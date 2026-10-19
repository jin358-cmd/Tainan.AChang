'use strict';
const crypto=require('node:crypto');
const STATES=new Set(['pending','approved','rejected','activated']);
function hashToken(token){
 if(typeof token!=='string'||token.length<24||token.length>512)throw new TypeError('invalid invite token');
 return crypto.createHash('sha256').update(token,'utf8').digest('hex');
}
function availability(invite,now=new Date()){
 if(!invite)return 'invalid';
 if(invite.revokedAt)return 'revoked';
 if(invite.usedAt)return 'used';
 if(new Date(invite.expiresAt).getTime()<=new Date(now).getTime())return 'expired';
 return 'available';
}
function consumeSynthetic(invite,application,now=new Date()){
 if(availability(invite,now)!=='available')throw new Error('invite unavailable');
 if(!application||!/^\+8869\d{8}$/.test(application.phoneE164||''))throw new TypeError('invalid applicant phone');
 return {invite:{...invite,usedAt:new Date(now).toISOString()},application:{...application,status:'pending',submittedAt:new Date(now).toISOString()}};
}
function transition(status,next){
 if(!STATES.has(status)||!STATES.has(next))throw new TypeError('invalid application status');
 const allowed={pending:new Set(['approved','rejected']),approved:new Set(['activated']),rejected:new Set(),activated:new Set()};
 if(!allowed[status].has(next))throw new Error('invalid application transition');
 return next;
}
module.exports={hashToken,availability,consumeSynthetic,transition};
