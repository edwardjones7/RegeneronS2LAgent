# Final trial -> patient-condition prefilter, and its evaluation.
# Offline: uses only files already cached in this folder plus the repo's patient file.
# Methods compared:
#   OLD      all trial MeSH terms (minus the old generic list) -> SNOMED, as in coverage.py
#   PRIMARY  only MeSH terms that match the trial's own condition text, plus a bigger stoplist
#   CHILD    PRIMARY + every MeSH descendant of those terms
#   MAP      CHILD + overrides.json (manual fixes, solid-tumor baskets, prevention trials)
#   WORD     trial condition words are a subset of the patient code's name words
#   FINAL    MAP or WORD
import json, re, sys, datetime
from collections import defaultdict, Counter

import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.abspath('../../..') + '/'
D = 'dl_mondo/'

# ---------- MeSH -> SNOMED (Mondo, Disease Ontology, Wikidata) ----------
def load_sssom(fn, pref):
    m = {}
    for line in open(D + fn):
        if line.startswith('#') or line.startswith('subject_id'): continue
        s, _, p, o, *_ = line.rstrip('\n').split('\t')
        if o.startswith(pref): m.setdefault(s, set()).add(o.split(':', 1)[1])
    return m
mesh, sct = {}, {}
for f in ['mondo_exactmatch_mesh.tsv', 'mondo_hasdbxref_mesh.tsv']:
    for k, v in load_sssom(f, 'mesh:').items(): mesh.setdefault(k, set()).update(v)
for f in ['mondo_exactmatch_sctid.tsv', 'mondo_hasdbxref_sctid.tsv']:
    for k, v in load_sssom(f, 'SCTID:').items(): sct.setdefault(k, set()).update(v)
M2S = defaultdict(set); SRC = defaultdict(dict)   # SRC[mesh][sct] = source label
def add(m, s, src):
    M2S[m].add(s); SRC[m].setdefault(s, src)
for mo, ms in mesh.items():
    for m in ms:
        for s in sct.get(mo, ()): add(m, s, 'mondo')
cur = None; dm = {}; ds = {}
for line in open('dl_doid/doid.obo'):
    if line.startswith('[Term]'): cur = None
    elif line.startswith('id: DOID:'): cur = line.split()[1]
    elif cur and line.startswith('xref: MESH:'): dm.setdefault(cur, set()).add(line.split(':')[2].split()[0])
    elif cur and line.startswith('xref: SNOMEDCT_US'): ds.setdefault(cur, set()).add(line.split(':')[2].split()[0])
for d, ms in dm.items():
    for m in ms:
        for s in ds.get(d, ()): add(m, s, 'doid')
for f in ['wikidata_map.json', 'wikidata_desc_map.json']:
    for m, ss in json.load(open(f)).items():
        for s in ss: add(m, s, 'wikidata')
for s, ms in json.load(open('wikidata_snomed_to_mesh.json')).items():
    for m in ms: add(m, s, 'wikidata')
MESH_DESC = json.load(open('mesh_desc.json'))

OLD_GENERIC = {'D009369','D002277','D000230','D009362','D012008','D007249','D005355','D020969','D019964','D009422','D019636','D009468','D030342','D008659','D008661','D001835','D012816','D010335','D013568','D020271'}
# Stoplist: generic or symptom-level MeSH terms ClinicalTrials.gov attaches as secondary terms.
STOP = OLD_GENERIC | {
    'D006470',  # Hemorrhage
    'D013927',  # Thrombosis
    'D020521',  # Stroke
    'D003704',  # Dementia
    'D002493',  # Central Nervous System Diseases
    'D002494',  # Central Nervous System Infections
    'D000038',  # Abscess
    'D015431',  # Weight Loss
    'D007333',  # Insulin Resistance
    'D019337',  # Hematologic Neoplasms
    'D004935',  # Esophageal Diseases
    'D003872',  # Dermatitis
    'D006505',  # Hepatitis
    'D008103',  # Liver Cirrhosis
    'D020447',  # Parasomnias
    'D009220',  # Myositis
    'D006311',  # Hearing Disorders
    'D057165',  # Proteostasis Deficiencies
    'D000686',  # Amyloidosis
    'D009202',  # Cardiomyopathies
}

