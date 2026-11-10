// GPS fields shared by the preview and both video export modes.
import {timeline,pointAt,speedAt} from './reviewTime.js';
export const gpsOptions=[['speed','Abiadura','Velocidad'],['x','Luzetarako indarra','Fuerza longitudinal'],['y','Alboko indarra','Fuerza lateral'],['z','Indar bertikala','Fuerza vertical'],['rotation','Biraketa','Giro'],['heading','Norabidea','Rumbo'],['battery','Bateria','Batería'],['accuracy','GPS zehaztasuna','Precisión GPS'],['time','Ordua','Hora']];
export const gpsStorageKey='basurto-routes-movie-gps';
export function normalizeGpsFields(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return {speed:true};
 return Object.fromEntries(gpsOptions.map(([key])=>[key,value[key]===true]));
}
export function readGpsFields(){try{const raw=localStorage.getItem(gpsStorageKey);return normalizeGpsFields(raw?JSON.parse(raw):null);}catch{return {speed:true};}}
export function gpsHud(review,second,language,fields={speed:true},clock=timeline(review.points)){
 const pos=pointAt(review.points,clock.duration?second/clock.duration:0,clock),p=pos.point,zero=review.calibration;
 const format=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'—',force=axis=>p?.gForce&&!pos.gap?p.gForce[axis]-(zero?.[axis]||0):null;
 const velocity=pos.gap?{value:null,estimated:false}:speedAt(review.points,pos.index);
 const lines=[
  format(velocity.value)+' km/h'+(velocity.estimated?' ≈':''),
  'X '+format(force('x'),3)+' g','Y '+format(force('y'),3)+' g','Z '+format(force('z'),3)+' g',
  (language==='eu'?'Biraketa':'Giro')+' '+format(pos.gap?null:p?.rotation?.z,2)+' °/s',
  (language==='eu'?'Norabidea':'Rumbo')+' '+format(pos.gap?null:p?.heading,0)+'°',
  (language==='eu'?'Bateria':'Batería')+' '+format(p?.battery,0)+'%',
  'GPS ±'+format(pos.gap?null:p?.accuracy)+' m',
  p?.time!=null?new Date(p.sourceTime??pos.time??p.time).toLocaleTimeString(language==='eu'?'eu-ES':'es-ES'):'—'
 ];
 return lines.filter((_,i)=>fields[gpsOptions[i][0]]===true).join('\n');
}
