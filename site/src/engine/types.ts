// Shared types for the matching engine. Pure data, no runtime code.

/** A trial row as stored in Supabase `trials` (only the fields the engine uses). */
export type Trial = {
  nct_id: string;
  brief_title: string;
  conditions: string[];
  condition_meshes: { id: string; term: string }[];
  eligibility_criteria: string | null;
  sex: string | null; // 'ALL' | 'MALE' | 'FEMALE'
  minimum_age_years: number | null;
  maximum_age_years: number | null;
  healthy_volunteers: boolean | null;
};

/** The clinical record, same shape as data/synthea-nj.json and Supabase `patients.record`. */
export type PatientRecord = {
  conditions: [code: string, start: string, stop: string | null][];
  medications: [code: string, start: string, stop: string | null][];
  procedures: [code: string, lastDate: string][];
  observations: Record<string, { value: number | string; unit?: string; date: string }>;
  weights?: [date: string, kg: number][];
  acuteVisits?: [date: string, kind: string, description: string, reason: string | null][];
};

export type Patient = {
  id: string;
  practice_id: string;
  birth_date: string;
  sex: 'M' | 'F';
  record: PatientRecord;
};

/** Code system → code → display name. */
export type CodeBook = {
  snomed: Record<string, string>;
  rxnorm: Record<string, string>;
  loinc: Record<string, string>;
};

/** One atomic criterion, split out of a trial's free-text eligibility. */
export type Criterion = {
  id: string; // 'inc_1', 'exc_4'
  kind: 'inclusion' | 'exclusion';
  text: string;
};

/**
 * The three answers every Jev question offers. The keys are the same for
 * inclusion and exclusion; the option descriptions say what each means.
 *  accept  = this criterion does not stop the patient
 *  reject  = this criterion rules the patient out
 *  unknown = the record cannot settle it
 */
export type Answer = 'accept' | 'reject' | 'unknown';
export const ANSWERS: Answer[] = ['accept', 'reject', 'unknown'];

export type CriterionResult = {
  id: string;
  kind: Criterion['kind'];
  answer: Answer;
  probabilities: Record<Answer, number>;
};

export type Bucket = 'candidate' | 'review' | 'not_match';

export type MatchResult = {
  patient_id: string;
  practice_id: string;
  nct_id: string;
  bucket: Bucket;
  accepts: number;
  rejects: number;
  unknowns: number;
  /** Mean probability of 'accept' across all questions. Used to rank patients. */
  score: number;
  criteria: CriterionResult[];
};