# ---------- text normalisation ----------
STOPW = set('''a an and or of the with in to for on by at as from without due secondary related associated
disease diseases disorder disorders syndrome type stage advanced metastatic recurrent refractory relapsed
locally local resectable unresectable newly diagnosed high low risk grade first line treatment patient patients
adult adults participant participants control any not otherwise specified nos chronic primary symptomatic
early moderate severe persistent previously untreated mutation mutated gene'''.split())
SYN = {'neoplasm':'cancer','neoplasms':'cancer','carcinoma':'cancer','carcinomas':'cancer','tumor':'cancer',
       'tumors':'cancer','tumour':'cancer','malignant':'cancer','malignancy':'cancer','cancers':'cancer',
       'pulmonary':'lung','renal':'kidney','nephropathy':'kidney','nephropathies':'kidney','colonic':'colon','colo':'colon',
       'colorectal':'colon rectal','prostatic':'prostate','hepatic':'liver','diabetic':'diabetes',
       'arterial':'artery','mesotheliomas':'mesothelioma','lymphomas':'lymphoma','alzheimer':'alzheimer',
       'nonsmall':'non small','hemoglobinuria':'hemoglobinuria'}
ABBR = {'nsclc':'non small cell lung cancer','copd':'chronic obstructive pulmonary','mcrpc':'prostate cancer',
        'ccrcc':'renal cell carcinoma','rcc':'renal cell carcinoma','hnscc':'head neck squamous cell carcinoma',
        'eskd':'end kidney','dkd':'diabetes kidney','rrmm':'multiple myeloma','vte':'venous thromboembolism'}
def toks(s, syn=True):
    s = s.lower().replace("'s", '').replace('’s', '')
    out = []
    for w in re.findall(r'[a-z0-9]+', s):
        if w in ABBR and syn: out += ABBR[w].split(); continue
        if syn and w in SYN: out += SYN[w].split(); continue
        if len(w) > 3 and w.endswith('s') and not w.endswith('ss') and not w.endswith('is'): w = w[:-1]
        out.append(w)
    return {w for w in out if w not in STOPW and not w.isdigit() and len(w) > 1}

def is_primary(term, conds):
    t = toks(term); c = set().union(*[toks(x) for x in conds]) if conds else set()
    return bool(t) and len(t & c) / len(t) >= 0.6

# ---------- data ----------
trials = sorted(json.load(open('trial_meta.json')), key=lambda r: r['nct_id'])
DATA = json.load(open(REPO + 'data/synthea-nj.json'))
PAT = DATA['patients']; ASOF = datetime.date.fromisoformat(DATA['asOf'])
cache = json.load(open('parents_cache.json')); anc = json.load(open('patient_ancestors.json'))
PC = json.load(open('patient_codes.json'))  # code -> [name, n_patients]
CLOS = {c: set(anc[c]) | {c} for c in PC}
def name(c): return PC[c][0] if c in PC else (cache.get(c) or {}).get('display') or c
OV = json.load(open('../overrides.json')); GOLD = json.load(open('gold.json'))

def codes_hitting(targets, exclude=()):
    return {c for c in PC if CLOS[c] & set(targets) and not CLOS[c] & set(exclude)}

MAX_DESC = 30   # only expand fairly specific MeSH terms
def rawtoks(x):
    return {w[:-1] if len(w) > 3 and w.endswith('s') else w for w in re.findall(r'[a-z0-9]+', x.lower())} - {'of', 'and', 'the', 'disease', 'diseases', 'disorder'}
