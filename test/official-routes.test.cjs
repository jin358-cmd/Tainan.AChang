const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const api=require('../official-routes.js');
const day=JSON.parse(fs.readFileSync(path.join(root,'data-official-day-20261030.source.json'),'utf8'));
const night=JSON.parse(fs.readFileSync(path.join(root,'data-official-night-20261030.source.json'),'utf8'));

test('official PDF transcription validates exact row and vehicle counts',()=>{
 const result=api.validate(day,night);
 assert.equal(result.valid,true);assert.equal(result.day.length,160);assert.equal(result.night.length,1626);
 assert.equal(result.dayRoutes,6);assert.equal(result.nightRoutes,24);
});

test('normalization preserves PDF source order, duplicate visible numbers and raw fields',()=>{
 const result=api.validate(day,night),sample=result.night.filter(row=>row['車次']==='夜間18');
 assert.deepEqual(result.day.map(row=>row['來源順序']),Array.from({length:160},(_,index)=>index+1));
 assert.deepEqual(result.night.map(row=>row['來源順序']),Array.from({length:1626},(_,index)=>index+1));
 assert.equal(new Set(result.night.map(row=>row['站點ID'])).size,1626);
 assert.ok(sample.length>0);assert.ok(sample.every((row,index)=>index===0||row['來源順序']>sample[index-1]['來源順序']));
 assert.equal(result.day[0]['來源原文']['站點名稱／地址'],day[0]['站點名稱／地址']);
});

test('struck PDF row remains visible source evidence but is non-assignable',()=>{
 const result=api.validate(day,night),struck=result.night.filter(row=>row['來源刪除線']===true);
 assert.equal(struck.length,1);assert.match(struck[0]['備註'],/刪除線/);
 const filter=require('../route-time-filter.js');assert.equal(filter.struck(struck[0]),true);
});

test('invalid or original unusual time text is preserved, never corrected',()=>{
 const result=api.validate(day,night),values=[...result.day,...result.night].map(row=>row['到達']);
 assert.ok(values.includes('04:59'));assert.ok(values.includes('14:40'));assert.ok(values.includes('18:6'));
 assert.equal(require('../route-time-filter.js').legalTime('18:6'),'');
});
