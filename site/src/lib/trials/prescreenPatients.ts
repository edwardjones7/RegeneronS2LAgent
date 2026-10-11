import supabase from '@/lib/utils/db/client';
import type { PrescreenCounts } from './prescreen';
import { getPrescreenCounts, getTrialCriteria } from './queries';

/**
 * One practice's pre-screened patients for one trial, for the doctor's candidate review.
 *
 * PATIENT DATA. This is identifiable (names, ages) and must only ever be shown to the
 * practice the patients belong to. Every read filters on `practice_id`: the server client
 * bypasses RLS, so that filter is the only thing scoping it. Never send this outward.
 */

export type CriterionResult = 'pass' | 'fail' | 'unknown';
export type DecidedBy = 'jev' | 'code' | 'not_applicable';

export interface PatientCriterion {
  id: string;
  kind: 'inclusion' | 'exclusion';
  /** `answer: accept` means the patient passes the criterion, whatever the question's wording. */
  result: CriterionResult;
  decidedBy: DecidedBy;
  /** The engine's question. */
  text: string;
  /** The protocol's own words, when the trial's structured criteria are loaded. */
  originalText: string | null;
  /** Criteria sharing a group are alternatives: passing any one passes the group. */
  group: string | null;
  /** The engine's probability on its own answer; 1 when code decided it. */
  confidence: number | null;
  /** The model answered with less than 0.75 confidence. */
  uncertain: boolean;
}

export interface PrescreenPatient {
  patientId: string;
  name: string;
  age: number | null;
  sex: string | null;
  bucket: 'candidate' | 'chart_review';
  /** Mean probability of a pass over the chart-checked criteria. Ranks patients; not an accuracy. */
  score: number;
  conditionMatch: string;
  minConfidence: number | null;
  criteria: PatientCriterion[];
  /** Criteria no record can settle: confirm at screening or on the call. */
  confirmAtScreening: string[];
}

export interface PrescreenDetail {
  counts: PrescreenCounts | null;
  patients: PrescreenPatient[];
}

interface RawCriterion {
  id: string;
  kind: 'inclusion' | 'exclusion';
  text: string;
  answer: 'accept' | 'reject' | 'unknown';
  decided_by: DecidedBy;
  probabilities?: { accept?: number; reject?: number; unknown?: number };
}

interface ResultRow {
  patient_id: string;
  bucket: 'candidate' | 'chart_review';
  score: number;
  condition_match: string;
  criteria: RawCriterion[];
  review_items: string[];
  min_confidence: number | null;
  uncertain_criteria: string[];
  patients: { name: string; birth_date: string | null; sex: string | null } | null;
}

const RESULT: Record<RawCriterion['answer'], CriterionResult> = { accept: 'pass', reject: 'fail', unknown: 'unknown' };
const PAGE = 1000;

function ageFrom(birthDate: string | null, now = new Date()): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

/** Candidate and chart-review patients for one trial at one practice, best score first. */
export async function getPrescreenDetail(practiceId: string, nctId: string): Promise<PrescreenDetail> {
  const [counts, structured] = await Promise.all([getPrescreenCounts(practiceId, nctId), getTrialCriteria(nctId)]);
  const byId = new Map((structured ?? []).map((c) => [c.id, c]));

  const rows: ResultRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('prescreen_results')
      .select('patient_id, bucket, score, condition_match, criteria, review_items, min_confidence, uncertain_criteria, patients(name, birth_date, sex)')
      .eq('practice_id', practiceId)
      .eq('nct_id', nctId)
      .in('bucket', ['candidate', 'chart_review'])
      .order('score', { ascending: false })
      .order('patient_id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to load pre-screen results: ${error.message}`);
    rows.push(...(data as unknown as ResultRow[]));
    if (data.length < PAGE) break;
  }

  return {
    counts: counts.get(nctId) ?? null,
    patients: rows.map((r) => {
      // 'inc_6 accept 0.62: Did the patient …' → inc_6
      const uncertain = new Set(r.uncertain_criteria.map((u) => u.split(' ')[0]));
      return {
        patientId: r.patient_id,
        name: r.patients?.name ?? 'Unnamed patient',
        age: ageFrom(r.patients?.birth_date ?? null),
        sex: r.patients?.sex ?? null,
        bucket: r.bucket,
        score: r.score,
        conditionMatch: r.condition_match,
        minConfidence: r.min_confidence,
        criteria: r.criteria.map((c) => {
          const s = byId.get(c.id);
          return {
            id: c.id,
            kind: c.kind,
            result: RESULT[c.answer] ?? 'unknown',
            decidedBy: c.decided_by,
            text: c.text,
            originalText: s?.original_text ?? null,
            group: s?.group ?? null,
            confidence: c.probabilities?.[c.answer] ?? null,
            uncertain: uncertain.has(c.id),
          };
        }),
        confirmAtScreening: r.review_items,
      };
    }),
  };
}