def mesh_targets(mids, children):
    """SNOMED targets for these MeSH ids -> {sct: source}"""
    out = {}
    for m in mids:
        for s in M2S.get(m, ()): out.setdefault(s, f'mesh:{m}:{SRC[m][s]}')
        if children and len(MESH_DESC.get(m, {})) <= MAX_DESC:
            for d, dlabel in MESH_DESC.get(m, {}).items():
                for s in M2S.get(d, ()):
                    # the SNOMED concept must carry every word of the child MeSH term,
                    # so a crosswalk to a broader concept (Bronchitis, Chronic -> Bronchitis) is dropped
                    sn = (cache.get(s) or {}).get('display')
                    if sn and rawtoks(dlabel) <= rawtoks(sn):
                        out.setdefault(s, f'mesh-child:{d}<{m}:{SRC[d][s]}')
    return out

def hits_from_targets(t):
    res = {}
    for c in PC:
        h = CLOS[c] & set(t)
        if h: res[c] = t[sorted(h)[0]]
    return res

# ---------- word match ----------
TAG = re.compile(r'\(([^()]*)\)\s*$')
def pname_tokens(c):
    n = PC[c][0]; m = TAG.search(n); tag = m.group(1) if m else None
    return tag, toks(TAG.sub('', n))
PNAME = {c: pname_tokens(c) for c in PC}
WORD_SKIP = {'anemia', 'metabolic', 'neurodegenerative', 'neuromuscular', 'nerve', 'immunotherapy', 'inflammation', 'pain'}
def word_hits(conds):
    res = {}
    for cs in conds:
        t = toks(re.sub(r'\([^)]*\)', '', cs))   # drop "(COPD)"-style abbreviations
        if not t or (len(t) == 1 and t <= WORD_SKIP) or (t - {'persistent'}) <= WORD_SKIP: continue
        for c, (tag, nt) in PNAME.items():
            if tag not in (None, 'disorder', 'finding'): continue
            if t <= nt: res.setdefault(c, f'word:{cs}')
    return res

# ---------- per-trial methods ----------
SOLID = re.compile(r'solid (tumou?r|cancer|neoplasm|malignan)', re.I)
result = {}
for r in trials:
    n = r['nct_id']; conds = r['conditions'] or []; ms = r['condition_meshes'] or []
    flags = []
    old_t = mesh_targets([m['id'] for m in ms if m['id'] not in OLD_GENERIC], False)
    prim = [m for m in ms if m['id'] not in STOP and is_primary(m['term'], conds)]
    secondary = [m for m in ms if m not in prim]
    prim_t = mesh_targets([m['id'] for m in prim], False)
    child_t = mesh_targets([m['id'] for m in prim], True)
    map_t = dict(child_t); excl = {}
    tov = OV['trial'].get(n, {})
    if tov.get('drop_mapping'): map_t = {}
    rules = []
    for m in ([] if tov.get('drop_mapping') else prim):
        o = OV['mesh'].get(m['id'])
        if o:
            for s in o.get('add', {}): map_t.setdefault(s, f'override:mesh:{m["id"]}')
            excl.update(o.get('exclude', {}))
            if o.get('flag'): flags.append(o['flag'])
            if o.get('rule'): rules.append(o['rule'])
    for s in tov.get('add', {}): map_t.setdefault(s, 'override:trial')
    if tov.get('flag'): flags.append(tov['flag'])
    if tov.get('rule'): rules.append(tov['rule'])
    if any(SOLID.search(c) for c in conds):
        so = OV['solid_tumor']
        for s in so['add']: map_t.setdefault(s, 'override:solid_tumor')
        for s in so['also_codes']: map_t.setdefault(s, 'override:solid_tumor')
        excl.update(so['exclude']); flags.append(so['flag'])
    if not ms: flags.append('no_mesh')
    if ms and not prim: flags.append('no_primary_mesh')
    if n in OV['healthy_only']: flags.append('healthy_volunteers_no_condition_filter')
    if r.get('healthy_volunteers') and n not in OV['healthy_only']: flags.append('also_takes_healthy_volunteers')
    mh = {c: s for c, s in hits_from_targets(map_t).items() if not CLOS[c] & set(excl)}
    w = {} if tov.get('drop_mapping') else word_hits(conds)
    fin = dict(mh); [fin.setdefault(c, s) for c, s in w.items()]
    result[n] = dict(r=r, flags=sorted(set(flags)), rules=rules, prim=prim, secondary=secondary, map_t=map_t,
        OLD=hits_from_targets(old_t), PRIMARY=hits_from_targets(prim_t), CHILD=hits_from_targets(child_t),
        MAP=mh, WORD=w, FINAL=fin)

