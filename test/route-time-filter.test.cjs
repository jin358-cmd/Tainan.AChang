'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const filter=require('../route-time-filter.js');

const rows=[
 {id:'page-1-stop-41','清運次序':41,'到達':'23:50'},
 {id:'page-2-stop-41','清運次序':41,'到達':'00:10'},
 {id:'invalid-short','清運次序':42,'到達':'18:6'},
 {id:'struck','清運次序':43,'到達':'00:20','來源刪除線':true},
 {id:'page-2-stop-42','清運次序':42,'到達':'00:30'}
];

test('all-time view preserves every PDF row in source order without mutation',()=>{
 const before=structuredClone(rows),actual=filter.filter(rows);
 assert.deepEqual(actual.map(row=>row.id),rows.map(row=>row.id));assert.notEqual(actual,rows);assert.deepEqual(rows,before);
});

test('time options keep first source occurrence and exclude invalid or struck values',()=>{
 assert.deepEqual(filter.times(rows),['23:50','00:10','00:30']);
 assert.equal(filter.legalTime('18:6'),'');assert.equal(filter.legalTime('24:00'),'');assert.equal(filter.legalTime('04:59'),'04:59');
});

test('active filters preserve duplicate station numbers and source order',()=>{
 assert.deepEqual(filter.filter(rows,'00:10','00:30').map(row=>row.id),['page-2-stop-41','page-2-stop-42']);
 assert.deepEqual(filter.filter(rows,'23:50','00:10').map(row=>row.id),['page-1-stop-41','page-2-stop-41']);
});

test('invalid filter values fail closed and a valid empty range is explicit',()=>{
 assert.deepEqual(filter.filter(rows,'18:6',''),[]);assert.deepEqual(filter.filter(rows,'12:00','13:00'),[]);
});

test('fixed daytime start and end options come from the source interval endpoints',()=>{
 const intervals=[
  {id:'first','到達':'09:15','離開':'09:45'},
  {id:'middle','到達':'13:30','離開':'13:45'},
  {id:'last','到達':'15:00','離開':'15:15'}
 ];
 assert.deepEqual(filter.startTimes(intervals),['09:15','13:30','15:00']);
 assert.deepEqual(filter.endTimes(intervals),['09:45','13:45','15:15']);
 assert.deepEqual(filter.filterIntervals(intervals,'13:30','13:45').map(row=>row.id),['middle']);
 assert.deepEqual(filter.filterIntervals(intervals,'15:00','15:15').map(row=>row.id),['last']);
 assert.deepEqual(filter.filterIntervals(intervals,'09:15','15:15').map(row=>row.id),['first','middle','last']);
 assert.deepEqual(filter.filterIntervals(intervals).map(row=>row.id),['first','middle','last']);
 assert.deepEqual(filter.filterIntervals(intervals,'15:15','09:15'),[]);
});
