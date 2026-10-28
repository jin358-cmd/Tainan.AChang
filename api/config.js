'use strict';
const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET']);
 const env=L.requireEnvironment();
 L.json(res,200,{
  environment:'test',
  projectRef:env.projectRef,
  supabaseUrl:env.supabaseUrl,
  googleOAuthUrl:`${env.supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=`
 });
});