METHODS = ['OLD', 'PRIMARY', 'CHILD', 'MAP', 'WORD', 'FINAL']

# ---------- patient index ----------
def age(p): b = datetime.date.fromisoformat(p['birthDate']); return (ASOF - b).days / 365.25
PCODES = [{c[0] for c in p['conditions']} for p in PAT]
def agesex_ok(r, p):
    a = age(p)
    if r['minimum_age_years'] is not None and a < float(r['minimum_age_years']): return False
    if r['maximum_age_years'] is not None and a >= float(r['maximum_age_years']) + 1: return False
    s = (r['sex'] or 'ALL').upper()
    return s == 'ALL' or (s == 'MALE' and p['sex'] == 'M') or (s == 'FEMALE' and p['sex'] == 'F')
ELIG = {n: [i for i, p in enumerate(PAT) if agesex_ok(v['r'], p)] for n, v in result.items()}

def pats_with(n, codes):
    return [i for i in ELIG[n] if PCODES[i] & set(codes)]

# ---------- 1. precision ----------
def judge(n, c):
    g = GOLD.get(n, {})
    return 'correct' if c in g.get('correct', []) else 'too_broad' if c in g.get('too_broad', []) else 'wrong'

out = []; P = print
P('# 1. Precision (code level, all 147 trials)')
P('method | trials with hits | code hits | correct | too broad | wrong')
prec = {}
for M in METHODS:
    cnt = Counter(); th = 0
    for n, v in result.items():
        if v[M]: th += 1
        for c in v[M]: cnt[judge(n, c)] += 1
    tot = sum(cnt.values()); prec[M] = (th, tot, cnt)
    P(f"{M} | {th} | {tot} | {cnt['correct']} | {cnt['too_broad']} | {cnt['wrong']}")
P('\nPatient-level precision (age/sex eligible pairs kept by the method):')
P('method | pairs kept | correct pairs | too-broad pairs | wrong pairs')
for M in METHODS:
    cnt = Counter()
    for n, v in result.items():
        for i in ELIG[n]:
            hit = PCODES[i] & set(v[M])
            if not hit: continue
            js = {judge(n, c) for c in hit}
            cnt['correct' if 'correct' in js else 'too_broad' if 'too_broad' in js else 'wrong'] += 1
    P(f"{M} | {sum(cnt.values())} | {cnt['correct']} | {cnt['too_broad']} | {cnt['wrong']}")

P('\nWrong and too-broad hits, OLD method, by trial:')
for n, v in result.items():
    bad = [(judge(n, c), name(c)) for c in v['OLD'] if judge(n, c) != 'correct']
    if bad: P(' ', n, v['r']['conditions'][:2], bad)
P('\nWrong and too-broad hits left in FINAL:')
for n, v in result.items():
    bad = [(judge(n, c), name(c), v['FINAL'][c]) for c in v['FINAL'] if judge(n, c) != 'correct']
    if bad: P(' ', n, v['r']['conditions'][:2], bad)

# ---------- 2. recall ----------
P('\n# 2. Recall against the hand gold (correct codes only), code level and patient level')
P('method | gold codes found / total | gold patients kept / total')
for M in METHODS:
    fc = tc = fp = tp = 0
    for n, g in GOLD.items():
        if n.startswith('_'): continue
        gc = set(g.get('correct', [])); tc += len(gc); fc += len(gc & set(result[n][M]))
        gp = set(pats_with(n, gc)); tp += len(gp); fp += len(gp & set(pats_with(n, result[n][M])))
    P(f'{M} | {fc}/{tc} | {fp}/{tp}')
