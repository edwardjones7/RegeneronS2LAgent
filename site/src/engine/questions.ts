import type { Answer, Criterion } from './types.ts';

// Turns criteria into Jev `choice` questions. Every question offers the same
// three options (accept, reject, unknown); the descriptions change with the
// criterion kind. Option order matters: Jev leans toward the first option, so
// the order is a parameter and gets measured, not assumed.

export type JevChoiceQuestion = {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
};

export const DEFAULT_ORDER: Answer[] = ['accept', 'reject', 'unknown'];

function ordered(options: Record<Answer, string>, order: Answer[]): Record<string, string> {
  return Object.fromEntries(order.map((a) => [a, options[a]]));
}

export function criterionQuestion(c: Criterion, order: Answer[] = DEFAULT_ORDER): JevChoiceQuestion {
  if (c.kind === 'inclusion') {
    return {
      type: 'choice',
      instructions:
        `Clinical trial INCLUSION criterion: "${c.text}"\n` +
        'Using only the patient record in the state, decide whether the patient meets this criterion.',
      criteria: ordered(
        {
          accept: 'The record shows the patient meets this criterion.',
          reject: 'The record shows the patient does not meet this criterion.',
          unknown:
            'The record does not contain the information needed to decide, for example a test, score, ' +
            'consent or willingness that is not recorded.',
        },
        order,
      ),
    };
  }
  return {
    type: 'choice',
    instructions:
      `Clinical trial EXCLUSION criterion: "${c.text}"\n` +
      'Using only the patient record in the state, decide whether this exclusion applies to the patient. ' +
      'A diagnosis, medication or procedure that is not in the record counts as absent.',
    criteria: ordered(
      {
        accept: 'The exclusion does not apply: the record shows nothing that matches it.',
        reject: 'The exclusion applies: the record shows something that matches it.',
        unknown:
          'The record cannot settle it, for example it depends on a test, a screening-visit result or ' +
          "the investigator's judgement that is not recorded.",
      },
      order,
    ),
  };
}

export function criteriaQuestions(criteria: Criterion[], order: Answer[] = DEFAULT_ORDER) {
  return Object.fromEntries(criteria.map((c) => [c.id, criterionQuestion(c, order)]));
}
