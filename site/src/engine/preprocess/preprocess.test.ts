// Fixture tests for the criteria preprocessing. No network: the model output
// is hand-written in fixtures/*.gemini.json and every model or Jev call is mocked.
//
//   cd site && npm test

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { Answer, CodeBook, PatientRecord } from '../types.ts';
import { geminiComplete } from '../../lib/gemini.ts';
import { fallbackCriteria } from './fallback.ts';
import { criteriaVersion, isCurrent, preprocessTrial, type Complete, type PreprocessTrial } from './preprocess.ts';
import { LLM_JSON_SCHEMA, PROMPT_VERSION, type TrialCriteria } from './schema.ts';
import { combine, evaluateCodeCheck, filterState, planPatient, structuredQuestion, type PatientFacts } from './toJev.ts';
import { unitMatches, validateCriteria } from './validate.ts';
import { criterionQuestion } from '../questions.ts';
import { splitEligibility } from '../eligibility.ts';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const trials: PreprocessTrial[] = fixture('trials.json');
const ASTHMA = trials.find((t) => t.nct_id === 'NCT07309614')!;
const OBESITY = trials.find((t) => t.nct_id === 'NCT07685808')!;
const OUTPUT = { NCT07309614: fixture('NCT07309614.gemini.json'), NCT07685808: fixture('NCT07685808.gemini.json') };

const mockComplete =
  (content: string | (() => string), counter = { n: 0 }): Complete =>
  async () => {
    counter.n++;
    return { content: typeof content === 'string' ? content : content(), usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.0001 } };
  };

async function structured(t: PreprocessTrial): Promise<TrialCriteria> {
  const r = await preprocessTrial(t, { complete: mockComplete(JSON.stringify(OUTPUT[t.nct_id as keyof typeof OUTPUT])), model: 'gemini-3.5-flash-lite' });
  assert.equal(r.skipped, false);
  if (r.skipped) throw new Error('unreachable');
  return r.row.criteria_questions;
}

// ---------- patients ----------

const AS_OF = new Date('2026-10-10');
const codes: CodeBook = {
  snomed: {
    '195967001': 'Asthma (disorder)',
    '59621000': 'Essential hypertension (disorder)',
    '44054006': 'Diabetes mellitus type 2 (disorder)',
    '235919008': 'Cholelithiasis (disorder)',
  },
  rxnorm: { '895994': 'fluticasone propionate 250 MCG/ACTU Dry Powder Inhaler', '312617': 'predniSONE 5 MG Oral Tablet' },
  loinc: {},
};
const record = (r: Partial<PatientRecord>): PatientRecord => ({
  conditions: [], medications: [], procedures: [], observations: {}, weights: [], acuteVisits: [], ...r,
});
const facts = (age: number, sex: 'M' | 'F', r: Partial<PatientRecord>): PatientFacts => ({ age, sex, record: record(r), codes, asOf: AS_OF });

/** Stand-in for Jev: answers every question it is sent with a fixed answer, or one per id. */
function mockJev(plan: ReturnType<typeof planPatient>, pick: (id: string) => Answer = () => 'accept') {
  const answers: Record<string, Answer> = { ...plan.decided };
  for (const call of plan.jevCalls) for (const id of Object.keys(call.questions)) answers[id] = pick(id);
  return answers;
}

// ---------- validation ----------

