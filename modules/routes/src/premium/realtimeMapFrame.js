import {pointAt} from './reviewTime.js';
// Follow the GPX from the user's framing, including the vehicle's off-centre screen position.
export function realtimeMapFrame(map,review,clock,progress=0){
 const camera={zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),...(map.getPadding?{padding:map.getPadding()}:{} )};
 const initial=pointAt(review.points,progress,clock).point;
 const anchor=initial&&map.project(initial.coordinates),origin=map.project(map.getCenter());
 const offset=anchor?[anchor.x-origin.x,anchor.y-origin.y]:[0,0];
 return (second,signal)=>new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new DOMException('Exportación cancelada.','AbortError'));
  const position=pointAt(review.points,clock.duration?second/clock.duration:0,clock);
  let timer;
  const clean=()=>{clearTimeout(timer);map.off('render',rendered);signal?.removeEventListener('abort',abort);};
  const rendered=()=>{clean();resolve();};
  const abort=()=>{clean();reject(new DOMException('Exportación cancelada.','AbortError'));};
  timer=setTimeout(()=>{clean();reject(Error('El mapa no responde durante la exportación.'));},10000);
  map.once('render',rendered);signal?.addEventListener('abort',abort,{once:true});
  try{map.stop();map.easeTo({...camera,...(position.point?{center:position.point.coordinates}:{}),offset,duration:0,essential:true});map.triggerRepaint();}catch(error){clean();reject(error);}
 });
}
