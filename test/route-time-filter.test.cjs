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
