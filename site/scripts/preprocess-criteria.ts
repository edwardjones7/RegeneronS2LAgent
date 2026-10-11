// Turns each trial's free-text eligibility into structured criteria with Gemini
// on OpenRouter, once per trial version.
//
//   cd site
//   npm run criteria -- --dry-run                       # all trials: tokens, cost, one prompt
//   npm run criteria -- --dry-run --fixtures            # offline, the 2 fixture trials
//   npm run criteria -- --trials NCT07309614,NCT07685808
//   npm run criteria -- --limit 10 --write              # also PATCH trials.criteria_* in Supabase
//
// Trials come from Supabase `trials` when SUPABASE_URL and SUPABASE_SECRET_KEY
// are set, else from ClinicalTrials.gov (needs --trials), or from the test
// fixtures with --fixtures. Results always go to data/criteria/<nct_id>.json;
// --write also updates the trials row (needs migration 0002).
//
// Skip-if-unchanged: a trial is skipped when its stored criteria_version equals
// `<last_update_post_date>/p<PROMPT_VERSION>` and the model (not the fallback)
// produced it. Stored = the Supabase columns if they exist, else the local file.
// --force re-runs anyway.
//
// From the trial sync job, call the module directly instead:
//   import { preprocessTrial } from '../src/engine/preprocess/preprocess.ts';
//   import { openRouterComplete, DEFAULT_CRITERIA_MODEL } from '../src/lib/openrouter.ts';
//   const r = await preprocessTrial(trial, { complete: openRouterComplete(key, DEFAULT_CRITERIA_MODEL), model: DEFAULT_CRITERIA_MODEL, existing });
//   if (!r.skipped) upsert r.row into trials
//
// Emits to OpenRouter: public registry text only (title, conditions, eligibility). No patient data.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  buildRequest, criteriaVersion, isCurrent, preprocessTrial,
  type ExistingCriteria, type PreprocessTrial,
} from '../src/engine/preprocess/preprocess.ts';
import { DEFAULT_CRITERIA_MODEL, openRouterComplete, PRICES } from '../src/lib/openrouter.ts';

const REPO = resolve(import.meta.dirname, '../..');
const FIXTURES = resolve(import.meta.dirname, '../src/engine/preprocess/fixtures');
const CHARS_PER_TOKEN = 4; // Gemini tokenizer on English text; an estimate, check against usage after a real run

const { values: args } = parseArgs({
  options: {
    trials: { type: 'string' },
    limit: { type: 'string' },
    model: { type: 'string', default: DEFAULT_CRITERIA_MODEL },
    'dry-run': { type: 'boolean', default: false },
    fixtures: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    write: { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '4' },
    out: { type: 'string', default: resolve(REPO, 'data/criteria') },
  },
});

const model = args.model!;
const dryRun = args['dry-run']!;
const apiKey = process.env.OPENROUTER_KEY ?? '';
if (!dryRun && !apiKey) throw new Error('OPENROUTER_KEY is not set (root .env)');
const useSupabase = !args.fixtures && Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
if (args.write && !useSupabase) throw new Error('--write needs SUPABASE_URL and SUPABASE_SECRET_KEY');

// ---------- loading ----------

type Row = PreprocessTrial & Partial<ExistingCriteria>;
const BASE_COLS = 'nct_id,brief_title,conditions,eligibility_criteria,sex,minimum_age_years,maximum_age_years,last_update_post_date';

async function supabase(path: string, init: RequestInit = {}): Promise<Response> {
  const key = process.env.SUPABASE_SECRET_KEY!;
  return fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
  });
}

async function loadFromSupabase(ids?: string[]): Promise<Row[]> {
  const filter = ids ? `&nct_id=in.(${ids.join(',')})` : '';
  const order = '&order=nct_id';
  // The criteria columns exist only after migration 0002; read without them if missing.
  let res = await supabase(`trials?select=${BASE_COLS},criteria_version,criteria_questions${filter}${order}`);
  if (res.status === 400) res = await supabase(`trials?select=${BASE_COLS}${filter}${order}`);
  if (!res.ok) throw new Error(`Supabase trials: ${res.status} ${await res.text()}`);
  return (await res.json()) as Row[];
}

async function loadFromCtgov(id: string): Promise<Row> {
  const res = await fetch(`https://clinicaltrials.gov/api/v2/studies/${id}`);
  if (!res.ok) throw new Error(`ClinicalTrials.gov ${id}: ${res.status}`);
  const p = (await res.json()).protocolSection;
  const years = (v?: string) => (v ? Number.parseFloat(v) / (/month/i.test(v) ? 12 : 1) : null);
  return {
    nct_id: id,
    brief_title: p.identificationModule.briefTitle,
    conditions: p.conditionsModule?.conditions ?? [],
    eligibility_criteria: p.eligibilityModule?.eligibilityCriteria ?? null,
    sex: p.eligibilityModule?.sex ?? 'ALL',
    minimum_age_years: years(p.eligibilityModule?.minimumAge),
    maximum_age_years: years(p.eligibilityModule?.maximumAge),
    last_update_post_date: p.statusModule?.lastUpdatePostDateStruct?.date ?? null,
  };
}

