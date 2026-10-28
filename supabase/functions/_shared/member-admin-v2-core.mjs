const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE=/^\+8869\d{8}$/;
const PIN=/^\d{6}$/;
const ROLES=new Set(['volunteer','admin']);

export class MemberAdminError extends Error{
 constructor(status,message,code='MEMBER_ADMIN_ERROR'){super(message);this.status=status;this.code=code}
}

const required=(value,label)=>{if(typeof value!=='string'||!value.trim())throw new MemberAdminError(400,`${label}格式不正確`);return value.trim()};
const uuid=value=>{const clean=required(String(value||''),'帳號 ID');if(!UUID.test(clean))throw new MemberAdminError(400,'帳號 ID 格式不正確');return clean};
const phone=value=>{const clean=required(String(value||''),'手機號碼');if(!PHONE.test(clean))throw new MemberAdminError(400,'請輸入有效台灣手機號碼');return clean};
const pin=value=>{const clean=String(value||'');if(!PIN.test(clean))throw new MemberAdminError(400,'PIN 必須是 6 位數字');return clean};
const role=value=>{const clean=String(value||'');if(!ROLES.has(clean))throw new MemberAdminError(400,'帳號角色不正確');return clean};

async function authorize(token,deps){
 if(typeof token!=='string'||!token)throw new MemberAdminError(401,'請重新登入','UNAUTHENTICATED');
 const actor=await deps.authenticate(token);
 if(!actor?.id)throw new MemberAdminError(401,'請重新登入','UNAUTHENTICATED');
 const account=await deps.getActiveAdmin(actor.id,token);
 if(!account||account.role!=='admin'||account.status!=='active')throw new MemberAdminError(403,'只有已啟用管理員可以管理會員','ADMIN_REQUIRED');
 return {actor,account};
}

async function reconcileCreatedAccount(memberId,context,deps){
 try{return await deps.getAccountByMember(memberId,context.token)}
 catch{throw new MemberAdminError(503,'帳號建立結果尚待確認，請稍後重新整理','CREATE_OUTCOME_UNKNOWN')}
}

async function createAccount(body,context,deps){
 const memberId=uuid(body.memberId),contact=phone(body.phone),password=pin(body.pin),requestedRole=role(body.role);
 await deps.rateLimit(context.actor.id,'create');
 const member=await deps.getMember(memberId,context.token);
 if(!member||member.deleted_at||member.phone_e164!==contact)throw new MemberAdminError(400,'會員與名冊手機不符');
 const existing=await deps.getAccountByMember(memberId,context.token);
 if(existing){
  if(existing.role!==requestedRole)throw new MemberAdminError(409,'會員已有不同角色的帳號');
  return {status:200,body:{ok:true,idempotent:true,member:deps.publicAccount(existing)}};
 }
 const loginId='ACH-'+memberId.replaceAll('-','').toUpperCase();
 const alias=required(String(await deps.authAlias?.(memberId,requestedRole)||''),'登入識別碼').replaceAll('-','').toLowerCase();
 if(!/^[0-9a-f]{32}$/.test(alias))throw new MemberAdminError(503,'登入身分安全識別碼建立失敗');
 const email=(requestedRole==='admin'?'admin-':'volunteer-')+alias+'@auth.achang.invalid';
 let authUser;
 try{authUser=await deps.ensureAuthUser({email,password,memberId,role:requestedRole})}
 catch(error){
  const concurrent=await reconcileCreatedAccount(memberId,context,deps);
  if(concurrent?.role===requestedRole)return {status:200,body:{ok:true,idempotent:true,member:deps.publicAccount(concurrent)}};
  throw new MemberAdminError(error?.status===422?409:502,error?.status===422?'登入身分已存在，請由管理員檢查':'登入身分建立失敗');
 }
 if(!authUser?.id)throw new MemberAdminError(502,'登入身分建立失敗');
 try{
  const account=await deps.insertAccount({member_id:memberId,auth_user_id:authUser.id,login_id:loginId,role:requestedRole,status:'pending',requested_at:deps.now(),device_approval_required:requestedRole!=='admin'},context.token);
  if(!account)throw new Error('account insert returned no row');
  return {status:201,body:{ok:true,idempotent:false,member:deps.publicAccount(account)}};
 }catch(error){
  const concurrent=await reconcileCreatedAccount(memberId,context,deps);
  if(concurrent?.auth_user_id===authUser.id&&concurrent.role===requestedRole)return {status:200,body:{ok:true,idempotent:true,member:deps.publicAccount(concurrent)}};
  if(concurrent)throw new MemberAdminError(409,'會員帳號建立衝突，請重新整理','CREATE_CONFLICT');
  throw new MemberAdminError(503,'登入身分已保留，請重新送出以完成帳號建立','CREATE_RETRY_REQUIRED');
 }
}

async function transitionAccount(action,body,context,deps){
 const accountId=uuid(body.accountId),reason=typeof body.reason==='string'?body.reason.trim().slice(0,500):'';
 await deps.rateLimit(context.actor.id,action);
 const target=await deps.getAccountById(accountId,context.token);
 if(!target)throw new MemberAdminError(404,'會員帳號不存在');
 if(target.auth_user_id===context.actor.id&&action==='suspend')throw new MemberAdminError(409,'管理員不能停用自己的帳號');
 if(action==='suspend'&&await deps.isProtectedPrincipal(target.auth_user_id))throw new MemberAdminError(403,'受保護主要管理員不能停用','PROTECTED_PRINCIPAL');
 let expectedStatus;
 if(action==='approve'){
  if(target.status!=='pending')throw new MemberAdminError(409,'只有待核准帳號可以核准');
  expectedStatus='pending';
 }else if(action==='suspend'){
  if(target.status!=='active')throw new MemberAdminError(409,'只有已啟用帳號可以停用');
  expectedStatus='active';
 }else if(action==='reactivate'){
  if(target.status!=='suspended'||!target.approved_at)throw new MemberAdminError(409,'未完成首次核准的帳號不能直接恢復');
  expectedStatus='suspended';
 }else throw new MemberAdminError(400,'不支援的會員操作');
 const updated=await deps.transitionAccountAtomic(target.id,action,expectedStatus,reason,context.token);
 if(!updated)throw new MemberAdminError(409,'會員狀態已由其他操作更新，請重新整理');
 return {status:200,body:{ok:true,member:deps.publicAccount(updated)}};
}

export async function executeMemberAdminV2({token,body},deps){
 const context={...(await authorize(token,deps)),token};
 const action=String(body?.action||'');
 if(action==='list')return {status:200,body:await deps.listState(context.token)};
 if(action==='create')return createAccount(body,context,deps);
 if(['approve','suspend','reactivate'].includes(action))return transitionAccount(action,body,context,deps);
 throw new MemberAdminError(400,'不支援的會員操作');
}
