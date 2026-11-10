import {timeline,pointAt,speedAt} from './reviewTime.js';
export async function fastComposition(composition,review,language){
 const map=await composition.freezeMap?.()||composition.mapCanvas;
 const rectangle=composition.mapCanvas.getBoundingClientRect(),stage=composition.stageRect?.()||rectangle,pip=composition.pipRect(),hudRect=composition.hudRect?.();
 const frozen=document.createElement('canvas');frozen.width=map.width;frozen.height=map.height;frozen.getContext('2d').drawImage(map,0,0);frozen.getBoundingClientRect=()=>rectangle;
 const clock=timeline(review.points),positions=composition.project?review.points.map(p=>composition.project(p.coordinates)):null,markers=composition.project?(review.incidents||[]).map(i=>composition.project(i.coordinates)):null;
 const format=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'—';
 return {...composition,mapCanvas:frozen,stageRect:()=>stage,pipRect:()=>pip,hudRect:()=>hudRect,
  drawMarkers:markers?(ctx,w)=>{const ratio=w/rectangle.width;ctx.fillStyle='white';ctx.font=`bold ${12*ratio}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';markers.forEach((p,i)=>ctx.fillText(String(i+1),p.x*ratio,p.y*ratio));ctx.textAlign='start';ctx.textBaseline='alphabetic';}:composition.drawMarkers,
  drawVehicle:positions?(ctx,w,h,second)=>{const p=pointAt(review.points,second/clock.duration,clock);if(p.gap||p.index<0)return;const a=positions[p.index],b=positions[p.index+1],pa=review.points[p.index],pb=review.points[p.index+1],f=pb&&pb.segment===pa.segment&&pb.time>pa.time?(p.time-pa.time)/(pb.time-pa.time):0;const ratio=w/rectangle.width;ctx.beginPath();ctx.arc((a.x+(b?b.x-a.x:0)*f)*ratio,(a.y+(b?b.y-a.y:0)*f)*ratio,8*ratio,0,Math.PI*2);ctx.fillStyle='#ef7c32';ctx.fill();ctx.strokeStyle='white';ctx.lineWidth=3*ratio;ctx.stroke();}:null,
  hud:second=>{const pos=pointAt(review.points,second/clock.duration,clock),p=pos.point,zero=review.calibration,force=axis=>p?.gForce&&!pos.gap?p.gForce[axis]-(zero?.[axis]||0):null;
   return `${format(pos.gap?null:speedAt(review.points,pos.index).value)} km/h\nX ${format(force('x'),3)} g\nY ${format(force('y'),3)} g\nZ ${format(force('z'),3)} g\n${language==='eu'?'Biraketa':'Giro'} ${format(p?.rotation?.z,2)} °/s\n${language==='eu'?'Norabidea':'Rumbo'} ${format(p?.heading,0)}°\n${language==='eu'?'Bateria':'Batería'} ${format(p?.battery,0)}%\nGPS ±${format(p?.accuracy)} m\n${new Date(p?.sourceTime??pos.time).toLocaleTimeString(language==='eu'?'eu-ES':'es-ES')}`;
  }
 };
}
