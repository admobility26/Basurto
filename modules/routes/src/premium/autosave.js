import {registerAutosave as registerHostAutosave,reportAutosave as reportHostAutosave} from '../autosave.js';
import {validBoardDocument} from './boardModel.js';
// SPDX-FileCopyrightText: 2026 Aitor Delgado Martínez · AD Mobility
// SPDX-License-Identifier: LicenseRef-RutasAD-Educational-NonCommercial-1.0
const entries=new Map();
let suspended=false;
export function suspendAutosave(){const previous=suspended;suspended=true;return()=>{suspended=previous;};}
export const SESSION_KEY='basurto-premium-autosave-session',BOARD_DRAFT_KEY='basurto-premium-board-autosave',REVISION_KEY='basurto-premium-autosave-revision';
let lastStatus={state:'saved',message:''};
export const autosaveStatus=()=>lastStatus;
export const reportAutosave=(state,message='')=>{lastStatus={state,message,time:Date.now()};reportHostAutosave(state,message);window.dispatchEvent(new CustomEvent('basurto-premium:autosave-status',{detail:lastStatus}));};
export function writeChanged(key,value){if(suspended)return false;const raw=JSON.stringify(value);if(localStorage.getItem(key)!==raw){localStorage.setItem(key,raw);return true;}return false;}
const text=s=>typeof s==='string'&&s.length<=10000;
const view=v=>v==null||(Array.isArray(v.center)&&v.center.length===2&&v.center.every(Number.isFinite)&&Math.abs(v.center[0])<=180&&Math.abs(v.center[1])<=85&&Number.isFinite(v.zoom)&&v.zoom>=0&&v.zoom<=24);
export function validSession(s){return !!s&&s.version===1&&text(s.projectId)&&view(s.view)&&(!s.nameDialog||(text(s.nameDialog.kind)&&text(s.nameDialog.value)))&&(!s.markerDialog||(s.markerDialog.draft&&text(s.markerDialog.draft.signalCode)&&(!s.markerDialog.draft.destinations||Array.isArray(s.markerDialog.draft.destinations)&&s.markerDialog.draft.destinations.every(d=>text(d.text)&&text(d.arrow)))))&&(!s.gpxIncidentDraft||(text(s.gpxIncidentDraft.title)&&text(s.gpxIncidentDraft.note)));}
export function validBoardRecovery(r){return !!r&&r.version===1&&validBoardDocument(r.document)&&view(r.view)&&(!r.caseName||text(r.caseName))&&(!r.tool||['pointer','move','route','arrow','signal','note','edit','erase','vehicle','draw'].includes(r.tool))&&(!r.group||['basic','vehicles','draw','signals','explain'].includes(r.group));}
export function readSession(){try{const s=JSON.parse(localStorage.getItem(SESSION_KEY));return validSession(s)?s:null;}catch{return null;}}
export function registerAutosave(id,entry){entries.set(id,entry);const release=registerHostAutosave('premium:'+id,entry);return()=>{release();if(entries.get(id)===entry)entries.delete(id);};}
export const hasActiveWork=()=>lastStatus.state==='error'||[...entries.values()].some(e=>e.busy?.());
export function checkpointAutosave(){
 if(suspended)return Promise.resolve();
 const pending=[];let failure;
 for(const entry of entries.values())try{pending.push(Promise.resolve(entry.checkpoint?.()));}catch(e){failure=e;reportAutosave('error',e.message);}
 const done=Promise.allSettled(pending).then(results=>{const error=failure||results.find(r=>r.status==='rejected')?.reason;if(error){reportAutosave('error',error.message);throw error;}reportAutosave('saved');});done.catch(()=>{});return done;
}
let finishing;
export function finishAutosave(){if(suspended)return Promise.resolve();return finishing||=(async()=>{reportAutosave('saving');for(const entry of [...entries.values()])await entry.finish?.();await new Promise(resolve=>setTimeout(resolve,30));await checkpointAutosave();})().finally(()=>{finishing=null;});}
