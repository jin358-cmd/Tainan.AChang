import { createClient } from 'jsr:@supabase/supabase-js@2';

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const bearer=req.headers.get('authorization')||'';
 if(!/^Bearer\s+\S+$/i.test(bearer))return json({error:'Unauthorized'},401);
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',expected=Deno.env.get('ACHANG_EXPECTED_PROJECT_REF')||'';
 let actual='';try{const parsed=new URL(url);if(parsed.protocol==='https:'&&/^[a-z0-9]+\.supabase\.co$/.test(parsed.hostname))actual=parsed.hostname.split('.')[0]}catch{}
 if(!expected||actual!==expected||!key)return json({error:'Not configured'},503);
 const supa=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
 try{
  const {data:{user},error:authErr}=await supa.auth.getUser(bearer.replace(/^Bearer\s+/i,''));
  if(authErr||!user)return json({error:'Unauthorized'},401);
  const {data:admin,error:adminErr}=await supa.from('member_accounts').select('role,status').eq('auth_user_id',user.id).maybeSingle();
  if(adminErr||admin?.role!=='admin'||admin?.status!=='active')return json({error:'Admin only'},403);
  const b=await req.json(),directApproval=b.directApproval===true,role=String(b.role||'volunteer');
  const memberId=String(b.memberId||''),phone=String(b.phone||''),password=String(b.password||'');
  if(!['volunteer','admin'].includes(role)||!directApproval||!/^[\da-f]{8}-[\da-f-]{27,}$/i.test(memberId)||!/^\+8869\d{8}$/.test(phone)||!/^\d{6}$/.test(password))return json({error:'Invalid fields'},400);
  const {data:member,error:memberErr}=await supa.from('members').select('id,phone_e164,deleted_at').eq('id',memberId).maybeSingle();
  if(memberErr||!member||member.deleted_at||member.phone_e164!==phone)return json({error:'Member and contact phone mismatch'},400);
  const {data:existing}=await supa.from('member_accounts').select('id').eq('member_id',memberId).maybeSingle();
  if(existing)return json({error:'Member already exists'},409);
  const loginId='ACH-'+memberId.replaceAll('-','').toUpperCase(),email=(role==='admin'?'admin-':'volunteer-')+memberId+'@auth.achang.invalid';
  const {data:created,error:createError}=await supa.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{achang_member_id:memberId,achang_role:role}});
  if(createError||!created.user)return json({error:'Unable to create account'},createError?.status===422?409:502);
  const now=new Date().toISOString(),uid=created.user.id;
  const {data:entry,error:entryErr}=await supa.from('member_accounts').insert({member_id:memberId,auth_user_id:uid,login_id:loginId,role,status:'active',requested_at:now,approved_at:now,approved_by:user.id,device_approval_required:true}).select('id,member_id,status,role').single();
  if(entryErr||!entry){await supa.auth.admin.deleteUser(uid);return json({error:'Account creation failed'},entryErr?.code==='23505'?409:502)}
  if(role==='admin')await supa.from('member_authorization_events').insert({member_id:memberId,account_id:entry.id,event_type:'admin_created',actor_user_id:user.id});
  return json({ok:true,member:{...entry,enabled:true}},201);
 }catch{return json({error:'Invalid request'},400)}
});
