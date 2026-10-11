import type { Patient } from './types.ts';

// Condition prefilter: does the patient have the disease this trial studies?
// A lookup against data/conditions/trial_condition_codes.json (see its README).
// No model involved.

export type MeasurementRule = { type: 'observation'; field: string; gte?: number; gt?: number; lt?: number; lte?: number };

export type TrialConditionEntry = {
  matched_patient_codes: { code: string; name: string }[];
  measurement_rules: MeasurementRule[];
  flags: string[];
};

export type TrialConditionMap = Record<string, TrialConditionEntry>;

function meets(rule: MeasurementRule, patient: Patient): boolean {
  const v = patient.record.observations[rule.field]?.value;
  if (typeof v !== 'number') return false;
  return (
    (rule.gte === undefined || v >= rule.gte) &&
    (rule.gt === undefined || v > rule.gt) &&
    (rule.lt === undefined || v < rule.lt) &&
    (rule.lte === undefined || v <= rule.lte)
  );
}

/**
 * Why the patient passes the trial's condition prefilter, or null if they don't.
 * A trial missing from the map passes no one: sending every age/sex-eligible patient to
 * Jev would cost far more than the trial is worth. The matcher warns about such trials;
 * rebuild the map (data/conditions/README.md) to include them.
 */
export function conditionMatch(patient: Patient, entry: TrialConditionEntry | undefined): string | null {
  if (!entry) return null;
  if (entry.flags.includes('healthy_volunteers_no_condition_filter')) return 'healthy-volunteer trial';
  const codes = new Set(patient.record.conditions.map(([code]) => code));
  const hit = entry.matched_patient_codes.find((c) => codes.has(c.code));
  if (hit) return hit.name;
  const rule = entry.measurement_rules.find((r) => meets(r, patient));
  if (rule) return `${rule.field} ${rule.gte !== undefined ? `≥ ${rule.gte}` : rule.lt !== undefined ? `< ${rule.lt}` : 'in range'}`;
  return null;
}
