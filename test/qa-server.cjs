'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const port=Number(process.env.ACHANG_QA_PORT||41731);
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml; charset=utf-8'};
const personId='11111111-1111-4111-8111-111111111111';
const accountId='22222222-2222-4222-8222-222222222222';
const task={id:'33333333-3333-4333-8333-333333333333',volunteer_id:personId,visit_date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}),shift:'日間',area:'復華里',truck:'QA-TEST',stop_address:'匿名測試站點',eta:'08:30',stop_order:1,status:'待訪',server_version:0};
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private'});res.end(JSON.stringify(body))};
const mode=req=>{try{return new URL(req.headers.referer||'http://127.0.0.1/').searchParams.get('mode')||'admin'}catch{return 'admin'}};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/api/')){
  const m=mode(req),editor=m==='editor';
  if(url.pathname==='/api/session')return json(res,200,m==='admin'?{role:'admin',memberId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',accountId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',canEditProfile:false,offlineAuthorizedUntil:null}:{role:'volunteer',memberId:personId,accountId,canEditProfile:editor,offlineAuthorizedUntil:new Date(Date.now()+86400000).toISOString()});
  if(url.pathname==='/api/health')return json(res,200,{backend:'reachable-auth-service'});
  if(url.pathname==='/api/roster')return json(res,200,{people:[{id:personId,name:'匿名志工甲',phone:'+886900000001',address:'匿名測試地址',resident_area:'復華里',assignment:'復華里',is_leader:false},{id:'44444444-4444-4444-8444-444444444444',name:'匿名志工乙',phone:'+886900000002',address:'',resident_area:'',assignment:'',is_leader:false}]});
  if(url.pathname==='/api/tasks')return json(res,200,{tasks:m==='admin'?[]:[task]});
  if(url.pathname==='/api/profile')return json(res,200,{profile:{id:personId,name:'匿名志工甲',phone:'+886900000001',address:'匿名測試地址',residentArea:'復華里'},canEdit:editor});
  if(url.pathname==='/api/roster-access')return json(res,200,{featureReady:true,people:[{accountId,memberId:personId,name:'匿名志工甲',phone:'+886900000001',status:'active',canEdit:false,grantedAt:null}]});
  if(url.pathname==='/api/members')return json(res,200,{members:[],devices:[]});
  return json(res,404,{error:'QA endpoint not found'});
 }
 const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/,''),file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found')}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
if(require.main===module){
 server.listen(port,'127.0.0.1',()=>console.log(`aChang QA server http://127.0.0.1:${port}`));
 const stop=()=>server.close(()=>process.exit(0));process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
module.exports={server};
