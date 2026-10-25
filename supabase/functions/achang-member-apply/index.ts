import { createClient } from 'jsr:@supabase/supabase-js@2';

const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const encoder=new TextEncoder();
const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');

Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 if(Number(req.headers.get('content-length')||0)>1500)return reply({error:'Invalid request'},400);
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',expected=Deno.env.get('ACHANG_EXPECTED_PROJECT_REF')||'';
 let actual='';try{const parsed=new URL(url);if(parsed.protocol==='https:'&&/^[a-z0-9]+\.supabase\.co$/.test(parsed.hostname))actual=parsed.hostname.split('.')[0]}catch{}
 if(!expected||actual!==expected||!key)return reply({error:'申請服務暫時無法使用'},503);
 try{
  const b=await req.json(),code=String(b.invitationCode||'').trim().toUpperCase(),phone=String(b.contactPhone||''),pin=String(b.pin||'');
  if(!/^[0-9]{4}$/.test(code)||!/^\+8869\d{8}$/.test(phone)||!/^[0-9]{6}$/.test(pin))return reply({error:'邀請碼、聯絡電話或 PIN 格式不正確'},400);
  const supa=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}),codeHash=await sha(code);
  const ip=(req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,100);
  const subject=await sha(key+'|application|'+ip+'|'+phone);
  const {data:allowed,error:limitError}=await supa.rpc('achang_try_pin_attempt',{p_subject:subject,p_max_attempts:5,p_window_seconds:900});
  if(limitError)return reply({error:'申請安全檢查暫時無法使用'},503);if(!allowed)return reply({error:'申請嘗試過於頻繁，請稍後再試'},429);
  // Account-wide daily budget prevents distributed guessing of a four-digit code.
  const phoneSubject=await sha(key+'|application-phone-24h|'+phone);
  const {data:phoneAllowed,error:phoneError}=await supa.rpc('achang_try_pin_attempt',{p_subject:phoneSubject,p_max_attempts:5,p_window_seconds:86400});
  if(phoneError)return reply({error:'申請安全檢查暫時無法使用'},503);
  if(!phoneAllowed)return reply({error:'邀請碼嘗試已達每日上限，請聯繫管理員'},429);
  const {data:member,error:memberError}=await supa.from('members').select('id,phone_e164,deleted_at,application_code_expires_at').eq('application_code_hash',codeHash).maybeSingle();
  if(memberError||!member||member.deleted_at||member.phone_e164!==phone||!member.application_code_expires_at||new Date(member.application_code_expires_at)<=new Date())return reply({error:'邀請碼、聯絡電話或 PIN 不正確'},400);
  const {data:existing}=await supa.from('member_accounts').select('id').eq('member_id',member.id).maybeSingle();if(existing)return reply({error:'這位會員已有帳號或待核准申請'},409);
  // Consume in a single conditional database UPDATE before provisioning Auth identity.
  // Only the first concurrent request can claim this invitation; failures require reissue.
  const {data:claimed,error:claimError}=await supa.from('members')
    .update({application_code_hash:null,application_code_expires_at:null})
    .eq('id',member.id).eq('application_code_hash',codeHash)
    .gt('application_code_expires_at',new Date().toISOString()).select('id');
  if(claimError)return reply({error:'邀請碼核銷服務暫時無法使用'},503);
  if(!claimed||claimed.length!==1)return reply({error:'邀請碼已失效或已使用'},409);
  const loginId='ACH-'+member.id.replaceAll('-','').toUpperCase(),email='volunteer-'+member.id+'@auth.achang.invalid';
  const {data:created,error:createError}=await supa.auth.admin.createUser({email,password:pin,email_confirm:true,user_metadata:{achang_member_id:member.id}});
  if(createError||!created.user)return reply({error:'登入身分建立失敗'},createError?.status===422?409:502);
  const {data:account,error:accountError}=await supa.from('member_accounts').insert({member_id:member.id,auth_user_id:created.user.id,login_id:loginId,role:'volunteer',status:'pending',requested_at:new Date().toISOString()}).select('id,login_id,status').single();
  if(accountError||!account){await supa.auth.admin.deleteUser(created.user.id);return reply({error:'會員申請建立失敗'},accountError?.code==='23505'?409:502)}
  return reply({ok:true,loginId:account.login_id,status:account.status,message:'申請已送出，請等待管理員核准'},201);
 }catch{return reply({error:'申請資料格式錯誤'},400)}
});
