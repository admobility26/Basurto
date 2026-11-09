import React,{useState,useEffect,Suspense,lazy} from 'react';
import {createRoot} from 'react-dom/client';
import {finishAutosave,registerAutosave,checkpointAutosave,reportAutosave,hasActiveWork} from './autosave.js';
import LocalVideos from './LocalVideos.jsx';
import {createUsbMedia} from './usbMedia.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import './help.css';
import './web-access.css';
import './basurto.css';
const Editor=lazy(()=>import('./App.jsx'));
const root=createRoot(document.getElementById('root'));
let session,vault,closed=false;
async function flush(){await finishAutosave();await vault?.flush()}
async function close(){if(closed)return;await flush();closed=true;await window.usbMedia?.close();root.unmount();await vault?.lock()}
function Unlock({user,onReady}){const [exists,setExists]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);useEffect(()=>{window.RutasLocalVault.has(user.id).then(setExists).catch(e=>setError(e.message))},[]);return <div className="basurto-unlock"><img src="/logo.png" alt="Autoescuela Basurto"/><h1>{exists?'Abrir tus materiales':'Proteger tus materiales locales'}</h1><p>Tu cuenta de Basurto ya está identificada. Esta clave protege los recorridos y el catálogo guardados en este navegador; no se envía a la oficina.</p><form onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);setBusy(true);try{if(!exists&&f.get('password')!==f.get('confirm'))throw Error('Las claves no coinciden.');const v=await window.RutasLocalVault.unlock(user,f.get('password'));form.reset();onReady(v)}catch(e){setError(e.message);setBusy(false)}}}><label>Clave local de materiales<input name="password" type="password" required minLength={12} maxLength={256} autoComplete={exists?'current-password':'new-password'}/></label>{exists===false&&<label>Repite la clave<input name="confirm" type="password" required minLength={12} maxLength={256} autoComplete="new-password"/></label>}<p>Conserva esta clave y una copia de tu biblioteca. Cambiar la contraseña de acceso no recupera estos archivos. Los vídeos originales no se modifican.</p>{error&&<p role="alert">{error}</p>}<button className="basurto-primary" disabled={busy||exists===null}>{busy?'Abriendo…':'Abrir materiales'}</button></form></div>}
function Workspace(){const [section,setSection]=useState('videos'),[error,setError]=useState('');useEffect(()=>{const home=()=>switchTo('videos');window.addEventListener('basurto-routes:home',home);return()=>window.removeEventListener('basurto-routes:home',home)},[]);async function switchTo(next){try{await flush();setSection(next)}catch(e){setError(e.message)}}return <><header className="basurto-module-nav"><img src="/logo.png" alt="Autoescuela Basurto"/><nav><button className={section==='videos'?'selected':''} onClick={()=>switchTo('videos')}>Vídeos locales</button><button className={section==='editor'?'selected':''} onClick={()=>switchTo('editor')}>Recorridos y pizarra</button></nav><span>{session.user.role==='teacher'?'Profesor · Básica':'Oficina · Premium'}</span></header>{error&&<p role="alert">{error}</p>}<div className="basurto-module-body">{section==='videos'?<LocalVideos session={session}/>:<Suspense fallback={<p>Abriendo el mapa y la pizarra…</p>}><Editor/></Suspense>}</div></>}
async function start(){
 if(parent===window||!parent.BasurtoRoutes)throw Error('Abre Formación → Recorridos desde Basurto.');
 session=await parent.BasurtoRoutes.connect(window,{flush,close});
 window.basurtoCanCreateVideos=['admin','manager'].includes(session.user.role);
 document.body.classList.toggle('teacher-materials',!window.basurtoCanCreateVideos);
 const secret=await session.localKey();
 window.basurtoNativeMaterials=Boolean(secret);
 vault=secret?await window.RutasLocalVault.unlock(session.user,secret):await new Promise(resolve=>root.render(<Unlock user={session.user} onReady={resolve}/>));
 if(closed){await vault.lock();return}
 window.usbMedia=createUsbMedia(session,vault);
 window.installRutasAccount(session.user,vault);localStorage.setItem('basurto-routes-language',localStorage.getItem('basurto-routes-language')||'es');
 registerAutosave('basurto-encrypted',{finish:()=>vault.flush(),checkpoint:()=>vault.flush(),busy:()=>vault.pending});
 window.addEventListener('basurto-routes:vault-error',e=>reportAutosave('error',e.detail));
 window.addEventListener('basurto-routes:retry-save',()=>flush().catch(e=>reportAutosave('error',e.message)));
 window.addEventListener('beforeunload',e=>{checkpointAutosave();if(hasActiveWork()||vault.pending){e.preventDefault();e.returnValue=''}});
 for(const type of ['pointerdown','keydown','touchstart'])window.addEventListener(type,()=>session.activity(),{passive:true});
 // MapLibre requests consult the explicit local cache in both browser and native WebViews.
 const nativeFetch=window.fetch.bind(window);window.fetch=async(resource,options)=>{const url=new URL(typeof resource==='string'?resource:resource.url,location.href);if(['www.geo.euskadi.eus','www.ign.es'].includes(url.hostname)&&url.protocol==='https:'&&(!options?.method||options.method==='GET')){const cache=await caches.open(url.hostname==='www.ign.es'?'ortofoto-pnoa-v1':'ortofoto-euskadi-v1');const saved=await cache.match(resource);if(saved)return saved}return nativeFetch(resource,options)};
 root.render(<Workspace/>);
}
start().catch(e=>root.render(<div className="basurto-unlock"><h1>No se ha podido abrir Formación</h1><p role="alert">{e.message}</p><p>Vuelve a la agenda y abre Recorridos de nuevo.</p></div>));