P('\nGold codes missed by each method:')
for M in ['MAP', 'WORD', 'FINAL']:
    miss = [(n, name(c)) for n, g in GOLD.items() if not n.startswith('_') for c in g.get('correct', []) if c not in result[n][M]]
    P(f' {M}:', miss)

# recall vs the 4 hand-authored protocol rules
P('\nRecall vs protocols/*.json condition rules (age-eligible patients):')
def proto_set(nct):
    pj = json.load(open(REPO + f'protocols/{nct}.json'))
    crit = [c for c in pj['criteria'] if c['type'] == 'inclusion' and c.get('check') == 'code' and c['id'] not in ('age',)]
    main = crit[0]['rule']
    def obs_ok(p, rule):
        o = p['observations'].get(rule['field'])
        if not o or not isinstance(o.get('value'), (int, float)): return False
        if 'maxAgeMonths' in rule and (ASOF - datetime.date.fromisoformat(o['date'])).days > rule['maxAgeMonths'] * 30.44: return False
        v = o['value']
        return ('gte' not in rule or v >= rule['gte']) and ('lt' not in rule or v < rule['lt'])
    def cond_ok(p, rule):
        for c, start, end in p['conditions']:
            if rule.get('active') and end: continue
            if c in rule.get('codes', []) or any(re.search(nm, name(c), re.I) for nm in rule.get('names', [])): return True
        return False
    def ev(p, rule):
        t = rule['type']
        if t == 'condition': return cond_ok(p, rule)
        if t == 'observation': return obs_ok(p, rule)
        if t == 'anyOf': return any(ev(p, x) for x in rule['rules'])
        if t == 'allOf': return all(ev(p, x) for x in rule['rules'])
        raise ValueError(t)
    rel = dict(main); rel.pop('active', None)
    return main, [i for i in ELIG[nct] if ev(PAT[i], main)], [i for i in ELIG[nct] if ev(PAT[i], rel)]
P('trial | rule | rule patients (active / ever) | OLD kept | MAP kept | WORD kept | FINAL kept (of "ever")')
for nct in ['NCT07309614', 'NCT07685808', 'NCT07053423', 'NCT06931717']:
    main, act, ever = proto_set(nct)
    row = [nct, main['type'], f'{len(act)}/{len(ever)}']
    for M in ['OLD', 'MAP', 'WORD', 'FINAL']:
        k = set(pats_with(nct, result[nct][M])); row.append(f'{len(k & set(ever))}')
    P(' | '.join(row))
# obesity: what the BMI rule adds over codes
nct = 'NCT07685808'; _, _, ever = proto_set(nct); codes_p = set(pats_with(nct, result[nct]['FINAL']))
bmi30 = [i for i in ELIG[nct] if (PAT[i]['observations'].get('bmi') or {}).get('value', 0) >= 30]
P(f'Obesity: BMI rule picks {len(ever)}; obese codes pick {len(codes_p)}; overlap {len(codes_p & set(ever))}; latest BMI>=30: {len(bmi30)}; BMI>=30 but no obese code: {len(set(bmi30)-codes_p)}; obese code but latest BMI<30: {len(codes_p-set(bmi30))}')

# ---------- 3. pruning ----------
P('\n# 3. Pruning power')
def kept(n, M):
    v = result[n]
    if 'healthy_volunteers_no_condition_filter' in v['flags']: return ELIG[n]
    return pats_with(n, v[M])
tot_as = sum(len(ELIG[n]) for n in result)
P(f'age/sex only: {tot_as} pairs ({len(result)} trials x {len(PAT)} patients = {len(result)*len(PAT)})')
for M in METHODS:
    k = sum(len(kept(n, M)) for n in result)
    P(f'{M}: {k} pairs kept, {tot_as-k} Jev calls saved ({100*(tot_as-k)/tot_as:.2f}% of age/sex pairs)')
