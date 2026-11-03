const test=require('node:test'),assert=require('node:assert/strict');
const {build,filterModelWindow}=require('../day-route-layer');
test('selected window filters map stations and lines with the same inclusive endpoints as the station list',()=>{
 const rows=['06:30','06:53','07:17','07:33'].map((time,i)=>({時段:'日間',車次:'日間2',站點ID:String(i),停靠點原文:`站${i}`,到達:time}));
 const catalog={stops:rows.map((r,i)=>({source_id:r.站點ID,source_name:r.停靠點原文,status:'official_stop',longitude:120.24+i*.001,latitude:23.01}))};
 const full=build(rows,catalog,'日間2'),selected=filterModelWindow(full,'06:53','07:17');
 assert.equal(full.total,4);assert.equal(selected.total,2);assert.equal(selected.points.features.length,2);assert.equal(selected.lines.features.length,1);assert.deepEqual(selected.stops.map(s=>s.order),[2,3]);assert.equal(filterModelWindow(full,'08:00','09:00').points.features.length,0);assert.equal(filterModelWindow(full).total,4);
});
