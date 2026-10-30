(function(global){
  'use strict';
  const rows=[
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
  ];
  global.AChangPopulation202609=Object.freeze({
    period:'2026-09',
    tableName:'115年9月永康區各里戶數/人口數一覽表',
    sourceUrl:'https://yungkang-house.tainan.gov.tw/News_Population.aspx?n=17911&sms=18329',
    definition:'戶籍人口與戶數；不是實際居住人口或白天活動人口',
    evidenceStatus:'官方頁面數值已擷取／原檔一致性待驗',
    totals:Object.freeze({households:20758,population:45036}),
    rows:Object.freeze(rows.map(Object.freeze))
  });
})(window);
