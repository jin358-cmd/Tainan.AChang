const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','population-data.js'),'utf8');
const sandbox={window:{}};
vm.runInNewContext(source,sandbox);
const data=sandbox.window.AChangPopulation202609;

test('official-page extract contains the exact ten-village household and population values',()=>{
  assert.equal(data.period,'2026-09');
  assert.equal(data.rows.length,10);
  assert.deepEqual(JSON.parse(JSON.stringify(data.rows)),[
    {village:'光復里',households:897,population:1446},
    {village:'復華里',households:4326,population:10555},
    {village:'勝利里',households:4333,population:8960},
    {village:'中華里',households:1535,population:3042},
    {village:'成功里',households:1156,population:2359},
    {village:'復國里',households:4144,population:9415},
    {village:'中興里',households:1471,population:3486},
    {village:'神洲里',households:719,population:1466},
    {village:'復興里',households:948,population:1952},
    {village:'建國里',households:1229,population:2355}
  ]);
});

test('recomputed totals and evidence limits are explicit',()=>{
  const totals=data.rows.reduce((sum,row)=>({households:sum.households+row.households,population:sum.population+row.population}),{households:0,population:0});
  assert.deepEqual(totals,{households:20758,population:45036});
  assert.deepEqual(JSON.parse(JSON.stringify(data.totals)),totals);
  assert.match(data.definition,/戶籍人口/);
  assert.match(data.definition,/不是實際居住人口或白天活動人口/);
  assert.equal(data.evidenceStatus,'官方頁面數值已擷取／原檔一致性待驗');
  assert.match(data.sourceUrl,/yungkang-house\.tainan\.gov\.tw/);
});
