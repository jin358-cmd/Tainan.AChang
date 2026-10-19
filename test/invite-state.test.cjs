'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const I=require('../lib/invite-state');
const TOKEN='SYNTHETIC-ONLY-NOT-A-REAL-INVITE-0001';

test('invite tokens are represented by deterministic SHA-256 only',()=>{
 const hash=I.hashToken(TOKEN);
 assert.match(hash,/^[0-9a-f]{64}$/);
 assert.equal(hash,I.hashToken(TOKEN));
 assert.ok(!hash.includes('SYNTHETIC'));
});

test('expired, used and revoked invitations cannot be consumed',()=>{
 const base={expiresAt:'2030-01-01T00:00:00.000Z',usedAt:null,revokedAt:null};
 assert.equal(I.availability(base,'2029-01-01T00:00:00.000Z'),'available');
 assert.equal(I.availability({...base,usedAt:'2028-01-01T00:00:00.000Z'},'2029-01-01T00:00:00.000Z'),'used');
 assert.equal(I.availability({...base,revokedAt:'2028-01-01T00:00:00.000Z'},'2029-01-01T00:00:00.000Z'),'revoked');
 assert.equal(I.availability(base,'2031-01-01T00:00:00.000Z'),'expired');
});

test('synthetic consume is one-time and application transitions require approval',()=>{
 const invite={expiresAt:'2030-01-01T00:00:00.000Z',usedAt:null,revokedAt:null};
 const result=I.consumeSynthetic(invite,{displayName:'示範志工',phoneE164:'+886900000001'},'2029-01-01T00:00:00.000Z');
 assert.equal(result.application.status,'pending');
 assert.throws(()=>I.consumeSynthetic(result.invite,{displayName:'示範志工',phoneE164:'+886900000001'},'2029-01-01T00:00:01.000Z'));
 assert.equal(I.transition('pending','approved'),'approved');
 assert.equal(I.transition('approved','activated'),'activated');
 assert.throws(()=>I.transition('pending','activated'));
});
