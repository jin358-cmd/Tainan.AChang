import argparse,hashlib,json,re,collections
from pathlib import Path
parser=argparse.ArgumentParser(description='Match nighttime source stations to a downloaded official Tainan API snapshot.');parser.add_argument('official_snapshot',type=Path);args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
p=json.loads((root/'data-official-night-20261030.source.json').read_text());a=json.loads(args.official_snapshot.read_text())['data'];d=collections.defaultdict(list)
norm=lambda x:re.sub(r'[\s()（）]','',str(x)).replace('臺','台')
# Explicitly allow only equivalent descriptive suffixes / numeral spelling, never a different door number or street.
alias={29:'勝利街116巷12弄路口_',562:'中山北路431號(7-11)',1348:'新興街111號',1362:'復華六街15號',1380:'復國一路175號',1592:'正義街85'}
for x in a:
 if x['AREA']=='永康區':d[x['ROUTEID']].append(x)
mp={};stops=[]
for i,x in enumerate(p,1):
 if x['車次'] not in mp:mp[x['車次']]=next(k for k,v in d.items() if norm(v[0]['POINTNAME'])==norm(x['站點名稱／地址']) and v[0]['TIME']==x['到達時間'])
 candidates=[z for z in d[mp[x['車次']]] if norm(z['POINTNAME'])==norm(alias.get(i,x['站點名稱／地址']))]
 exacttime=[z for z in candidates if z['TIME']==x['到達時間']]
 exactorder=[z for z in candidates if int(z['ROUTEORDER'])==int(x['站點序號'])]
 hit=exacttime[0] if len(exacttime)==1 else candidates[0] if len(candidates)==1 else exactorder[0] if len(exactorder)==1 else None
 if x['_extras'].get('刪除線'):hit=None
 notes=[]
 if i in alias:notes.append('地址等義寫法比對：'+alias[i])
 if hit and hit['TIME']!=x['到達時間']:notes.append('原表／官方到站時間不同；保留原表時間')
 if not hit:notes.append('原表地址與官方資料無法精確對應，座標待確認')
 stops.append({'source_id':f'PDF:NIGHT:{i:04d}','source_name':x['站點名稱／地址'],'route':x['車次'],'official_route_id':mp[x['車次']],'original_order':int(x['站點序號']),'official_name':hit['POINTNAME'] if hit else None,'longitude':float(hit['LONGITUDE']) if hit else None,'latitude':float(hit['LATITUDE']) if hit else None,'status':'official_stop' if hit else 'pending','notes':notes})
catalog={'version':1,'generated_at':'2026-11-03','sources':{'snapshot_sha256':hashlib.sha256(args.official_snapshot.read_bytes()).hexdigest(),'schedule':'data-official-night-20261030.source.json','coordinates':'https://soa.tainan.gov.tw/Api/Service/Get/84df8cd6-8741-41ed-919c-5105a28ecd6d','matching':'Route identity matched by first station and arrival time. Station identity uses exact normalized name, with time or order to disambiguate repeated names. Only explicit equivalent name aliases permitted. Conflicting street/door numbers remain unlocated.'},'routes':mp,'stops':stops}
(root/'data-night-route-locations-20261103.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
print(collections.Counter(s['status'] for s in stops));print('pending',[(s['source_id'],s['source_name']) for s in stops if s['status']=='pending'])
