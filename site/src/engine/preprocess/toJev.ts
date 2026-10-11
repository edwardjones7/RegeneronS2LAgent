import { DEFAULT_ORDER, type JevChoiceQuestion } from '../questions.ts';
import type { Answer, Bucket, CodeBook, PatientRecord } from '../types.ts';
import { SECTION_STATE_KEYS, SECTIONS, type CodeCheck, type Section, type StructuredCriterion, type TrialCriteria } from './schema.ts';

// Turns stored structured criteria into work for one patient:
//   - criteria code can settle (subgroup gates, age, sex, lab thresholds),
//   - short Jev questions, all in one call whose state holds only the sections they need,
//   - review items ("confirm at screening") that never affect the bucket.
// Then combines the answers, OR groups included, into a bucket. Pure.

const MS_PER_MONTH = 30.44 * 24 * 3600 * 1000;

export type PatientFacts = {
  age: number;
  sex: 'M' | 'F';
  record: PatientRecord;
  codes: CodeBook;
  asOf: Date;
};

/** true/false: the criterion's condition holds or not. 'unknown': the record lacks the value. */
export type CheckResult = boolean | 'unknown';

const monthsAgo = (date: string, asOf: Date) => (asOf.getTime() - new Date(date).getTime()) / MS_PER_MONTH;

type Bounds = { gte?: number; gt?: number; lte?: number; lt?: number };
const mul = (x: number | undefined, k: number) => (x == null ? x : x * k);
const inBounds = (v: number, b: Bounds) =>
  (b.gte == null || v >= b.gte) && (b.gt == null || v > b.gt) && (b.lte == null || v <= b.lte) && (b.lt == null || v < b.lt);

export function evaluateCodeCheck(check: CodeCheck, f: PatientFacts): CheckResult {
  switch (check.type) {
    case 'age':
      return inBounds(f.age, check);
    case 'sex':
      return (check.sex === 'female') === (f.sex === 'F');
    case 'lab': {
      const o = f.record.observations[check.field];
      if (!o || typeof o.value !== 'number') return 'unknown';
      if (check.max_age_months != null && monthsAgo(o.date, f.asOf) > check.max_age_months) return 'unknown';
      // Guard: a ratio threshold (0.70) against a value stored in % (70).
      const bounds = [check.gte, check.gt, check.lte, check.lt].filter((b) => b != null) as number[];
      const scale = o.unit === '%' && bounds.every((b) => b <= 1.5) && o.value > 1.5 ? 100 : 1;
      const b = { gte: mul(check.gte, scale), gt: mul(check.gt, scale), lte: mul(check.lte, scale), lt: mul(check.lt, scale) };
      return inBounds(o.value, b);
    }
  }
}

/** Does the criterion apply to this patient? 'maybe' when the gate is clinical and Jev must judge. */
export function applies(c: StructuredCriterion, f: Pick<PatientFacts, 'age' | 'sex'>): boolean | 'maybe' {
  const a = c.applies_to;
  if (!a) return true;
  if (a.sex && (a.sex === 'female') !== (f.sex === 'F')) return false;
  if (a.min_age != null && f.age < a.min_age) return false;
  if (a.max_age != null && f.age > a.max_age) return false;
  return a.condition ? 'maybe' : true;
}

export function isReviewItem(c: StructuredCriterion): boolean {
  return c.class !== 'record';
}

/** A short Jev question. "Yes" means the criterion's condition holds; the option keys stay accept/reject/unknown. */
export function structuredQuestion(c: StructuredCriterion, order: Answer[] = DEFAULT_ORDER): JevChoiceQuestion {
  const gate = c.applies_to?.condition;
  const inc = c.kind === 'inclusion';
  const options: Record<Answer, string> = inc
    ? {
        accept: 'Yes, the record shows this.' + (gate ? ` Or the patient is not in the group: ${gate}.` : ''),
        reject: 'No, the record shows otherwise.',
        unknown: 'Not stated in the record.',
      }
    : {
        accept: 'No, nothing in the record shows this.' + (gate ? ` Or the patient is not in the group: ${gate}.` : ''),
        reject: 'Yes, the record shows this.',
        unknown: 'The record mentions something related but cannot settle it.',
      };
  return {
    type: 'choice',
    instructions:
      `${inc ? 'Inclusion' : 'Exclusion'}: ${c.question}` +
      (gate ? `\nApplies only to: ${gate}.` : '') +
      (inc ? '' : '\nA diagnosis, medication or procedure not in the record counts as absent.'),
    criteria: Object.fromEntries(order.map((a) => [a, options[a]])),
  };
}

