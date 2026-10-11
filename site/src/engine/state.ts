import { conditionAction, procedureAction } from './trim.ts';
import type { CodeBook, Patient } from './types.ts';

// Builds the de-identified patient state sent to Jev.
//
// Emits: age (capped at 90), sex, and the clinical record as one short line per
// item, with times relative to today ("8y", "14mo"). Never emits the patient's
// name, ID, birth date, practice or any exact date. Social/admin entries and visit
// boilerplate are dropped, dental work is collapsed to one line (see trim.ts).

const MS_PER_MONTH = 30.44 * 24 * 3600 * 1000;

export function ageOn(birthDate: string, asOf: Date): number {
  const b = new Date(birthDate);
  let age = asOf.getUTCFullYear() - b.getUTCFullYear();
  const m = asOf.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && asOf.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export function monthsAgo(date: string, asOf: Date): number {
  return Math.max(0, Math.round((asOf.getTime() - new Date(date).getTime()) / MS_PER_MONTH));
}

/** Compact relative time: "0mo", "14mo", "8y". */
export function ago(months: number): string {
  return months < 24 ? `${months}mo` : `${Math.round(months / 12)}y`;
}

/** "Asthma (disorder)" → "Asthma". The tag is only needed for trimming. */
function stripTag(name: string): string {
  return name.replace(/\s*\([a-z/ ]+\)\s*$/, '').replace(/\s{2,}/g, ' ');
}

export type JevState = Record<string, unknown>;

export function buildState(patient: Patient, codes: CodeBook, asOf: Date): JevState {
  const r = patient.record;
  const name = (book: Record<string, string>, code: string) => book[code] ?? `code ${code}`;
  const age = ageOn(patient.birth_date, asOf);

  const conditions = r.conditions
    .map(([code, start, stop]) => ({ n: name(codes.snomed, code), s: monthsAgo(start, asOf), e: stop ? monthsAgo(stop, asOf) : null }))
    .filter((c) => conditionAction(c.n) === 'keep')
    .map((c) => `${stripTag(c.n)} (${c.e === null ? `active, since ${ago(c.s)}` : `resolved, ${ago(c.s)}–${ago(c.e)}`})`);

  const medications = r.medications.map(([code, start, stop]) => {
    const n = name(codes.rxnorm, code).replace(/^NDA\d+\s+/, '');
    return `${n} (${stop ? `stopped, ${ago(monthsAgo(start, asOf))}–${ago(monthsAgo(stop, asOf))}` : `active, since ${ago(monthsAgo(start, asOf))}`})`;
  });

  const procedures: string[] = [];
  let lastDental: number | null = null;
  for (const [code, last] of r.procedures) {
    const n = name(codes.snomed, code);
    const m = monthsAgo(last, asOf);
    const action = procedureAction(n, m);
    if (action === 'keep') procedures.push(`${stripTag(n)} (${ago(m)})`);
    else if (action === 'lab order') procedures.push(`${stripTag(n)} (${ago(m)}; test ordered, no result on file)`);
    else if (action === 'dental summary') lastDental = Math.min(lastDental ?? m, m);
  }
  if (lastDental !== null) procedures.push(`Routine dental care (most recent ${ago(lastDental)})`);

  const labs = Object.entries(r.observations).map(
    ([field, o]) => `${field.replace(/_/g, ' ')}: ${o.value}${o.unit ? ` ${o.unit}` : ''} (${ago(monthsAgo(o.date, asOf))})`,
  );

  const state: JevState = {
    note: 'All times are how long ago: "8y" = 8 years ago, "14mo" = 14 months ago.',
    age: age >= 90 ? '90+' : age,
    sex: patient.sex === 'F' ? 'female' : 'male',
    conditions,
    medications,
    procedures,
    labs,
  };
  if (r.weights?.length) state.weights_kg = r.weights.map(([d, kg]) => `${kg} (${ago(monthsAgo(d, asOf))})`).join(', ');
  if (r.acuteVisits?.length) {
    state.emergency_urgent_hospital_visits = r.acuteVisits.map(
      ([d, kind, desc, reason]) => `${kind}, ${ago(monthsAgo(d, asOf))}: ${stripTag(desc)}${reason ? `; reason: ${reason}` : ''}`,
    );
  }
  return state;
}

/** A small state for the condition prefilter: only age, sex and diagnoses. */
export function buildConditionState(patient: Patient, codes: CodeBook, asOf: Date): JevState {
  const { note, age, sex, conditions } = buildState(patient, codes, asOf);
  return { note, age, sex, conditions };
}