describe('validation of the hand-written model output', () => {
  for (const t of [ASTHMA, OBESITY]) {
    it(`${t.nct_id} validates with no errors and no invented items`, () => {
      const v = validateCriteria(OUTPUT[t.nct_id as keyof typeof OUTPUT], t.eligibility_criteria!);
      assert.ok(v.ok, JSON.stringify(!v.ok && v.errors));
      assert.deepEqual(v.warnings, []);
    });
  }

  it('accepts the raw JSON string, including a ```json fence', () => {
    const v = validateCriteria('```json\n' + JSON.stringify(OUTPUT.NCT07685808) + '\n```', OBESITY.eligibility_criteria!);
    assert.ok(v.ok);
    assert.equal(v.criteria.length, 9);
  });

  it('turns the flat null-filled shape into clean checks', () => {
    const v = validateCriteria(OUTPUT.NCT07685808);
    assert.ok(v.ok);
    assert.deepEqual(v.criteria[0].code_check, { type: 'lab', field: 'bmi', gte: 30, lt: 45, unit: 'kg/m2', max_age_months: 24 });
    assert.equal(v.criteria[3].code_check, null); // exc_2, weight change: no code check type
  });

  it('rejects non-JSON, empty output, a mixed-kind group and a subgroup with no subgroup', () => {
    assert.equal(validateCriteria('not json').ok, false);
    assert.equal(validateCriteria({ criteria: [] }).ok, false);
    const items = structuredClone(OUTPUT.NCT07685808.criteria);
    items[2].group = 'g1'; // an exclusion joining the inclusion OR group
    assert.equal(validateCriteria({ criteria: items }).ok, false);
    const sub = structuredClone(OUTPUT.NCT07309614.criteria);
    sub[10].applies_to = null;
    const v = validateCriteria({ criteria: sub });
    assert.equal(v.ok, false);
    assert.match(!v.ok ? v.errors.join() : '', /subgroup item without applies_to/);
  });

  it('drops a bad code check with a warning, renumbers bad ids, clears one-member groups', () => {
    const items = structuredClone(OUTPUT.NCT07685808.criteria);
    items[0].code_check.field = 'serum_magic';
    items[1].group = null; // inc_1 now alone in g1
    items[3].id = 'exc_1'; // duplicate
    const v = validateCriteria({ criteria: items });
    assert.ok(v.ok);
    assert.equal(v.criteria[0].code_check, null);
    assert.equal(v.criteria[0].group, null);
    assert.deepEqual(v.criteria.map((c) => c.id).slice(0, 4), ['inc_1', 'inc_2', 'exc_1', 'exc_2']);
    assert.equal(v.warnings.length, 3);
  });

  it('flags an item whose text is not in the source', () => {
    const items = structuredClone(OUTPUT.NCT07685808.criteria);
    items[4].original_text = 'Prior treatment with experimental gene therapy vectors';
    const v = validateCriteria({ criteria: items }, OBESITY.eligibility_criteria!);
    assert.ok(v.ok);
    assert.match(v.warnings.join(), /exc_3: original_text not found/);
  });

  it('the schema sent to the model requires every property (strict mode)', () => {
    const item = LLM_JSON_SCHEMA.properties.criteria.items;
    assert.deepEqual([...item.required].sort(), Object.keys(item.properties).sort());
    const cc = item.properties.code_check;
    assert.deepEqual([...cc.required].sort(), Object.keys(cc.properties).sort());
  });
});

// ---------- the problems the preprocessing must fix ----------

