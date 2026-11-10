export const SERVICE='6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const TX='6e400003-b5a3-f393-e0a9-e50e24dcca9e';
export class RaceBoxParser {
 buffer=[];
 push(view){
  this.buffer.push(...new Uint8Array(view.buffer,view.byteOffset,view.byteLength));const results=[];
  while(this.buffer.length>=6){
   if(this.buffer[0]!==181||this.buffer[1]!==98){this.buffer.shift();continue;}
   const n=this.buffer[4]+256*this.buffer[5];if(n>504){this.buffer.shift();continue;}if(this.buffer.length<n+8)break;
   const p=this.buffer.slice(0,n+8);let a=0,b=0;for(let i=2;i<n+6;i++){a=(a+p[i])&255;b=(b+a)&255;}
   if(a!==p[n+6]||b!==p[n+7]){this.buffer.shift();continue;}this.buffer.splice(0,n+8);
   if(p[2]!==255||p[3]!==1||n!==80)continue;
   const d=new DataView(Uint8Array.from(p.slice(6,86)).buffer),valid=d.getUint8(20)===3&&!!(d.getUint8(21)&1)&&!(d.getUint8(66)&1);
   const timeValid=(d.getUint8(11)&3)===3;
   const t=timeValid?Date.UTC(d.getUint16(4,true),d.getUint8(6)-1,d.getUint8(7),d.getUint8(8),d.getUint8(9),d.getUint8(10))+d.getInt32(16,true)/1e6:Date.now();
   results.push({lat:d.getInt32(28,true)/1e7,lon:d.getInt32(24,true)/1e7,speed:Math.max(0,d.getInt32(48,true)*.0036),accuracy:d.getUint32(40,true)/1000,time:new Date(t).toISOString(),timeSource:timeValid?'gnss':'device',receivedAt:Date.now(),valid,battery:d.getUint8(67)&127,heading:(d.getUint8(21)&32)?d.getInt32(52,true)/1e5:null,gForce:{x:d.getInt16(68,true)/1000,y:d.getInt16(70,true)/1000,z:d.getInt16(72,true)/1000},rotation:{x:d.getInt16(74,true)/100,y:d.getInt16(76,true)/100,z:d.getInt16(78,true)/100}});
  }return results;
 }
}
export function validateTrack(t){
 if(!t||!Array.isArray(t.points)||t.points.length>500000||!Array.isArray(t.events)||t.events.length>10000)throw Error('Recorrido inválido o superior al límite de 500.000 posiciones.');
 for(const p of t.points)if(!Number.isFinite(p.lat)||Math.abs(p.lat)>90||!Number.isFinite(p.lon)||Math.abs(p.lon)>180||(p.time!==null&&!Number.isFinite(Date.parse(p.time)))||(p.speed!=null&&(!Number.isFinite(p.speed)||p.speed<0)))throw Error('Invalid point');
 for(const p of t.points)for(const v of [p.gForce,p.rotation])if(v!=null&&(!v||!['x','y','z'].every(k=>Number.isFinite(v[k]))))throw Error('Invalid telemetry');
 for(const e of t.events){if(e.coordinates!==undefined&&(!Array.isArray(e.coordinates)||e.coordinates.length!==2||!Number.isFinite(e.coordinates[0])||Math.abs(e.coordinates[0])>180||!Number.isFinite(e.coordinates[1])||Math.abs(e.coordinates[1])>90))throw Error('Invalid event location');if(e.time!=null&&!Number.isFinite(e.time))throw Error('Invalid event time');if(!Number.isInteger(e.index)||e.index<0||e.index>=t.points.length||typeof e.note!=='string'||e.note.length>1000)throw Error('Invalid event');}
}
export function parseGPX(text){
 const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror')||doc.documentElement.localName!=='gpx')throw Error('GPX');
 const points=[];let segment=0;for(const seg of doc.getElementsByTagNameNS('*','trkseg')){for(const p of seg.getElementsByTagNameNS('*','trkpt')){if(!p.hasAttribute('lat')||!p.hasAttribute('lon'))throw Error('GPX');const time=p.getElementsByTagNameNS('*','time')[0]?.textContent;points.push({lat:Number(p.getAttribute('lat')),lon:Number(p.getAttribute('lon')),time:time?new Date(time).toISOString():null,speed:null,segment});}segment++;}
 const t={source:'gpx',points,events:[]};validateTrack(t);if(!points.length)throw Error('GPX');return t;
}
export function exportGPX(t){const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));const events=t.events.map(e=>{const p=t.points[e.index],lat=e.coordinates?.[1]??p.lat,lon=e.coordinates?.[0]??p.lon,time=e.time!=null?new Date(e.time).toISOString():p.time;return `<wpt lat="${lat}" lon="${lon}">${time?`<time>${time}</time>`:''}<name>Traza</name><desc>${escape(e.note)}</desc></wpt>`;}).join('');return `<?xml version="1.0"?><gpx version="1.1" creator="Traza" xmlns="http://www.topografix.com/GPX/1/1">${events}<trk><name>Traza</name>${t.points.map((p,i)=>`${i===0||p.segment!==t.points[i-1].segment?'<trkseg>':''}<trkpt lat="${p.lat}" lon="${p.lon}">${p.time?`<time>${p.time}</time>`:''}</trkpt>${i===t.points.length-1||p.segment!==t.points[i+1].segment?'</trkseg>':''}`).join('')}</trk></gpx>`;}
