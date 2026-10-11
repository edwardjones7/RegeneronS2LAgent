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
  // Outside a gated inclusion criterion's group, it passes, unless it is one alternative
  // in an OR group: then it simply isn't the alternative that applies, and must not
  // satisfy the group on the patient's behalf.
  const outside = gate ? ` Or the patient is not in the group: ${gate}.` : '';
  const options: Record<Answer, string> = inc
    ? {
        accept: 'Yes, the record shows this.' + (c.group ? '' : outside),
        reject: 'No, the record shows otherwise.' + (c.group ? outside : ''),
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
  /**
   * Jev-asked criteria whose precondition code couldn't settle (value missing or stale, or
   * a gated inclusion alternative). Pass their Jev answers through `finalAnswer`.
   */
  preconditionUnknown: string[];
};

export function planPatient(tc: TrialCriteria, f: PatientFacts, order: Answer[] = DEFAULT_ORDER): PatientPlan {
  const plan: PatientPlan = { decided: {}, decidedBy: {}, jevCalls: [], review: [], preconditionUnknown: [] };
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
    if (c.code_check && c.code_check_role === 'precondition') {
      // "Number AND clinical fact": code checks the number, Jev only the rest.
      const r = evaluateCodeCheck(c.code_check, f);
      // A gated inclusion outside any group passes outside its gate whatever the number,
      // so there a failed check can't settle it (validation keeps this case out).
      const settles = ap === true || c.kind === 'exclusion' || c.group != null;
      if (r === false && settles) {
        plan.decided[c.id] = c.kind === 'inclusion' ? 'reject' : 'accept'; // condition false
        plan.decidedBy[c.id] = 'code';
        continue;
      }
      if (r !== true) plan.preconditionUnknown.push(c.id);
      toJev.push(c);
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

/**
 * A Jev answer on a criterion whose precondition is unsettled: the condition is
 * "number AND rest" (three-valued AND), so only an answer that the rest is false settles
 * it; anything else is unknown. Other criteria keep Jev's answer.
 */
export function finalAnswer(c: StructuredCriterion, plan: PatientPlan, a: Answer): Answer {
  if (!plan.preconditionUnknown.includes(c.id)) return a;
  const conditionFalse: Answer = c.kind === 'inclusion' ? 'reject' : 'accept';
  return a === conditionFalse ? conditionFalse : 'unknown';
}

export type GroupedResult = {
  bucket: Bucket;
  /** One entry per record criterion, or per OR group (keyed by the group name). */
  units: Record<string, Answer>;
  review: string[];
};

/**
 * Combines code and Jev answers into one result per criterion or group.
 * Inclusion groups are alternatives ("any of the following"): accept if any member
 * accepts, reject only if every member rejects, else unknown. Exclusion groups list
 * things that each exclude ("any of the following"): reject if any member rejects,
 * accept only if every member accepts, else unknown. A review member inside a group
 * counts as unknown, because the screening visit could still settle it. Members that
 * don't apply to this patient are left out of their group; a group with no member
 * left passes. Review items outside groups never count. A missing answer counts as
 * unknown, never as a pass.
 */
export function combine(
  tc: TrialCriteria,
  answers: Record<string, Answer>,
  review: string[] = [],
  notApplicable: string[] = [],
): GroupedResult {
  const units: Record<string, Answer> = {};
  const members = new Map<string, Answer[]>();
  const groupKind = new Map<string, StructuredCriterion['kind']>();
  for (const c of tc.criteria) {
    const isReview = review.includes(c.id);
    if (!c.group && (isReview || (c.class !== 'record' && !answers[c.id]))) continue;
    if (!c.group) {
      units[c.id] = answers[c.id] ?? 'unknown';
      continue;
    }
    groupKind.set(c.group, c.kind);
    if (!members.has(c.group)) members.set(c.group, []);
    if (notApplicable.includes(c.id)) continue;
    members.get(c.group)!.push(isReview ? 'unknown' : (answers[c.id] ?? 'unknown'));
  }
  for (const [g, as] of members) {
    const [win, lose] = groupKind.get(g) === 'inclusion' ? (['accept', 'reject'] as const) : (['reject', 'accept'] as const);
    units[g] = !as.length ? 'accept' : as.includes(win) ? win : as.every((a) => a === lose) ? lose : 'unknown';
  }
  const vals = Object.values(units);
  const bucket: Bucket = vals.includes('reject') ? 'not_a_match' : vals.includes('unknown') ? 'chart_review' : 'candidate';
  return { bucket, units, review };
}
