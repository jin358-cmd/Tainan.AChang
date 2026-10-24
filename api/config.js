'use strict';
const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
  L.method(req,['GET']);
  const env=L.requireEnvironment();
  L.json(res,200,{
    environment:env.environment,
    projectRef:env.actualProjectRef,
    supabaseUrl:env.supabaseUrl,
    googleOAuthUrl:`${env.supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=`
  });
});
