import { fallbackCriteria } from './fallback.ts';
import { SYSTEM_PROMPT, userPrompt, type PromptTrial } from './prompt.ts';
import { LLM_JSON_SCHEMA, PROMPT_VERSION, SCHEMA_VERSION, type TrialCriteria } from './schema.ts';
import { validateCriteria } from './validate.ts';

// Runs the preprocessing for one trial: skip if this trial version is already
// done, else ask the model, validate, and fall back to the naive splitter.
// Pure apart from the injected `complete` function, which does the network
// call (lib/openrouter.ts in real runs, a fixture in tests). Only trial text is
// sent; no patient data is involved at any point.

export type PreprocessTrial = PromptTrial & { last_update_post_date: string | null };

export type CompletionRequest = { system: string; user: string; schema: typeof LLM_JSON_SCHEMA };
export type Completion = {
  content: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};
export type Complete = (req: CompletionRequest) => Promise<Completion>;

/** What is stored on the trials row today, if anything. */
export type ExistingCriteria = {
  criteria_version: string | null;
  criteria_questions: TrialCriteria | null;
};

/** The columns to write back to `trials`. Trial-level data only. */
export type CriteriaRow = {
  criteria_questions: TrialCriteria;
  criteria_version: string;
  criteria_model: string;
  criteria_generated_at: string;
};

/** Skip key: the registry's update date plus the prompt version. */
export function criteriaVersion(trial: Pick<PreprocessTrial, 'last_update_post_date'>): string {
  return `${trial.last_update_post_date ?? 'undated'}/p${PROMPT_VERSION}`;
}

/** Done already: same trial version, same prompt, and the model (not the fallback) produced it. */
export function isCurrent(trial: PreprocessTrial, existing: ExistingCriteria | null | undefined): boolean {
  return Boolean(
    existing &&
      existing.criteria_version === criteriaVersion(trial) &&
      existing.criteria_questions?.status === 'llm' &&
      existing.criteria_questions.schema_version === SCHEMA_VERSION,
  );
}

export function buildRequest(trial: PromptTrial): CompletionRequest {
  return { system: SYSTEM_PROMPT, user: userPrompt(trial), schema: LLM_JSON_SCHEMA };
}

export type PreprocessResult =
  | { skipped: true; nct_id: string }
  | {
      skipped: false;
      nct_id: string;
      row: CriteriaRow;
      errors: string[];
      usage: { prompt_tokens: number; completion_tokens: number; cost: number; calls: number };
    };

export async function preprocessTrial(
  trial: PreprocessTrial,
  opts: {
    complete: Complete;
    model: string;
    existing?: ExistingCriteria | null;
    force?: boolean;
    /** Extra model calls when the output doesn't validate. */
    retries?: number;
    now?: () => Date;
  },
): Promise<PreprocessResult> {
  if (!opts.force && isCurrent(trial, opts.existing)) return { skipped: true, nct_id: trial.nct_id };

  const usage = { prompt_tokens: 0, completion_tokens: 0, cost: 0, calls: 0 };
  const errors: string[] = [];
  const now = (opts.now ?? (() => new Date()))().toISOString();
  const base = {
    schema_version: SCHEMA_VERSION,
    nct_id: trial.nct_id,
    source_version: trial.last_update_post_date,
    prompt_version: PROMPT_VERSION,
    generated_at: now,
  };
  const finish = (doc: TrialCriteria): PreprocessResult => ({
    skipped: false,
    nct_id: trial.nct_id,
    errors,
    usage,
    row: {
      criteria_questions: doc,
      criteria_version: criteriaVersion(trial),
      criteria_model: doc.model,
      criteria_generated_at: now,
    },
  });

  if (trial.eligibility_criteria?.trim()) {
    const request = buildRequest(trial);
    for (let attempt = 0; attempt <= (opts.retries ?? 1); attempt++) {
      try {
        const res = await opts.complete(request);
        usage.calls++;
        usage.prompt_tokens += res.usage?.prompt_tokens ?? 0;
        usage.completion_tokens += res.usage?.completion_tokens ?? 0;
        usage.cost += res.usage?.cost ?? 0;
        const v = validateCriteria(res.content, trial.eligibility_criteria);
        if (v.ok) {
          return finish({ ...base, model: opts.model, status: 'llm', warnings: v.warnings, criteria: v.criteria });
        }
        errors.push(...v.errors.map((e) => `attempt ${attempt + 1}: ${e}`));
      } catch (e) {
        errors.push(`attempt ${attempt + 1}: ${(e as Error).message}`);
      }
    }
  }

  return finish({
    ...base,
    model: 'naive-splitter',
    status: 'fallback',
    warnings: errors.length ? [`model output rejected: ${errors.join('; ')}`] : ['no eligibility text'],
    criteria: fallbackCriteria(trial.eligibility_criteria),
  });
}
