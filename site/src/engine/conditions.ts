import type { Patient } from './types.ts';

// Condition prefilter: does the patient have the disease this trial studies?
// A lookup against data/conditions/trial_conditions.json (see its README). No model involved.

export type MeasurementRule = { type: 'observation'; field: string; gte?: number; gt?: number; lt?: number; lte?: number };

export type TrialConditionEntry = {
  /** Patient SNOMED codes that count as the trial's disease. */
  codes: string[];
  /** For trials defined by a measurement, e.g. bmi >= 30. */
  rules: MeasurementRule[];
  /** Healthy-volunteer trials have no disease to filter on. */
  healthy_volunteers: boolean;
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
 * Jev would cost far more than the trial is worth. The matcher warns about such trials.
 */
export function conditionMatch(
  patient: Patient,
  entry: TrialConditionEntry | undefined,
  snomedName: (code: string) => string,
): string | null {
  if (!entry) return null;
  if (entry.healthy_volunteers) return 'healthy-volunteer trial';
  const codes = new Set(entry.codes);
  const hit = patient.record.conditions.find(([code]) => codes.has(code));
  if (hit) return snomedName(hit[0]);
  const rule = entry.rules.find((r) => meets(r, patient));
  if (rule) return `${rule.field} ${rule.gte !== undefined ? `≥ ${rule.gte}` : rule.lt !== undefined ? `< ${rule.lt}` : 'in range'}`;
  return null;
}
