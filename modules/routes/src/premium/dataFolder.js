import {readEncryptedBackup} from '../encryptedBackup.js';
import {createBackup,parseBackup,restoreBackup} from './backups.js';
let active=null,timer,saveQueue=Promise.resolve();
export const DATA_FILE='Basurto Recorridos-datos.json';
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
const emit=(state)=>{window.dispatchEvent(new CustomEvent('basurto-premium:data-folder',{detail:state}));};
async function handleStore(mode,handle,key='data'){if(window.rutasVault){const id='src/premium/dataFolder.js'+':'+key;if(mode==='get')return window.rutasVault.handleGet(id);window.rutasVault.handlePut(id,handle);return;}const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('basurto-premium-data-folder',1);r.onupgradeneeded=()=>r.result.createObjectStore('handles');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return new Promise((resolve,reject)=>{const tx=db.transaction('handles',mode==='get'?'readonly':'readwrite'),r=mode==='get'?tx.objectStore('handles').get(key):tx.objectStore('handles').put(handle,key);let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};});}
export const dataFolderStatus=()=>active?{name:active.handle.name,message:active.message||'Carpeta conectada',error:false}:{name:'',message:'',error:false};
export async function chooseDataFolder(reopen=false){
 if(!window.showDirectoryPicker)throw Error('Usa Chrome para guardar en una carpeta. En Basurto Recorridos para Mac los datos se guardan automáticamente en este Mac; utiliza las copias para compartir.');
 clearTimeout(timer);timer=null;active=null;
 let handle=reopen?await handleStore('get'):null;
 if(handle){if(await handle.requestPermission({mode:'readwrite'})!=='granted')throw Error('Autoriza la carpeta para guardar los datos.');}
 else handle=await window.showDirectoryPicker({mode:'readwrite',id:'basurto-premium-data'});
 await handleStore('put',handle);
 let file=null,backup=null;
 try{file=await(await handle.getFileHandle(DATA_FILE)).getFile();if(file.size>256*1024*1024)throw Error('La copia supera 256 MB.');backup=parseBackup(await readEncryptedBackup(JSON.parse(await file.text())));}catch(e){if(e.name!=='NotFoundError')throw e;}
 return {handle,file,backup};
}
export async function connectDataFolder(selection,mode='current'){
 if(selection.backup&&mode==='import')await restoreBackup(selection.backup,{update:true});
 active={handle:selection.handle,lastModified:selection.file?.lastModified??null,lastDigest:selection.file?await digest(await selection.file.arrayBuffer()):null,message:'Guardando…'};
 await saveDataFolder();
 if(mode==='import')window.location.reload();
}
export function saveDataFolder(){
 const target=active;if(!target)return Promise.resolve();
 const task=saveQueue.catch(()=>{}).then(()=>writeDataFolder(target));saveQueue=task;return task;
}
async function writeDataFolder(target){
 if(active!==target)return;
 try{
  const value=await createBackup(),data=JSON.stringify(window.rutasVault?await window.rutasVault.encodeBackup(value):value);
  let old=null;try{old=await(await target.handle.getFileHandle(DATA_FILE)).getFile();}catch(e){if(e.name!=='NotFoundError')throw e;}
  if(old&&old.size>256*1024*1024)throw Error('La copia supera 256 MB.');
  if((old?await digest(await old.arrayBuffer()):null)!==target.lastDigest)throw Error('La copia de la carpeta ha cambiado desde otro dispositivo. Vuelve a abrirla antes de guardar.');
  const file=await target.handle.getFileHandle(DATA_FILE,{create:true}),writer=await file.createWritable();
  try{await writer.write(data);await writer.close();}catch(e){await writer.abort().catch(()=>{});throw e;}
  target.lastModified=(await file.getFile()).lastModified;target.lastDigest=await digest(new TextEncoder().encode(data));await handleStore('put',target.lastDigest,'lastDigest');target.message='Copia actualizada · '+new Date().toLocaleTimeString();if(active===target)emit(dataFolderStatus());
 }catch(e){if(active===target){active=null;emit({name:target.handle.name,message:e.message,error:true});}throw e;}
}
export function scheduleDataSave(){if(!active||timer)return;timer=setTimeout(()=>{timer=null;saveDataFolder().catch(()=>{});},1000);}
export function watchDataFolder(){
 const original=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
 Storage.prototype.setItem=function(key,value){original.call(this,key,value);if(this===localStorage&&key.startsWith('basurto-premium-'))scheduleDataSave();};
 Storage.prototype.removeItem=function(key){remove.call(this,key);if(this===localStorage&&key.startsWith('basurto-premium-'))scheduleDataSave();};
 for(const type of ['basurto-premium:metadata-changed','basurto-premium:students-changed'])window.addEventListener(type,scheduleDataSave);
 window.addEventListener('pagehide',()=>{if(active){clearTimeout(timer);saveDataFolder().catch(()=>{});}});
}

export async function reconnectDataFolder(){const handle=await handleStore('get');if(!handle)return;if(await handle.queryPermission({mode:'readwrite'})!=='granted'){emit({name:handle.name,message:'Los cambios están en este navegador. Pulsa Reabrir carpeta para actualizar la copia en disco.',error:true});return;}const previousDigest=await handleStore('get',null,'lastDigest');let file;try{file=await(await handle.getFileHandle(DATA_FILE)).getFile();}catch(e){if(e.name!=='NotFoundError')throw e;}if(file?.size>256*1024*1024)throw Error('La copia supera 256 MB.');const current=file?await digest(await file.arrayBuffer()):null;if(current!==previousDigest)throw Error('La copia de la carpeta ha cambiado. Abre la carpeta para revisarla; se conserva la recuperación de este navegador.');active={handle,lastModified:file?.lastModified??null,lastDigest:current,message:'Carpeta reconectada'};await saveDataFolder();}
