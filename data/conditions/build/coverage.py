# Join trial MeSH -> SNOMED via Mondo SSSOM (+ Wikidata), then match patient codes
# by SNOMED is-a closure (from tx.fhir.org). Prints coverage and misses.
import json, csv, sys
D='dl_mondo/'
def load(fn,pref):
    m={}
    for line in open(D+fn):
        if line.startswith('#') or line.startswith('subject_id'): continue
        s,_,p,o,*_=line.rstrip('\n').split('\t')
        if o.startswith(pref): m.setdefault(s,set()).add(o.split(':',1)[1])
    return m
mesh={};sct={}
for f in ['mondo_exactmatch_mesh.tsv','mondo_hasdbxref_mesh.tsv']:
    for k,v in load(f,'mesh:').items(): mesh.setdefault(k,set()).update(v)
for f in ['mondo_exactmatch_sctid.tsv','mondo_hasdbxref_sctid.tsv']:
    for k,v in load(f,'SCTID:').items(): sct.setdefault(k,set()).update(v)
mesh2sct={}
for mo,ms in mesh.items():
    for m in ms: mesh2sct.setdefault(m,set()).update(sct.get(mo,()))
# Disease Ontology: terms carrying both MESH and SNOMEDCT_US xrefs
cur=None;dm={};ds={}
for line in open('dl_doid/doid.obo'):
    if line.startswith('[Term]'): cur=None
    elif line.startswith('id: DOID:'): cur=line.split()[1]
    elif cur and line.startswith('xref: MESH:'): dm.setdefault(cur,set()).add(line.split(':')[2].split()[0])
    elif cur and line.startswith('xref: SNOMEDCT_US'): ds.setdefault(cur,set()).add(line.split(':')[2].split()[0])
if '--no-doid' not in sys.argv:
    for d,ms in dm.items():
        for m in ms: mesh2sct.setdefault(m,set()).update(ds.get(d,()))
# Generic MeSH terms that ClinicalTrials.gov adds; they cause false hits.
GENERIC={'D009369','D002277','D000230','D009362','D012008','D007249','D005355','D020969','D019964','D009422','D019636','D009468','D030342','D008659','D008661','D001835','D012816','D010335','D013568','D020271'}
if '--keep-generic' not in sys.argv:
    for g in GENERIC: mesh2sct.pop(g,None)
wd=json.load(open('wikidata_map.json'))
use_wd='--no-wikidata' not in sys.argv
if use_wd:
    for m,s in wd.items(): mesh2sct.setdefault(m,set()).update(s)
    for s,ms in json.load(open('wikidata_snomed_to_mesh.json')).items():
        for m in ms: mesh2sct.setdefault(m,set()).add(s)
pc=json.load(open('patient_codes.json')); anc=json.load(open('patient_ancestors.json'))
closure={c:set(anc[c])|{c} for c in pc}
def match(mid):
    S=mesh2sct.get(mid,set())
    return sorted(c for c in pc if closure[c]&S)
rows=json.load(open('trials.json'))
mapped_terms=set();hit_terms=set();all_terms={}
trial_hit=0;misses=[];result={}
for r in rows:
    hits=set()
    for m in r['condition_meshes']:
        all_terms[m['id']]=m['term']
        if mesh2sct.get(m['id']): mapped_terms.add(m['id'])
        h=match(m['id'])
        if h: hit_terms.add(m['id']); hits.update(h)
    result[r['nct_id']]=sorted(hits)
    if hits: trial_hit+=1
    else: misses.append((r['nct_id'],r['conditions'],[m['term'] for m in r['condition_meshes']]))
print(f"MeSH terms: {len(all_terms)}; mapped to any SNOMED: {len(mapped_terms)}; hit a patient code: {len(hit_terms)}")
print(f"Trials: {len(rows)}; with >=1 patient code: {trial_hit}")
for t in ['NCT07309614','NCT07685808','NCT07053423','NCT06931717']:
    print(t,[(c,pc[c][0],pc[c][1]) for c in result[t]])
json.dump(result,open('trial_to_patient_codes.json','w'),indent=1)
json.dump({k:sorted(v) for k,v in mesh2sct.items() if k in all_terms},open('mesh_to_snomed.json','w'),indent=1)
print('\nHITS:')
for r in rows:
    if result[r['nct_id']]: print(r['nct_id'],r['conditions'][:2],'->',[pc[c][0] for c in result[r['nct_id']]][:6])
print('\nMISSES:')
for m in misses: print(*m)
