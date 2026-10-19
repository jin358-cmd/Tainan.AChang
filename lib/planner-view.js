(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AChangPlannerView=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function pendingAreas(stops,tasks,date,shift,truck){
    const areas=[];
    for(const stop of stops||[]){
      const area=stop['里別'];
      if(area&&!areas.includes(area))areas.push(area);
    }
    return areas.filter(area=>!(tasks||[]).some(task=>
      task.area===area&&task.visit_date===date&&task.shift===shift&&task.truck===truck
    ));
  }
  return {pendingAreas};
});
