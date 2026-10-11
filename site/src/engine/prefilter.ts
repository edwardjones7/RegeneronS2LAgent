import { ageOn } from './state.ts';
import type { Patient, Trial } from './types.ts';

// Code-only prefilter on the structured trial fields. Free, runs before any Jev call.

export function passesDemographics(patient: Patient, trial: Trial, asOf: Date): boolean {
  const age = ageOn(patient.birth_date, asOf);
  if (trial.minimum_age_years != null && age < Number(trial.minimum_age_years)) return false;
  if (trial.maximum_age_years != null && age > Number(trial.maximum_age_years)) return false;
  if (trial.sex === 'MALE' && patient.sex !== 'M') return false;
  if (trial.sex === 'FEMALE' && patient.sex !== 'F') return false;
  return true;
}

/** Healthy-volunteer trials have no condition to look for, so they skip the condition prefilter. */
export function needsConditionCheck(trial: Trial): boolean {
  return !trial.healthy_volunteers && trial.conditions.length > 0;
}
