import { createClient } from 'jsr:@supabase/supabase-js@2';
import { executeMemberAdminV2,MemberAdminError } from '../_shared/member-admin-v2-core.mjs';

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const encoder=new TextEncoder();
const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const protectedPrincipalHashByProject:Record<string,string>={
 fhxdpupascsikjsycpbi:'0c547cdd53e62896571f12b7ed9e2aaa2f0bf5361aad782f1a2e9eb362202ee6',
 ctskglmglevronvnkpmm:'aafea9485fd742b9c78d4eea26f9368c0b4800f1823075bee0f3bd8787f9cf45'
};

Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 if(Number(req.headers.get('content-length')||0)>4000)return json({error:'Invalid request'},400);
 const bearer=req.headers.get('authorization')||'',token=bearer.replace(/^Bearer\s+/i,'');
 if(!/^Bearer\s+\S+$/i.test(bearer))return json({error:'請重新登入',code:'UNAUTHENTICATED'},401);
 const url=Deno.env.get('SUPABASE_URL')||'',serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',anonKey=Deno.env.get('SUPABASE_ANON_KEY')||'',expected=Deno.env.get('ACHANG_EXPECTED_PROJECT_REF')||'';
 let actual='';try{const parsed=new URL(url);if(parsed.protocol==='https:'&&/^[a-z0-9]+\.supabase\.co$/.test(parsed.hostname))actual=parsed.hostname.split('.')[0]}catch{}
 const protectedPrincipalHash=protectedPrincipalHashByProject[expected]||'';
 if(!expected||actual!==expected||!serviceKey||!anonKey||!protectedPrincipalHash)return json({error:'會員管理服務尚未完成隔離設定'},503);
 const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
 const userClient=createClient(url,anonKey,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{Authorization:bearer}}});
 const selectAccount='id,member_id,auth_user_id,login_id,role,status,requested_at,approved_at,approved_by,rejected_at,rejection_reason,suspended_at,suspended_by,reactivated_at,reactivated_by,created_at,device_approval_required';
 const findAuthUser=async(email:string)=>{
  for(let page=1;page<=50;page++){
   const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});if(error)throw error;
   const found=data.users.find((user:{email?:string})=>user.email?.toLowerCase()===email.toLowerCase());if(found)return found;
   if(data.users.length<1000)return null;
  }
  throw new MemberAdminError(503,'登入身分查核範圍超出安全限制');
 };
 const deps={
  now:()=>new Date().toISOString(),
  authAlias:async(memberId:string,role:string)=>{const {data,error}=await userClient.rpc('achang_prepare_member_auth_identity',{p_member_id:memberId,p_role:role});if(error)throw error;return data},
  publicAccount:(account:Record<string,unknown>)=>({id:account.id,member_id:account.member_id,auth_user_id:account.auth_user_id,login_id:account.login_id,role:account.role,status:account.status,requested_at:account.requested_at,approved_at:account.approved_at,suspended_at:account.suspended_at,reactivated_at:account.reactivated_at,device_approval_required:account.device_approval_required,deleted_at:account.deleted_at||null}),
  authenticate:async(accessToken:string)=>{const {data:{user},error}=await admin.auth.getUser(accessToken);if(error||!user)return null;return {id:user.id,email:user.email||''}},
  getActiveAdmin:async(userId:string)=>{const {data,error}=await userClient.from('member_accounts').select('id,role,status').eq('auth_user_id',userId).eq('role','admin').eq('status','active').limit(1).maybeSingle();if(error)throw error;return data},
  rateLimit:async(userId:string,action:string)=>{const subject=await sha(serviceKey+'|member-admin-v2|'+userId+'|'+action);const {data,error}=await admin.rpc('achang_try_pin_attempt',{p_subject:subject,p_max_attempts:30,p_window_seconds:900});if(error)throw new MemberAdminError(503,'會員管理安全檢查暫時無法使用');if(!data)throw new MemberAdminError(429,'操作過於頻繁，請稍後再試')},
  getMember:async(memberId:string)=>{const {data,error}=await userClient.from('members').select('id,phone_e164,display_name,deleted_at').eq('id',memberId).limit(1).maybeSingle();if(error)throw error;return data},
  getAccountByMember:async(memberId:string)=>{const {data,error}=await userClient.from('member_accounts').select(selectAccount).eq('member_id',memberId).limit(1).maybeSingle();if(error)throw error;return data},
  getAccountById:async(accountId:string)=>{const {data,error}=await userClient.from('member_accounts').select(selectAccount).eq('id',accountId).limit(1).maybeSingle();if(error)throw error;return data},
  ensureAuthUser:async({email,password,memberId,role}:{email:string,password:string,memberId:string,role:string})=>{
   const valid=(user:{user_metadata?:Record<string,unknown>})=>user.user_metadata?.achang_member_id===memberId&&user.user_metadata?.achang_role===role;
   let existing=await findAuthUser(email);if(existing){if(!valid(existing))throw new MemberAdminError(409,'登入身分識別衝突');return existing}
   const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{achang_member_id:memberId,achang_role:role}});
   if(!error&&data.user)return data.user;
   existing=await findAuthUser(email);if(existing&&valid(existing))return existing;
   throw error||new MemberAdminError(502,'登入身分建立失敗');
  },
  insertAccount:async(values:Record<string,unknown>)=>{const {data,error}=await userClient.from('member_accounts').insert(values).select(selectAccount).single();if(error)throw error;return data},
  transitionAccountAtomic:async(accountId:string,action:string,expectedStatus:string,reason:string)=>{
   const {data,error}=await userClient.rpc('achang_member_admin_v2_transition',{p_account_id:accountId,p_action:action,p_expected_status:expectedStatus,p_reason:reason||null});
   if(error){
    if(error.code==='40001')throw new MemberAdminError(409,'會員狀態已由其他操作更新，請重新整理','STATE_CONFLICT');
    if(error.code==='P0002')throw new MemberAdminError(404,'會員帳號不存在','ACCOUNT_NOT_FOUND');
    if(error.code==='42501')throw new MemberAdminError(403,'只有已啟用管理員可以管理會員','ADMIN_REQUIRED');
    if(error.code==='23514'){
     if(/protected principal/i.test(error.message||''))throw new MemberAdminError(403,'受保護主要管理員不能停用','PROTECTED_PRINCIPAL');
     throw new MemberAdminError(409,'會員狀態不允許此操作','INVALID_TRANSITION');
    }
    throw error;
   }
   return data;
  },
  archiveMemberAtomic:async(accountId:string,expectedStatus:string,reason:string)=>{
   const {data,error}=await userClient.rpc('achang_member_admin_v2_archive',{p_account_id:accountId,p_expected_status:expectedStatus,p_reason:reason});
   if(error){
    if(error.code==='40001')throw new MemberAdminError(409,'會員狀態已由其他操作更新，請重新整理','STATE_CONFLICT');
    if(error.code==='P0002')throw new MemberAdminError(404,'會員帳號不存在','ACCOUNT_NOT_FOUND');
    if(error.code==='42501')throw new MemberAdminError(403,'只有已啟用管理員可以管理會員','ADMIN_REQUIRED');
    if(error.code==='23514'){
     if(/protected principal/i.test(error.message||''))throw new MemberAdminError(403,'受保護主要管理員不能刪除','PROTECTED_PRINCIPAL');
     if(/last active administrator/i.test(error.message||''))throw new MemberAdminError(409,'不能刪除最後一位啟用中的管理員','LAST_ACTIVE_ADMIN');
     if(/own account/i.test(error.message||''))throw new MemberAdminError(409,'管理員不能封存自己的帳號','SELF_ARCHIVE_FORBIDDEN');
     throw new MemberAdminError(409,'會員狀態不允許封存','INVALID_TRANSITION');
    }
    if(error.code==='22023')throw new MemberAdminError(400,'封存資料格式不正確','INVALID_ARCHIVE_REQUEST');
    throw error;
   }
   return data;
  },
  promoteAdminAtomic:async(accountId:string,expectedRole:string,expectedStatus:string)=>{
   const {data,error}=await userClient.rpc('achang_member_admin_v2_promote_admin',{p_account_id:accountId,p_expected_role:expectedRole,p_expected_status:expectedStatus});
   if(error){
    if(error.code==='40001')throw new MemberAdminError(409,'會員角色已由其他操作更新，請重新整理','STATE_CONFLICT');
    if(error.code==='P0002')throw new MemberAdminError(404,'會員帳號不存在','ACCOUNT_NOT_FOUND');
    if(error.code==='42501')throw new MemberAdminError(403,'只有已啟用管理員可以管理會員','ADMIN_REQUIRED');
    if(error.code==='23514')throw new MemberAdminError(409,'只有已核准且啟用中的志工可以設為管理員','INVALID_TRANSITION');
    throw error;
   }
   return data;
  },
  isProtectedPrincipal:async(userId:string)=>await sha(userId)===protectedPrincipalHash,
  listState:async()=>{
   const [{data:accounts,error:accountError},{data:members,error:memberError},{data:devices,error:deviceError}]=await Promise.all([
    userClient.from('member_accounts').select(selectAccount).order('created_at'),
    userClient.from('members').select('id,display_name,phone_e164,deleted_at'),
    userClient.from('member_devices').select('id,account_id,status,requested_at,created_at,device_type,operating_system,browser_name,approved_at,revoked_at,last_seen_at').order('created_at')
   ]);
   if(accountError||memberError||deviceError)throw accountError||memberError||deviceError;
   const memberRows=((members||[]) as Record<string,unknown>[]).filter(member=>!member.deleted_at),accountRows=(accounts||[]) as Record<string,unknown>[];
   const byMember=new Map<string,Record<string,unknown>>(memberRows.map(member=>[String(member.id),member]));
   const visibleAccounts=accountRows.filter(account=>byMember.has(String(account.member_id)));
   const visibleAccountIds=new Set(visibleAccounts.map(account=>String(account.id)));
   const rows=await Promise.all(visibleAccounts.map(async account=>{const member=byMember.get(String(account.member_id));return {...deps.publicAccount(account),name:member?.display_name||'',phone:member?.phone_e164||'',enabled:account.status==='active',protected:await sha(String(account.auth_user_id))===protectedPrincipalHash}}));
   return {ok:true,members:rows,devices:(devices||[]).filter(device=>visibleAccountIds.has(String(device.account_id)))};
  }
 };
 let attemptedAction='unknown';
 try{
  const body=await req.json();attemptedAction=typeof body?.action==='string'?body.action.slice(0,32):'unknown';const result=await executeMemberAdminV2({token,body},deps);
  return json(result.body,result.status);
 }catch(error){
  if(error instanceof MemberAdminError){try{const {data:{user}}=await admin.auth.getUser(token);const subject=user?.id?await sha(serviceKey+'|member-admin-v2-denied|'+user.id):null;console.warn(JSON.stringify({event:'member_admin_v2_denied',action:attemptedAction,status:error.status,code:error.code,subject}))}catch{}return json({error:error.message,code:error.code},error.status)}
  console.error('achang-member-admin-v2',error instanceof Error?error.message:'unknown error');
  return json({error:'會員管理服務暫時無法使用'},503);
 }
});

