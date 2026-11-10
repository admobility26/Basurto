import {assembleReview,capturedParts} from './reviewAssembly.js';
import {timeline,pointAt} from './reviewTime.js';
export const clipTime=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
export function parseClipTime(value){const m=/^(\d+):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(value.trim());return m?Number(m[1])*60+Number(m[2])+Number('0.'+(m[3]||'0')):NaN;}
export function makeReviewClip(review,start,end){
 const clock=timeline(review.points);
 if(!clock.timed)throw Error('El GPX necesita tiempos completos para recortar por minutos.');
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>clock.duration||end<=start)throw Error('Indica inicio y final válidos (minutos:segundos), dentro del recorrido.');
 if(review.parts?.length){
  const from=clock.start+start*1000,to=clock.start+end*1000;
  const selected=capturedParts(review).filter(p=>p.endTime>from&&p.startTime<to).map(p=>{
   const c=timeline(p.points),a=Math.max(from,p.startTime)-p.shift,b=Math.min(to,p.endTime)-p.shift;
   const ap=pointAt(p.points,(a-c.start)/(c.end-c.start),c),bp=pointAt(p.points,(b-c.start)/(c.end-c.start),c);
   if(ap.gap||bp.gap)throw Error('El intervalo incluye un hueco del GPS.');
   return {...p,points:[{...ap.point,time:a},...p.points.filter(x=>x.time>a&&x.time<b),{...bp.point,time:b}],incidents:(p.incidents||[]).filter(i=>i.time>=a&&i.time<=b)};
  });
  return assembleReview({libraryId:crypto.randomUUID(),name:`${review.name||'GPX'} · ${clipTime(start)}–${clipTime(end)}`,source:'gpx',assemblyStart:from,fragment:{start,end,sourceName:review.name||'GPX'},calibration:structuredClone(review.calibration||null)},selected);
 }
 const a=pointAt(review.points,start/clock.duration,clock),b=pointAt(review.points,end/clock.duration,clock);
 if(a.gap||b.gap)throw Error('El inicio o final está en un hueco del GPS. Ajusta el intervalo hasta un punto con posición.');
 const from=clock.start+start*1000,to=clock.start+end*1000;
 const points=structuredClone([{...a.point,time:from},...review.points.filter(p=>p.time>from&&p.time<to),{...b.point,time:to}]);
 const incidents=(review.incidents||[]).map(i=>({...i,time:Number.isFinite(i.time)?i.time:clock.start+(i.fraction||0)*(clock.end-clock.start)})).filter(i=>i.time>=from&&i.time<=to).map(i=>({...structuredClone(i),id:crypto.randomUUID(),fraction:(i.time-from)/(to-from),pointIndex:pointAt(points,(i.time-from)/(to-from)).index}));
 return {libraryId:crypto.randomUUID(),name:`${review.name||'GPX'} · ${clipTime(start)}–${clipTime(end)}`,source:'gpx',points,incidents,media:review.media?{...structuredClone(review.media),videoStartUtc:review.media.videoStartUtc??clock.start}:null,fragment:{start,end,sourceName:review.name||'GPX'},calibration:structuredClone(review.calibration||null)};
}
export function clipBoardDocument(clip){
 const items=[],groups=[];
 for(const p of clip.points){if(!groups.length||groups.at(-1).segment!==p.segment)groups.push({segment:p.segment,points:[]});groups.at(-1).points.push([...p.coordinates]);}
 for(const g of groups)for(let i=0;i<g.points.length-1;i+=4999)items.push({id:crypto.randomUUID(),type:'route',points:g.points.slice(i,i+5000),color:'#3288c8',width:6,opacity:1});
 for(const i of clip.incidents)items.push({...structuredClone(i),id:crypto.randomUUID(),type:i.signalCode?'signal':'note',text:i.note||i.title||'Punto crítico'});
 return {steps:[{id:crypto.randomUUID(),name:clip.name,question:'',answer:'',items}],activeStep:0,sourceClip:structuredClone(clip)};
}
