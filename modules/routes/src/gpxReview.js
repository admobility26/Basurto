// GPX playback clock adapted from RutasAD / ElorrietaTrack.
// © 2026 Aitor Delgado Martínez · AD Mobility
export const canUseGpx = user => ['admin', 'manager'].includes(user?.role);
export function requireGpx(user) { if (!canUseGpx(user)) throw Error('Solo administración y gerencia pueden usar GPX + vídeo.'); }
export function parseGpx(text, Parser = globalThis.DOMParser) {
 if (text.length > 20 * 1024 * 1024) throw Error('El GPX supera el límite de 20 MB.');
 if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('El GPX contiene declaraciones no admitidas.');
 const xml = new Parser().parseFromString(text, 'application/xml');
 if (xml.getElementsByTagName('parsererror').length || xml.documentElement?.localName !== 'gpx') throw Error('El archivo no es un GPX válido.');
 const elements = [...xml.getElementsByTagName('*')];
 const segments = elements.filter(e => ['trkseg', 'rte'].includes(e.localName));
 const nodes = elements.filter(e => ['trkpt', 'rtept'].includes(e.localName));
 if (nodes.length > 100000) throw Error('El GPX supera los 100.000 puntos. Divide el recorrido.');
 const points = nodes.map(e => {
  const lon = e.getAttribute('lon'), lat = e.getAttribute('lat');
  if (!lon?.trim() || !lat?.trim()) throw Error('Hay puntos sin coordenadas.');
  const coordinates = [Number(lon), Number(lat)];
  if (!coordinates.every(Number.isFinite) || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) throw Error('Hay coordenadas inválidas en el GPX.');
  const raw = [...e.children].find(c => c.localName === 'time')?.textContent;
  const time = raw ? Date.parse(raw) : null;
  return {coordinates, time: Number.isFinite(time) ? time : null, segment: segments.indexOf(e.parentElement)};
 });
 if (points.length < 2) throw Error('El GPX necesita al menos dos puntos.');
 const name = elements.find(e => e.localName === 'name' && ['trk','rte','metadata'].includes(e.parentElement?.localName))?.textContent?.trim() || '';
 return {name: name.slice(0,160), points};
}
export function timeline(points) {
 const timed = points.length > 1 && points.at(-1).time > points[0].time && points.every((p,i) => Number.isFinite(p.time) && (!i || p.time >= points[i-1].time));
 return {timed, start: timed ? points[0].time : null, duration: timed ? (points.at(-1).time-points[0].time)/1000 : 0};
}
export function positionAt(points, seconds, duration, offset=0) {
 const clock=timeline(points), span=clock.timed?clock.duration:duration;
 if (!points.length || !(span>0)) return null;
 const fraction=Math.max(0,Math.min(1,(seconds-offset)/span));
 if (!clock.timed) return points[Math.round(fraction*(points.length-1))].coordinates;
 const time=clock.start+fraction*span*1000;
 let low=0,high=points.length-1;
 while(low<high){const mid=Math.ceil((low+high)/2);if(points[mid].time<=time)low=mid;else high=mid-1;}
 const a=points[low], b=points[low+1];
 if (!b || a.segment!==b.segment || b.time<=a.time) return a.coordinates;
 const f=(time-a.time)/(b.time-a.time);
 return a.coordinates.map((v,i)=>v+(b.coordinates[i]-v)*f);
}
export function trackGeometry(points) {
 const groups=[];
 for(const p of points){if(!groups.length || groups.at(-1).segment!==p.segment)groups.push({segment:p.segment,coordinates:[]});groups.at(-1).coordinates.push(p.coordinates);}
 return {type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates:groups.filter(g=>g.coordinates.length>1).map(g=>g.coordinates)}};
}
