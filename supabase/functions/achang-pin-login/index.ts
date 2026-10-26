import { createClient } from 'jsr:@supabase/supabase-js@2';

const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const encoder=new TextEncoder(),decoder=new TextDecoder();
const hash=async(k:string,v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(k+'|'+v)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const generic=()=>reply({error:'手機號碼或 PIN 不正確'},401);
const toBase64Url=(bytes:Uint8Array)=>btoa(Array.from(bytes,x=>String.fromCharCode(x)).join('')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const fromBase64Url=(value:string)=>{const raw=atob(value.replaceAll('-','+').replaceAll('_','/')+'==='.slice((value.length+3)%4));return Uint8Array.from(raw,x=>x.charCodeAt(0))};
const selectionKey=async(secret:string)=>crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode('achang-login-selection-v1|'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);
const sealSelection=async(secret:string,payload:Record<string,unknown>)=>{const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await selectionKey(secret),encoder.encode(JSON.stringify(payload))));const packed=new Uint8Array(iv.length+cipher.length);packed.set(iv);packed.set(cipher,iv.length);return toBase64Url(packed)};
const openSelection=async(secret:string,token:string)=>{if(!/^[A-Za-z0-9_-]{40,1200}$/.test(token))throw new Error('invalid selection');const packed=fromBase64Url(token),iv=packed.slice(0,12),cipher=packed.slice(12);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},await selectionKey(secret),cipher);return JSON.parse(decoder.decode(plain)) as {accountId?:string,subject?:string,context?:string,nonce?:string,expiresAt?:number}};
const maskName=(value:string)=>{const chars=Array.from(value.trim());if(!chars.length)return '未命名身分';if(chars.length===1)return chars[0]+'•';if(chars.length===2)return chars[0]+'•';return chars[0]+'•'.repeat(Math.min(3,chars.length-2))+chars.at(-1)};
type Member={id:string,display_name:string|null};
type Account={id:string,auth_user_id:string,member_id:string,status:string,role:string};

Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 if(Number(req.headers.get('content-length')||0)>3000)return reply({error:'Invalid request'},400);
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',expected=Deno.env.get('ACHANG_EXPECTED_PROJECT_REF')||'';
 let actual='';try{const parsed=new URL(url);if(parsed.protocol==='https:'&&/^[a-z0-9]+\.supabase\.co$/.test(parsed.hostname))actual=parsed.hostname.split('.')[0]}catch{}
 if(!expected||actual!==expected||!key||!anon)return reply({error:'Authentication service unavailable'},503);
 try{
  const body=await req.json(),phone=String(body.phone||''),pin=String(body.pin||''),selectionToken=String(body.selectionToken||'');
  if(!/^\+8869\d{8}$/.test(phone)||!/^\d{6}$/.test(pin))return generic();
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),subject=await hash(key,'v4-phone-login:'+phone);
  const ip=(req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,100);
  const {data:ipAllowed,error:ipError}=await admin.rpc('achang_try_pin_attempt',{p_subject:await hash(key,'v4-ip:'+ip),p_max_attempts:25,p_window_seconds:900});
  if(ipError)return reply({error:'登入安全檢查暫時無法使用'},503);
  if(!ipAllowed)return reply({error:'連線嘗試過於頻繁，請稍後再試'},429);
  const {data:memberRows,error:memberError}=await admin.from('members').select('id,display_name').eq('phone_e164',phone).is('deleted_at',null).limit(6),members=(memberRows||[]) as Member[];
  if(memberError||!members?.length||members.length>5){await admin.from('member_authorization_events').insert({event_type:'login_failed',subject_hash:subject});return generic()}
  const {data:accountRows,error:accountError}=await admin.from('member_accounts').select('id,auth_user_id,member_id,status,role').in('member_id',members.map(m=>m.id)).in('role',['admin','volunteer']).limit(6),accounts=(accountRows||[]) as Account[];
  if(accountError||!accounts?.length||accounts.length>5){await admin.from('member_authorization_events').insert({event_type:'login_failed',subject_hash:subject});return generic()}
  const selectionContext=await hash(key,'v4-selection-context:'+subject+':'+ip);
  let candidates=accounts;
  if(selectionToken){
   let selected;try{selected=await openSelection(key,selectionToken)}catch{await admin.from('member_authorization_events').insert({event_type:'login_failed',subject_hash:subject});return generic()}
   if(selected.subject!==subject||selected.context!==selectionContext||!selected.nonce||!selected.expiresAt||selected.expiresAt<Date.now()){await admin.from('member_authorization_events').insert({event_type:'login_failed',subject_hash:subject});return generic()}
   const {data:freshChallenge,error:challengeError}=await admin.rpc('achang_try_pin_attempt',{p_subject:await hash(key,'v4-selection-nonce:'+selected.nonce),p_max_attempts:1,p_window_seconds:300});
   if(challengeError)return reply({error:'登入安全檢查暫時無法使用'},503);
   if(!freshChallenge)return generic();
   candidates=accounts.filter(account=>account.id===selected.accountId);
   if(candidates.length!==1){await admin.from('member_authorization_events').insert({event_type:'login_failed',subject_hash:subject});return generic()}
  }
  const {data:allowed,error:rateError}=await admin.rpc('achang_try_pin_attempt',{p_subject:subject,p_max_attempts:5,p_window_seconds:900});
  if(rateError)return reply({error:'登入安全檢查暫時無法使用'},503);
  if(!allowed)return reply({error:'嘗試次數過多，請稍後再試'},429);
  const matches:Array<{account:Account,session:{access_token:string,refresh_token:string,expires_in:number},client:ReturnType<typeof createClient>}>=[];
  for(const account of candidates){
   const {data:userResult,error:userError}=await admin.auth.admin.getUserById(account.auth_user_id),email=userResult.user?.email;
   if(userError||!email)continue;
   const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
   try{const {data:login,error:authError}=await client.auth.signInWithPassword({email,password:pin});if(!authError&&login.user?.id===account.auth_user_id&&login.session)matches.push({account,session:login.session,client})}catch{}
  }
  if(!selectionToken&&matches.length>1){
   await Promise.allSettled(matches.map(match=>match.client.auth.signOut({scope:'local'})));
   const names=new Map(members.map(member=>[member.id,String(member.display_name||'')]));
   const identities=await Promise.all(matches.map(async({account})=>({token:await sealSelection(key,{accountId:account.id,subject,context:selectionContext,nonce:crypto.randomUUID(),expiresAt:Date.now()+120*1000}),label:maskName(names.get(account.member_id)||''),role:account.role==='admin'?'管理員':'志工'})));
   return reply({code:'IDENTITY_SELECTION_REQUIRED',identities},409);
  }
  if(matches.length!==1){await Promise.allSettled(matches.map(match=>match.client.auth.signOut({scope:'local'})));await admin.from('member_authorization_events').insert({event_type:'login_failed',subject_hash:subject});return generic()}
  const match=matches[0];
  if(match.account.status==='pending'){await match.client.auth.signOut({scope:'local'});return reply({error:'會員申請已送出，請等待管理員核准',code:'ACCOUNT_PENDING'},403)}
  if(match.account.status!=='active'){await match.client.auth.signOut({scope:'local'});return reply({error:'會員帳號已停用',code:'ACCOUNT_SUSPENDED'},403)}
  await admin.from('member_authorization_events').insert({member_id:match.account.member_id,account_id:match.account.id,event_type:'login_succeeded',subject_hash:subject});
  return reply({access_token:match.session.access_token,refresh_token:match.session.refresh_token,expires_in:match.session.expires_in,token_type:'bearer'});
 }catch{return reply({error:'請求資料格式錯誤'},400)}
});