/** Keeps the time note, age, sex and only the listed sections of a full Jev state (engine/state.ts). */
export function filterState(state: Record<string, unknown>, sections: Section[]): Record<string, unknown> {
  const keep = new Set(['note', 'age', 'sex', ...sections.map((s) => SECTION_STATE_KEYS[s])]);
  // Smoking status lives in the labs section; the labs section stays whole.
  return Object.fromEntries(Object.entries(state).filter(([k]) => keep.has(k)));
}

export type JevCall = { sections: Section[]; questions: Record<string, JevChoiceQuestion> };

export type PatientPlan = {
  /** Already decided in code, keyed by criterion id. */
  decided: Record<string, Answer>;
  /** How each decided answer was reached, for the drill-down. */
  decidedBy: Record<string, 'not_applicable' | 'code'>;
  /** The Jev call to make, if any: at most one per patient and trial. */
  jevCalls: JevCall[];
  /** Confirm-at-screening items for this patient; not in the bucket. */
  review: string[];
};

export function planPatient(tc: TrialCriteria, f: PatientFacts, order: Answer[] = DEFAULT_ORDER): PatientPlan {
  const plan: PatientPlan = { decided: {}, decidedBy: {}, jevCalls: [], review: [] };
  const toJev: StructuredCriterion[] = [];

  for (const c of tc.criteria) {
    const ap = applies(c, f);
    if (ap === false) {
      plan.decided[c.id] = 'accept';
      plan.decidedBy[c.id] = 'not_applicable';
      continue;
    }
    if (isReviewItem(c)) {
      plan.review.push(c.id);
      continue;
    }
    if (c.code_check && ap === true) {
      const r = evaluateCodeCheck(c.code_check, f);
      plan.decided[c.id] = r === 'unknown' ? 'unknown' : r === (c.kind === 'inclusion') ? 'accept' : 'reject';
      plan.decidedBy[c.id] = 'code';
      continue;
    }
    toJev.push(c);
  }

  // One call per patient and trial: every question shares a state with the union of the
  // sections they need (TypeSafe: questions sharing a state belong in one request).
  if (toJev.length) {
    plan.jevCalls.push({
      sections: SECTIONS.filter((s) => toJev.some((c) => c.sections.includes(s))),
      questions: Object.fromEntries(toJev.map((c) => [c.id, structuredQuestion(c, order)])),
    });
  }
  return plan;
}

export type GroupedResult = {
  bucket: Bucket;
  /** One entry per record criterion, or per OR group (keyed by the group name). */
  units: Record<string, Answer>;
  review: string[];
};

/**
 * Combines code and Jev answers. OR groups pass if any member accepts, fail only
 * if every member rejects, else unknown; a review member inside a group counts
 * as unknown, because the screening visit could still pass it. Review items
 * outside groups never count. A missing answer counts as unknown, never as a pass.
 */
export function combine(tc: TrialCriteria, answers: Record<string, Answer>, review: string[] = []): GroupedResult {
  const units: Record<string, Answer> = {};
  for (const c of tc.criteria) {
    const isReview = review.includes(c.id);
    if (!c.group && (isReview || (c.class !== 'record' && !answers[c.id]))) continue;
    const a = isReview ? 'unknown' : (answers[c.id] ?? 'unknown');
    if (!c.group) {
      units[c.id] = a;
      continue;
    }
    const prev = units[c.group];
    units[c.group] =
      prev === undefined
        ? a
        : prev === 'accept' || a === 'accept'
          ? 'accept'
          : prev === 'reject' && a === 'reject'
            ? 'reject'
            : 'unknown';
  }
  const vals = Object.values(units);
  const bucket: Bucket = vals.includes('reject') ? 'not_a_match' : vals.includes('unknown') ? 'chart_review' : 'candidate';
  return { bucket, units, review };
}
