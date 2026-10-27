const test=require('node:test');
const assert=require('node:assert/strict');

async function invokeWith(upstream){
 const serverPath=require.resolve('../lib/server');
 const sessionPath=require.resolve('../api/session');
 const originalServer=require.cache[serverPath];
 const originalSession=require.cache[sessionPath];
 const fake={
  run:handler=>handler,
  method(){},
  body:req=>req.body,
  checkText:value=>String(value),
  phone:value=>String(value),
  request:async()=>upstream,
  problem(status,message){const error=new Error(message);error.status=status;throw error}
 };
 require.cache[serverPath]={id:serverPath,filename:serverPath,loaded:true,exports:fake,children:[],paths:[]};
 delete require.cache[sessionPath];
 try{
  const handler=require('../api/session');
  await handler({method:'POST',body:{login:'0912345678',password:'123456'}},{});
 }finally{
  delete require.cache[sessionPath];
  if(originalSession)require.cache[sessionPath]=originalSession;
  if(originalServer)require.cache[serverPath]=originalServer;else delete require.cache[serverPath];
 }
}

test('verified suspended account returns the explicit suspended message',async()=>{
 await assert.rejects(
  invokeWith({ok:false,status:403,data:{code:'ACCOUNT_SUSPENDED'}}),
  error=>error.status===403&&error.message==='會員帳號已停用'
 );
});

test('invalid phone PIN remains a generic authentication failure',async()=>{
 await assert.rejects(
  invokeWith({ok:false,status:401,data:{code:'INVALID_CREDENTIALS'}}),
  error=>error.status===401&&error.message==='手機號碼或 PIN 不正確'
 );
});
