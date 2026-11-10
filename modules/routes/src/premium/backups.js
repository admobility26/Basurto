import {validateAssembly} from './reviewAssembly.js';
import {BOARD_DRAFT_KEY,SESSION_KEY,validBoardRecovery,validSession,suspendAutosave} from './autosave.js';
import {validBoardDocument} from './boardModel.js';
import {BOARD_CASES_KEY,validBoardCases} from './boardModel.js';
import {listLessons,listLibraryReviews,replaceBackupRecords} from './lessonStore.js';
import {validateTrack} from './racebox.js';
import {FICHA_KEY,validateStudents,mergeStudents} from './students.js';
const prefix='basurto-premium-';
const desktopSnapshot=()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('basurto-routes-')).map(k=>[k,localStorage.getItem(k)]));
export const backupStorage=()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>[k,localStorage.getItem(k)]));
const array=(value,max=10000)=>Array.isArray(value)&&value.length<=max;
const text=value=>typeof value==='string'&&value.length>0&&value.length<=500;
const coordinates=p=>array(p,2)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const fail=()=>{throw Error('La copia no contiene una biblioteca válida de Basurto Recorridos.');};
const json=value=>{try{return JSON.parse(value);}catch{fail();}};
function reviewValid(review){
 if(!review||!array(review.points,500000)||!array(review.incidents,10000))fail();
 for(const p of review.points)if(!p||!coordinates(p.coordinates)||(p.time!=null&&!Number.isFinite(p.time)))fail();
 for(const i of review.incidents)if(!i||!coordinates(i.coordinates)||typeof i.title!=='string'||typeof i.note!=='string')fail();
 try{validateAssembly(review);}catch{fail();}
 if(review.parts!=null){if(!array(review.parts,100)||new Set(review.parts.map(p=>p.id)).size!==review.parts.length)fail();for(const p of review.parts){if(!text(p.id)||!text(p.name)||p.parts)fail();reviewValid({...p,incidents:p.incidents||[]});if(!Number.isFinite(p.startTime)||!Number.isFinite(p.endTime)||!Number.isFinite(p.shift)||p.endTime<=p.startTime)fail();}}
 if(review.name!=null&&typeof review.name!=='string')fail();
 if(review.media!=null&&(!review.media||typeof review.media!=='object'||typeof review.media.name!=='string'))fail();
}
function routesValid(routes){if(!array(routes,1000))fail();for(const route of routes){if(!route||!text(route.id)||!text(route.name)||typeof route.color!=='string'||!array(route.points,500000)||route.points.some(p=>!coordinates(p)))fail();}}
function markersValid(markers){if(!array(markers,10000))fail();for(const marker of markers)if(!marker||!text(marker.id)||!text(marker.routeId)||!coordinates(marker.coordinates))fail();}
export function parseBackup(input){
 if(!input||![1,2].includes(input.version)||(input.version===2&&input.format!=='basurto-premium-backup')||!input.storage||typeof input.storage!=='object'||Array.isArray(input.storage))fail();
 const storage=Object.fromEntries(Object.entries(input.storage).filter(([key])=>key.startsWith(prefix)));
 if(Object.values(storage).some(value=>typeof value!=='string'))fail();
 const index=json(storage[`${prefix}projects`]);
 if(!index||!text(index.activeProjectId)||!array(index.projects,1000)||!index.projects.length||index.projects.some(p=>!p||!text(p.id)||!text(p.name))||new Set(index.projects.map(p=>p.id)).size!==index.projects.length||!index.projects.some(p=>p.id===index.activeProjectId))fail();
 if(storage[`${prefix}routes`])routesValid(json(storage[`${prefix}routes`]));
 for(const project of index.projects){
  const key=`${prefix}project-${project.id}`;
  if(!storage[key]&&storage[`${prefix}routes`]&&(project.legacy||index.projects.length===1))storage[key]=storage[`${prefix}routes`];
  if(storage[key])routesValid(json(storage[key]));
  if(storage[`${key}-board`]&&!validBoardDocument(json(storage[`${key}-board`]).document))fail();
  if(storage[`${key}-markers`])markersValid(json(storage[`${key}-markers`]));
  if(storage[`${key}-gpx-review`])reviewValid(json(storage[`${key}-gpx-review`]));
 }
 storage[`${prefix}projects`]=JSON.stringify({...index,projects:index.projects.map(({legacy,...project})=>project)});
 if(storage[`${prefix}students`]){const students=json(storage[`${prefix}students`]);if(!array(students,10000)||students.some(s=>!s||!text(s.id)||['__proto__','constructor','prototype'].includes(s.id)||!text(s.name)))fail();}
 if(storage[BOARD_DRAFT_KEY]&&!validBoardRecovery(json(storage[BOARD_DRAFT_KEY])))fail();
 if(storage[SESSION_KEY]&&!validSession(json(storage[SESSION_KEY])))fail();
 if(storage[BOARD_CASES_KEY]&&!validBoardCases(json(storage[BOARD_CASES_KEY])))fail();
 if(storage[FICHA_KEY])validateStudents(json(storage[FICHA_KEY]));
 const sessions=input.version===2?input.sessions||[]:[],library=input.version===2?input.library||[]:[];
 if(!array(sessions,1000)||!array(library,10000))fail();
 for(const session of sessions){if(!session||!text(session.id)||!text(session.studentId)||!text(session.studentName)||!Number.isFinite(Date.parse(session.startedAt)))fail();try{validateTrack(session);}catch{fail();}}
 for(const item of library){if(!item||!text(item.id)||!text(item.projectId))fail();reviewValid(item.review);}
 if(new Set(sessions.map(s=>s.id)).size!==sessions.length||new Set(library.map(s=>s.id)).size!==library.length)fail();
 return {format:'basurto-premium-backup',version:2,createdAt:input.createdAt||input.updatedAt||null,storage,sessions,library};
}
export function backupSummary(backup){
 const index=json(backup.storage[`${prefix}projects`]);let trajectories=0;const reviews=new Set();
 const add=(r,key)=>{if(r.points.length)reviews.add(r.sessionId?`session:${r.sessionId}`:r.libraryId?`library:${r.libraryId}`:key);};
 for(const p of index.projects){const key=`${prefix}project-${p.id}`;if(backup.storage[key])trajectories+=json(backup.storage[key]).filter(r=>r.points.length).length;if(backup.storage[`${key}-gpx-review`])add(json(backup.storage[`${key}-gpx-review`]),`project:${p.id}`);}
 for(const item of backup.library)add(item.review,`library:${item.id}`);for(const session of backup.sessions)if(session.points.length)reviews.add(`session:${session.id}`);
 return {explanations:backup.storage[BOARD_CASES_KEY]?json(backup.storage[BOARD_CASES_KEY]).length:0,projects:index.projects.length,trajectories,reviews:reviews.size,sessions:backup.sessions.length,students:backup.storage[FICHA_KEY]?Object.keys(json(backup.storage[FICHA_KEY]).students).length:0,classes:backup.storage[FICHA_KEY]?Object.values(json(backup.storage[FICHA_KEY]).students).reduce((n,s)=>n+Object.values(s.permits).reduce((a,p)=>a+p.history.length,0),0):0};
}
export async function createBackup(){const [sessions,library]=await Promise.all([listLessons(),listLibraryReviews()]);return parseBackup({format:'basurto-premium-backup',version:2,createdAt:new Date().toISOString(),storage:backupStorage(),sessions,library});}
const mergeItems=(current,incoming,update)=>{const map=new Map(current.map(item=>[item.id,item]));for(const item of incoming)if(update||!map.has(item.id))map.set(item.id,item);return [...map.values()];};
export function mergeBackupStorage(current,incoming,update=false){
 const next={...current},oldIndex=current[`${prefix}projects`]?json(current[`${prefix}projects`]):{projects:[]},newIndex=json(incoming[`${prefix}projects`]);
 const oldIds=new Set(oldIndex.projects.map(p=>p.id));
 for(const [key,value] of Object.entries(incoming)){
  if(key===BOARD_DRAFT_KEY||key===SESSION_KEY){if(update||!(key in current))next[key]=value;continue;}
  if(key===`${prefix}projects`||key===`${prefix}students`||key===FICHA_KEY||key===BOARD_CASES_KEY)continue;
  const project=newIndex.projects.find(p=>key===`${prefix}project-${p.id}`||key===`${prefix}project-${p.id}-markers`||key===`${prefix}project-${p.id}-gpx-review`||key===`${prefix}project-${p.id}-board`);
  if(project){if(!oldIds.has(project.id)||update)next[key]=value;}else if(!(key in current))next[key]=value;
 }
 if(current[BOARD_CASES_KEY]||incoming[BOARD_CASES_KEY]){const mergedCases=mergeItems(current[BOARD_CASES_KEY]?json(current[BOARD_CASES_KEY]):[],incoming[BOARD_CASES_KEY]?json(incoming[BOARD_CASES_KEY]):[],update);if(!validBoardCases(mergedCases))throw Error('La biblioteca resultante supera el límite de 60 explicaciones o contiene datos no válidos.');next[BOARD_CASES_KEY]=JSON.stringify(mergedCases);}
 const projects=mergeItems(oldIndex.projects,newIndex.projects,update);
 next[`${prefix}projects`]=JSON.stringify({activeProjectId:oldIndex.activeProjectId||newIndex.activeProjectId,projects});
 const oldStudents=current[`${prefix}students`]?json(current[`${prefix}students`]):[],newStudents=incoming[`${prefix}students`]?json(incoming[`${prefix}students`]):[];
 if(oldStudents.length||newStudents.length)next[`${prefix}students`]=JSON.stringify(mergeItems(oldStudents,newStudents,update));
 if(!incoming[FICHA_KEY]&&newStudents.length){const canonical=current[FICHA_KEY]?json(current[FICHA_KEY]):{students:{}};for(const s of newStudents)if(!Object.hasOwn(canonical.students,s.id))canonical.students[s.id]={...s,permits:{},teacher:'',school:'',notes:'',updatedAt:new Date().toISOString()};next[FICHA_KEY]=JSON.stringify(canonical);}
 if(incoming[FICHA_KEY]||current[FICHA_KEY])next[FICHA_KEY]=JSON.stringify(mergeStudents(next[FICHA_KEY]?json(next[FICHA_KEY]):{students:{}},incoming[FICHA_KEY]?json(incoming[FICHA_KEY]):{students:{}},update));
 return next;
}
const writeStorage=storage=>{for(const key of Object.keys(localStorage))if(key.startsWith(prefix)&&!(key in storage))localStorage.removeItem(key);for(const [key,value] of Object.entries(storage))localStorage.setItem(key,value);};
export async function restoreBackup(input,{update=false,desktop=window.elorrietaDesktop}={}){
 const backup=parseBackup(input),storage=backupStorage(),[sessions,library]=await Promise.all([listLessons(),listLibraryReviews()]);
 const merged=mergeBackupStorage(storage,backup.storage,update),records={sessions:mergeItems(sessions,backup.sessions,update),library:mergeItems(library,backup.library,update)};
 const resumeAutosave=suspendAutosave();
 let recordsWritten=false;
 try{writeStorage(merged);await replaceBackupRecords(records);recordsWritten=true;if(desktop)await desktop.saveLibrary(desktopSnapshot());await window.rutasVault?.flush();}
 catch(error){resumeAutosave();let rollbackError;try{writeStorage(storage);}catch(e){rollbackError=e;}if(recordsWritten)try{await replaceBackupRecords({sessions,library});}catch(e){rollbackError=e;}if(desktop)try{await desktop.saveLibrary(desktopSnapshot());}catch(e){rollbackError=e;}try{await window.rutasVault?.flush();}catch(e){rollbackError=e;}throw Error(rollbackError?'No se pudo completar la restauración. No cierres la aplicación; conserva tu archivo de copia.':`No se pudo restaurar. Se han conservado los datos anteriores. ${error.message||''}`);}
 return backupSummary(backup);
}