describe('fixes for failures seen in the accuracy tests', async () => {
  const asthma = await structured(ASTHMA);
  const obesity = await structured(OBESITY);
  const byId = (tc: TrialCriteria, id: string) => tc.criteria.find((c) => c.id === id)!;

  it('screening and consent items are review items, never in the bucket', () => {
    const p = planPatient(asthma, facts(40, 'F', {}));
    for (const id of ['inc_3', 'inc_4', 'inc_12', 'exc_3', 'exc_4', 'exc_5', 'exc_14']) {
      assert.ok(p.review.includes(id), id);
      assert.ok(!p.jevCalls.some((c) => id in c.questions), id);
    }
  });

  it('a female-only criterion passes in code for a man and is a review item for a woman', () => {
    const man = planPatient(asthma, facts(39, 'M', {}));
    assert.equal(man.decided.inc_11, 'accept');
    assert.equal(man.decidedBy.inc_11, 'not_applicable');
    assert.ok(planPatient(asthma, facts(39, 'F', {})).review.includes('inc_11'));
  });

  it('OR alternatives share a group, and one passing alternative passes the group', () => {
    assert.equal(byId(obesity, 'inc_1').group, 'g1');
    assert.equal(byId(obesity, 'inc_2').group, 'g1');
    // BMI 28 with hypertension: inc_1 fails in code, Jev accepts inc_2.
    const f = facts(45, 'M', {
      conditions: [['59621000', '2020-01-01', null]],
      observations: { bmi: { value: 28, unit: 'kg/m2', date: '2026-03-01' } },
    });
    const plan = planPatient(obesity, f);
    assert.equal(plan.decided.inc_1, 'reject');
    const r = combine(obesity, mockJev(plan), plan.review);
    assert.equal(r.units.g1, 'accept');
    assert.equal(r.bucket, 'candidate');
  });

  it('an OR group with an unchecked screening alternative cannot fail, only need review', () => {
    // Asthma g1: ACQ score and FEV1 (screening) or high-dose ICS or a recent attack (record).
    const plan = planPatient(asthma, facts(40, 'M', {}));
    const answers = mockJev(plan, (id) => (id === 'inc_9' || id === 'inc_10' ? 'reject' : 'accept'));
    const r = combine(asthma, answers, plan.review);
    assert.equal(r.units.g1, 'unknown');
    assert.equal(r.bucket, 'chart_review');
  });

  it('"Exceptions" narrow the item instead of becoming exclusions', () => {
    for (const tc of [asthma, obesity]) {
      assert.ok(!tc.criteria.some((c) => /^(except|exceptions?:)/i.test(c.original_text)));
    }
    assert.match(byId(asthma, 'exc_10').question, /other than basal cell/);
  });

  it('the main diagnosis is its own record item, left to Jev rather than text matching', () => {
    const dx = byId(asthma, 'inc_2');
    assert.equal(dx.class, 'record');
    assert.equal(dx.code_check, null);
  });

  it('record facts and screening tests packed together are split', () => {
    assert.equal(byId(obesity, 'exc_5').class, 'record'); // personal history
    assert.equal(byId(obesity, 'exc_6').class, 'screening'); // family history
  });

  it('questions are short: under 200 characters and far shorter than the naive prompts', () => {
    const naive = splitEligibility(ASTHMA.eligibility_criteria).map((c) => criterionQuestion(c));
    const ours = asthma.criteria.filter((c) => c.class === 'record').map((c) => structuredQuestion(c));
    const len = (qs: { instructions: string; criteria: Record<string, string> }[]) =>
      qs.reduce((s, q) => s + JSON.stringify(q).length, 0) / qs.length;
    for (const c of asthma.criteria) assert.ok(c.question.length < 200, c.id);
    assert.ok(len(ours) < len(naive) * 0.7, `${len(ours)} vs ${len(naive)}`);
  });
});

// ---------- conversion to Jev and code ----------

