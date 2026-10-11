import { LAB_UNITS,
  CLASSES, LAB_FIELDS, SECTIONS,
  type AppliesTo, type CodeCheck, type CriterionClass, type LabField, type Section, type StructuredCriterion,
} from './schema.ts';

// Checks the model's output and turns its flat, null-filled shape into
// StructuredCriterion[]. Errors mean "don't trust this, use the fallback";
// warnings are kept on the stored document for a human to look at.

export type Validation =
  | { ok: true; criteria: StructuredCriterion[]; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

const MAX_QUESTION_CHARS = 200;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Drops undefined fields so stored JSON stays small. */
function compact<T extends Obj>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export function normalizeText(s: string): string {
  return s
    .replace(/\\([<>[\]*.()_\-#+!|^])/g, '$1')
    .toLowerCase()
    .replace(/[^a-z0-9≥≤<>%.]+/g, ' ')
    .trim();
}

const normUnit = (u: string) =>
  u.toLowerCase().replace(/µ/g, 'u').replace(/\{|\}|\[|\]|\s/g, '').replace(/\*/g, '^').replace(/m\^?2$/, 'm2');
/** Units that mean the same as the record's unit for a field. Empty means "the record's unit". */
const UNIT_ALIASES: Partial<Record<LabField, string[]>> = {
  wbc: ['10^9/l', 'k/ul', 'x10^3/ul', 'x10^9/l'], platelets: ['10^9/l', 'k/ul', 'x10^3/ul', 'x10^9/l'],
  eosinophils: ['10^9/l', 'k/ul', 'x10^3/ul', 'x10^9/l'], fev1_fvc: ['ratio', 'fraction', ''],
  egfr: ['ml/min', 'ml/min/1.73m2'], systolic_bp: ['mm[hg]', 'mmhg'], diastolic_bp: ['mm[hg]', 'mmhg'],
};
export function unitMatches(field: LabField, unit: string | undefined): boolean {
  if (!unit) return true;
  const u = normUnit(unit);
  const record = normUnit(LAB_UNITS[field].split(' ')[0]);
  return u === record || (UNIT_ALIASES[field] ?? []).map(normUnit).includes(u);
}

function parseCodeCheck(v: unknown, where: string, warnings: string[]): CodeCheck | null {
  if (v == null) return null;
  const bad = (why: string) => (warnings.push(`${where}: code_check dropped, ${why}`), null);
  if (!isObj(v)) return bad('not an object');
  switch (v.type) {
    case 'age': {
      const c = compact({ type: 'age' as const, gte: num(v.gte), gt: num(v.gt), lte: num(v.lte), lt: num(v.lt) });
      return Object.keys(c).length > 1 ? c : bad('age with no bound');
    }
    case 'sex':
      return v.sex === 'female' || v.sex === 'male' ? { type: 'sex', sex: v.sex } : bad('sex missing');
    case 'lab': {
      if (!LAB_FIELDS.includes(v.field as LabField)) return bad(`unknown lab field ${String(v.field)}`);
      const c = compact({
        type: 'lab' as const,
        field: v.field as LabField,
        gte: num(v.gte),
        gt: num(v.gt),
        lte: num(v.lte),
        lt: num(v.lt),
        unit: str(v.unit) ?? '',
        max_age_months: num(v.max_age_months),
      });
      if (![c.gte, c.gt, c.lte, c.lt].some((b) => b !== undefined)) return bad('lab with no bound');
      // A threshold in another unit than the record's (cells/uL vs 10^3/uL, mmol/mol vs %) would
      // silently misjudge everyone: drop the check and let Jev read the value instead.
      if (!unitMatches(c.field, c.unit)) return bad(`unit ${c.unit} is not the record's ${LAB_UNITS[c.field]}`);
      return c;
    }
    default:
      return bad(`unknown type ${String(v.type)}`);
  }
}

function parseAppliesTo(v: unknown, where: string, errors: string[]): AppliesTo | null {
  if (v == null) return null;
  if (!isObj(v)) return (errors.push(`${where}: applies_to is not an object`), null);
  const a = compact({
    sex: v.sex === 'female' || v.sex === 'male' ? (v.sex as 'female' | 'male') : undefined,
    min_age: num(v.min_age),
    max_age: num(v.max_age),
    condition: str(v.condition),
    description: str(v.description) ?? '',
  });
  // An applies_to with nothing in it means the criterion applies to everyone.
  if (a.sex === undefined && a.min_age === undefined && a.max_age === undefined && a.condition === undefined) return null;
  return a;
}

/**
 * @param output  the parsed model output, or its raw JSON string
 * @param source  the trial's eligibility text, used to flag invented items
 */
export function validateCriteria(output: unknown, source = ''): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];

  let parsed = output;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch (e) {
      return { ok: false, errors: [`not JSON: ${(e as Error).message}`], warnings };
    }
  }
  const list = isObj(parsed) ? parsed.criteria : undefined;
  if (!Array.isArray(list) || list.length === 0) return { ok: false, errors: ['no criteria array'], warnings };

  const criteria: StructuredCriterion[] = [];
  list.forEach((raw, i) => {
    const where = `item ${i + 1}`;
    if (!isObj(raw)) return void errors.push(`${where}: not an object`);
    const kind = raw.kind;
    if (kind !== 'inclusion' && kind !== 'exclusion') return void errors.push(`${where}: bad kind`);
    const cls = raw.class as CriterionClass;
    if (!CLASSES.includes(cls)) return void errors.push(`${where}: bad class ${String(raw.class)}`);
    const question = str(raw.question);
    const original = str(raw.original_text);
    if (!question) errors.push(`${where}: empty question`);
    if (!original) errors.push(`${where}: empty original_text`);
    if (!question || !original) return;
    if (question.length > MAX_QUESTION_CHARS) warnings.push(`${where}: question is ${question.length} characters`);

    const sections = Array.isArray(raw.sections) ? raw.sections : [];
    const unknown = sections.filter((s) => !SECTIONS.includes(s as Section));
    if (unknown.length) warnings.push(`${where}: dropped unknown sections ${unknown.join(', ')}`);
    const codeCheck = cls === 'record' ? parseCodeCheck(raw.code_check, where, warnings) : null;
    let clean = [...new Set(sections.filter((s): s is Section => SECTIONS.includes(s as Section)))];
    // Age and sex are always in the state, so an age or sex check needs no section.
    const selfContained = codeCheck?.type === 'age' || codeCheck?.type === 'sex';
    if (cls === 'record' && !clean.length && !selfContained) {
      warnings.push(`${where}: record item with no sections, using all`);
      clean = [...SECTIONS];
    }
    if (cls !== 'record') clean = [];

    const appliesTo = parseAppliesTo(raw.applies_to, where, errors);
    if (cls === 'subgroup' && !appliesTo) errors.push(`${where}: subgroup item without applies_to`);

    criteria.push({
      id: str(raw.id) ?? '',
      kind,
      class: cls,
      applies_to: appliesTo,
      question,
      sections: clean,
      group: str(raw.group) ?? null,
      original_text: original,
      code_check: codeCheck,
    });
  });

  // Ids: unique and of the form inc_N / exc_N matching the kind, else renumber.
  const idOk = (c: StructuredCriterion) => new RegExp(`^${c.kind === 'inclusion' ? 'inc' : 'exc'}_\\d+$`).test(c.id);
  const ids = criteria.map((c) => c.id);
  if (criteria.some((c) => !idOk(c)) || new Set(ids).size !== ids.length) {
    warnings.push('ids were missing, duplicated or mismatched; renumbered');
    let inc = 0;
    let exc = 0;
    for (const c of criteria) c.id = c.kind === 'inclusion' ? `inc_${++inc}` : `exc_${++exc}`;
  }

  // Groups: alternatives must share a kind and have at least two members.
  const groups = Map.groupBy(criteria.filter((c) => c.group), (c) => c.group!);
  for (const [g, members] of groups) {
    if (members.length < 2) {
      warnings.push(`group ${g} has one member; cleared`);
      members[0].group = null;
    } else if (new Set(members.map((m) => m.kind)).size > 1) {
      errors.push(`group ${g} mixes inclusion and exclusion items`);
    }
  }

  if (!criteria.some((c) => c.kind === 'inclusion') && /inclusion/i.test(source)) {
    errors.push('source has inclusion criteria but output has none');
  }

  // Invented items: most words of original_text should appear in the source.
  if (source) {
    const words = new Set(normalizeText(source).split(' '));
    for (const c of criteria) {
      const own = normalizeText(c.original_text).split(' ').filter((w) => w.length > 3);
      const hit = own.filter((w) => words.has(w)).length;
      if (own.length >= 3 && hit / own.length < 0.6) warnings.push(`${c.id}: original_text not found in the source`);
    }
  }

  return errors.length ? { ok: false, errors, warnings } : { ok: true, criteria, warnings };
}
