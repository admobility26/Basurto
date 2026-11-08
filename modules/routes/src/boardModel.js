// SPDX-FileCopyrightText: 2026 Aitor Delgado Martínez · AD Mobility
// SPDX-License-Identifier: LicenseRef-RutasAD-Educational-NonCommercial-1.0
export const BOARD_CASES_KEY='basurto-routes-board-cases';
export const vehicleTypes=[['car','Autoa','Coche'],['bus','Autobusa','Autobús'],['truck','Kamioia','Camión'],['bike','Bizikleta','Bicicleta'],['person','Oinezkoa','Peatón']];
const decorate=(document,past=[])=>({...document,items:document.steps[document.activeStep].items,past});
const documentOf=state=>({steps:state.steps,activeStep:state.activeStep,...(state.recording?{recording:state.recording}:{})});
export const emptyBoard=()=>decorate({steps:[{id:crypto.randomUUID(),name:'',question:'',answer:'',items:[]}],activeStep:0});
export function boardReducer(state,action){
 if(action.type==='undo')return state.past.length?decorate(state.past.at(-1),state.past.slice(0,-1)):state;
 if(action.type==='navigate')return decorate({...documentOf(state),activeStep:action.index},state.past);
 let document=documentOf(state);
 if(action.type==='set'){
  const proposed=typeof action.items==='function'?action.items(state.items):action.items;
  const items=proposed.map(item=>item.type==='vehicle'&&item.routeId&&!proposed.some(r=>r.id===item.routeId&&['route','arrow'].includes(r.type)&&r.points?.length>1)?{...item,routeId:null}:item);
  if(items===state.items)return state;
  document={...document,steps:state.steps.map((step,n)=>n===state.activeStep?{...step,items}:step)};
 }else if(action.type==='replace')document=action.document;
 else if(action.type==='recording')document={...document,recording:action.value};
 else if(action.type==='step-field')document={...document,steps:state.steps.map((step,n)=>n===state.activeStep?{...step,[action.field]:action.value}:step)};
 else if(action.type==='add-step'){
  if(state.steps.length>=20)return state;
  const steps=[...state.steps];steps.splice(state.activeStep+1,0,{...structuredClone(steps[state.activeStep]),id:action.id,name:'',question:'',answer:''});document={...document,steps,activeStep:state.activeStep+1};
 }else if(action.type==='delete-step'){
  if(state.steps.length===1)return state;document={...document,steps:state.steps.filter((_,n)=>n!==state.activeStep),activeStep:Math.max(0,state.activeStep-1)};
 }else if(action.type==='move-step'){
  const target=state.activeStep+action.direction;if(target<0||target>=state.steps.length)return state;
  const steps=[...state.steps];[steps[target],steps[state.activeStep]]=[steps[state.activeStep],steps[target]];document={...document,steps,activeStep:target};
 }else return state;
 return decorate(document,[...state.past,documentOf(state)].slice(-80));
}
export function boardDocument(state){return structuredClone(documentOf(state));}
const coordinate=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85;
export function validBoardDocument(doc){
 if(!doc||!Array.isArray(doc.steps)||!doc.steps.length||doc.steps.length>20||!Number.isInteger(doc.activeStep)||doc.activeStep<0||doc.activeStep>=doc.steps.length||new Set(doc.steps.map(s=>s?.id)).size!==doc.steps.length)return false;
 if(doc.recording&&(typeof doc.recording.name!=='string'||doc.recording.name.length>255||!Number.isFinite(doc.recording.seconds)||doc.recording.seconds<0||typeof doc.recording.withAudio!=='boolean'))return false;
 if(doc.sourceClip){const c=doc.sourceClip;if(!Array.isArray(c.points)||c.points.length<2||c.points.length>500000||!c.points.every((p,n)=>coordinate(p.coordinates)&&Number.isFinite(p.time)&&(!n||p.time>=c.points[n-1].time))||c.points.at(-1).time<=c.points[0].time)return false;if(c.media&&(typeof c.media.id!=='string'||typeof c.media.name!=='string'||!Number.isFinite(c.media.size)||!Number.isFinite(c.media.videoStartUtc)))return false;}
 return doc.steps.every(s=>s&&typeof s.id==='string'&&['name','question','answer'].every(k=>typeof s[k]==='string'&&s[k].length<=1000)&&Array.isArray(s.items)&&s.items.length<=1000&&new Set(s.items.map(i=>i?.id)).size===s.items.length&&s.items.every(i=>{
  if(!i||typeof i.id!=='string'||!['route','arrow','drawing','signal','note','vehicle'].includes(i.type))return false;
  if(i.points&&(!Array.isArray(i.points)||i.points.length>5000||!i.points.every(coordinate)))return false;
  if(i.type==='vehicle'&&(!coordinate(i.coordinates)||!vehicleTypes.some(v=>v[0]===i.vehicleType)||!Number.isFinite(i.angle)||!Number.isFinite(i.size)||i.size<16||i.size>140))return false;
  if(['signal','note'].includes(i.type)&&!coordinate(i.coordinates))return false;
  if(['route','arrow','drawing'].includes(i.type)&&!i.points)return false;
  if(i.color!=null&&!/^#[\da-f]{6}$/i.test(i.color))return false;
  if(i.width!=null&&(!Number.isFinite(i.width)||i.width<1||i.width>30))return false;
  if(i.opacity!=null&&(!Number.isFinite(i.opacity)||i.opacity<.1||i.opacity>1))return false;
  if(i.type==='vehicle'&&((i.duration!=null&&(!Number.isFinite(i.duration)||i.duration<1||i.duration>180))||(i.label!=null&&(typeof i.label!=='string'||i.label.length>2))))return false;
  if(i.type==='vehicle'&&i.routeId&&!s.items.some(r=>r.id===i.routeId&&r.points?.length>1))return false;
  return true;
 }));
}
export const validBoardCases=cases=>Array.isArray(cases)&&cases.length<=60&&new Set(cases.map(c=>c?.id)).size===cases.length&&cases.every(c=>c&&typeof c.id==='string'&&c.id.length<=100&&typeof c.name==='string'&&c.name.trim().length>0&&c.name.length<=100&&validBoardDocument(c.document));
export function readBoardCases(){
 const raw=localStorage.getItem(BOARD_CASES_KEY);if(!raw)return [];
 const cases=JSON.parse(raw);
 if(!validBoardCases(cases))throw Error('La biblioteca de explicaciones no tiene un formato válido. Conserva una copia de seguridad.');
 return cases;
}
export function saveBoardCases(cases){if(!validBoardCases(cases))throw Error('La biblioteca contiene una explicación no válida.');const raw=JSON.stringify(cases);if(raw.length>3500000)throw Error('La biblioteca de explicaciones es demasiado grande. Exporta o elimina casos antes de guardar más.');localStorage.setItem(BOARD_CASES_KEY,raw);}
export function shapePoints(kind,start,end,map){
 const a=map.project(start),b=map.project(end),point=(x,y)=>{const p=map.unproject([x,y]);return[p.lng,p.lat];};
 if(kind==='circle'){const points=Array.from({length:64},(_,i)=>{const angle=i/64*Math.PI*2;return point((a.x+b.x)/2+Math.cos(angle)*Math.abs(b.x-a.x)/2,(a.y+b.y)/2+Math.sin(angle)*Math.abs(b.y-a.y)/2);});return [...points,[...points[0]]];}
 if(kind==='rect'||kind==='area')return[start,point(b.x,a.y),end,point(a.x,b.y),start];
 if(kind==='curve')return Array.from({length:33},(_,i)=>{const t=i/32;return point((1-t)**2*a.x+2*(1-t)*t*a.x+t*t*b.x,(1-t)**2*a.y+2*(1-t)*t*b.y+t*t*b.y);});
 return[start,end];
}
export function positionAlong(points,fraction){
 const scale=Math.cos(points[0][1]*Math.PI/180),segments=points.slice(1).map((p,n)=>Math.hypot((p[0]-points[n][0])*scale,p[1]-points[n][1])),total=segments.reduce((a,b)=>a+b,0);let rest=Math.max(0,Math.min(1,fraction))*total;
 for(let n=0;n<segments.length;n++){if(rest<=segments[n]||n===segments.length-1){const a=points[n],b=points[n+1],f=segments[n]?rest/segments[n]:0;return {coordinates:[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f],angle:Math.atan2((b[0]-a[0])*scale,b[1]-a[1])*180/Math.PI};}rest-=segments[n];}
 return {coordinates:points[0],angle:0};
}
export function vehicleSvg(item){
 const person=item.vehicleType==='person',bike=item.vehicleType==='bike',long=['bus','truck'].includes(item.vehicleType),w=bike?18:person?23:30,h=long?65:person?25:44;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -46 80 92" aria-hidden="true"><rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="${person?12:6}" fill="${/^#[\da-f]{6}$/i.test(item.color)?item.color:'#f3b73e'}" stroke="#183c31" stroke-width="2"/>${person?'':`<rect x="${-w/2+4}" y="${-h/2+6}" width="${w-8}" height="9" rx="2" fill="#234438"/><rect x="${-w/2+4}" y="${h/2-12}" width="${w-8}" height="6" rx="2" fill="#234438"/>`}<text x="0" y="5" font-size="13" font-family="sans-serif" font-weight="700" fill="#132e24" text-anchor="middle">${String(item.label||'').replace(/[<>&"']/g,'').slice(0,2)}</text></svg>`;
}