describe('planPatient and combine', async () => {
  const asthma = await structured(ASTHMA);
  const obesity = await structured(OBESITY);

  it('decides age in code and sends diagnoses and drugs to Jev', () => {
    const f = facts(85, 'F', {
      conditions: [['195967001', '2025-01-01', null]],
      medications: [['312617', '2026-09-25', null]],
    });
    const p = planPatient(asthma, f);
    assert.equal(p.decided.inc_1, 'reject'); // 85 is over the age limit
    assert.equal(p.decidedBy.inc_1, 'code');
    for (const id of ['inc_2', 'exc_1']) assert.ok(id in p.jevCalls[0].questions, id); // asthma dx, steroid use
  });

  it('a ratio threshold is compared against a value stored in percent', () => {
    const f = facts(60, 'M', { observations: { fev1_fvc: { value: 65, unit: '%', date: '2026-06-01' } } });
    assert.equal(evaluateCodeCheck({ type: 'lab', field: 'fev1_fvc', lt: 0.7, unit: 'ratio' }, f), true);
    assert.equal(evaluateCodeCheck({ type: 'lab', field: 'fev1_fvc', lt: 70, unit: '%' }, f), true);
    assert.equal(evaluateCodeCheck({ type: 'lab', field: 'fev1_fvc', lt: 0.6, unit: 'ratio' }, f), false);
  });

  it('an applies_to with no subgroup in it means everyone', () => {
    const items = structuredClone(OUTPUT.NCT07685808.criteria);
    items[2].applies_to = { sex: null, min_age: null, max_age: null, condition: null, description: '' };
    const v = validateCriteria({ criteria: items });
    assert.ok(v.ok);
    if (v.ok) assert.equal(v.criteria[2].applies_to, null);
  });

  it('a missing lab is unknown, never a pass', () => {
    const p = planPatient(obesity, facts(50, 'M', {}));
    assert.equal(p.decided.inc_1, 'unknown');
  });

  it('puts every Jev question in one call, and filters the state to the sections they need', () => {
    const p = planPatient(asthma, facts(40, 'M', {}));
    assert.equal(p.jevCalls.length, 1);
    assert.ok(['exc_1', 'exc_11', 'inc_6', 'inc_9'].every((id) => id in p.jevCalls[0].questions));
    const state = { note: 'n', age: 40, sex: 'male', conditions: [], medications: [1], procedures: [], labs: [] };
    assert.deepEqual(filterState(state, ['medications']), { note: 'n', age: 40, sex: 'male', medications: [1] });
  });

  it('a clean obesity patient is a pre-screen candidate', () => {
    const f = facts(40, 'F', {
      conditions: [['59621000', '2020-01-01', null]],
      observations: { bmi: { value: 33, unit: 'kg/m2', date: '2026-05-01' } },
    });
    const plan = planPatient(obesity, f);
    const r = combine(obesity, mockJev(plan), plan.review);
    assert.equal(r.bucket, 'candidate');
    assert.deepEqual(r.review, ['exc_6', 'exc_7']);
  });

  it('a Jev reject on the diabetes exclusion rules the patient out', () => {
    const f = facts(40, 'F', {
      conditions: [['44054006', '2019-01-01', null]],
      observations: { bmi: { value: 33, unit: 'kg/m2', date: '2026-05-01' } },
    });
    const plan = planPatient(obesity, f);
    assert.ok('exc_1' in plan.jevCalls[0].questions);
    const answers = { ...mockJev(plan), exc_1: 'reject' as const };
    assert.equal(combine(obesity, answers, plan.review).bucket, 'not_a_match');
  });

  it('a missing Jev answer counts as unknown', () => {
    const plan = planPatient(obesity, facts(40, 'F', { observations: { bmi: { value: 33, unit: 'kg/m2', date: '2026-05-01' } } }));
    assert.equal(combine(obesity, plan.decided, plan.review).bucket, 'chart_review');
  });

  it('exclusion questions keep the absent-means-absent rule and the accept/reject/unknown keys', () => {
    const q = structuredQuestion(obesity.criteria.find((c) => c.id === 'exc_4')!);
    assert.deepEqual(Object.keys(q.criteria), ['accept', 'reject', 'unknown']);
    assert.match(q.instructions, /not in the record counts as absent/);
  });
});

// ---------- versioning, fallback and the client ----------

