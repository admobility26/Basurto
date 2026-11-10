import {parseGpxText} from '../gpxParser.js';
import {readEncryptedBackup} from '../encryptedBackup.js';
import {assembleReview,capturedParts,validateAssembly} from './reviewAssembly.js';
let active;
const native=()=>window.elorrietaDesktop?.chooseWorkspace;
const db=()=>new Promise((ok,no)=>{const r=indexedDB.open('basurto-premium-workspace',1);r.onupgradeneeded=()=>r.result.createObjectStore('handles');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
async function remember(handle){if(window.rutasVault)return window.rutasVault.handlePut('workspace',handle);const d=await db();return new Promise((ok,no)=>{const t=d.transaction('handles','readwrite');t.objectStore('handles').put(handle,'folder');t.oncomplete=()=>{d.close();ok();};t.onerror=()=>no(t.error);});}
async function previous(){if(window.rutasVault)return window.rutasVault.handleGet('workspace');const d=await db();return new Promise((ok,no)=>{const r=d.transaction('handles').objectStore('handles').get('folder');r.onsuccess=()=>{d.close();ok(r.result);};r.onerror=()=>no(r.error);});}
export async function openWorkspace(reopen=false){
 if(native()){const folder=await window.elorrietaDesktop.chooseWorkspace();if(!folder)return null;active={...folder,native:true};return active;}
 if(!window.showDirectoryPicker)throw Error('Para trabajar con carpetas usa Chrome en Mac o Basurto Recorridos.');
 let handle=reopen?await previous():null;
 if(handle){if(await handle.requestPermission({mode:'readwrite'})!=='granted')throw Error('Necesitas autorizar lectura y escritura en la carpeta.');}
 else handle=await window.showDirectoryPicker({mode:'readwrite',id:'basurto-premium-class'});
 const files=[];for await(const [name,h] of handle.entries())if(h.kind==='file')files.push({name,size:(await h.getFile()).size});
 active={name:handle.name,handle,files};await remember(handle).catch(()=>{});return active;
}
export async function workspaceText(name){if(!active)throw Error('Abre primero la carpeta de esta clase.');if(active.native)return window.elorrietaDesktop.readWorkspaceText(name);return (await(await active.handle.getFileHandle(name)).getFile()).text();}
export async function workspaceMedia(media){
 if(!active)throw Error('Abre la carpeta de esta clase para recuperar el vídeo.');
 if(!active.files.some(f=>f.name===media.name&&f.size===media.size))throw Error('El vídeo original no está en esta carpeta o su tamaño ha cambiado.');
 if(active.native){await window.elorrietaDesktop.checkWorkspaceMedia?.(media.name,media.size);return {url:`basurto-routes://app/__workspace/${encodeURIComponent(media.name)}`};}
 try{return {file:await(await active.handle.getFileHandle(media.name)).getFile()};}catch{throw Error('No se encuentra el vídeo original. Si has renombrado o movido la carpeta, pulsa Abrir carpeta y selecciona su ubicación actual.');}
}
export async function saveWorkspaceProject(review){
 if(!active)throw Error('Abre primero una carpeta.');const value={format:'basurto-premium-project',version:1,review},text=JSON.stringify(window.rutasVault?await window.rutasVault.encodeBackup(value):value,null,2);
 if(active.native)return window.elorrietaDesktop.writeWorkspaceProject(text);
 const f=await active.handle.getFileHandle('Basurto Recorridos-proyecto.json',{create:true});const w=await f.createWritable();try{await w.write(text);await w.close();}catch(e){await w.abort().catch(()=>{});throw e;}
}
export function parseWorkspaceGpx(text,name){return {...parseGpxText(text),name,incidents:[]};}

export async function loadWorkspaceSelection(gpx,video){
 let review;
 if(gpx==='Basurto Recorridos-proyecto.json'){const raw=JSON.parse(await workspaceText(gpx)),p=await readEncryptedBackup(raw);if(p.format!=='basurto-premium-project'||p.version!==1||!Array.isArray(p.review?.points)||!Array.isArray(p.review?.incidents))throw Error('Proyecto Basurto Recorridos inválido.');review=p.review;if(review.points.length<2||review.points.some(p=>!Array.isArray(p.coordinates)||p.coordinates.length!==2||!p.coordinates.every(Number.isFinite)||Math.abs(p.coordinates[0])>180||Math.abs(p.coordinates[1])>90||(p.time!=null&&!Number.isFinite(p.time))))throw Error('Posiciones del proyecto inválidas.');if(review.incidents.some(i=>!Array.isArray(i.coordinates)||i.coordinates.length!==2||!i.coordinates.every(Number.isFinite)||typeof i.title!=='string'||typeof i.note!=='string'))throw Error('Incidencias del proyecto inválidas.');}
 else review=parseWorkspaceGpx(await workspaceText(gpx),gpx.replace(/\.gpx$/i,''));
 validateAssembly(review);
 if(review.parts?.length){
  const parts=capturedParts(review).map(p=>({...p,media:p.media?{...p.media,id:crypto.randomUUID(),workspace:true,workspaceName:active.name}:null}));
  return assembleReview(review,parts);
 }
 const file=active.files.find(f=>f.name===(video||review.media?.name));
 if(file)review.media={...(review.media||{}),id:crypto.randomUUID(),name:file.name,size:file.size,workspace:true,workspaceName:active.name,videoStartUtc:review.media?.name===file.name&&review.media?.size===file.size?(review.media.videoStartUtc??review.points[0]?.time):review.points[0]?.time};
 else if(review.media)review.media={...review.media,id:crypto.randomUUID(),workspace:true};
 return review;
}
export async function openMovieSink({suggestedName='Basurto Recorridos-mapa-pip.mp4'}={}){
 if(window.basurtoMovie){const token=await window.basurtoMovie({action:'begin',name:suggestedName});let index=0;return {name:token.name,write:async blob=>{for(let i=0;i<blob.size;i+=1024*1024){const bytes=new Uint8Array(await blob.slice(i,i+1024*1024).arrayBuffer());let raw='';for(let j=0;j<bytes.length;j+=32768)raw+=String.fromCharCode(...bytes.subarray(j,j+32768));await window.basurtoMovie({action:'append',token:token.token,index:index++,data:btoa(raw)})}},close:()=>window.basurtoMovie({action:'finish',token:token.token}),abort:()=>window.basurtoMovie({action:'abort',token:token.token})};}

 if(window.elorrietaDesktop?.beginMovie){const token=await window.elorrietaDesktop.beginMovie(suggestedName);if(!token)throw new DOMException('Cancelado','AbortError');return {name:token.name,write:async blob=>window.elorrietaDesktop.writeMovie(token.id,await blob.arrayBuffer()),close:()=>window.elorrietaDesktop.finishMovie(token.id),abort:()=>window.elorrietaDesktop.abortMovie(token.id)};}
 if(!window.showSaveFilePicker)return null;
 const h=await window.showSaveFilePicker({suggestedName,id:'basurto-premium-export',...(active?.handle?{startIn:active.handle}:{}),types:[{description:'Vídeo MP4',accept:{'video/mp4':['.mp4']}}]});const writable=await h.createWritable();return {name:h.name,handle:h,write:b=>writable.write(b),close:()=>writable.close(),abort:()=>writable.abort(),file:()=>h.getFile()};
}
