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
    const {data:member,error:memberErr}=await supa.from('members').select('id,phone_e164').eq('id',memberId).maybeSingle();
    if(memberErr||!member||member.phone_e164!==phone)return json({error:'Member and phone mismatch'},400);
    const {data:existing}=await supa.from('member_accounts').select('id').eq('member_id',memberId).maybeSingle();
    if(existing)return json({error:'Member already exists'},409);
    const {data:created,error:createError}=await supa.auth.admin.createUser({phone,password,phone_confirm:true});
    if(createError||!created.user)return json({error:'Unable to create account'},createError?.status===422?409:502);
    const uid=created.user.id;
    const {data:entry,error:entryErr}=await supa.from('member_accounts').insert({member_id:memberId,auth_user_id:uid,role:'volunteer',status:'active',approved_at:new Date().toISOString(),approved_by:user.id}).select('id').single();
    if(entryErr||!entry){await supa.auth.admin.deleteUser(uid);return json({error:'Account activation failed'},502)}
    return json({ok:true,member:{member_id:memberId,role:'volunteer',enabled:true}},201);
  }catch{ return json({error:'Invalid request'},400)}
});