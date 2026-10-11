// Naive end-to-end matcher: trials × patients → Jev → buckets.
//
//   node --env-file=../.env scripts/match.ts --trials NCT07309614,NCT07685808 --dry-run
//
// Steps:
//   1. Code prefilter on age and sex (free).
//   2. Condition prefilter (free): does the patient have the trial's disease? A lookup in
//      data/conditions/trial_condition_codes.json. No model involved.
//   3. Eligibility: one Jev call per surviving (patient, trial), every criterion as a question.
//   4. Code turns the answers into buckets and writes a JSON report.
//
// Data comes from Supabase when SUPABASE_URL and SUPABASE_SECRET_KEY are set.
// Otherwise patients come from data/synthea-nj.json and trials from the
// ClinicalTrials.gov API.
//
// --dry-run builds every request and estimates calls, tokens and cost without calling Jev.
// --max-cost stops starting new Jev calls once the reported spend passes it (default $0.25).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { bucketOf, toResult } from '../src/engine/decide.ts';
import { splitEligibility } from '../src/engine/eligibility.ts';
import { conditionMatch, type TrialConditionMap } from '../src/engine/conditions.ts';
import { passesDemographics } from '../src/engine/prefilter.ts';
import { criteriaQuestions, DEFAULT_ORDER } from '../src/engine/questions.ts';
import { buildState } from '../src/engine/state.ts';
import type { Answer, CodeBook, MatchResult, Patient, Trial } from '../src/engine/types.ts';
import { askJev, JEV_MODEL, type JevResponse } from '../src/lib/jev.ts';

const REPO = resolve(import.meta.dirname, '../..');
const JEV_PRICE_PER_TOKEN = 0.042 / 1e6; // OpenRouter listing, input only; output is free

const { values: args } = parseArgs({
  options: {
    trials: { type: 'string' },
    practice: { type: 'string' },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '16' },
    order: { type: 'string', default: DEFAULT_ORDER.join(',') },
    'dry-run': { type: 'boolean', default: false },
    'max-cost': { type: 'string', default: '0.25' },
    'as-of': { type: 'string', default: '2026-10-10' },
    out: { type: 'string' },
  },
});

const asOf = new Date(args['as-of']!);
const order = args.order!.split(',') as Answer[];
const dryRun = args['dry-run']!;
const maxCost = Number(args['max-cost']);
const apiKey = process.env.OPENROUTER_KEY ?? '';
if (!dryRun && !apiKey) throw new Error('OPENROUTER_KEY is not set');

// ---------- data loading ----------

async function supabaseGet<T>(path: string): Promise<T[]> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SECRET_KEY!;
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
const TRIAL_COLS =
  'nct_id,brief_title,conditions,condition_meshes,eligibility_criteria,sex,minimum_age_years,maximum_age_years,healthy_volunteers';

async function loadTrials(ids: string[] | undefined): Promise<Trial[]> {
  if (useSupabase) {
    const filter = ids ? `&nct_id=in.(${ids.join(',')})` : '';
    return supabaseGet<Trial>(`trials?select=${TRIAL_COLS}${filter}`);
  }
  if (!ids) throw new Error('Without Supabase, pass --trials');
  return Promise.all(ids.map(fetchCtgovTrial));
}

async function fetchCtgovTrial(id: string): Promise<Trial> {
  const res = await fetch(`https://clinicaltrials.gov/api/v2/studies/${id}`);
  if (!res.ok) throw new Error(`ClinicalTrials.gov ${id}: ${res.status}`);
  const s = await res.json();
  const p = s.protocolSection;
  const years = (v?: string) => (v ? Number.parseFloat(v) / (/month/i.test(v) ? 12 : 1) : null);
  return {
    nct_id: id,
    brief_title: p.identificationModule.briefTitle,
    conditions: p.conditionsModule?.conditions ?? [],
    condition_meshes: s.derivedSection?.conditionBrowseModule?.meshes ?? [],
    eligibility_criteria: p.eligibilityModule?.eligibilityCriteria ?? null,
    sex: p.eligibilityModule?.sex ?? 'ALL',
    minimum_age_years: years(p.eligibilityModule?.minimumAge),
    maximum_age_years: years(p.eligibilityModule?.maximumAge),
    healthy_volunteers: p.eligibilityModule?.healthyVolunteers ?? false,
  };
}

async function loadPatients(): Promise<{ patients: Patient[]; codes: CodeBook }> {
  if (useSupabase) {
    const filter = args.practice ? `&practice_id=eq.${args.practice}` : '';
    const patients = await supabaseGet<Patient>(`patients?select=id,practice_id,birth_date,sex,record${filter}`);
    const rows = await supabaseGet<{ system: keyof CodeBook; code: string; description: string }>(
      'codes?select=system,code,description',
    );
    const codes: CodeBook = { snomed: {}, rxnorm: {}, loinc: {} };
    for (const r of rows) codes[r.system][r.code] = r.description;
    return { patients, codes };
  }
  const bundle = JSON.parse(readFileSync(resolve(REPO, 'data/synthea-nj.json'), 'utf8'));
  const slug = (g: string) => g.toLowerCase().replace(/ county$/, '').replace(/\s+/g, '_');
  const patients: Patient[] = bundle.patients
    .map((p: Record<string, unknown>) => ({
      id: p.id,
      practice_id: slug(p.group as string),
      birth_date: p.birthDate,
      sex: p.sex,
      record: p,
    }))
    .filter((p: Patient) => !args.practice || p.practice_id === args.practice);
  return { patients, codes: bundle.codes };
}

