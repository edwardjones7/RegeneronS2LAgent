# Free, no-key: NLM MeSH SPARQL. All descendants of every trial condition MeSH descriptor,
# then Wikidata MeSH->SNOMED for those descendants. Caches to mesh_desc.json, wikidata_desc_map.json.
import json, urllib.request, urllib.parse, os
from concurrent.futures import ThreadPoolExecutor
rows=json.load(open('trials.json'))
ids=sorted({m['id'] for r in rows for m in r['condition_meshes']})
def desc(mid):
    q=f'''PREFIX meshv: <http://id.nlm.nih.gov/mesh/vocab#>
PREFIX mesh: <http://id.nlm.nih.gov/mesh/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?d ?l WHERE {{ ?d meshv:broaderDescriptor+ mesh:{mid} . ?d rdfs:label ?l }}'''
    u='https://id.nlm.nih.gov/mesh/sparql?'+urllib.parse.urlencode({'query':q,'format':'JSON','limit':1000})
    for _ in range(3):
        try:
            b=json.load(urllib.request.urlopen(u,timeout=90))['results']['bindings']
            return mid,{x['d']['value'].rsplit('/',1)[1]:x['l']['value'] for x in b}
        except Exception as e: err=str(e)
    return mid,{'_error':err}
out=json.load(open('mesh_desc.json')) if os.path.exists('mesh_desc.json') else {}
with ThreadPoolExecutor(4) as ex:
    for k,v in ex.map(desc,[i for i in ids if i not in out]): out[k]=v
json.dump(out,open('mesh_desc.json','w'),indent=0)
print('terms',len(out),'errors',sum('_error' in v for v in out.values()),'truncated',sum(len(v)>=1000 for v in out.values()))
allids=sorted({d for v in out.values() for d in v if d!='_error'})
wd={}
for i in range(0,len(allids),300):
    vals=' '.join(f'"{c}"' for c in allids[i:i+300])
    q=f'SELECT ?mesh ?sn WHERE {{ VALUES ?mesh {{ {vals} }} ?item wdt:P486 ?mesh . ?item wdt:P5806 ?sn . }}'
    req=urllib.request.Request('https://query.wikidata.org/sparql',data=urllib.parse.urlencode({'query':q}).encode(),
      headers={'Accept':'application/sparql-results+json','User-Agent':'hackru-research/0.1'})
    for b in json.load(urllib.request.urlopen(req,timeout=120))['results']['bindings']:
        wd.setdefault(b['mesh']['value'],set()).add(b['sn']['value'])
json.dump({k:sorted(v) for k,v in wd.items()},open('wikidata_desc_map.json','w'),indent=0)
print('descendant ids',len(allids),'with wikidata snomed',len(wd))
