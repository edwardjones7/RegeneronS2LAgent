import { splitEligibility } from '../eligibility.ts';
import { SECTIONS, type StructuredCriterion } from './schema.ts';

// Used when the model call fails or its output doesn't validate: the naive
// regex splitter, plus a few keyword rules for the class so consent and
// screening-visit items stay out of the bucket. Coarse on purpose; the stored
// document is marked status 'fallback' and gets retried on the next run.

const ADMIN = /\b(informed consent|willing|able to comply|ability to comply|investigator'?s? (opinion|judge?ment)|according to (the )?investigator|protocol[- ]defined|participat\w+ in (another|other) (clinical )?(study|trial))\b/i;
const SCREENING = /\b(at screening|screening visit|at baseline|at randomi[sz]ation|run-in|family history|pregnan|breast-?feeding|contracepti|ECOG|Karnofsky|FeNO|ACQ|questionnaire|score of)\b/i;
const FEMALE = /^(female participants|women of (child-?bearing|reproductive) potential|wocbp)\b/i;
const MALE = /^male participants\b/i;

export function fallbackCriteria(eligibility: string | null): StructuredCriterion[] {
  return splitEligibility(eligibility).map((c) => {
    const female = FEMALE.test(c.text);
    const male = MALE.test(c.text);
    const cls = ADMIN.test(c.text)
      ? 'administrative'
      : female || male
        ? 'subgroup'
        : SCREENING.test(c.text)
          ? 'screening'
          : 'record';
    return {
      id: c.id,
      kind: c.kind,
      class: cls,
      applies_to: female
        ? { sex: 'female', description: 'Female participants' }
        : male
          ? { sex: 'male', description: 'Male participants' }
          : null,
      question: c.text,
      sections: cls === 'record' ? [...SECTIONS] : [],
      group: null,
      original_text: c.text,
      code_check: null,
    };
  });
}
