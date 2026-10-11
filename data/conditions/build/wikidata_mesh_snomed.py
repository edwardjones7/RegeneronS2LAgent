# Free, no-key: Wikidata SPARQL. MeSH descriptor (P486) -> SNOMED CT (P5806).
import json, urllib.parse, urllib.request, sys
rows=json.load(open('trials.json'))
ids=set()
for r in rows:
    for m in r['condition_meshes']+r['condition_mesh_ancestors']: ids.add(m['id'])
vals=' '.join(f'"{i}"' for i in sorted(ids))
q=f'''SELECT ?mesh ?item ?itemLabel ?snomed WHERE {{
 VALUES ?mesh {{ {vals} }}
 ?item wdt:P486 ?mesh .
 OPTIONAL {{ ?item wdt:P5806 ?snomed . }}
 SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }} }}'''
req=urllib.request.Request('https://query.wikidata.org/sparql',data=urllib.parse.urlencode({'query':q}).encode(),
  headers={'Accept':'application/sparql-results+json','User-Agent':'hackru-research/0.1 (research script)'})
res=json.load(urllib.request.urlopen(req,timeout=120))
out={}
for b in res['results']['bindings']:
    out.setdefault(b['mesh']['value'],set())
    if 'snomed' in b: out[b['mesh']['value']].add(b['snomed']['value'])
out={k:sorted(v) for k,v in out.items()}
json.dump(out,open('wikidata_map.json','w'),indent=1)
print('mesh ids queried',len(ids),'found in wikidata',len(out),'with snomed',sum(1 for v in out.values() if v))
