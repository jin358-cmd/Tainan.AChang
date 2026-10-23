'use strict';
const crypto = require('node:crypto');
const URL = 'https://ctskglmglevronvnkpmm.supabase.co';
// Supabase publishable key is explicitly PUBLIC. No service-role keys are stored or used in Vercel.
const KEY = 'sb_publishable_byHnuKhXO6O9beNekbBIzA_WpELQ1GI';
function problem(status,message){throw Object.assign(new Error(message),{status})}
function method(req,allowed){if(!allowed.includes(req.method))problem(405,'不支援的操作')}
function originCheck(req){if(['GET','HEAD','OPTIONS'].includes(req.method))return;const o=req.headers.origin;if(o){let h;try{h=new URLConstructor(o).host}catch{problem(403,'來源不合法')} const host=req.headers['x-forwarded-host']||req.headers.host;if(h!==host)problem(403,'拒絕跨網站寫入')}if(req.headers['sec-fetch-site']==='cross-site')problem(403,'拒絕跨網站寫入')}
const URLConstructor=global.URL;
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(s=>{const k=s.indexOf('=');return k<0?['','']:[s.slice(0,k).trim(),decodeURIComponent(s.slice(k+1))]}).filter(x=>x[0]))}
function cookie(res,name,value,maxAge){const old=res.getHeader('Set-Cookie')||[];res.setHeader('Set-Cookie',[...(Array.isArray(old)?old:[old]),`${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${maxAge}`])}
const REMEMBER_DEVICE_DAYS=90; // Rolling on approved devices when an access token is renewed.
function setSession(res,d){cookie(res,'achang_access',d.access_token,Math.max(1,Number(d.expires_in)||3500));cookie(res,'achang_refresh',d.refresh_token,60*60*24*REMEMBER_DEVICE_DAYS)}
function clearCookies(res){cookie(res,'achang_access','',0);cookie(res,'achang_refresh','',0)}
function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(body))}
function run(fn){return async(req,res)=>{try{originCheck(req);await fn(req,res)}catch(e){if(!res.writableEnded)json(res,e.status||500,{error:e.status?e.message:'伺服器發生錯誤',code:e.status||500});if(!e.status)console.error('Tainan.AChang',e.message)}}}
async function request(path,{method='GET',body,headers={},token,auth=false}={}){let r;try{r=await fetch(URL+path,{method,headers:{apikey:KEY,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'})}catch(e){problem(503,'資料庫無法連線')}const s=await r.text();let data;try{data=s?JSON.parse(s):null}catch{data=s}return {ok:r.ok,status:r.status,data}}
function need(r,message){if(!r.ok)problem(r.status===409?409:r.status===401?401:502,message);return r.data}
async function rest(path,token,opt={}){return request('/rest/v1/'+path,{...opt,token})}
async function accountFromToken(token){const auth=await request('/auth/v1/user',{token});if(!auth.ok||!auth.data?.id)problem(401,'請重新登入');const r=await rest('member_accounts?auth_user_id=eq.'+encodeURIComponent(auth.data.id)+'&select=id,member_id,role,status,auth_user_id&limit=1',token);need(r,'會員查核失敗');const p=r.data?.[0];if(!p||p.status!=='active')problem(403,'帳號尚未經管理員核准或已停用');return {...p,token}}

function deviceMetadata(req){
 const ua=String(req.headers['user-agent']||'').slice(0,500);
 return {
 device_type:/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)?'tablet':/Mobile|iPhone|iPod|Android/i.test(ua)?'phone':ua?'computer':'unknown',
 operating_system:/iPhone|iPad|iPod/i.test(ua)?'iOS/iPadOS':/Android/i.test(ua)?'Android':/Windows/i.test(ua)?'Windows':/Mac OS X|Macintosh/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'unknown',
 browser_name:/Edg\//i.test(ua)?'Edge':/CriOS|Chrome\//i.test(ua)?'Chrome':/FxiOS|Firefox\//i.test(ua)?'Firefox':/Safari\//i.test(ua)?'Safari':'unknown'
 };
}
async function deviceCheck(req,account,token,requestApproval=false){
 if(account.role==='admin')return true;
 const supplied=String(req.headers['x-achang-device']||'');
 if(!/^[0-9a-f-]{32,64}$/i.test(supplied))problem(403,'請使用已授權的裝置');
 const hash=crypto.createHash('sha256').update(supplied).digest('hex');
 const q=await rest('member_devices?account_id=eq.'+account.id+'&device_id_hash=eq.'+hash+'&select=id,status,device_type,operating_system,browser_name&limit=1',token);need(q,'裝置授權查核失敗');
 const found=q.data?.[0];
 if(found?.status==='approved'){
  if(requestApproval&&(!found.device_type||!found.operating_system||!found.browser_name)){
   const meta=await rest('member_devices?id=eq.'+found.id,token,{method:'PATCH',body:deviceMetadata(req)});
   need(meta,'設備資料更新失敗');
  }
  return true;
 }
 if(requestApproval&&!found){const create=await rest('member_devices?select=id,status',token,{method:'POST',headers:{Prefer:'return=representation'},body:{account_id:account.id,device_id_hash:hash,status:'pending',...deviceMetadata(req)}});need(create,'裝置授權申請失敗')}
 problem(403,'此裝置尚未獲管理員核准，請聯絡管理員開通');
}
async function session(req,res){const c=cookies(req);let tok=c.achang_access,p;if(tok)try{p=await accountFromToken(tok)}catch(e){if(e.status!==401)throw e}
 if(!p&&c.achang_refresh){const r=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:c.achang_refresh}});if(r.ok&&r.data?.access_token){setSession(res,r.data);tok=r.data.access_token;p=await accountFromToken(tok)}}
 if(!p)problem(401,'請重新登入');await deviceCheck(req,p,p.token);return p}
async function authorized(req,res,roles){const p=await session(req,res);if(!roles.includes(p.role))problem(403,'此帳號沒有操作權限');return p}
function body(req){if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))problem(400,'資料格式不正確');return req.body}
function phone(s){const n=String(s||'').replace(/[^0-9+]/g,'');if(/^09\d{8}$/.test(n))return '+886'+n.substring(1);if(/^\+8869\d{8}$/.test(n))return n;problem(400,'請輸入有效台灣手機號碼')}
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s))||Number.isNaN(Date.parse(s+'T00:00:00Z')))problem(400,'日期不合法');return s}
function time(s){const a=String(s||'');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(a))problem(400,'時間不合法');return a}
function checkText(s,label,max=100,allowBlank=false){if(typeof s!=='string'||(!allowBlank&&!s.trim())||s.length>max)problem(400,`${label}格式不正確`);return s.trim()}
function uuid(s){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s)))problem(400,'ID 格式不正確');return s}
async function getOne(table,id,token){const r=await rest(`${table}?id=eq.${uuid(id)}&select=*&limit=1`,token);need(r,'資料讀取失敗');return r.data?.[0]||null}
function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string')return false;return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(),crypto.createHash('sha256').update(b).digest())}
module.exports={URL,KEY,problem,method,originCheck,cookies,cookie,setSession,clearCookies,json,run,request,need,rest,accountFromToken,session,authorized,body,phone,validDate,time,checkText,uuid,getOne,safeEqual,deviceCheck};