const test=require('node:test');
const assert=require('node:assert/strict');
const {pendingAreas}=require('../lib/planner-view.js');

const stops=[
  {'里別':'復華里'},{'里別':'復國里'},{'里別':'復華里'}
];
const task=(area,overrides={})=>({area,visit_date:'2026-10-20',shift:'日間',truck:'ABC-123',...overrides});

test('跟巡提示涵蓋無、部分及全部已指派狀態',()=>{
  assert.deepEqual(pendingAreas(stops,[],'2026-10-20','日間','ABC-123'),['復華里','復國里']);
  assert.deepEqual(pendingAreas(stops,[task('復華里')],'2026-10-20','日間','ABC-123'),['復國里']);
  assert.deepEqual(pendingAreas(stops,[task('復華里'),task('復國里')],'2026-10-20','日間','ABC-123'),[]);
});

test('日期、日夜及車輛切換不沿用其他條件的指派',()=>{
  const tasks=[task('復華里'),task('復國里',{visit_date:'2026-10-21'}),task('復國里',{shift:'夜間'}),task('復國里',{truck:'XYZ-789'})];
  assert.deepEqual(pendingAreas(stops,tasks,'2026-10-20','日間','ABC-123'),['復國里']);
  assert.deepEqual(pendingAreas(stops,tasks,'2026-10-21','日間','ABC-123'),['復華里']);
  assert.deepEqual(pendingAreas(stops,tasks,'2026-10-20','夜間','ABC-123'),['復華里']);
  assert.deepEqual(pendingAreas(stops,tasks,'2026-10-20','日間','XYZ-789'),['復華里']);
});

test('取消與改派後立即依目前任務重算',()=>{
  const assigned=[task('復華里'),task('復國里')];
  assert.deepEqual(pendingAreas(stops,assigned,'2026-10-20','日間','ABC-123'),[]);
  assert.deepEqual(pendingAreas(stops,assigned.slice(0,1),'2026-10-20','日間','ABC-123'),['復國里']);
  assert.deepEqual(pendingAreas(stops,[task('復國里')],'2026-10-20','日間','ABC-123'),['復華里']);
});
