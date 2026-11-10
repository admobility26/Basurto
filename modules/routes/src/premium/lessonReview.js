import {timeline,pointFraction} from './reviewTime.js';
export const convert=s=>{
 const points=s.points.map(p=>({coordinates:[p.lon,p.lat],time:p.time?Date.parse(p.time):null,speed:p.speed,accuracy:p.accuracy,battery:p.battery,heading:p.heading,gForce:p.gForce,rotation:p.rotation,timeSource:p.timeSource,segment:p.segment||0}));
 const clock=timeline(points);
 return {name:s.name||s.studentName,source:s.source,media:s.media,calibration:s.calibration,sessionId:s.id,points,incidents:s.events.map((e,i)=>({id:e.id||crypto.randomUUID(),signalCode:e.signalCode,speed:e.speed,distance:e.distance,destinations:e.destinations,showInVideo:e.showInVideo,coordinates:e.coordinates||[s.points[e.index].lon,s.points[e.index].lat],time:e.time??(s.points[e.index].time?Date.parse(s.points[e.index].time):null),pointIndex:e.index,markedAt:e.markedAt,videoTime:e.videoTime,fraction:clock.timed&&Number.isFinite(e.time)?(e.time-clock.start)/(clock.end-clock.start):pointFraction(points,e.index,clock),title:e.title||`#${i+1}`,note:e.note}))};
};