const ids = args.trials?.split(',').map((s) => s.trim()).filter(Boolean);
let trials: Row[];
if (args.fixtures) {
  trials = JSON.parse(readFileSync(resolve(FIXTURES, 'trials.json'), 'utf8'));
  if (ids) trials = trials.filter((t) => ids.includes(t.nct_id));
} else if (useSupabase) {
  trials = await loadFromSupabase(ids);
} else {
  if (!ids) throw new Error('Without Supabase, pass --trials or --fixtures');
  trials = await Promise.all(ids.map(loadFromCtgov));
}
if (args.limit) trials = trials.slice(0, Number(args.limit));

const outFile = (id: string) => resolve(args.out!, `${id}.json`);
function existingFor(t: Row): ExistingCriteria | null {
  if (t.criteria_version !== undefined) return { criteria_version: t.criteria_version ?? null, criteria_questions: t.criteria_questions ?? null };
  if (!existsSync(outFile(t.nct_id))) return null;
  const saved = JSON.parse(readFileSync(outFile(t.nct_id), 'utf8'));
  return { criteria_version: saved.criteria_version, criteria_questions: saved.criteria_questions };
}

const todo = trials.filter((t) => args.force || !isCurrent(t, existingFor(t)));
const withText = todo.filter((t) => t.eligibility_criteria?.trim());

// ---------- dry run ----------

if (dryRun) {
  // Output size calibrated on the hand-written fixtures: model JSON chars per eligibility char.
  const fx: Row[] = JSON.parse(readFileSync(resolve(FIXTURES, 'trials.json'), 'utf8'));
  const outChars = fx.reduce((s, t) => s + JSON.stringify(JSON.parse(readFileSync(resolve(FIXTURES, `${t.nct_id}.gemini.json`), 'utf8'))).length, 0);
  const inChars = fx.reduce((s, t) => s + (t.eligibility_criteria ?? '').length, 0);
  const outRatio = outChars / inChars;

  let inTok = 0;
  let outTok = 0;
  for (const t of withText) {
    const req = buildRequest(t);
    inTok += Math.ceil((req.system.length + req.user.length + JSON.stringify(req.schema).length) / CHARS_PER_TOKEN);
    outTok += Math.ceil(((t.eligibility_criteria ?? '').length * outRatio) / CHARS_PER_TOKEN);
  }
  if (withText[0]) {
    const req = buildRequest(withText[0]);
    console.log(`----- system prompt -----\n${req.system}\n\n----- user prompt (${withText[0].nct_id}) -----\n${req.user}\n`);
  }
  const cost = (m: string) => {
    const [pi, po] = PRICES[m] ?? [NaN, NaN];
    return +((inTok * pi + outTok * po) / 1e6).toFixed(4);
  };
  console.log(
    JSON.stringify(
      {
        source: args.fixtures ? 'fixtures' : useSupabase ? 'supabase' : 'ClinicalTrials.gov',
        trials: trials.length,
        skippedAsCurrent: trials.length - todo.length,
        toProcess: withText.length,
        noEligibilityText: todo.length - withText.length,
        estimatedInputTokens: inTok,
        estimatedOutputTokens: outTok,
        outputCharsPerEligibilityChar: +outRatio.toFixed(2),
        estimatedCostUsd: { [model]: cost(model), ...Object.fromEntries(Object.keys(PRICES).filter((m) => m !== model).map((m) => [m, cost(m)])) },
        note: 'Estimate only; a failed validation adds one retry call for that trial.',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// ---------- real run ----------

const complete = openRouterComplete(apiKey, model);
mkdirSync(args.out!, { recursive: true });
const totals = { processed: 0, skipped: trials.length - todo.length, llm: 0, fallback: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0, cost: 0 };

let next = 0;
await Promise.all(
  Array.from({ length: Math.min(Number(args.concurrency), todo.length) }, async () => {
    while (next < todo.length) {
      const t = todo[next++];
      const r = await preprocessTrial(t, { complete, model, existing: existingFor(t), force: args.force });
      if (r.skipped) continue;
      totals.processed++;
      totals[r.row.criteria_questions.status]++;
      for (const k of ['calls', 'prompt_tokens', 'completion_tokens', 'cost'] as const) totals[k] += r.usage[k];
      writeFileSync(outFile(t.nct_id), JSON.stringify(r.row, null, 1));
      if (args.write) {
        // Emits trial-level structured criteria only; no patient data.
        const res = await supabase(`trials?nct_id=eq.${t.nct_id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(r.row),
        });
        if (!res.ok) console.error(`${t.nct_id}: Supabase write ${res.status} ${await res.text()}`);
      }
      const doc = r.row.criteria_questions;
      console.log(`${t.nct_id} ${doc.status} ${doc.criteria.length} criteria${doc.warnings.length ? `, ${doc.warnings.length} warnings` : ''} (${criteriaVersion(t)})`);
    }
  }),
);
console.log(JSON.stringify({ model, ...totals, cost: +totals.cost.toFixed(4) }, null, 2));
