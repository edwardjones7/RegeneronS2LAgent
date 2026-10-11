// Pure and client-safe: the trial cards, filters and walkthrough all use these.

/**
 * How many of one practice's patients the matcher put in each bucket for one trial.
 * Counts only. Stays inside the practice: no small-cell suppression, so never pool these
 * across practices for a sponsor view.
 */
export interface PrescreenCounts {
  candidates: number;
  /** Chart review: a record criterion the engine couldn't settle. */
  review: number;
  notAMatch: number;
  evaluatedAt: string;
}

/** The practice has patients worth a look: candidates or chart-review patients. */
export const canFill = (p: PrescreenCounts | null): boolean => Boolean(p && p.candidates + p.review > 0);
