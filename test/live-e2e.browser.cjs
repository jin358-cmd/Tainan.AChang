const { chromium }=require('playwright');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const cp=require('node:child_process');

const base=process.env.ACHANG_E2E_BASE_URL;
const adminPhone=process.env.ACHANG_E2E_ADMIN_PHONE;
const adminPin=process.env.ACHANG_E2E_ADMIN_PIN;
const metadataPath=process.env.ACHANG_E2E_METADATA_PATH;
const meta=JSON.parse(fs.readFileSync(metadataPath,'utf8'));
const six=()=>String(crypto.randomInt(100000,1000000));
const evidence={runId:'ACHANG-LIVE-'+new Date().toISOString(),baseUrl:base,steps:{}};

function acceptDialogs(page){page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'真實隔離驗收':undefined))}
async function openLogin(page){await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#rosterLocked')?.hidden===false);await page.waitForTimeout(1000);await page.locator('#volunteerLoginBtn').click();await page.waitForFunction(()=>document.querySelector('#secureLogin')?.hidden===false);await page.locator('#secureLoginForm').waitFor()}
async function submitLogin(page,phone,pin){await page.locator('#secureLoginForm input[name="login"]').fill(phone);await page.locator('#secureLoginForm input[name="password"]').fill(pin);await page.locator('#secureLoginForm button[type="submit"]').click()}
async function sessionResult(page){return page.evaluate(()=>fetch('/api/session',{cache:'no-store',headers:{'X-AChang-Device':localStorage.getItem('achang-v10-device-id')||''}}).then(async r=>({status:r.status,body:await r.json()})))}
async function loginApproved(page,phone,pin,role){await openLogin(page);await submitLogin(page,phone,pin);await page.waitForFunction(()=>document.querySelector('#signedInName')?.hidden===false);const session=await sessionResult(page);assert.equal(session.status,200);assert.equal(session.body.role,role)}
async function openAdmin(page){if(await page.locator('#modal').evaluate(x=>!x.hidden))await page.locator('#closeModal').click();await page.locator('#adminHeaderAction').click();await page.locator('#memberAdminForm').waitFor()}
async function issueInvite(page,memberId){await openAdmin(page);await page.locator('#authorizationVolunteer').selectOption(memberId);await page.locator('#memberAdminForm button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#modalTitle')?.textContent.includes('邀請碼'));const code=(await page.locator('#modalBody div[style*="font-size:36px"]').textContent()).trim();assert.match(code,/^\d{4}$/);return code}
async function applyMember(context,code,phone,pin,expectSuccess){const page=await context.newPage();await openLogin(page);await page.locator('#openMemberApplication').click();const form=page.locator('#memberApplicationForm');await form.locator('[name="invitationCode"]').fill(code);await form.locator('[name="phone"]').fill(phone);await form.locator('[name="pin"]').fill(pin);await form.locator('button[type="submit"]').click();await page.waitForFunction(()=>/✓|申請失敗/.test(document.querySelector('#memberApplicationStatus')?.textContent||''));const text=await page.locator('#memberApplicationStatus').textContent();assert.equal(/✓/.test(text),expectSuccess,text);await page.close();return text}
async function approveAccount(adminPage,name){await openAdmin(adminPage);const row=adminPage.locator('.approved-member-row').filter({hasText:name}).filter({has:adminPage.locator('[data-account-approve]')}).first();await row.locator('[data-account-approve]').click();await adminPage.waitForFunction(n=>!Array.from(document.querySelectorAll('.approved-member-row')).some(x=>x.textContent.includes(n)&&x.querySelector('[data-account-approve]')),name)}
async function requestDevice(page,phone,pin){acceptDialogs(page);await openLogin(page);await submitLogin(page,phone,pin);await page.waitForFunction(()=>{const t=document.querySelector('#authStatus')?.textContent||'';return t&&t!=='登入驗證中…'});const status=await page.locator('#authStatus').textContent();assert.match(status,/申請已送出|等待管理員核准/,status)}
async function approvePendingDevice(adminPage,name){await openAdmin(adminPage);const row=adminPage.locator('.device-approval-row').filter({hasText:name}).first();await row.locator('[data-approve-device]').click();await adminPage.waitForFunction(n=>!Array.from(document.querySelectorAll('.device-approval-row')).some(x=>x.textContent.includes(n)),name)}
function expireInvite(memberId){const script=__dirname+'\\live-e2e-fixture.ps1';const local=process.env.LOCALAPPDATA+'\\Tainan.AChang';cp.execFileSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Mode','Expire','-FunctionName',process.env.ACHANG_E2E_FIXTURE_FUNCTION,'-ProjectRef',process.env.ACHANG_E2E_PROJECT_REF,'-TokenPath',process.env.ACHANG_E2E_TOKEN_PATH,'-CredentialPath',local+'\\fixture-admin.xml','-MetadataPath',metadataPath,'-MemberId',memberId],{stdio:'ignore'})}

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const adminContext=await browser.newContext({serviceWorkers:'block'}),adminPage=await adminContext.newPage();acceptDialogs(adminPage);
  await loginApproved(adminPage,adminPhone,adminPin,'admin');
  const bootstrap=await adminPage.evaluate(async()=>{const out={};for(const name of ['tasks','roster','members']){const r=await fetch('/api/'+name,{cache:'no-store'});const body=await r.json();out[name]={status:r.status,count:Array.isArray(body.tasks)?body.tasks.length:Array.isArray(body.people)?body.people.length:Array.isArray(body.members)?body.members.length:0,error:body.error||''}}return out});
  assert.equal(bootstrap.tasks.status,200,JSON.stringify(bootstrap));assert.equal(bootstrap.roster.status,200,JSON.stringify(bootstrap));assert.equal(bootstrap.members.status,200,JSON.stringify(bootstrap));assert.ok(bootstrap.roster.count>=44,JSON.stringify(bootstrap));
  for(const tab of ['map','areas','planner','reports','people']){await adminPage.locator(`.desktop-nav [data-page="${tab}"]`).click();assert.equal(await adminPage.locator('#page-'+tab).evaluate(x=>x.classList.contains('active')),true)}
  evidence.steps.liveAdminLoginAndNavigation='PASS';

  const volunteerPin=six(),invite=await issueInvite(adminPage,meta.volunteerMemberId),publicContext=await browser.newContext({serviceWorkers:'block'});
  const wrong=String((Number(invite)+1)%10000).padStart(4,'0');
  await applyMember(publicContext,wrong,meta.volunteerPhone,volunteerPin,false);
  await applyMember(publicContext,invite,meta.volunteerPhone,volunteerPin,true);
  await applyMember(publicContext,invite,meta.volunteerPhone,volunteerPin,false);
  evidence.steps.inviteWrongSingleUseAndApplication='PASS';
  await approveAccount(adminPage,'合成驗收志工');
  evidence.steps.memberApproval='PASS';

  const deviceA=await browser.newContext({serviceWorkers:'block'}),pageA=await deviceA.newPage();
  await requestDevice(pageA,meta.volunteerPhone,volunteerPin);await approvePendingDevice(adminPage,'合成驗收志工');await loginApproved(pageA,meta.volunteerPhone,volunteerPin,'volunteer');
  const deviceB=await browser.newContext({serviceWorkers:'block'}),pageB=await deviceB.newPage();
  await requestDevice(pageB,meta.volunteerPhone,volunteerPin);await approvePendingDevice(adminPage,'合成驗收志工');await loginApproved(pageB,meta.volunteerPhone,volunteerPin,'volunteer');
  assert.equal((await sessionResult(pageA)).status,200);
  evidence.steps.twoIndependentDevices='PASS';

  await openAdmin(adminPage);const deviceRows=adminPage.locator('.device-detail-row').filter({hasText:'合成驗收志工'});assert.equal(await deviceRows.count(),2);await deviceRows.first().locator('[data-revoke-device]').click();await adminPage.waitForFunction(()=>Array.from(document.querySelectorAll('.device-detail-row')).filter(x=>x.textContent.includes('合成驗收志工')).length===1);
  const afterRevoke=[await sessionResult(pageA),await sessionResult(pageB)];assert.deepEqual(afterRevoke.map(x=>x.status).sort(),[200,403]);
  const activePage=afterRevoke[0].status===200?pageA:pageB,revokedPage=afterRevoke[0].status===403?pageA:pageB;
  evidence.steps.singleDeviceRevocation='PASS';

  await openAdmin(adminPage);await adminPage.locator('.approved-member-row').filter({hasText:'合成驗收志工'}).filter({has:adminPage.locator('[data-member-revoke]')}).first().locator('[data-member-revoke]').click();await adminPage.waitForFunction(()=>Array.from(document.querySelectorAll('[data-account-reactivate]')).some(x=>x.closest('.approved-member-row')?.textContent.includes('合成驗收志工')));
  assert.equal((await sessionResult(activePage)).status,403);
  await adminPage.locator('.approved-member-row').filter({hasText:'合成驗收志工'}).filter({has:adminPage.locator('[data-account-reactivate]')}).first().locator('[data-account-reactivate]').click();await adminPage.waitForFunction(()=>Array.from(document.querySelectorAll('[data-member-revoke]')).some(x=>x.closest('.approved-member-row')?.textContent.includes('合成驗收志工')));
  assert.equal((await sessionResult(activePage)).status,200);
  assert.equal((await sessionResult(revokedPage)).status,403);
  evidence.steps.suspendReactivateKeepsDeviceStates='PASS';

  const admin2Pin=six();await openAdmin(adminPage);await adminPage.locator('#authorizationVolunteer').selectOption(meta.secondAdminMemberId);await adminPage.locator('#directAdminBtn').click();const direct=adminPage.locator('#directProvisionForm');await direct.locator('[name="pin"]').fill(admin2Pin);await direct.locator('[name="pinConfirm"]').fill(admin2Pin);await direct.locator('button[type="submit"]').click();await adminPage.waitForFunction(()=>document.querySelector('#memberAdminForm'));
  const admin2Context=await browser.newContext({serviceWorkers:'block'}),admin2Page=await admin2Context.newPage();await requestDevice(admin2Page,meta.secondAdminPhone,admin2Pin);await approvePendingDevice(adminPage,'合成第二管理員');await loginApproved(admin2Page,meta.secondAdminPhone,admin2Pin,'admin');evidence.steps.createAdminAndApproveDevice='PASS';

  const expiryPin=six(),expiryCode=await issueInvite(adminPage,meta.expiryMemberId);expireInvite(meta.expiryMemberId);await applyMember(publicContext,expiryCode,meta.expiryMemberPhone,expiryPin,false);evidence.steps.expiredInviteRejected='PASS';

  const config=await adminPage.evaluate(()=>fetch('/api/config',{cache:'no-store'}).then(r=>r.json()));assert.equal(config.projectRef,'fhxdpupascsikjsycpbi');assert.equal(config.environment,'test');assert.match(config.googleOAuthUrl,/fhxdpupascsikjsycpbi\.supabase\.co\/auth\/v1\/authorize\?provider=google/);evidence.steps.testIsolationAndGoogleOAuthWiring='PASS';
  await Promise.all([adminContext.close(),publicContext.close(),deviceA.close(),deviceB.close(),admin2Context.close()]);
  evidence.status='PASS';process.stdout.write(JSON.stringify(evidence,null,2)+'\n');
 }finally{await browser.close()}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
