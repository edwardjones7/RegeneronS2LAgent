# Free, no-key: tx.fhir.org $lookup (property=parent), walked recursively.
# Builds is-a ancestor closure for every SNOMED code used in our patients.
import json, urllib.request, os
from concurrent.futures import ThreadPoolExecutor
pc=json.load(open('patient_codes.json'))
cache=json.load(open('parents_cache.json')) if os.path.exists('parents_cache.json') else {}
def parents(code):
    url=f'https://tx.fhir.org/r4/CodeSystem/$lookup?system=http://snomed.info/sct&code={code}&property=parent'
    for _ in range(3):
        try:
            d=json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'Accept':'application/fhir+json'}),timeout=60))
            out=[]; disp=None
            for p in d.get('parameter',[]):
                if p['name']=='display': disp=p['valueString']
                if p['name']=='property':
                    parts={x['name']:x for x in p['part']}
                    if parts['code'].get('valueCode')=='parent': out.append(parts['value']['valueCode'])
            return code,{'display':disp,'parents':out}
        except Exception as e: err=str(e)
    return code,{'display':None,'parents':[],'error':err}
frontier=set(pc)
with ThreadPoolExecutor(6) as ex:
    while frontier:
        todo=[c for c in frontier if c not in cache]
        for c,v in ex.map(parents,todo): cache[c]=v
        frontier={p for c in frontier for p in cache[c]['parents'] if p not in cache}
        print('fetched',len(todo),'next',len(frontier),flush=True)
json.dump(cache,open('parents_cache.json','w'))
def anc(c,seen=None):
    seen=set() if seen is None else seen
    for p in cache.get(c,{}).get('parents',[]):
        if p not in seen: seen.add(p); anc(p,seen)
    return seen
closure={c:sorted(anc(c)) for c in pc}
json.dump(closure,open('patient_ancestors.json','w'))
print('codes',len(pc),'errors',sum(1 for v in cache.values() if 'error' in v),'concepts',len(cache))