describe('preprocessTrial', () => {
  const model = 'google/gemini-2.5-flash-lite';
  const good = JSON.stringify(OUTPUT.NCT07685808);

  it('skips a trial whose version and prompt are unchanged, re-runs when the registry updates', async () => {
    const counter = { n: 0 };
    const first = await preprocessTrial(OBESITY, { complete: mockComplete(good, counter), model });
    assert.ok(!first.skipped);
    assert.equal(first.row.criteria_version, `2026-09-29/p${PROMPT_VERSION}`);
    const existing = { criteria_version: first.row.criteria_version, criteria_questions: first.row.criteria_questions };
    assert.ok(isCurrent(OBESITY, existing));
    assert.ok((await preprocessTrial(OBESITY, { complete: mockComplete(good, counter), model, existing })).skipped);
    const updated = { ...OBESITY, last_update_post_date: '2026-11-02' };
    assert.ok(!(await preprocessTrial(updated, { complete: mockComplete(good, counter), model, existing })).skipped);
    assert.ok(!(await preprocessTrial(OBESITY, { complete: mockComplete(good, counter), model, existing, force: true })).skipped);
    assert.equal(counter.n, 3);
  });

  it('falls back to the naive splitter after a retry on invalid output, and retries it next run', async () => {
    const counter = { n: 0 };
    const r = await preprocessTrial(ASTHMA, { complete: mockComplete('{"criteria": "oops"}', counter), model });
    assert.ok(!r.skipped);
    assert.equal(counter.n, 2);
    const doc = r.row.criteria_questions;
    assert.equal(doc.status, 'fallback');
    assert.equal(doc.model, 'naive-splitter');
    assert.ok(doc.criteria.length > 10);
    assert.ok(!isCurrent(ASTHMA, { criteria_version: r.row.criteria_version, criteria_questions: doc }));
  });

  it('falls back when the call throws, and on a trial with no text makes no call', async () => {
    const boom: Complete = async () => {
      throw new Error('OpenRouter 503');
    };
    const r = await preprocessTrial(OBESITY, { complete: boom, model, retries: 0 });
    assert.ok(!r.skipped && r.row.criteria_questions.status === 'fallback' && /503/.test(r.errors[0]));
    const counter = { n: 0 };
    const empty = await preprocessTrial({ ...OBESITY, eligibility_criteria: null }, { complete: mockComplete(good, counter), model });
    assert.equal(counter.n, 0);
    assert.ok(!empty.skipped && empty.row.criteria_questions.criteria.length === 0);
  });

  it('criteriaVersion changes with the registry date', () => {
    assert.notEqual(criteriaVersion(OBESITY), criteriaVersion({ last_update_post_date: '2027-01-01' }));
  });
});

describe('fallback splitter classes', () => {
  it('keeps consent and screening-visit items out of the record class', () => {
    const fb = fallbackCriteria(ASTHMA.eligibility_criteria);
    const consent = fb.find((c) => /^Capable of giving signed informed consent/.test(c.original_text));
    assert.equal(consent?.class, 'administrative');
    const female = fb.find((c) => /^Female participants/.test(c.original_text));
    assert.equal(female?.class, 'subgroup');
    assert.equal(female?.applies_to?.sex, 'female');
  });
});

describe('Gemini client (mocked fetch)', () => {
  it('sends a JSON-schema request with minimal thinking and returns the content and usage', async () => {
    let sent: Record<string, unknown> = {};
    let url = '';
    const fetchImpl = (async (u: string, init: RequestInit) => {
      url = u;
      sent = JSON.parse(init.body as string);
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"criteria":[]}' }] } }],
        usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 3, thoughtsTokenCount: 2 },
      }));
    }) as typeof fetch;
    const complete = geminiComplete('test-key', 'gemini-3.5-flash-lite', { fetchImpl });
    const res = await complete({ system: 's', user: 'u', schema: LLM_JSON_SCHEMA });
    assert.equal(res.content, '{"criteria":[]}');
    assert.equal(res.usage?.prompt_tokens, 9);
    assert.equal(res.usage?.completion_tokens, 5);
    assert.match(url, /models\/gemini-3\.5-flash-lite:generateContent$/);
    const gc = sent.generationConfig as { responseMimeType: string; responseJsonSchema: unknown; thinkingConfig: { thinkingLevel: string } };
    assert.equal(gc.responseMimeType, 'application/json');
    assert.deepEqual(gc.responseJsonSchema, LLM_JSON_SCHEMA);
    assert.equal(gc.thinkingConfig.thinkingLevel, 'minimal');
  });
});

