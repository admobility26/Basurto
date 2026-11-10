import {timeline,pointAt} from './reviewTime.js';
export function reviewParts(review){
 if(review.parts?.length)return review.parts;
 if(!review.points?.length)return [];
 return [{id:'original',name:review.name||review.sourceFile||'GPX',points:review.points,media:review.media||null,sourceFile:review.sourceFile,storedGpxFile:review.storedGpxFile,incidents:review.incidents||[]}];
}
export function assemblyPartAt(review,time){const parts=review.parts;if(!parts?.length)return null;return parts.findLast(p=>time>=p.startTime)||parts[0];}
export function partMedia(part){return part?.media?{...part.media,videoStartUtc:(part.media.videoStartUtc??part.points[0].time)+(part.shift||0)}:null;}
export function capturedParts(review){
 if(!review.parts?.length)return reviewParts(review);
 return review.parts.map(p=>({...p,incidents:(review.incidents||[]).filter(i=>i.partId===p.id||(!i.partId&&assemblyPartAt(review,i.time??review.points[0].time)?.id===p.id)).map(i=>({...i,time:(i.time??(review.points[0].time+(i.fraction||0)*(review.points.at(-1).time-review.points[0].time)))-p.shift}))}));
}
export function assembleReview(review,parts){
 if(!parts.length)return {...review,parts:[],points:[],incidents:[],media:null};
 if(parts.length>100)throw Error('El montaje admite hasta 100 tramos.');
 if(new Set(parts.map(p=>p.id)).size!==parts.length)throw Error('Hay identificadores de tramo duplicados.');
 const base=review.assemblyStart??parts[0].points[0]?.time;let cursor=base;
 const all=[],incidents=[],built=[];
 for(const part of parts){const clock=timeline(part.points);if(!clock.timed)throw Error('Cada GPX del montaje necesita horas completas y ordenadas.');const shift=cursor-clock.start,indexStart=all.length;
  const next={...part,shift,startTime:cursor,endTime:cursor+clock.duration*1000,indexStart};
  for(const point of part.points)all.push({...point,coordinates:[...point.coordinates],sourceTime:point.time,time:point.time+shift,partId:part.id,segment:part.id+':'+(point.segment??0)});
  for(const i of part.incidents||[]){const sourceTime=Number.isFinite(i.time)?i.time:clock.start+(i.fraction||0)*(clock.end-clock.start);incidents.push({...i,partId:part.id,time:sourceTime+shift,pointIndex:indexStart+pointAt(part.points,(sourceTime-clock.start)/(clock.end-clock.start),clock).index});}
  built.push(next);cursor=next.endTime;
 }
 if(all.length>500000)throw Error('El montaje supera 500.000 puntos; recorta los GPX antes de unirlos.');
 for(const i of incidents)i.fraction=(i.time-base)/Math.max(1,cursor-base);
 return {...review,source:'gpx',assemblyStart:base,parts:built,points:all,incidents,media:partMedia(built[0])};
}
export function appendReviewParts(review,additions){const parts=capturedParts(review);return assembleReview(review,[...parts,...additions.map(p=>({...p,id:p.id||crypto.randomUUID(),incidents:p.incidents||[]}))]);}
export function editReviewPart(review,id,patch){return assembleReview(review,capturedParts(review).map(p=>p.id===id?{...p,...patch}:p));}
export function reorderReviewPart(review,id,direction){const parts=capturedParts(review),i=parts.findIndex(p=>p.id===id),j=i+direction;if(i<0||j<0||j>=parts.length)return review;[parts[i],parts[j]]=[parts[j],parts[i]];return assembleReview(review,parts);}
export function removeReviewPart(review,id){return assembleReview(review,capturedParts(review).filter(p=>p.id!==id));}
export function assemblyClips(review){return review.parts?.map(p=>{const media=partMedia(p);if(!media)throw Error('Falta el vídeo del tramo «'+p.name+'».');return {partId:p.id,name:p.name,media,startSecond:(p.startTime-media.videoStartUtc)/1000,endSecond:(p.endTime-media.videoStartUtc)/1000,offset:(p.startTime-review.points[0].time)/1000,duration:(p.endTime-p.startTime)/1000};})||[];}
export function validateAssembly(review){
 if(review.parts==null)return;
 const parts=review.parts;
 if(!Array.isArray(parts)||parts.length>100||new Set(parts.map(p=>p?.id)).size!==parts.length)throw Error('Montaje de tramos inválido.');
 let count=0;
 for(const p of parts){
  if(!p||typeof p.id!=='string'||!p.id||typeof p.name!=='string'||!p.name||p.parts||!Array.isArray(p.points)||!timeline(p.points).timed||!Number.isFinite(p.shift)||!Number.isFinite(p.startTime)||!Number.isFinite(p.endTime)||p.endTime<=p.startTime||p.points.some(x=>!Array.isArray(x.coordinates)||x.coordinates.length!==2||!x.coordinates.every(Number.isFinite)||Math.abs(x.coordinates[0])>180||Math.abs(x.coordinates[1])>90))throw Error('Montaje de tramos inválido.');
  if(p.media&&(typeof p.media.id!=='string'||typeof p.media.name!=='string'||(p.media.videoStartUtc!=null&&!Number.isFinite(p.media.videoStartUtc))))throw Error('Vídeo de tramo inválido.');
  count+=p.points.length;
 }
 if(count>500000||count!==review.points.length)throw Error('Puntos del montaje inválidos.');
}