// ---------- Jev calls with a budget and a promise pool ----------

let spent = 0;
let calls = 0;
let estTokens = 0;
const latencies: number[] = [];

async function jev(state: unknown, questions: Record<string, unknown>): Promise<JevResponse | null> {
  estTokens += Math.ceil(JSON.stringify({ state, questions }).length / 2.5); // chars per token, calibrated on a real run
  calls++;
  if (dryRun) return null;
  if (spent >= maxCost) throw new Error(`Budget of $${maxCost} reached after ${calls - 1} calls`);
  const t0 = performance.now();
  const res = await askJev(apiKey, state, questions);
  latencies.push(performance.now() - t0);
  spent += res.usage?.cost ?? 0;
  return res;
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

// ---------- pipeline ----------

const t0 = performance.now();
const trialIds = args.trials?.split(',').map((s) => s.trim());
const [trials, { patients: allPatients, codes }] = await Promise.all([loadTrials(trialIds), loadPatients()]);
const patients = args.limit ? allPatients.slice(0, Number(args.limit)) : allPatients;
const concurrency = Number(args.concurrency);
const tLoad = performance.now();

const criteriaByTrial = new Map(trials.map((t) => [t.nct_id, splitEligibility(t.eligibility_criteria)]));
const conditionMap: TrialConditionMap = JSON.parse(readFileSync(resolve(REPO, 'data/conditions/trial_condition_codes.json'), 'utf8'));

// 1. Demographics.
const pairs = patients.flatMap((p) => trials.filter((t) => passesDemographics(p, t, asOf)).map((t) => ({ p, t })));
const afterDemographics = pairs.length;

// 2. Condition prefilter: a lookup, no Jev calls.
const unmapped = trials.filter((t) => !conditionMap[t.nct_id]).map((t) => t.nct_id);
if (unmapped.length) console.warn(`Not in the condition map, so not prefiltered: ${unmapped.join(', ')}`);
const matched = pairs.flatMap(({ p, t }) => {
  const why = conditionMatch(p, conditionMap[t.nct_id]);
  return why ? [{ p, t, why }] : [];
});
const afterCondition = matched.length;
const tCondition = performance.now();

// 3. Eligibility, one call per (patient, trial) with every criterion.
const results: MatchResult[] = [];
await pool(matched, concurrency, async ({ p, t, why }) => {
  const criteria = criteriaByTrial.get(t.nct_id)!;
  if (!criteria.length) return;
  const res = await jev(buildState(p, codes, asOf), criteriaQuestions(criteria, order));
  if (!res) return;
  const criteriaResults = criteria.map((c) => toResult(c, res.answers[c.id]));
  results.push({
    patient_id: p.id,
    practice_id: p.practice_id,
    nct_id: t.nct_id,
    condition_match: why,
    ...bucketOf(criteriaResults),
    criteria: criteriaResults,
  });
});
const tEnd = performance.now();

// ---------- report ----------

const pct = (xs: number[], q: number) => xs.toSorted((a, b) => a - b)[Math.floor(q * (xs.length - 1))] ?? 0;
const meta = {
  model: JEV_MODEL,
  dryRun,
  order,
  source: useSupabase ? 'supabase' : 'local bundle + ClinicalTrials.gov',
  patients: patients.length,
  trials: trials.map((t) => ({ nct_id: t.nct_id, title: t.brief_title, criteria: criteriaByTrial.get(t.nct_id)!.length })),
  pairs: { total: patients.length * trials.length, afterDemographics, afterCondition },
  calls,
  estimatedInputTokens: estTokens,
  estimatedCostUsd: +(estTokens * JEV_PRICE_PER_TOKEN).toFixed(4),
  reportedCostUsd: +spent.toFixed(4),
  seconds: {
    load: +((tLoad - t0) / 1000).toFixed(1),
    conditionPrefilter: +((tCondition - tLoad) / 1000).toFixed(1),
    eligibility: +((tEnd - tCondition) / 1000).toFixed(1),
    total: +((tEnd - t0) / 1000).toFixed(1),
  },
  latencyMs: { p50: Math.round(pct(latencies, 0.5)), p95: Math.round(pct(latencies, 0.95)) },
  concurrency,
};

const summary = trials.map((t) => {
  const rs = results.filter((r) => r.nct_id === t.nct_id);
  const n = (b: string) => rs.filter((r) => r.bucket === b).length;
  return { nct_id: t.nct_id, evaluated: rs.length, candidate: n('candidate'), review: n('review'), not_match: n('not_match') };
});

console.log(JSON.stringify(meta, null, 2));
console.table(summary);

const out = resolve(args.out ?? resolve(REPO, `data/matches/run-${Date.now()}.json`));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({ meta, summary, criteria: Object.fromEntries(criteriaByTrial), results }, null, 1),
);
console.log(`Wrote ${out}`);
