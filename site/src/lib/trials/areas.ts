/**
 * Therapeutic areas, so a specialist can find their trials at a glance.
 *
 * Rules run in order and the first hit wins. Condition text is checked first
 * (it's what the sponsor wrote); MeSH terms are the fallback for anything the
 * text rules miss.
 */

export type TherapeuticArea =
  | 'solid-tumors'
  | 'blood-cancers'
  | 'immunology'
  | 'respiratory'
  | 'cardiovascular'
  | 'metabolic'
  | 'eye'
  | 'neurology'
  | 'other';

interface AreaRule {
  area: Exclude<TherapeuticArea, 'other'>;
  label: string;
  text: RegExp;
  mesh: RegExp;
}

const RULES: AreaRule[] = [
  {
    area: 'blood-cancers',
    label: 'Blood cancers',
    text: /myeloma|lymphoma|leuka?emia|myelodysplastic|gammopathy|light chain amyloidosis|clonal cytopenia/i,
    mesh: /Lymphoproliferative|Paraproteinemias|Leukemia/,
  },
  {
    area: 'solid-tumors',
    label: 'Solid tumors',
    text: /cancer|carcinoma|tumou?r|melanoma|gli(o|oblast)oma|mesothelioma|nsclc|ependymoma|sarcoma/i,
    mesh: /Neoplasms/,
  },
  {
    area: 'eye',
    label: 'Eye',
    text: /macular|retina|geographic atrophy|glaucoma|ocular|conjunctivitis|graves/i,
    mesh: /Eye Diseases/,
  },
  {
    area: 'respiratory',
    label: 'Respiratory',
    text: /asthma|copd|obstructive pulmonary|pulmonary arterial|nasal polyp/i,
    mesh: /Respiratory Tract Diseases/,
  },
  {
    area: 'cardiovascular',
    label: 'Heart and blood',
    text: /thrombo|embolism|fibrillation|artery disease|hemophilia|hemoglobinuria|anemia|cardiomyopathy|heart failure/i,
    mesh: /Cardiovascular Diseases|Hematologic Diseases/,
  },
  {
    area: 'immunology',
    label: 'Immunology and skin',
    text: /dermatitis|prurigo|prurit|alopecia|hidradenitis|urticaria|arthritis|polymyalgia|lupus|esophagitis|myositis|chaple/i,
    mesh: /Skin Diseases|Immune System Diseases|Rheumatic Diseases|Autoimmune/,
  },
  {
    area: 'metabolic',
    label: 'Metabolic and kidney',
    text: /obesity|steato|mash|masld|cholesterol|lipodystrophy|kidney|dialysis|diabet/i,
    mesh: /Metabolic Diseases|Kidney Diseases|Liver Diseases|Digestive System Diseases/,
  },
  {
    area: 'neurology',
    label: 'Brain and nerves',
    text: /alzheimer|parkinson|amyotrophic|prion|hearing|neuromuscular|fibrodysplasia/i,
    mesh: /Nervous System Diseases|Musculoskeletal Diseases/,
  },
];

export const AREA_LABELS: Record<TherapeuticArea, string> = {
  ...(Object.fromEntries(RULES.map((r) => [r.area, r.label])) as Record<AreaRule['area'], string>),
  other: 'Other',
};

/** Display order for filters. */
export const AREA_ORDER: TherapeuticArea[] = [...RULES.map((r) => r.area), 'other'];

export function isTherapeuticArea(value: unknown): value is TherapeuticArea {
  return typeof value === 'string' && (AREA_ORDER as string[]).includes(value);
}

export function classifyTrial(conditions: string[], meshTerms: string[]): TherapeuticArea {
  const text = conditions.join(' | ');
  const mesh = meshTerms.join(' | ');
  return (
    RULES.find((r) => r.text.test(text))?.area ??
    RULES.find((r) => r.mesh.test(mesh))?.area ??
    'other'
  );
}
