# Free, no-key: Wikidata SPARQL reverse lookup. SNOMED (P5806) -> MeSH (P486)
# for every patient code and every is-a ancestor of it.
import json, urllib.parse, urllib.request
cache=json.load(open('parents_cache.json'))
codes=sorted(cache)
out={}
for i in range(0,len(codes),300):
    vals=' '.join(f'"{c}"' for c in codes[i:i+300])
    q=f'SELECT ?sn ?mesh WHERE {{ VALUES ?sn {{ {vals} }} ?item wdt:P5806 ?sn . ?item wdt:P486 ?mesh . }}'
    req=urllib.request.Request('https://query.wikidata.org/sparql',data=urllib.parse.urlencode({'query':q}).encode(),
      headers={'Accept':'application/sparql-results+json','User-Agent':'hackru-research/0.1'})
    for b in json.load(urllib.request.urlopen(req,timeout=120))['results']['bindings']:
        out.setdefault(b['sn']['value'],set()).add(b['mesh']['value'])
out={k:sorted(v) for k,v in out.items()}
json.dump(out,open('wikidata_snomed_to_mesh.json','w'),indent=1)
print('snomed concepts',len(codes),'with mesh',len(out))
