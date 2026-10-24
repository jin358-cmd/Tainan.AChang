import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
Deno.serve(async (req: Request) => {
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  const bearer=req.headers.get('authorization')||'';
  if(!/^Bearer\s+\S+$/i.test(bearer))return json({error:'Unauthorized'},401);
  const url=Deno.env.get('SUPABASE_URL')||'';
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)return json({error:'Not configured'},503);
  const supa=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  try{
    const {data:{user},error:authErr}=await supa.auth.getUser(bearer.replace(/^Bearer\s+/i,''));
    if(authErr||!user)return json({error:'Unauthorized'},401);
    const {data:admin,error:adminErr}=await supa.from('member_accounts').select('role,status').eq('auth_user_id',user.id).maybeSingle();
    if(adminErr||admin?.role!=='admin'||admin?.status!=='active')return json({error:'Admin only'},403);
    const b=await req.json();
    const memberId=String(b.memberId||'');const phone=String(b.phone||'');const password=String(b.password||'');
    if(!/^[\da-f]{8}-[\da-f-]{27,}$/i.test(memberId)||!/^\+8869\d{8}$/.test(phone)||!(/^[0-9]{6}$/.test(password)||(password.length>=12&&password.length<=180)))return json({error:'Invalid fields'},400);
    const {data:member,error:memberErr}=await supa.from('members').select('id,phone_e164,deleted_at').eq('id',memberId).maybeSingle();
    if(memberErr||!member||member.deleted_at||member.phone_e164!==phone)return json({error:'Member and contact phone mismatch'},400);
    const {data:existing}=await supa.from('member_accounts').select('id').eq('member_id',memberId).maybeSingle();
    if(existing)return json({error:'Member already exists'},409);
    // Supabase Auth phone identities are unique. Use a member-specific internal alias for
    // authentication and keep phone_e164 as non-unique contact information only.
    const loginId='ACH-'+memberId.replaceAll('-','').toUpperCase();
    const email='volunteer-'+memberId+'@auth.achang.invalid';
    const {data:created,error:createError}=await supa.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{achang_member_id:memberId}});
    if(createError||!created.user)return json({error:'Unable to create account'},createError?.status===422?409:502);
    const uid=created.user.id;
    const {data:entry,error:entryErr}=await supa.from('member_accounts').insert({member_id:memberId,auth_user_id:uid,login_id:loginId,role:'volunteer',status:'pending',requested_at:new Date().toISOString()}).select('id,member_id,login_id,status').single();
    if(entryErr||!entry){await supa.auth.admin.deleteUser(uid);return json({error:'Account request creation failed'},502)}
    return json({ok:true,member:{...entry,role:'volunteer',enabled:false}},201);
  }catch{ return json({error:'Invalid request'},400)}
});
