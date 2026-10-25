import { createClient } from 'jsr:@supabase/supabase-js@2';

const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const encoder=new TextEncoder();
const hash=async(k:string,v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(k+'|'+v)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const generic=()=>reply({error:'手機號碼或 PIN 不正確'},401);

Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 if(Number(req.headers.get('content-length')||0)>1500)return reply({error:'Invalid request'},400);
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',expected=Deno.env.get('ACHANG_EXPECTED_PROJECT_REF')||'';
 let actual='';try{const parsed=new URL(url);if(parsed.protocol==='https:'&&/^[a-z0-9]+\.supabase\.co$/.test(parsed.hostname))actual=parsed.hostname.split('.')[0]}catch{}
 if(!expected||actual!==expected||!key||!anon)return reply({error:'Authentication service unavailable'},503);
 try{
  const body=await req.json(),phone=String(body.phone||''),pin=String(body.pin||'');
  if(!/^\+8869\d{8}$/.test(phone)||!/^\d{6}$/.test(pin))return generic();
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const subject=await hash(key,'v3-phone-login:'+phone);
  const {data:allowed,error:rateError}=await admin.rpc('achang_try_pin_attempt',{p_subject:subject,p_max_attempts:5,p_window_seconds:900});
  if(rateError)return reply({error:'登入安全檢查暫時無法使用'},503);
  if(!allowed)return reply({error:'嘗試次數過多，請稍後再試'},429);
  const ip=(req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,100);
  const {data:ipAllowed,error:ipError}=await admin.rpc('achang_try_pin_attempt',{p_subject:await hash(key,'v3-ip:'+ip),p_max_attempts:25,p_window_seconds:900});
  if(ipError)return reply({error:'登入安全檢查暫時無法使用'},503);
  if(!ipAllowed)return reply({error:'連線嘗試過於頻繁，請稍後再試'},429);
  const {data:members,error:memberError}=await admin.from('members').select('id').eq('phone_e164',phone).is('deleted_at',null).limit(6);
  if(memberError||!members?.length||members.length>5){await admin.from('member_authorization_events').insert({event_type:'login_failed',subject_hash:subject});return generic()}
  const {data:accounts,error:accountError}=await admin.from('member_accounts').select('id,auth_user_id,member_id,status,role').in('member_id',members.map(m=>m.id)).in('role',['admin','volunteer']).limit(6);
  if(accountError||!accounts?.length||accounts.length>5){await admin.from('member_authorization_events').insert({event_type:'login_failed',subject_hash:subject});return generic()}
  const matches:Array<{account:typeof accounts[number],session:{access_token:string,refresh_token:string,expires_in:number}}>=[];
  const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  for(const account of accounts){
   const {data:userResult,error:userError}=await admin.auth.admin.getUserById(account.auth_user_id),email=userResult.user?.email;
   if(userError||!email)continue;
   const {data:login,error:authError}=await client.auth.signInWithPassword({email,password:pin});
   if(!authError&&login.user?.id===account.auth_user_id&&login.session)matches.push({account,session:login.session});
  }
  if(matches.length!==1){await admin.from('member_authorization_events').insert({event_type:'login_failed',subject_hash:subject});return generic()}
  const match=matches[0];
  if(match.account.status==='pending')return reply({error:'會員申請已送出，請等待管理員核准',code:'ACCOUNT_PENDING'},403);
  if(match.account.status!=='active')return reply({error:'會員帳號已停用',code:'ACCOUNT_SUSPENDED'},403);
  await admin.from('member_authorization_events').insert({member_id:match.account.member_id,account_id:match.account.id,event_type:'login_succeeded',subject_hash:subject});
  return reply({access_token:match.session.access_token,refresh_token:match.session.refresh_token,expires_in:match.session.expires_in,token_type:'bearer'});
 }catch{return reply({error:'請求資料格式錯誤'},400)}
});
