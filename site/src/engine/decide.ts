import { ANSWERS, type Answer, type Bucket, type Criterion, type CriterionResult } from './types.ts';

// Turns Jev's per-question probabilities into a bucket and a ranking score.
// Pure code: Jev answers questions, this decides what the answers mean.

export type JevChoiceAnswer = { probabilities?: Record<string, number>; choice?: string };

/**
 * A reject below this probability becomes unknown (chart review) instead of ruling the
 * patient out. In the PoC test, wrong rejects had a median of 0.56 and right ones 0.86.
 */
export const REJECT_THRESHOLD = 0.6;

export function toResult(c: Criterion, a: JevChoiceAnswer | undefined): CriterionResult {
  const p = a?.probabilities ?? {};
  const probabilities = Object.fromEntries(ANSWERS.map((k) => [k, p[k] ?? 0])) as Record<Answer, number>;
  let answer = a
    ? ANSWERS.reduce((best, k) => (probabilities[k] > probabilities[best] ? k : best), 'unknown' as Answer)
    : 'unknown';
  if (answer === 'reject' && probabilities.reject < REJECT_THRESHOLD) answer = 'unknown';
  return { id: c.id, kind: c.kind, answer, probabilities };
}

export function bucketOf(results: CriterionResult[]): {
  bucket: Bucket;
  accepts: number;
  rejects: number;
  unknowns: number;
  score: number;
} {
  const count = (a: Answer) => results.filter((r) => r.answer === a).length;
  const rejects = count('reject');
  const unknowns = count('unknown');
  const score = results.length
    ? results.reduce((s, r) => s + r.probabilities.accept, 0) / results.length
    : 0;
  const bucket: Bucket = rejects > 0 ? 'not_match' : unknowns > 0 ? 'review' : 'candidate';
  return { bucket, accepts: count('accept'), rejects, unknowns, score };
}
