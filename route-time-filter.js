(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.AChangRouteTime=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
 const STRIKE_FIELDS=['刪除線','來源刪除線','strikethrough','deleted'];
 const legalTime=value=>TIME.test(String(value||''))?String(value):'';
 const struck=row=>STRIKE_FIELDS.some(key=>row?.[key]===true);
 function times(rows){
  const seen=new Set(),result=[];
  for(const row of Array.isArray(rows)?rows:[]){
   if(struck(row))continue;
   const value=legalTime(row?.['到達']);
   if(value&&!seen.has(value)){seen.add(value);result.push(value)}
  }
  return result;
 }
 function endpointTimes(rows,field,fallback=''){
  const seen=new Set(),result=[];
  for(const row of Array.isArray(rows)?rows:[]){
   if(struck(row))continue;
   const value=legalTime(row?.[field])||legalTime(fallback?row?.[fallback]:'');
   if(value&&!seen.has(value)){seen.add(value);result.push(value)}
  }
  return result;
 }
 const startTimes=rows=>endpointTimes(rows,'到達');
 const endTimes=rows=>endpointTimes(rows,'離開','到達');
 function filter(rows,start='',end=''){
  const source=Array.isArray(rows)?rows:[],from=String(start||''),to=String(end||'');
  if(!from&&!to)return source.slice();
  if(from&&!legalTime(from)||to&&!legalTime(to))return [];
  return source.filter(row=>{
   if(struck(row))return false;
   const value=legalTime(row?.['到達']);if(!value)return false;
   if(from&&to)return from<=to?value>=from&&value<=to:value>=from||value<=to;
   return from?value>=from:value<=to;
  });
 }
 function filterIntervals(rows,start='',end=''){
  const source=Array.isArray(rows)?rows:[],from=String(start||''),to=String(end||'');
  if(!from&&!to)return source.slice();
  if(from&&!legalTime(from)||to&&!legalTime(to)||from&&to&&from>to)return [];
  return source.filter(row=>{
   if(struck(row))return false;
   const rowStart=legalTime(row?.['到達']),rowEnd=legalTime(row?.['離開'])||rowStart;if(!rowStart||!rowEnd)return false;
   return (!from||rowStart>=from)&&(!to||rowEnd<=to);
  });
 }
 return {legalTime,struck,times,startTimes,endTimes,filter,filterIntervals};
});