describe('group logic', () => {
  const crit = (id: string, kind: 'inclusion' | 'exclusion', group: string | null): TrialCriteria['criteria'][number] => ({
    id, kind, class: 'record', applies_to: null, question: id, sections: ['conditions'], group, original_text: id, code_check: null,
  });
  const tc = (criteria: TrialCriteria['criteria']): TrialCriteria => ({
    schema_version: 1, nct_id: 'NCT0', source_version: null, prompt_version: 1, model: 'm', status: 'llm',
    generated_at: '', warnings: [], criteria,
  });

  it('an exclusion group rejects when any member applies', () => {
    const t = tc([crit('exc_1', 'exclusion', 'g1'), crit('exc_2', 'exclusion', 'g1')]);
    assert.equal(combine(t, { exc_1: 'accept', exc_2: 'reject' }).bucket, 'not_a_match');
    assert.equal(combine(t, { exc_1: 'accept', exc_2: 'accept' }).bucket, 'candidate');
    assert.equal(combine(t, { exc_1: 'accept', exc_2: 'unknown' }).bucket, 'chart_review');
  });

  it('an inclusion group passes when any member passes', () => {
    const t = tc([crit('inc_1', 'inclusion', 'g1'), crit('inc_2', 'inclusion', 'g1')]);
    assert.equal(combine(t, { inc_1: 'reject', inc_2: 'accept' }).bucket, 'candidate');
    assert.equal(combine(t, { inc_1: 'reject', inc_2: 'reject' }).bucket, 'not_a_match');
  });

  it('a member that does not apply to the patient cannot pass the group for them', () => {
    const t = tc([crit('inc_1', 'inclusion', 'g1'), crit('inc_2', 'inclusion', 'g1')]);
    // inc_2 is for adolescents; for an adult it is not applicable, so inc_1 alone decides.
    assert.equal(combine(t, { inc_1: 'reject', inc_2: 'accept' }, [], ['inc_2']).bucket, 'not_a_match');
    assert.equal(combine(t, { inc_1: 'accept', inc_2: 'accept' }, [], ['inc_2']).bucket, 'candidate');
  });
});

describe('lab units', () => {
  it('drops a lab check whose unit is not the record unit', () => {
    const items = structuredClone(OUTPUT.NCT07685808.criteria);
    items[0].code_check = { ...items[0].code_check, field: 'eosinophils', unit: 'cells/uL', gte: 300 };
    const v = validateCriteria({ criteria: items });
    assert.ok(v.ok);
    if (v.ok) assert.equal(v.criteria[0].code_check, null);
  });

  it('accepts equivalent units', () => {
    assert.ok(unitMatches('eosinophils', '10^9/L'));
    assert.ok(unitMatches('bmi', 'kg/m^2'));
    assert.ok(unitMatches('fev1_fvc', 'ratio'));
    assert.ok(!unitMatches('hba1c', 'mmol/mol'));
  });
});

describe('gated alternatives', () => {
  it('a gated inclusion alternative does not pass its group for someone outside the gate', () => {
    const base = {
      id: 'inc_1', kind: 'inclusion' as const, class: 'record' as const, question: 'BMI 23-40?', sections: ['labs' as const],
      original_text: 'x', code_check: null,
      applies_to: { condition: 'East Asian ancestry', description: 'East Asian participants' },
    };
    const inGroup = structuredQuestion({ ...base, group: 'g1' });
    assert.doesNotMatch(inGroup.criteria.accept, /not in the group/);
    assert.match(inGroup.criteria.reject, /not in the group/);
    const alone = structuredQuestion({ ...base, group: null });
    assert.match(alone.criteria.accept, /not in the group/);
  });
});
