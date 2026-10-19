const test=require('node:test');
const assert=require('node:assert/strict');
const {server}=require('./qa-server.cjs');

test('匿名 loopback fixture 分離 admin、viewer 與 editor 畫面資料',async t=>{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const {port}=server.address(),base=`http://127.0.0.1:${port}`;
 const get=async(path,mode)=>{
  const response=await fetch(base+path,{headers:{Referer:`${base}/?mode=${mode}`}});
  assert.equal(response.status,200);
  return response.headers.get('content-type')?.includes('json')?response.json():response.text();
 };
 try{
  const html=await get('/','admin');
  const admin=await get('/api/session','admin'),viewer=await get('/api/session','viewer'),editor=await get('/api/session','editor');
  const access=await get('/api/roster-access','admin');
  assert.match(html,/⑤ 人員管理/);
  assert.doesNotMatch(html,/會員管理/);
  assert.equal(admin.role,'admin');
  assert.equal(viewer.role,'volunteer');assert.equal(viewer.canEditProfile,false);
  assert.equal(editor.role,'volunteer');assert.equal(editor.canEditProfile,true);
  assert.equal(access.featureReady,true);
  assert.equal(access.people.length,1);
  assert.match(JSON.stringify(access),/匿名志工甲/);
 }catch(error){
  if(error?.cause?.code==='EACCES'){t.skip('目前 sandbox 禁止 loopback connect；保留為 browser/runtime QA blocker');return}
  throw error;
 }finally{await new Promise(resolve=>server.close(resolve))}
});
