import { createClient } from 'jsr:@supabase/supabase-js@2';

const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
const encoder=new TextEncoder();
const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const groupKey=(row:{service_date:string;shift:string;village:string;truck_number:string|null})=>[row.service_date,row.shift,row.village,row.truck_number||''].join('|');

Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 if(Number(req.headers.get('content-length')||0)>32)return reply({error:'Invalid request'},400);
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',expected=Deno.env.get('ACHANG_EXPECTED_PROJECT_REF')||'';
 let actual='';try{const parsed=new URL(url);if(parsed.protocol==='https:'&&/^[a-z0-9]+\.supabase\.co$/.test(parsed.hostname))actual=parsed.hostname.split('.')[0]}catch{}
 if(!expected||actual!==expected||!key)return reply({error:'小組名冊服務暫時無法使用'},503);
 const authorization=req.headers.get('authorization')||'',token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
 const device=String(req.headers.get('x-achang-device')||'');
 if(!token||!/^[0-9a-f-]{32,64}$/i.test(device))return reply({error:'請重新登入'},401);
 try{
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userResult,error:userError}=await admin.auth.getUser(token),user=userResult.user;
  if(userError||!user?.id)return reply({error:'請重新登入'},401);
  const {data:account,error:accountError}=await admin.from('member_accounts').select('id,member_id,role,status').eq('auth_user_id',user.id).limit(1).maybeSingle();
  if(accountError)return reply({error:'小組名冊服務暫時無法使用'},503);
  if(!account||account.role!=='volunteer'||account.status!=='active')return reply({error:'此帳號沒有小組名冊權限'},403);
  const {data:binding,error:deviceError}=await admin.from('member_devices').select('id').eq('account_id',account.id).eq('device_id_hash',await sha(device)).eq('status','approved').limit(1).maybeSingle();
  if(deviceError)return reply({error:'裝置授權查核失敗'},503);
  if(!binding)return reply({error:'此裝置尚未核准'},403);
  const {data:own,error:ownError}=await admin.from('assignments').select('service_date,shift,village,truck_number').eq('member_id',account.member_id).is('cancelled_at',null).limit(101);
  if(ownError)return reply({error:'小組排班讀取失敗'},503);
  if((own||[]).length>100)return reply({error:'小組排班筆數超出安全上限'},503);
  const ownGroups=new Set((own||[]).map(groupKey));
  if(!ownGroups.size)return reply({contacts:[]});
  const dates=[...new Set((own||[]).map(row=>row.service_date))];
  const {data:assignments,error:assignmentError}=await admin.from('assignments').select('service_date,shift,village,truck_number,member_id').in('service_date',dates).is('cancelled_at',null).limit(5001);
  if(assignmentError)return reply({error:'小組排班讀取失敗'},503);
  if((assignments||[]).length>5000)return reply({error:'小組排班筆數超出安全上限'},503);
  const grouped=(assignments||[]).filter(row=>ownGroups.has(groupKey(row)));
  const memberIds=[...new Set(grouped.map(row=>row.member_id))];
  if(!memberIds.length)return reply({contacts:[]});
  const [{data:members,error:memberError},{data:accounts,error:activeError}]=await Promise.all([
   admin.from('members').select('id,display_name,phone_e164').in('id',memberIds).is('deleted_at',null).limit(5001),
   admin.from('member_accounts').select('member_id').in('member_id',memberIds).eq('role','volunteer').eq('status','active').limit(5001)
  ]);
  if(memberError||activeError)return reply({error:'小組名冊讀取失敗'},503);
  const active=new Set((accounts||[]).map(row=>row.member_id)),byMember=new Map((members||[]).map(row=>[row.id,row]));
  const seen=new Set<string>(),contacts=[];
  for(const row of grouped){const member=byMember.get(row.member_id);if(!member||!active.has(row.member_id))continue;const key=groupKey(row)+'|'+row.member_id;if(seen.has(key))continue;seen.add(key);contacts.push({visit_date:row.service_date,shift:row.shift==='day'?'日間':'夜間',area:row.village,truck:row.truck_number||'',name:member.display_name,phone:member.phone_e164||''})}
  return reply({contacts});
 }catch{return reply({error:'小組名冊服務暫時無法使用'},503)}
});
