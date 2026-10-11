import type { Criterion } from './types.ts';

// Splits ClinicalTrials.gov free-text eligibility into atomic criteria.
//
// The registry text is loosely formatted Markdown: an "Inclusion Criteria"
// heading, an "Exclusion Criteria" heading, then bullets (`*`, `-`) or numbered
// items, with sub-bullets indented under them. Each top-level item becomes one
// criterion; indented lines and sub-items are folded into their parent.
// This is the naive splitter. Known weak spots: items that pack several
// conditions together, and sub-headings that sit between items.

const MAX_CRITERION_CHARS = 1200;

const ITEM = /^(\s*)(?:[*\-•]|\d{1,2}[.)])\s+(.*)$/;
const INCLUSION_HEADING = /inclusion\s+criteria/i;
const EXCLUSION_HEADING = /exclusion\s+criteria/i;

/** Remove the Markdown escapes the registry adds, e.g. `\<`, `\>`, `\[`, `\*`. */
function unescape(text: string): string {
  return text.replace(/\\([<>[\]*.()_\-#+!|^])/g, '$1');
}

function isHeading(line: string): boolean {
  const t = line.trim();
  return t.length < 80 && (INCLUSION_HEADING.test(t) || EXCLUSION_HEADING.test(t));
}

function splitSection(lines: string[]): string[] {
  const items: string[] = [];
  let topIndent: number | null = null;
  let current: string[] | null = null;

  const flush = () => {
    if (current) items.push(current.join(' ').replace(/\s+/g, ' ').trim());
    current = null;
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    const m = ITEM.exec(line);
    const indent = line.length - line.trimStart().length;
    if (m && (topIndent === null || indent <= topIndent)) {
      topIndent ??= indent;
      flush();
      current = [m[2]];
    } else if (current) {
      // A sub-item or wrapped line belongs to the item above it. Short lines with
      // no punctuation are sub-headings ("Medical conditions") and are dropped.
      const t = line.trim();
      if (!m && t.length < 60 && !/[.;:,)]$/.test(t)) continue;
      current.push(t);
    }
    // Lines before the first item (preambles) are dropped.
  }
  flush();
  // "A ... OR" followed by "B ..." are alternatives, not two required criteria: merge them.
  const merged: string[] = [];
  for (const item of items) {
    const prev = merged.at(-1);
    if (prev && /\b(or|OR)[:;,]?$/.test(prev)) merged[merged.length - 1] = `${prev} ${item}`;
    else merged.push(item);
  }
  return merged.filter((s) => s.length > 2);
}

export function splitEligibility(raw: string | null): Criterion[] {
  if (!raw) return [];
  const lines = unescape(raw).split('\n');

  const excAt = lines.findIndex((l) => isHeading(l) && EXCLUSION_HEADING.test(l));
  const incAt = lines.findIndex((l) => isHeading(l) && INCLUSION_HEADING.test(l));
  const incLines = lines.slice(incAt >= 0 ? incAt + 1 : 0, excAt >= 0 ? excAt : undefined);
  const excLines = excAt >= 0 ? lines.slice(excAt + 1) : [];

  const make = (kind: Criterion['kind'], prefix: string) => (text: string, i: number): Criterion => ({
    id: `${prefix}_${i + 1}`,
    kind,
    text: text.length > MAX_CRITERION_CHARS ? text.slice(0, MAX_CRITERION_CHARS) + '…' : text,
  });

  return [
    ...splitSection(incLines).map(make('inclusion', 'inc')),
    ...splitSection(excLines).map(make('exclusion', 'exc')),
  ];
}
