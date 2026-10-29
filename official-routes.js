(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.AChangOfficialRoutes=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const text=value=>String(value??'').trim();
 const area=value=>{const name=text(value);return name&&!name.endsWith('里')?name+'里':name};
 function normalize(source,shift){
  const rows=Array.isArray(source)?source:[],pageRows=new Map();
  return rows.map((raw,index)=>{
   const page=Number(raw?._page)||0,pageRow=(pageRows.get(page)||0)+1;pageRows.set(page,pageRow);
   const extras=raw?._extras&&typeof raw._extras==='object'?raw._extras:{};
   const vehicle=text(raw?.['車次']),plate=text(raw?.['車牌']),originalOrder=text(raw?.['站點序號']);
   const sourceId=`PDF:${shift==='日間'?'DAY':'NIGHT'}:${String(index+1).padStart(4,'0')}`;
   return {
    '時段':shift,'車次':vehicle,'車牌':plate,'路線ID':`PDF:${shift}:${vehicle}:${plate}`,'站點ID':sourceId,
    '里別':area(raw?.['里別']),'清運次序':originalOrder,'原始站點序號':originalOrder,
    '停靠點原文':text(raw?.['站點名稱／地址']),'Google地圖定位地址':'','到達':text(raw?.['到達時間']),'離開':text(extras['離開時間']),
    '垃圾日':text(raw?.['清運星期']),'回收日':text(raw?.['資源回收星期']),'PDF頁碼':page,'PDF列序':pageRow,
    'PDF檔名':text(raw?.['資料來源']),'來源順序':index+1,'來源刪除線':extras['刪除線']===true,
    '定位狀態':'來源未提供已核對座標，不放置站點標記','備註':text(raw?._notes),'來源原文':raw
   };
  });
 }
 function validate(day,night){
  const d=normalize(day,'日間'),n=normalize(night,'夜間');
  const unique=rows=>new Set(rows.map(row=>row['站點ID'])).size===rows.length;
  return {day:d,night:n,valid:d.length===160&&n.length===1626&&unique(d)&&unique(n),
   dayRoutes:new Set(d.map(row=>row['車次'])).size,nightRoutes:new Set(n.map(row=>row['車次'])).size};
 }
 return {normalize,validate};
});
