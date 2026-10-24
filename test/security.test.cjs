const t=require('node:test'),assert=require('node:assert/strict');const L=require('../lib/server');
t('拒絕任意電話格式',()=>{assert.equal(L.phone('0989-098-468'),'+886989098468');assert.throws(()=>L.phone('1234567890'),/手機號碼/)});
t('會員登入代碼與聯絡電話分離',()=>{const id='ACH-92ACBBAF7E994A2692AB98297EB5076D';assert.equal(L.loginId(id.toLowerCase()),id);assert.throws(()=>L.loginId('0912345678'),/登入代碼/)});
t('日期、時間格式有驗證',()=>{assert.equal(L.validDate('2026-10-19'),'2026-10-19');assert.throws(()=>L.validDate('tomorrow'));assert.throws(()=>L.time('25:00'))});
t('公鑰可公開但絕不包含 Service Role 密鑰',()=>{assert.match(L.KEY,/^sb_publishable_/);assert.ok(!('SUPABASE_SERVICE_ROLE_KEY' in L))});
t('檢查來路不明的跨網站寫入',()=>{assert.throws(()=>L.originCheck({method:'POST',headers:{origin:'https://evil.invalid',host:'sample.vercel.app'}}),/拒絕跨網站/);assert.doesNotThrow(()=>L.originCheck({method:'POST',headers:{origin:'https://sample.vercel.app',host:'sample.vercel.app'}}))});
t('任意 token 不能通過 bootstrap 機密比對',()=>{assert.equal(L.safeEqual('bad','correct-secret'),false);assert.equal(L.safeEqual('same','same'),true)});
t('ID 只接受 UUID',()=>{assert.throws(()=>L.uuid('DEMO-01'));assert.equal(L.uuid('92acbbaf-7e99-4a26-92ab-98297eb5076d'),'92acbbaf-7e99-4a26-92ab-98297eb5076d')});

t('已授權 PWA 工作階段為受保護的 HttpOnly cookie；90 天滑動有效',()=>{
 const h={};const res={getHeader:(n)=>h[n],setHeader:(n,v)=>h[n]=v};
 L.setSession(res,{access_token:'placeholder_access',refresh_token:'placeholder_refresh',expires_in:3600});
 const parts=h['Set-Cookie'];assert.equal(parts.length,2);
 for(const item of parts){assert.match(item,/HttpOnly/);assert.match(item,/Secure/);assert.match(item,/SameSite=Strict/);assert.match(item,/Path=\/api/)}
 assert.match(parts[1],/Max-Age=7776000/);
 assert.doesNotMatch(parts.join(','),/password/i);
});
