'use strict';
const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET']);
 const host=String(req.headers['x-forwarded-host']||req.headers.host||'');
 if(!/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(host))L.problem(400,'網址不正確');
 const redirect=new global.URL(String(req.query.redirect_to||''));
 if(redirect.protocol!=='https:'||redirect.host!==host)L.problem(400,'網址不正確');
 const target=L.URL+'/auth/v1/authorize?provider=google&redirect_to='+encodeURIComponent(redirect.href);
 res.setHeader('Cache-Control','no-store');res.statusCode=302;res.setHeader('Location',target);res.end();
});
