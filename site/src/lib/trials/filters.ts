import { isTherapeuticArea, type TherapeuticArea } from './areas';
import type { TrialListItem } from './queries';

/**
 * Filters for the trials page, one per fact on the trial card. Pure and client-safe:
 * the server filters with it and the filter menu builds URLs with it.
 */

interface Option<V extends string> {
  value: V;
  label: string;
  test: (t: TrialListItem) => boolean;
}

const PHASE_OPTIONS: Option<string>[] = [
  { value: '1', label: 'Phase 1', test: (t) => t.phases.some((p) => p === 'PHASE1' || p === 'EARLY_PHASE1') },
  { value: '2', label: 'Phase 2', test: (t) => t.phases.includes('PHASE2') },
  { value: '3', label: 'Phase 3', test: (t) => t.phases.includes('PHASE3') },
  { value: '4', label: 'Phase 4', test: (t) => t.phases.includes('PHASE4') },
];

const minAge = (t: TrialListItem) => t.minimumAge ?? 0;
const maxAge = (t: TrialListItem) => t.maximumAge ?? Infinity;

/** A trial matches an age group if its age range overlaps it. */
const AGE_OPTIONS: Option<string>[] = [
  { value: 'child', label: 'Under 18', test: (t) => minAge(t) < 18 },
  { value: 'adult', label: '18–64', test: (t) => minAge(t) <= 64 && maxAge(t) >= 18 },
  { value: 'older', label: '65+', test: (t) => maxAge(t) >= 65 },
];

const SEX_OPTIONS: Option<string>[] = [
  { value: 'all', label: 'All', test: (t) => t.sex === 'ALL' },
  { value: 'female', label: 'Female', test: (t) => t.sex === 'FEMALE' },
  { value: 'male', label: 'Male', test: (t) => t.sex === 'MALE' },
];

const SIZE_OPTIONS: Option<string>[] = [
  { value: 'small', label: 'Under 100', test: (t) => t.enrollment !== null && t.enrollment < 100 },
  { value: 'medium', label: '100–499', test: (t) => t.enrollment !== null && t.enrollment >= 100 && t.enrollment < 500 },
  { value: 'large', label: '500+', test: (t) => t.enrollment !== null && t.enrollment >= 500 },
];

const endYear = (t: TrialListItem) => (t.primaryCompletion ? Number(t.primaryCompletion.slice(0, 4)) : null);

const ENDS_OPTIONS: Option<string>[] = [
  { value: '2027', label: 'By 2027', test: (t) => (endYear(t) ?? Infinity) <= 2027 },
  { value: '2028', label: '2028', test: (t) => endYear(t) === 2028 },
  { value: '2029', label: '2029', test: (t) => endYear(t) === 2029 },
  { value: '2030', label: '2030 or later', test: (t) => (endYear(t) ?? 0) >= 2030 },
];

export const FILTER_GROUPS = [
  { key: 'phase', label: 'Phase', options: PHASE_OPTIONS },
  { key: 'age', label: 'Ages', options: AGE_OPTIONS },
  { key: 'sex', label: 'Sex', options: SEX_OPTIONS },
  { key: 'size', label: 'Enrolling', options: SIZE_OPTIONS },
  { key: 'ends', label: 'Ends', options: ENDS_OPTIONS },
] as const;

export type FilterGroupKey = (typeof FILTER_GROUPS)[number]['key'];

export interface TrialFilters {
  area: TherapeuticArea | null;
  /** Selected option values per group; empty means no filter. */
  groups: Record<FilterGroupKey, string[]>;
  /** Only trials with hand-authored criteria. */
  ready: boolean;
  /** Only trials recruiting at a New Jersey site. */
  nj: boolean;
}

type Query = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export function parseFilters(query: Query): TrialFilters {
  const groups = {} as Record<FilterGroupKey, string[]>;
  for (const g of FILTER_GROUPS) {
    const allowed = new Set(g.options.map((o) => o.value));
    groups[g.key] = first(query[g.key])
      .split(',')
      .filter((v) => allowed.has(v));
  }
  const area = first(query.area);
  return { area: isTherapeuticArea(area) ? area : null, groups, ready: first(query.ready) === '1', nj: first(query.nj) === '1' };
}

export function filtersToQuery(f: TrialFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (f.area) query.area = f.area;
  for (const g of FILTER_GROUPS) if (f.groups[g.key].length) query[g.key] = f.groups[g.key].join(',');
  if (f.ready) query.ready = '1';
  if (f.nj) query.nj = '1';
  return query;
}

export function filtersHref(f: TrialFilters): string {
  const qs = new URLSearchParams(filtersToQuery(f)).toString();
  return qs ? `/trials?${qs}` : '/trials';
}

/** Filters set in the menu (everything except area). */
export function countMenuFilters(f: TrialFilters): number {
  return FILTER_GROUPS.reduce((n, g) => n + f.groups[g.key].length, 0) + Number(f.ready) + Number(f.nj);
}

export const NO_MENU_FILTERS: Pick<TrialFilters, 'groups' | 'ready' | 'nj'> = {
  groups: Object.fromEntries(FILTER_GROUPS.map((g) => [g.key, []])) as unknown as Record<FilterGroupKey, string[]>,
  ready: false,
  nj: false,
};

/** Within a group options are OR'd; across groups they're AND'd. */
export function matchesMenuFilters(t: TrialListItem, f: TrialFilters): boolean {
  if (f.ready && !t.hasProtocol) return false;
  if (f.nj && t.njRecruiting === 0) return false;
  return FILTER_GROUPS.every((g) => {
    const selected = f.groups[g.key];
    if (!selected.length) return true;
    return (g.options as readonly Option<string>[]).some((o) => selected.includes(o.value) && o.test(t));
  });
}
