const test=require('node:test'),assert=require('node:assert/strict');
const {nextStopIds,build}=require('../day-route-layer'),progress=require('../dispatch-view');
test('next glow follows Taiwan schedule, respects service days, and disappears after the last station',()=>{
 const rows=[{時段:'日間',車次:'日間2',站點ID:'a',停靠點原文:'A',到達:'06:30',垃圾日:'二'},{時段:'日間',車次:'日間2',站點ID:'b',停靠點原文:'B',到達:'06:53',垃圾日:'二'},{時段:'日間',車次:'日間2',站點ID:'c',停靠點原文:'C',到達:'07:17',垃圾日:'二'}],model=build(rows,null,'日間2');
 assert.deepEqual([...nextStopIds(model,rows,progress,new Date('2026-11-02T22:40:00Z'))],['b']);
 assert.deepEqual([...nextStopIds(model,rows,progress,new Date('2026-11-02T22:54:00Z'))],['c']);
 assert.deepEqual([...nextStopIds(model,rows,progress,new Date('2026-11-02T23:18:00Z'))],[]);
 assert.deepEqual([...nextStopIds(model,rows,progress,new Date('2026-11-03T22:40:00Z'))],[]);
});
