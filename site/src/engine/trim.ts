// Rules that shape the record before it goes to Jev. Diagnoses, symptoms, acute
// illnesses, meds, labs, pregnancy and clinically meaningful procedures all stay.
// Only entries that say nothing about medical fit are dropped, and repetitive
// routine entries are collapsed. Code-evaluated criteria never see this; it only
// shapes the Jev state.

const semanticTag = (name: string) => /\(([a-z/ ]+)\)\s*$/.exec(name)?.[1] ?? '';

// Social and administrative SNOMED concepts. Only (finding), (situation) and (person)
// entries are tested, so clinical findings like "Body mass index 30+ - obesity" or
// "Prediabetes" can never match. These matter for the outbound call, not medical fit.
const SOCIAL = new RegExp(
  [
    'employment', 'unemployed', 'labor force', 'education', 'educated',
    'social contact', 'social isolation', '^stress \\(', 'housing', 'homeless', 'transport',
    'criminal record', 'violence in the environment', 'intimate partner abuse', 'refugee',
    'military service', 'risk activity', 'medication review due', 'sterilization requested',
  ].join('|'),
  'i',
);

// Pregnancy-related entries always stay: pregnancy is a common exclusion.
const PREGNANCY = /pregnan|fetal|parturition|uterine fundal|aneuploidy|alpha-fetoprotein|antenatal|prenatal|obstetric/i;

// Dental work: kept as one summary line, not every cleaning and X-ray.
const DENTAL_PROCEDURE = /dental|tooth|teeth|gingiv|plaque|denture|fluoride|bitewing|periodontal|orthodontic|oral examination|impression/i;

// Lab and specimen orders. Results, when they exist, are in labs; the order alone
// only shows a test was done, so it is labelled that way for Jev.
const LAB_ORDER = /hemogram|urine (culture|specimen|screening)|urinalysis|throat culture|sputum examination|blood smear|blood group|culture \(|titer test|antigen test|antibody|antigen (assay|measurement)|skin test for tuberculosis|occult blood|laboratory test|complete blood count|metabolic panel|cytopathology|screening test/i;

// Visit boilerplate: records that a form or step happened, not what it found.
// Real findings (e.g. a depression diagnosis) are in conditions.
const BOILERPLATE = new RegExp(
  [
    'screening(?! mammography)|^assessment (of|using)|questionnaire|anticipatory guidance|medication reconciliation|health and social care needs|oral health',
    'history taking|history and physical|physical examination|review of systems|brief general examination|initial patient assessment|plan of care|documentation|notifications|certification|scheduling|information gathering|^discussion|education|counseling|^referral|liaising|coordination of care|consultation|evaluation procedure|^evaluating|diagnostic assessment|comprehensive interview|care regimes assessment|risk assessment|telemedicine|patient informed|medical records review|multidisciplinary|nursing care|professional / ancillary|taking patient vital|measurement procedure|triage|patient discharge|discharge (from|to)|pre-discharge|patient transfer|transfer to|admission to|preparation of patient|placing subject|face mask',
  ].join('|'),
  'i',
);
// Screenings that are themselves evidence for a trial's condition.
const KEEP = /asthma screening|allergy screening|screening mammography/i;
const VACCINE = /vaccine|immunization|tetanus antitoxin/i;
const VACCINE_KEEP_MONTHS = 6; // "live vaccine in the past 4 weeks" style criteria

export type ConditionAction = 'keep' | 'drop:social/admin';
export type ProcedureAction = 'keep' | 'lab order' | 'dental summary' | 'drop:boilerplate' | 'drop:old vaccine';

export function conditionAction(name: string): ConditionAction {
  return ['finding', 'situation', 'person'].includes(semanticTag(name)) && SOCIAL.test(name) ? 'drop:social/admin' : 'keep';
}

export function procedureAction(name: string, monthsAgo: number): ProcedureAction {
  if (KEEP.test(name) || PREGNANCY.test(name)) return 'keep';
  if (VACCINE.test(name)) return monthsAgo > VACCINE_KEEP_MONTHS ? 'drop:old vaccine' : 'keep';
  if (DENTAL_PROCEDURE.test(name)) return 'dental summary';
  if (LAB_ORDER.test(name)) return 'lab order';
  if (BOILERPLATE.test(name)) return 'drop:boilerplate';
  return 'keep';
}
