// SPDX-FileCopyrightText: 2026 Aitor Delgado Martínez · AD Mobility
// SPDX-License-Identifier: LicenseRef-RutasAD-Educational-NonCommercial-1.0
import {BOARD_DRAFT_KEY,SESSION_KEY,validBoardRecovery,validSession,suspendAutosave} from './autosave.js';
import {BOARD_CASES_KEY,validBoardCases,validBoardDocument} from './boardModel.js';
const prefix='basurto-routes-';
const allowed=k=>k.startsWith(prefix)&&!k.startsWith('basurto-routes-premium-')&&!/(students|ficha|gpx|racebox|google|mapbox)/i.test(k);
export const backupStorage=()=>Object.fromEntries(Object.keys(localStorage).filter(allowed).map(k=>[k,localStorage.getItem(k)]));
const fail=()=>{throw Error('La copia no contiene una biblioteca válida de Basurto Recorridos.');};
const json=s=>{try{return JSON.parse(s);}catch{fail();}};
const text=s=>typeof s==='string'&&s.length>0&&s.length<=500;
const coords=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
export function parseBackup(input){
 if(input?.format!=='basurto-routes-backup'||input.version!==1||!input.storage||Array.isArray(input.storage)||typeof input.storage!=='object')fail();
 const storage=Object.fromEntries(Object.entries(input.storage).filter(([k])=>allowed(k)));if(Object.values(storage).some(s=>typeof s!=='string'))fail();
 const index=json(storage[prefix+'projects']);if(!index||!Array.isArray(index.projects)||!index.projects.length||index.projects.length>1000||index.projects.some(p=>!text(p?.id)||!text(p.name))||!index.projects.some(p=>p.id===index.activeProjectId)||new Set(index.projects.map(p=>p.id)).size!==index.projects.length)fail();
 for(const project of index.projects){const key=prefix+'project-'+project.id;
  if(storage[key]){const routes=json(storage[key]);if(!Array.isArray(routes)||routes.length>1000||routes.some(r=>!text(r?.id)||!text(r.name)||typeof r.color!=='string'||!Array.isArray(r.points)||r.points.length>100000||r.points.some(p=>!coords(p))))fail();}
  if(storage[key+'-markers']){const markers=json(storage[key+'-markers']);if(!Array.isArray(markers)||markers.length>10000||markers.some(m=>!text(m?.id)||!text(m.routeId)||!coords(m.coordinates)))fail();}
  if(storage[key+'-board']&&!validBoardDocument(json(storage[key+'-board']).document))fail();
 }
 if(storage[BOARD_CASES_KEY]&&!validBoardCases(json(storage[BOARD_CASES_KEY])))fail();
 if(storage[BOARD_DRAFT_KEY]&&!validBoardRecovery(json(storage[BOARD_DRAFT_KEY])))fail();
 if(storage[SESSION_KEY]&&!validSession(json(storage[SESSION_KEY])))fail();
 return {format:'basurto-routes-backup',version:1,createdAt:input.createdAt||null,storage};
}
export function backupSummary(backup){const storage=backup.storage,index=json(storage[prefix+'projects']);return {projects:index.projects.length,trajectories:index.projects.reduce((n,p)=>n+(storage[prefix+'project-'+p.id]?json(storage[prefix+'project-'+p.id]).filter(r=>r.points.length).length:0),0),explanations:storage[BOARD_CASES_KEY]?json(storage[BOARD_CASES_KEY]).length:0};}
export async function createBackup(){return parseBackup({format:'basurto-routes-backup',version:1,createdAt:new Date().toISOString(),storage:backupStorage()});}
const merge=(a,b,update)=>{const map=new Map(a.map(x=>[x.id,x]));for(const x of b)if(update||!map.has(x.id))map.set(x.id,x);return [...map.values()];};
export function mergeBackupStorage(current,incoming,update=false){const next={...current},a=current[prefix+'projects']?json(current[prefix+'projects']):{projects:[]},b=json(incoming[prefix+'projects']);for(const[k,v]of Object.entries(incoming)){const project=b.projects.find(p=>k.startsWith(prefix+'project-'+p.id));if(project){if(update||!a.projects.some(p=>p.id===project.id))next[k]=v;}else if(update||!(k in next))next[k]=v;}next[prefix+'projects']=JSON.stringify({activeProjectId:a.activeProjectId||b.activeProjectId,projects:merge(a.projects,b.projects,update)});if(current[BOARD_CASES_KEY]||incoming[BOARD_CASES_KEY])next[BOARD_CASES_KEY]=JSON.stringify(merge(current[BOARD_CASES_KEY]?json(current[BOARD_CASES_KEY]):[],incoming[BOARD_CASES_KEY]?json(incoming[BOARD_CASES_KEY]):[],update));parseBackup({format:'basurto-routes-backup',version:1,storage:next});return next;}
const write=storage=>{for(const k of Object.keys(localStorage))if(allowed(k)&&!(k in storage))localStorage.removeItem(k);for(const[k,v]of Object.entries(storage))localStorage.setItem(k,v);};
export async function restoreBackup(input,{update=false,desktop=window.elorrietaDesktop}={}){const backup=parseBackup(input),before=backupStorage(),merged=mergeBackupStorage(before,backup.storage,update),resume=suspendAutosave();try{write(merged);if(desktop)await desktop.saveLibrary(Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>[k,localStorage.getItem(k)])));await window.rutasVault?.flush();}catch(error){try{write(before);if(desktop)await desktop.saveLibrary(Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>[k,localStorage.getItem(k)])));}finally{resume();}throw error;}return backupSummary(backup);}
