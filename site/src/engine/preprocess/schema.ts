// Structured eligibility criteria: the shape stored on `trials.criteria_questions`.
//
// A generative model (Gemini through OpenRouter) splits a trial's free-text
// eligibility into these items once per trial version. Pure types and
// constants, no runtime side effects.

/** Bump when the prompt or the schema changes. Part of the skip-if-unchanged key. */
export const PROMPT_VERSION = 1;
/** Version of the stored document shape. */
export const SCHEMA_VERSION = 1;

/**
 * How a criterion gets decided.
 *  record          answerable from a patient record: Jev, or code when `code_check` is set
 *  screening       needs a test, score or exam done at the screening visit, or a fact no
 *                  record holds (family history, pregnancy status, contraception plans)
 *  subgroup        applies only to a subgroup (`applies_to`), and for that subgroup it is
 *                  a screening item. Patients outside the subgroup pass it in code.
 *  administrative  consent, willingness, compliance, site logistics, investigator judgement
 * `screening`, `subgroup` and `administrative` never affect the bucket on their own; they are
 * listed on every candidate as "confirm at screening". Inside an OR group they count as
 * unknown, so a group can't fail while an unchecked alternative could still pass it.
 */
export const CLASSES = ['record', 'screening', 'subgroup', 'administrative'] as const;
export type CriterionClass = (typeof CLASSES)[number];

/** State sections a record question needs. Mirrors the keys built by engine/state.ts. */
export const SECTIONS = ['conditions', 'medications', 'procedures', 'labs', 'weights', 'acute_visits'] as const;
export type Section = (typeof SECTIONS)[number];

/** Section name → key in the Jev state from engine/state.ts `buildState`. */
export const SECTION_STATE_KEYS: Record<Section, string> = {
  conditions: 'conditions',
  medications: 'medications',
  procedures: 'procedures',
  labs: 'latest_labs_and_vitals',
  weights: 'weights_last_year',
  acute_visits: 'emergency_urgent_and_hospital_visits_last_3_years',
};

/** Observation fields in a patient record (data/synthea-nj.json `observations`). */
export const LAB_FIELDS = [
  'bmi', 'weight_kg', 'height_cm', 'systolic_bp', 'diastolic_bp', 'hba1c', 'glucose', 'creatinine',
  'egfr', 'alt', 'ast', 'bilirubin', 'wbc', 'hemoglobin', 'platelets', 'eosinophils', 'cholesterol',
  'ldl', 'hdl', 'triglycerides', 'fev1_fvc',
] as const;
export type LabField = (typeof LAB_FIELDS)[number];

/**
 * A check code can run without Jev. Each returns true, false or unknown about the
 * criterion's *condition* ("age is 18 to under 80", "BMI is 30 or more", "had a
 * diagnosis of X in the last N months"); the criterion kind turns that into a result.
 */
export type CodeCheck =
  | { type: 'age'; gte?: number; gt?: number; lte?: number; lt?: number }
  | { type: 'sex'; sex: 'female' | 'male' }
  | { type: 'lab'; field: LabField; gte?: number; gt?: number; lte?: number; lt?: number; unit: string; max_age_months?: number }
  | {
      type: 'date_window';
      event: 'condition' | 'medication' | 'procedure';
      /** Lowercase name fragments matched against record display names. */
      terms: string[];
      within_months?: number;
      min_duration_months?: number;
      active?: boolean;
    };

export type AppliesTo = {
  sex?: 'female' | 'male';
  min_age?: number;
  max_age?: number;
  /** A clinical subgroup code can't gate, e.g. "participants on insulin". Jev gets told. */
  condition?: string;
  /** The subgroup in the registry's words. */
  description: string;
};

export type StructuredCriterion = {
  id: string; // 'inc_1', 'exc_4'
  kind: 'inclusion' | 'exclusion';
  class: CriterionClass;
  applies_to: AppliesTo | null;
  /**
   * Short, record-answerable yes/no question, phrased so "yes" means the criterion's
   * condition holds. Inclusion: yes = meets it. Exclusion: yes = the exclusion applies.
   */
  question: string;
  sections: Section[];
  /** Criteria sharing a group are alternatives: the group passes if any member passes. */
  group: string | null;
  original_text: string;
  code_check: CodeCheck | null;
};

export type TrialCriteria = {
  schema_version: number;
  nct_id: string;
  /** The trial's last_update_post_date this was built from. */
  source_version: string | null;
  prompt_version: number;
  model: string;
  status: 'llm' | 'fallback';
  generated_at: string;
  warnings: string[];
  criteria: StructuredCriterion[];
};

// ---------- the JSON schema sent to the model ----------
//
// Strict structured output wants every property required and no unions of
// objects, so the model fills a flat shape with nulls and validate.ts turns it
// into the clean types above.

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, 'null'], ...extra });

export const LLM_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['criteria'],
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id', 'kind', 'class', 'applies_to', 'question', 'sections', 'group', 'original_text', 'code_check',
        ],
        properties: {
          id: { type: 'string', description: "'inc_1', 'inc_2', ... then 'exc_1', ..." },
          kind: { type: 'string', enum: ['inclusion', 'exclusion'] },
          class: { type: 'string', enum: [...CLASSES] },
          applies_to: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['sex', 'min_age', 'max_age', 'condition', 'description'],
            properties: {
              sex: nullable('string', { enum: ['female', 'male', null] }),
              min_age: nullable('number'),
              max_age: nullable('number'),
              condition: nullable('string'),
              description: { type: 'string' },
            },
          },
          question: { type: 'string', description: 'Yes/no question, under 160 characters.' },
          sections: { type: 'array', items: { type: 'string', enum: [...SECTIONS] } },
          group: nullable('string'),
          original_text: { type: 'string' },
          code_check: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: [
              'type', 'gte', 'gt', 'lte', 'lt', 'sex', 'field', 'unit', 'max_age_months',
              'event', 'terms', 'within_months', 'min_duration_months', 'active',
            ],
            properties: {
              type: { type: 'string', enum: ['age', 'sex', 'lab', 'date_window'] },
              gte: nullable('number'),
              gt: nullable('number'),
              lte: nullable('number'),
              lt: nullable('number'),
              sex: nullable('string', { enum: ['female', 'male', null] }),
              field: nullable('string', { enum: [...LAB_FIELDS, null] }),
              unit: nullable('string'),
              max_age_months: nullable('number'),
              event: nullable('string', { enum: ['condition', 'medication', 'procedure', null] }),
              terms: { type: ['array', 'null'], items: { type: 'string' } },
              within_months: nullable('number'),
              min_duration_months: nullable('number'),
              active: nullable('boolean'),
            },
          },
        },
      },
    },
  },
} as const;
