// A teaching copy never shares mutable objects or identifiers with the project.
export function trajectoryBoardDocument(routes,markers,name='Situación preparada'){
 const copied=new Map(),items=[];
 for(const route of routes){if(!route.points?.length)continue;const id=crypto.randomUUID();copied.set(route.id,id);items.push({id,type:'route',name:route.name||'',points:structuredClone(route.points),color:route.color,width:5,opacity:1});}
 for(const marker of markers){if(!copied.has(marker.routeId)||!marker.coordinates)continue;items.push({...structuredClone(marker),id:crypto.randomUUID(),routeId:copied.get(marker.routeId),type:marker.signalCode?'signal':'note'});}
 return {steps:[{id:crypto.randomUUID(),name,question:'',answer:'',items}],activeStep:0};
}
export function boardTrajectoryProject(document,name){
 const routes=[],markers=[];
 document.steps.forEach((step,n)=>{const map=new Map();for(const item of step.items){if(!item.points?.length)continue;const id=crypto.randomUUID();map.set(item.id,id);routes.push({id,name:`${step.name||name} · ${n+1}.${map.size}`,color:item.color||'#e36b4d',points:structuredClone(item.points),narration:'',narrationLanguage:'es'});}for(const item of step.items){if(!['signal','note'].includes(item.type))continue;let routeId=map.get(item.routeId)||map.values().next().value;if(!routeId){routeId=crypto.randomUUID();routes.push({id:routeId,name:step.name||name,color:'#e36b4d',points:[],narration:'',narrationLanguage:'es'});}markers.push({...structuredClone(item),id:crypto.randomUUID(),routeId,description:item.description||item.note||''});}});
 if(!routes.length)routes.push({id:crypto.randomUUID(),name,color:'#e36b4d',points:[],narration:'',narrationLanguage:'es'});
 return {routes,markers,board:structuredClone(document)};
}
