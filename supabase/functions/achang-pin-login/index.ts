import { createClient } from 'jsr:@supabase/supabase-js@2';

const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-AChang-Environment':'production'}});
const encoder=new TextEncoder();
const hash=async(k:string,v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(k+'|'+v)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const generic=()=>reply({error:'登入代碼或 PIN 不正確'},401);

Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 if(Number(req.headers.get('content-length')||0)>1500)return reply({error:'Invalid request'},400);
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
 if(!url.includes('ctskglmglevronvnkpmm.supabase.co')||!key||!anon)return reply({error:'Authentication service unavailable'},503);
 try{
  const body=await req.json(),loginId=String(body.loginId||'').trim().toUpperCase(),pin=String(body.pin||'');
  if(!/^ACH-[A-F0-9]{32}$/.test(loginId)||!/^[0-9]{6}$/.test(pin))return generic();
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const subject=await hash(key,'v2-login:'+loginId);
  const {data:allowed,error:rateError}=await admin.rpc('achang_try_pin_attempt',{p_subject:subject,p_max_attempts:5,p_window_seconds:900});
  if(rateError)return reply({error:'登入安全檢查暫時無法使用'},503);
  if(!allowed)return reply({error:'嘗試次數過多，請稍後再試'},429);
  const ip=(req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,100);
  const {data:ipAllowed,error:ipError}=await admin.rpc('achang_try_pin_attempt',{p_subject:await hash(key,'v2-ip:'+ip),p_max_attempts:25,p_window_seconds:900});
  if(ipError)return reply({error:'登入安全檢查暫時無法使用'},503);
  if(!ipAllowed)return reply({error:'連線嘗試過於頻繁，請稍後再試'},429);
  const {data:acct,error:ae}=await admin.from('member_accounts').select('auth_user_id,member_id,status,role').eq('login_id',loginId).maybeSingle();
  if(ae||!acct||acct.role!=='volunteer')return generic();
  const email='volunteer-'+acct.member_id+'@auth.achang.invalid';
  const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:login,error:authError}=await client.auth.signInWithPassword({email,password:pin});
  if(authError||!login.user||login.user.id!==acct.auth_user_id||!login.session)return generic();
  if(acct.status==='pending')return reply({error:'會員申請已送出，請等待管理員核准',code:'ACCOUNT_PENDING'},403);
  if(acct.status!=='active')return reply({error:'會員帳號已停用',code:'ACCOUNT_SUSPENDED'},403);
  return reply({access_token:login.session.access_token,refresh_token:login.session.refresh_token,expires_in:login.session.expires_in,token_type:'bearer'});
 }catch{return reply({error:'請求資料格式錯誤'},400)}
});
