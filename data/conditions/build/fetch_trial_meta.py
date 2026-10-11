# Read-only: pull trial age/sex/title/keywords from Supabase REST. Never prints keys.
import json, os, urllib.request
os.chdir(os.path.dirname(os.path.abspath(__file__)))
env={}
for l in open('../../../.env'):
    if '=' in l: k,v=l.strip().split('=',1); env[k]=v.strip('"\'')
u=env['SUPABASE_URL'].rstrip('/')+'/rest/v1/trials?select=nct_id,brief_title,sex,minimum_age_years,maximum_age_years,healthy_volunteers,keywords,conditions,condition_meshes,condition_mesh_ancestors&limit=1000'
k=env['SUPABASE_SECRET_KEY']
r=json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'apikey':k,'Authorization':'Bearer '+k})))
json.dump(r,open('trial_meta.json','w'),indent=0)
print(len(r))
