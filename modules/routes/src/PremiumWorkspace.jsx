import React,{useEffect,useState} from 'react';
import App from './premium/App.jsx';
import {canUseGpx} from './gpxReview.js';
import {registerAutosave} from './autosave.js';
import {finishAutosave,hasActiveWork} from './premium/autosave.js';
import {closeVideoPlayers} from './premium/lessonStore.js';
export default function PremiumWorkspace({session}){
 const [ready,setReady]=useState(false),[error,setError]=useState('');const allowed=canUseGpx(session.user);
 useEffect(()=>{if(!allowed)return;let alive=true;const off=registerAutosave('full-gpx-editor',{finish:finishAutosave,busy:hasActiveWork});
 (async()=>{localStorage.setItem('basurto-premium-language',localStorage.getItem('basurto-premium-language')||'es');const vault=window.rutasVault,old=await vault.get('materials','gpx-video-projects')||[];for(const row of old){if(await vault.get('premium-migrations',row.id))continue;const id='basurto-034-'+row.id,review={name:row.name,points:row.points,incidents:[],libraryId:id,media:{id,name:row.filename,stored:true,videoStartUtc:row.points[0]?.time==null?null:row.points[0].time-(row.offset||0)*1000}};await vault.batch([{type:'put',namespace:'premium-media',id,value:{fingerprint:row.fingerprint,name:row.filename}},{type:'put',namespace:'library',id,value:{id,review,updatedAt:Date.now()}},{type:'put',namespace:'premium-migrations',id:row.id,value:true}]);}await vault.flush();if(alive)setReady(true)})().catch(e=>setError(e.message));
 return()=>{alive=false;off();closeVideoPlayers().catch(()=>{})};},[]);
 if(!allowed)return <p role="alert">Solo administración y gerencia pueden utilizar GPX + vídeo.</p>;
 if(error)return <p role="alert">{error}</p>;
 return ready?<div className="premium-workspace"><App/></div>:<p>Abriendo recorridos guardados…</p>;
}
