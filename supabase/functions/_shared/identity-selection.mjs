export function classifyVerifiedAccounts(matches){
 if(!Array.isArray(matches)||matches.length===0)return {kind:'invalid'};
 if(matches.length===1)return {kind:'selected',account:matches[0]};
 return {kind:'selection',accounts:matches};
}

export function accountAccessCode(account){
 if(account?.status==='pending')return 'ACCOUNT_PENDING';
 if(account?.status!=='active')return 'ACCOUNT_SUSPENDED';
 return null;
}

export async function authenticateAccountCandidates({accounts,selectedAccountId=/** @type {string|null} */(null),getEmail,signIn,revokeSession}){
 if(!Array.isArray(accounts)||typeof getEmail!=='function'||typeof signIn!=='function'||typeof revokeSession!=='function')return {kind:'error'};
 const created=[],matches=[];
 let outcome={kind:'invalid'},retainedSession=null,retainedAccount=null,failed=false;
 try{
  for(const account of accounts){
   if(selectedAccountId&&account.id!==selectedAccountId)continue;
   const email=await getEmail(account);if(!email)continue;
   const attempt=await signIn(account,email);if(!attempt)continue;
   const session=attempt.session||attempt;if(!session?.access_token)throw Error('invalid auth session');
   const entry={account,session};created.push(entry);
   if(attempt.verified!==false)matches.push(entry);
  }
  const decision=classifyVerifiedAccounts(matches);
  if(decision.kind==='selection')outcome={kind:'selection',accounts:decision.accounts.map(x=>x.account)};
  else if(decision.kind==='selected'){
   const code=accountAccessCode(decision.account.account);
   if(code)outcome={kind:'blocked',code};
   else{retainedSession=decision.account.session;retainedAccount=decision.account.account;outcome={kind:'selected',account:retainedAccount,session:retainedSession}}
  }
 }catch{failed=true}
 let cleanupFailed=false;
 for(const entry of created){
  if(entry.session===retainedSession)continue;
  try{if(await revokeSession(entry.session,entry.account)===false)cleanupFailed=true}catch{cleanupFailed=true}
 }
 if((failed||cleanupFailed)&&retainedSession){
  try{await revokeSession(retainedSession,retainedAccount)}catch{}
 }
 if(failed||cleanupFailed)return {kind:'error'};
 return outcome;
}

export async function returnAuthenticatedSession({session,audit,revokeSession,buildResult}){
 let returned=false;
 try{
  if(!session?.access_token||typeof audit!=='function'||typeof revokeSession!=='function'||typeof buildResult!=='function')throw Error('invalid session ownership');
  if(await audit()===false)throw Error('authentication audit failed');
  const result=await buildResult(session);returned=true;
  return {ok:true,result};
 }catch{return {ok:false}}
 finally{
  if(!returned&&session?.access_token&&typeof revokeSession==='function'){
   try{await revokeSession(session)}catch{}
  }
 }
}
