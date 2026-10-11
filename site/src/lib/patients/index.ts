import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Synthetic patients from data/synthea-nj.json (Synthea, no real people).
 * Read from disk on the server only. Patient data never goes to Supabase.
 */

/* ————————— Bundle shape (see data/build_synthea_bundle.py) ————————— */

type CodedSpan = [code: string, start: string, end: string | null];
type CodedEvent = [code: string, date: string];
type Observation = { value: number | string; unit: string | null; date: string };
type AcuteVisit = [date: string, kind: string, description: string, reason: string | null];

interface RawPatient {
  id: string;
  name: string;
  birthDate: string;
  sex: 'F' | 'M';
  race: string;
  ethnicity: string;
  group: string;
  conditions: CodedSpan[];
  medications: CodedSpan[];
  procedures: CodedEvent[];
  observations: Record<string, Observation>;
  weights: [date: string, kg: number][];
  acuteVisits: AcuteVisit[];
}

interface Bundle {
  source: string;
  asOf: string;
  codes: { snomed: Record<string, string>; rxnorm: Record<string, string>; loinc: Record<string, string> };
  patients: RawPatient[];
}

/* ————————— Loading ————————— */

const DATA_PATH = process.env.PATIENT_DATA_PATH ?? path.join(process.cwd(), '..', 'data', 'synthea-nj.json');

let bundle: Bundle | null = null;
let summaries: PatientSummary[] | null = null;

function getBundle(): Bundle {
  if (!bundle) {
    bundle = JSON.parse(readFileSync(DATA_PATH, 'utf8')) as Bundle;
  }
  return bundle;
}

/* ————————— Helpers ————————— */

/** Whole years between birthDate and the bundle's as-of date. */
function ageOn(birthDate: string, asOf: string): number {
  const birth = new Date(birthDate);
  const ref = new Date(asOf);
  let age = ref.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    ref.getUTCMonth() < birth.getUTCMonth() ||
    (ref.getUTCMonth() === birth.getUTCMonth() && ref.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** "Hypertension (disorder)" → { name: "Hypertension", kind: "disorder" } */
function splitSnomed(label: string): { name: string; kind: string | null } {
  const match = label.match(/^(.*) \(([^()]+)\)$/);
  return match ? { name: match[1], kind: match[2] } : { name: label, kind: null };
}

function snomedName(code: string): { name: string; kind: string | null } {
  return splitSnomed(getBundle().codes.snomed[code] ?? `SNOMED ${code}`);
}

/** Synthea records social and administrative "conditions" (employment, stress…) alongside diagnoses. */
const NON_CLINICAL =
  /employment|educat|school|labor force|unemployed|social|stress|intimate partner|violence|criminal|housing|transport|risk activity|refugee|military|homeless|medication review|dental filling|sterilization requested|tubal ligation|miscarriage/i;

function isClinical(name: string, kind: string | null): boolean {
  if (kind === 'person' || kind === 'morphologic abnormality') return false;
  return !NON_CLINICAL.test(name);
}

/** Friendlier names for the SNOMED terms a doctor sees most. */
const SHORT_NAMES: Record<string, string> = {
  'Body mass index 30+ - obesity': 'Obesity',
  'Body mass index 40+ - severely obese': 'Severe obesity',
  'Essential hypertension': 'Hypertension',
  'Diabetes mellitus type 2': 'Type 2 diabetes',
  'Metabolic syndrome X': 'Metabolic syndrome',
  'Abnormal findings diagnostic imaging heart+coronary circulat': 'Abnormal cardiac imaging',
  'Chronic obstructive bronchitis': 'COPD (chronic bronchitis)',
  'Pulmonary emphysema': 'COPD (emphysema)',
};

/** SNOMED code → display name, with the short form where there is one. */
function conditionName(code: string): { name: string; kind: string | null } {
  const { name, kind } = snomedName(code);
  return { name: SHORT_NAMES[name] ?? name, kind };
}

function rxnormName(code: string): string {
  return getBundle().codes.rxnorm[code] ?? `RxNorm ${code}`;
}

const OBSERVATION_LABELS: Record<string, string> = {
  bmi: 'BMI',
  height_cm: 'Height',
  weight_kg: 'Weight',
  systolic_bp: 'Systolic BP',
  diastolic_bp: 'Diastolic BP',
  hba1c: 'HbA1c',
  glucose: 'Glucose',
  cholesterol: 'Total cholesterol',
  ldl: 'LDL',
  hdl: 'HDL',
  triglycerides: 'Triglycerides',
  creatinine: 'Creatinine',
  egfr: 'eGFR',
  alt: 'ALT',
  ast: 'AST',
  bilirubin: 'Bilirubin',
  wbc: 'White blood cells',
  hemoglobin: 'Hemoglobin',
  platelets: 'Platelets',
  eosinophils: 'Eosinophils',
  fev1_fvc: 'FEV1/FVC',
  smoking_status: 'Smoking status',
};

const PAGE_SIZE = 50;

/* ————————— Public types ————————— */

export interface PatientSummary {
  id: string;
  name: string;
  age: number;
  sex: 'F' | 'M';
  county: string;
  /** Active clinical conditions (social findings left out), most recent first. */
  activeDiagnoses: string[];
  activeMedicationCount: number;
  bmi: number | null;
  hba1c: number | null;
  bloodPressure: string | null;
}

export interface PatientDetail {
  id: string;
  name: string;
  age: number;
  sex: 'F' | 'M';
  race: string;
  ethnicity: string;
  county: string;
  birthDate: string;
  activeConditions: { name: string; clinical: boolean; since: string }[];
  pastConditions: { name: string; clinical: boolean; start: string; end: string }[];
  activeMedications: { name: string; since: string }[];
  pastMedicationCount: number;
  observations: { key: string; label: string; value: string; unit: string | null; date: string }[];
  weights: { date: string; kg: number }[];
  acuteVisits: { date: string; kind: string; reason: string | null }[];
  recentProcedures: { name: string; date: string }[];
}

export interface PatientListResult {
  asOf: string;
  source: string;
  patients: PatientSummary[];
  total: number;
  page: number;
  pageCount: number;
}

export interface PatientStats {
  total: number;
  counties: { name: string; count: number }[];
  medianAge: number;
  femaleShare: number;
}

/* ————————— Queries ————————— */

function toSummary(p: RawPatient, asOf: string): PatientSummary {
  const active = p.conditions
    .filter(([, , end]) => end === null)
    .map(([code, start]) => ({ ...conditionName(code), start }))
    .filter((c) => isClinical(c.name, c.kind))
    .sort((a, b) => b.start.localeCompare(a.start));
  const num = (key: string) => {
    const value = p.observations[key]?.value;
    return typeof value === 'number' ? value : null;
  };
  const systolic = num('systolic_bp');
  const diastolic = num('diastolic_bp');

  return {
    id: p.id,
    name: p.name,
    age: ageOn(p.birthDate, asOf),
    sex: p.sex,
    county: p.group,
    activeDiagnoses: active.map((c) => c.name),
    activeMedicationCount: p.medications.filter(([, , end]) => end === null).length,
    bmi: num('bmi'),
    hba1c: num('hba1c'),
    bloodPressure: systolic !== null && diastolic !== null ? `${Math.round(systolic)}/${Math.round(diastolic)}` : null,
  };
}

export function getPatientStats(): PatientStats {
  const { patients, asOf } = getBundle();
  const counts = new Map<string, number>();
  for (const p of patients) counts.set(p.group, (counts.get(p.group) ?? 0) + 1);
  const ages = patients.map((p) => ageOn(p.birthDate, asOf)).sort((a, b) => a - b);

  return {
    total: patients.length,
    counties: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)),
    medianAge: ages[Math.floor(ages.length / 2)] ?? 0,
    femaleShare: patients.length ? patients.filter((p) => p.sex === 'F').length / patients.length : 0,
  };
}