P('\nPer trial (FINAL), trials with any kept pair:')
P('nct | conditions | age/sex | kept | correct-pair patients')
per_trial = {}
for n, v in result.items():
    k = kept(n, 'FINAL'); g = set(pats_with(n, GOLD.get(n, {}).get('correct', [])))
    per_trial[n] = (len(ELIG[n]), len(k), len(g & set(k)))
    if k: P(f"{n} | {v['r']['conditions'][0][:40]} | {len(ELIG[n])} | {len(k)} | {len(g & set(k))}")
P('trials with zero kept pairs:', sum(1 for n in per_trial if per_trial[n][1] == 0))

# ---------- 4. MAP vs WORD ----------
P('\n# 4. MAP vs WORD, code level, correct hits only')
only_map = [(n, name(c)) for n, v in result.items() for c in v['MAP'] if c not in v['WORD'] and judge(n, c) == 'correct']
only_word = [(n, name(c)) for n, v in result.items() for c in v['WORD'] if c not in v['MAP'] and judge(n, c) == 'correct']
bad_word = [(n, judge(n, c), name(c)) for n, v in result.items() for c in v['WORD'] if judge(n, c) != 'correct']
P('correct only via MAP:', len(only_map), Counter(x[1] for x in only_map).most_common())
P('correct only via WORD:', len(only_word), only_word)
P('WORD non-correct hits:', bad_word)

# ---------- 5. measurement-defined trials ----------
P('\n# 5. Measurement rules')
for n, v in result.items():
    for rule in v['rules']:
        f = rule['field']
        sel = [i for i in ELIG[n] if (PAT[i]['observations'].get(f) or {}).get('value') is not None and
               ('gte' not in rule or PAT[i]['observations'][f]['value'] >= rule['gte']) and
               ('lt' not in rule or PAT[i]['observations'][f]['value'] < rule['lt'])]
        has = sum(1 for i in ELIG[n] if PAT[i]['observations'].get(f))
        codek = set(kept(n, 'FINAL'))
        P(f"{n} {v['r']['conditions'][0][:35]} | {f} {rule} | measured {has} | rule picks {len(sel)} | code filter {len(codek)} | rule-only {len(set(sel)-codek)}")

# ---------- artifact ----------
art = {'_about': {
    'what': 'Trial -> patient condition codes prefilter. A (patient, trial) pair goes to Jev only if the patient passes age/sex and has one of matched_patient_codes (or the trial is flagged healthy_volunteers_no_condition_filter). Measurement rules are suggestions, not applied here.',
    'snomed_targets': 'SNOMED concepts the trial maps to; a patient code matches if it is the concept or a descendant (is-a closure from tx.fhir.org).',
    'sources': 'mesh:<id>:<mondo|doid|wikidata> = primary MeSH term mapped by that crosswalk; mesh-child:<child><<parent> = via a MeSH descendant; override:* = overrides.json; word:<text> = condition words found in the SNOMED name.',
    'judgement': 'correct / too_broad / wrong from gold.json (hand review).',
    'built': str(datetime.date.today())}}
for n, v in result.items():
    art[n] = {
        'title': v['r']['brief_title'], 'conditions': v['r']['conditions'],
        'age': [v['r']['minimum_age_years'], v['r']['maximum_age_years']], 'sex': v['r']['sex'],
        'primary_mesh': [f"{m['id']} {m['term']}" for m in v['prim']],
        'ignored_mesh': [f"{m['id']} {m['term']}" for m in v['secondary']],
        'snomed_targets': {s: {'name': name(s), 'source': src} for s, src in sorted(v['map_t'].items())},
        'matched_patient_codes': [{'code': c, 'name': name(c), 'source': src, 'judgement': judge(n, c),
                                   'patients_age_sex_ok': len(pats_with(n, [c]))} for c, src in sorted(v['FINAL'].items())],
        'measurement_rules': v['rules'],
        'flags': v['flags'],
        'pairs': {'age_sex': per_trial[n][0], 'after_prefilter': per_trial[n][1]},
    }
json.dump(art, open('../trial_condition_codes.json', 'w'), indent=1)
P('\nwrote trial_condition_codes.json')
