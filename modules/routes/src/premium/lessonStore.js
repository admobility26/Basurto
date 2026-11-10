import {mediaIdentity} from '../mediaIdentity.js';
const openPlayers=new Set();
const vault=()=>window.rutasVault;
const changed=()=>window.dispatchEvent(new Event('basurto-premium:metadata-changed'));
const encrypted=async operations=>{await vault().batch(operations);changed();};
let database;
const open = () => database ||= new Promise((resolve,reject)=>{let blocked=false;const r=indexedDB.open('basurto-premium-lessons',3);r.onupgradeneeded=()=>{for(const store of ['sessions','videos','library'])if(!r.result.objectStoreNames.contains(store))r.result.createObjectStore(store,{keyPath:'id'});};r.onsuccess=()=>{if(blocked){r.result.close();return;}r.result.onversionchange=()=>{r.result.close();database=null;};resolve(r.result);};r.onblocked=()=>{blocked=true;reject(Error("Cierra otras pestañas de Basurto Recorridos y vuelve a abrir la biblioteca."));};r.onerror=()=>reject(r.error);}).catch(error=>{database=null;throw error;});
export async function saveLesson(session){if(vault())return encrypted([{type:'put',namespace:'sessions',id:session.id,value:session}]);const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('sessions','readwrite');tx.objectStore('sessions').put(structuredClone(session));tx.oncomplete=()=>{window.dispatchEvent(new Event('basurto-premium:metadata-changed'));resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
export async function listLessons(){if(vault())return (await vault().all('sessions')).sort((a,b)=>b.startedAt.localeCompare(a.startedAt));const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction('sessions').objectStore('sessions').getAll();r.onsuccess=()=>resolve(r.result.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)));r.onerror=()=>reject(r.error);});}

export async function saveVideo(id,file){
 const fingerprint=await mediaIdentity(file);
 await window.usbMedia.importFile(fingerprint,file);
 await vault().put('premium-media',id,{fingerprint,name:file.name,size:file.size});changed();
}
export async function loadVideo(id){
 const ref=await vault().get('premium-media',id);if(!ref)return null;
 const player=await window.usbMedia.open(ref.fingerprint);openPlayers.add(player);return {url:player.url,close:async()=>{openPlayers.delete(player);await player.close()}};
}
export async function deleteVideo(id){await vault().batch([{type:'delete',namespace:'premium-media',id}]);changed();}
export async function closeVideoPlayers(){for(const player of openPlayers)await player.close().catch(()=>{});openPlayers.clear();}

export async function saveLibraryReview(item){if(vault())return encrypted([{type:'put',namespace:'library',id:item.id,value:item}]);const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('library','readwrite');tx.objectStore('library').put(structuredClone(item));tx.oncomplete=()=>{window.dispatchEvent(new Event('basurto-premium:metadata-changed'));resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
export async function listLibraryReviews(){if(vault())return vault().all('library');const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction('library').objectStore('library').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}

// Delete every saved representation of one review in a single transaction.
// Original source files and stored/shared video blobs are deliberately untouched.
export async function deleteLibraryReview({libraryId,sessionId}){
 if(vault()){const operations=[];if(sessionId)operations.push({type:'delete',namespace:'sessions',id:sessionId});for(const item of await vault().all('library'))if((libraryId&&(item.id===libraryId||item.review?.libraryId===libraryId))||(sessionId&&(item.id===sessionId||item.review?.sessionId===sessionId)))operations.push({type:'delete',namespace:'library',id:item.id});return encrypted(operations);}

 const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['library','sessions'],'readwrite');if(sessionId)tx.objectStore('sessions').delete(sessionId);const request=tx.objectStore('library').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const item=cursor.value;if((libraryId&&(item.id===libraryId||item.review?.libraryId===libraryId))||(sessionId&&(item.id===sessionId||item.review?.sessionId===sessionId)))cursor.delete();cursor.continue();};tx.oncomplete=()=>{window.dispatchEvent(new Event('basurto-premium:metadata-changed'));resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}

// Replace metadata atomically for restore/rollback; source videos are never touched.
export async function replaceBackupRecords({sessions,library}){
 if(vault())return encrypted(['sessions','library'].flatMap(namespace=>[{type:'clear',namespace},...(namespace==='sessions'?sessions:library).map(value=>({type:'put',namespace,id:value.id,value}))]));

 const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['sessions','library'],'readwrite');for(const [name,items] of [['sessions',sessions],['library',library]]){const store=tx.objectStore(name);store.clear();for(const item of items)store.put(structuredClone(item));}tx.oncomplete=()=>{window.dispatchEvent(new Event('basurto-premium:metadata-changed'));resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}

// Atomic cascade, including cached videos. No original disk files are touched.
export async function commitStudentDeletion({sessionIds,libraryIds,libraryItems,videoIds}){
 if(vault()){await encrypted([...sessionIds.map(id=>({type:'delete',namespace:'sessions',id})),...libraryIds.map(id=>({type:'delete',namespace:'library',id})),...libraryItems.map(value=>({type:'put',namespace:'library',id:value.id,value})),...videoIds.map(id=>({type:'delete',namespace:'videos',id}))]);for(const id of videoIds)await vault().removeVideo(id).catch(()=>{});return;}

 const db=await open();return new Promise((resolve,reject)=>{
  const tx=db.transaction(['sessions','library','videos'],'readwrite');
  tx.oncomplete=()=>{window.dispatchEvent(new Event('basurto-premium:metadata-changed'));resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('No se pudo completar el borrado.'));
  try{for(const id of sessionIds)tx.objectStore('sessions').delete(id);for(const id of libraryIds)tx.objectStore('library').delete(id);for(const item of libraryItems)tx.objectStore('library').put(structuredClone(item));for(const id of videoIds)tx.objectStore('videos').delete(id);}catch(error){tx.abort();reject(error);}
 });
}