function getSummaries(): PatientSummary[] {
  const { patients, asOf } = getBundle();
  summaries ??= patients.map((p) => toSummary(p, asOf));
  return summaries;
}

/** Most common active clinical conditions in a county (one practice's panel), most common first. */
export function getConditionCounts(county: string, limit = 12): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of getSummaries()) {
    if (p.county !== county) continue;
    for (const d of p.activeDiagnoses) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function listPatients(opts: {
  county?: string;
  /** Patient must have every one of these active conditions. */
  conditions?: string[];
  query?: string;
  page?: number;
}): PatientListResult {
  const { asOf, source } = getBundle();
  const query = opts.query?.trim().toLowerCase();

  let rows = getSummaries();
  if (opts.county) rows = rows.filter((r) => r.county === opts.county);
  if (opts.conditions?.length) rows = rows.filter((r) => opts.conditions!.every((c) => r.activeDiagnoses.includes(c)));
  if (query) {
    rows = rows.filter(
      (r) => r.name.toLowerCase().includes(query) || r.activeDiagnoses.some((d) => d.toLowerCase().includes(query))
    );
  }
  rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), pageCount);

  return {
    asOf,
    source,
    patients: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: rows.length,
    page,
    pageCount,
  };
}

export function getPatient(id: string): PatientDetail | null {
  const { patients, asOf } = getBundle();
  const p = patients.find((x) => x.id === id);
  if (!p) return null;

  const byDateDesc = <T extends { date: string }>(a: T, b: T) => b.date.localeCompare(a.date);

  return {
    id: p.id,
    name: p.name,
    age: ageOn(p.birthDate, asOf),
    sex: p.sex,
    race: p.race,
    ethnicity: p.ethnicity,
    county: p.group,
    birthDate: p.birthDate,
    activeConditions: p.conditions
      .filter(([, , end]) => end === null)
      .map(([code, start]) => {
        const { name, kind } = conditionName(code);
        return { name, clinical: isClinical(name, kind), since: start };
      })
      .sort((a, b) => Number(b.clinical) - Number(a.clinical) || b.since.localeCompare(a.since)),
    pastConditions: p.conditions
      .filter((c): c is [string, string, string] => c[2] !== null)
      .map(([code, start, end]) => {
        const { name, kind } = conditionName(code);
        return { name, clinical: isClinical(name, kind), start, end };
      })
      .sort((a, b) => b.end.localeCompare(a.end)),
    activeMedications: p.medications
      .filter(([, , end]) => end === null)
      .map(([code, start]) => ({ name: rxnormName(code), since: start }))
      .sort((a, b) => b.since.localeCompare(a.since)),
    pastMedicationCount: p.medications.filter(([, , end]) => end !== null).length,
    observations: Object.entries(p.observations).map(([key, o]) => ({
      key,
      label: OBSERVATION_LABELS[key] ?? key,
      value: typeof o.value === 'number' ? String(Math.round(o.value * 10) / 10) : splitSnomed(o.value).name,
      unit: o.unit,
      date: o.date,
    })),
    weights: p.weights.map(([date, kg]) => ({ date, kg })).sort(byDateDesc),
    acuteVisits: p.acuteVisits
      .map(([date, kind, , reason]) => ({ date, kind, reason: reason ? splitSnomed(reason).name : null }))
      .sort(byDateDesc),
    recentProcedures: p.procedures
      .map(([code, date]) => ({ name: snomedName(code).name, date }))
      .sort(byDateDesc)
      .slice(0, 10),
  };
}
