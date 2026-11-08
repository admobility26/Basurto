import {useEffect,useRef,useState} from 'react';
import './placeSearch.css';
const endpoint='https://www.cartociudad.es/geocoder/api/geocoder/';
const located=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180&&(p.lat!==0||p.lng!==0);
export default function PlaceSearch({language='eu',disabled=false,onSelect}){
 const eu=language==='eu',t=(a,b)=>eu?a:b;
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[results,setResults]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const request=useRef(null),generation=useRef(0),input=useRef(null);
 const cancel=()=>{generation.current++;request.current?.abort();setBusy(false);};
 useEffect(()=>()=>{generation.current++;request.current?.abort();},[]);
 useEffect(()=>{if(disabled){cancel();setOpen(false);}},[disabled]);
 async function load(path,params,signal){const response=await fetch(endpoint+path+'?'+new URLSearchParams(params),{signal});if(!response.ok)throw Error('service');return response.json();}
 async function run(task){cancel();const version=generation.current,controller=new AbortController();request.current=controller;setBusy(true);setMessage('');const timer=setTimeout(()=>controller.abort(),15000);try{await task(controller.signal,()=>version===generation.current);}catch(e){if(version===generation.current)setMessage(t('Ezin izan da bilatu. Egiaztatu konexioa eta saiatu berriro.','No se pudo buscar. Comprueba la conexión e inténtalo de nuevo.'));}finally{clearTimeout(timer);if(version===generation.current)setBusy(false);}}
 const search=e=>{e.preventDefault();const q=query.trim();if(q.length<3)return;setResults([]);run(async(signal,current)=>{const data=await load('candidates',{q,limit:'8'},signal);if(current()){const items=Array.isArray(data)?data.filter(p=>typeof p.address==='string').slice(0,8):[];setResults(items);if(!items.length)setMessage(t('Ez dago emaitzarik. Gehitu herriaren izena.','Sin resultados. Prueba añadiendo el municipio.'));}});};
 const select=item=>run(async(signal,current)=>{const place=located(item)?item:await load('find',{q:item.address},signal);if(!located(place))throw Error('coordinates');if(current()){onSelect({coordinates:[place.lng,place.lat],zoom:/municipio|poblacion|provincia|comunidad/i.test(item.type)?14:18});setOpen(false);}});
 return <div className="place-search" onKeyDown={e=>{if(e.key==='Escape'){cancel();setOpen(false);}}}>
 <button className="map-tool" disabled={disabled} aria-expanded={open} onClick={()=>{cancel();setOpen(!open);setTimeout(()=>input.current?.focus(),0);}}>⌕ {t('Lekua bilatu','Buscar lugar')}</button>
 {open&&<section className="place-search-panel" aria-label={t('Lekuen bilatzailea','Buscador de lugares')}><form onSubmit={search}><label htmlFor={'place-query-'+language}>{t('Herria edo kalea','Pueblo o calle')}</label><div><input id={'place-query-'+language} ref={input} value={query} maxLength={180} placeholder="Getxo / Gran Vía, Bilbao" onChange={e=>{cancel();setQuery(e.target.value);setResults([]);setMessage('');}}/><button type="submit" disabled={busy||query.trim().length<3}>{t('Bilatu','Buscar')}</button><button type="button" aria-label={t('Itxi bilatzailea','Cerrar buscador')} onClick={()=>{cancel();setOpen(false);}}>×</button></div></form>
 <div role="status" aria-live="polite">{busy?t('Bilatzen…','Buscando…'):message}</div>
 {!!results.length&&<ul>{results.map((p,i)=><li key={p.id+'-'+i}><button disabled={busy} onClick={()=>select(p)}>{p.address}<small>{[p.type,p.province].filter(Boolean).join(' · ')}</small></button></li>)}</ul>}
 <a href="https://www.scne.es/productos.html#CartoCiudad" target="_blank" rel="noreferrer">CartoCiudad · IGN · CC BY 4.0</a></section>}
 </div>;
}
