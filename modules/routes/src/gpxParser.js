import sax from 'sax';
// Preserve every GPS sample and its timestamp. Only rendering may simplify a line.
export const MAX_GPX_POINTS=500000;
export const MAX_GPX_BYTES=256*1024*1024;
export function createGpxParser(){
 const parser=sax.parser(true,{xmlns:true,trim:true}),points=[];let point=null,field='',value='',segment=0,name='',root=false,depth=0;
 parser.ondoctype=()=>{throw Error('No se admiten declaraciones DOCTYPE en el GPX.');};
 parser.onerror=()=>{throw Error('El GPX contiene XML no válido.');};
 parser.onopentag=node=>{
  depth++;const tag=node.local;
  if(depth===1){if(tag!=='gpx')throw Error('El archivo no es un GPX.');root=true;}
  if(['trkseg','rte'].includes(tag))segment++;
  if(['trkpt','rtept'].includes(tag)){
   const attr=key=>Object.values(node.attributes).find(a=>a.local===key)?.value;
   const lon=attr('lon'),lat=attr('lat');if(!lon?.trim()||!lat?.trim())throw Error('Hay un punto sin coordenadas.');
   const coordinates=[Number(lon),Number(lat)];
   if(!coordinates.every(Number.isFinite)||Math.abs(coordinates[0])>180||Math.abs(coordinates[1])>90)throw Error('Hay coordenadas no válidas en el GPX.');
   point={coordinates,time:null,segment};
  }
  if(point&&['time','ele','speed','hdop','accuracy'].includes(tag)||!point&&tag==='name'&&!name){field=tag;value='';}
 };
 parser.ontext=text=>{if(field)value+=text};parser.oncdata=parser.ontext;
 parser.onclosetag=raw=>{
  const tag=raw.split(':').at(-1);
  if(field===tag){if(point){if(tag==='time'){const time=Date.parse(value);point.time=Number.isFinite(time)?time:null;}else if(value.trim()&&Number.isFinite(Number(value))){const number=Number(value);if(tag==='speed')point.speed=number*3.6;else point[tag==='ele'?'elevation':tag]=number;}}else if(tag==='name')name=value.slice(0,160);field='';value='';}
  if(['trkpt','rtept'].includes(tag)&&point){points.push(point);point=null;if(points.length>MAX_GPX_POINTS)throw Error('El GPX supera 500.000 puntos. Divide la sesión en dos archivos.');}
  depth--;
 };
 return {write:chunk=>parser.write(chunk),finish:()=>{parser.close();if(!root||points.length<2)throw Error('El GPX necesita al menos dos posiciones válidas.');return {name,points};}};
}
export function parseGpxText(text){if(text.length>MAX_GPX_BYTES)throw Error('El GPX supera 256 MB.');const parser=createGpxParser();parser.write(text);return parser.finish();}
