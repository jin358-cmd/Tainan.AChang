const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const api=require('../official-routes.js');
const dayRaw=fs.readFileSync(path.join(root,'data-official-day-20261030.source.json'));
const day=JSON.parse(dayRaw);
const night=JSON.parse(fs.readFileSync(path.join(root,'data-official-night-20261030.source.json'),'utf8'));
const windows=JSON.parse(fs.readFileSync(path.join(root,'data-day-shift-windows-20261029.json'),'utf8'));

test('official PDF transcription validates exact row and vehicle counts',()=>{
 const result=api.validate(day,night);
 assert.equal(result.valid,true);assert.equal(result.day.length,160);assert.equal(result.night.length,1626);
 assert.equal(result.dayRoutes,6);assert.equal(result.nightRoutes,24);
 assert.equal(crypto.createHash('sha256').update(dayRaw).digest('hex'),'f8fb5fd77a31c543d976d614d20355e5cd171bf32938a67bc4e1356cb6062c29');
 assert.deepEqual(Object.fromEntries([...new Set(day.map(row=>row['車次']))].map(route=>[route,day.filter(row=>row['車次']===route).length])),{'日間1':50,'日間2':4,'日間3':94,'日間4':4,'日間5':5,'日間6':3});
});

test('normalization preserves PDF source order, duplicate visible numbers and raw fields',()=>{
 const result=api.validate(day,night),sample=result.night.filter(row=>row['車次']==='夜間18');
 assert.deepEqual(result.day.map(row=>row['來源順序']),Array.from({length:160},(_,index)=>index+1));
 assert.deepEqual(result.night.map(row=>row['來源順序']),Array.from({length:1626},(_,index)=>index+1));
 assert.equal(new Set(result.night.map(row=>row['站點ID'])).size,1626);
 assert.ok(sample.length>0);assert.ok(sample.every((row,index)=>index===0||row['來源順序']>sample[index-1]['來源順序']));
 assert.equal(result.day[0]['來源原文']['站點名稱／地址'],day[0]['站點名稱／地址']);
 assert.ok(result.day.every((row,index)=>row['來源順序']===index+1&&row['來源原文']===day[index]));
});

test('early-shift defaults contain only the six public route windows and no personal data',()=>{
 assert.equal(windows.source_sha256,'763e43618b20ce2412a621e5525c0f538fdf6dac24bba7b9900e4e82397aee62');
 assert.deepEqual(windows.routes,{
  '日間1':{start:'06:30',end:'08:05'},'日間2':{start:'06:25',end:'07:45'},'日間3':{start:'06:15',end:'07:15'},
  '日間4':{start:'06:35',end:'08:05'},'日間5':{start:'06:28',end:'07:45'},'日間6':{start:'06:52',end:'07:30'}
 });
 assert.doesNotMatch(JSON.stringify(windows),/司機姓名|駕駛|driver/i);
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
