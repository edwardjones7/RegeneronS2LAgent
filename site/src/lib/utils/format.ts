const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-09" → "Oct 9, 2026"; "2026-05" → "May 2026"; partial dates stay partial. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  if (!month) return String(year);
  if (!day) return `${MONTHS[month - 1]} ${year}`;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

/** "PHASE2" → "Phase 2", "EARLY_PHASE1" → "Early phase 1", "NA" → "N/A". */
export function formatPhase(phase: string): string {
  if (phase === 'NA') return 'N/A';
  return phase
    .replace('EARLY_PHASE', 'Early phase ')
    .replace('PHASE', 'Phase ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatPhases(phases: string[]): string {
  return phases.length ? phases.map(formatPhase).join(' / ') : '—';
}

/** "NOT_YET_RECRUITING" → "Not yet recruiting". */
export function formatStatus(status: string): string {
  const words = status.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatAgeRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return 'Any age';
  if (max === null) return `${min}+`;
  if (min === null) return `Up to ${max}`;
  return `${min}–${max}`;
}
