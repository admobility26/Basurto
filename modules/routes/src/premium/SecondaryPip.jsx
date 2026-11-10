import React,{useEffect,useRef,useState} from 'react';
import {loadVideo,saveVideo} from './lessonStore.js';
import {secondarySecond,secondaryVideoFrame} from './secondaryVideoFrame.js';
import './secondaryPip.css';

export default function SecondaryPip({review,onReview,clock,position,playing,onPlaying,speed,language,exporting,apiRef,onClose}){
 const t=(eu,es)=>language==='eu'?eu:es,media=review.secondaryMedia;
 const videoRef=useRef(null),fileRef=useRef(null),drag=useRef(null);
 const [url,setUrl]=useState(''),[message,setMessage]=useState(''),[calibrating,setCalibrating]=useState(false),[duration,setDuration]=useState(0);
 const box=media?.box||{x:2,y:5,width:28};
 const update=patch=>onReview({...review,secondaryMedia:{...media,...patch}});
 useEffect(()=>{
  let active=true,owned,opened;setUrl('');setDuration(0);setMessage('');
  if(media?.id)(fileRef.current?.id===media.id?Promise.resolve(fileRef.current.file):loadVideo(media.id)).then(file=>{
   if(!active){file?.close?.();return;}opened=file;if(!file){setMessage(t('Hautatu berriro bigarren bideoa.','Vuelve a seleccionar el segundo vídeo.'));return;}
   owned=file.url?null:URL.createObjectURL(file);setUrl(file.url||owned);
  }).catch(e=>{if(active)setMessage(e.message);});
  return()=>{active=false;opened?.close?.();if(owned)URL.revokeObjectURL(owned);};
 },[media?.id]);
 useEffect(()=>{const video=videoRef.current;if(!video||!url||exporting||calibrating)return;
  const second=clock.timed&&position.time!=null?secondarySecond(clock,media,(position.time-clock.start)/1000):NaN;
  if(!Number.isFinite(second)||second<0||second>=duration){video.pause();return;}
  if(!playing||Math.abs(video.currentTime-second)>.35)video.currentTime=second;
  video.playbackRate=Math.max(.1,Math.min(4,speed));if(playing)video.play().catch(()=>{});else video.pause();
 },[url,position.time,playing,speed,exporting,calibrating,duration,media?.videoStartUtc]);
 const second=clock.timed&&media?secondarySecond(clock,media,((position.time??clock.start)-clock.start)/1000):NaN;
 const covered=calibrating||(Number.isFinite(second)&&second>=0&&second<duration);
 apiRef.current={createExport(){
  if(!media)return {};
  const video=videoRef.current;if(!url||!video||video.readyState<2)throw Error(t('Kargatu bigarren bideoa esportatu aurretik.','Carga el segundo vídeo antes de exportar.'));
  const frame=secondaryVideoFrame(video,media,clock),rect=video.getBoundingClientRect();
  return {prepareVideoFrame:(second,signal)=>frame.prepare(second,signal),secondaryPip:()=>frame.visible?{image:video,rect}:null};
 }};
 const importFile=async e=>{
  const file=e.target.files?.[0];if(!file)return;onPlaying(false);setCalibrating(false);
  try{const id=crypto.randomUUID();fileRef.current=null;let stored=false;
   await saveVideo(id,file);stored=true;
   onReview({...review,secondaryMedia:{id,name:file.name,size:file.size,stored,videoStartUtc:clock.start,box}});
  }catch(error){setMessage(error.message);}finally{e.target.value='';}
 };
 const move=e=>{if(!drag.current)return;const parent=e.currentTarget.parentElement.getBoundingClientRect(),width=e.currentTarget.getBoundingClientRect().width,height=e.currentTarget.getBoundingClientRect().height;
  update({box:{...box,x:Math.max(0,Math.min(100-width/parent.width*100,drag.current.box.x+(e.clientX-drag.current.x)/parent.width*100)),y:Math.max(0,Math.min(100-height/parent.height*100,drag.current.box.y+(e.clientY-drag.current.y)/parent.height*100))}});
 };
 return <div className="secondary-pip" style={{left:box.x+'%',top:box.y+'%',width:box.width+'%'}} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
  <header className="secondary-pip-controls" onPointerDown={e=>{if(exporting||e.target.closest('button'))return;drag.current={x:e.clientX,y:e.clientY,box};e.currentTarget.parentElement.setPointerCapture(e.pointerId);}}>
   <strong>PIP 2 · {t('Mugitu','Mover')}</strong><button disabled={exporting} type="button" onClick={onClose} aria-label={t('Kendu bigarren PIPa','Quitar segundo PIP')}>×</button>
  </header>
  {url?<video ref={videoRef} src={url} muted playsInline preload="auto" controls={calibrating&&!exporting} onLoadedMetadata={e=>setDuration(e.currentTarget.duration)} onError={()=>setMessage(t('Ezin da bideoa ireki.','No se puede abrir el vídeo.'))} style={{visibility:covered?'visible':'hidden'}}/>:<div className="secondary-pip-empty">{t('Gehitu beste ikuspegi bat','Añade otra cámara')}</div>}
  {url&&!covered&&!exporting&&<p className="secondary-pip-uncovered">{t('Une honetarako bideorik ez','Sin vídeo para este instante')}</p>}
  {!exporting&&<details className="secondary-pip-settings" open={!media||!!message}>
   <summary>{t('2. bideoa · ezarpenak','Vídeo 2 · ajustes')}</summary>
   <label>{t('Bideoa hautatu','Seleccionar vídeo')}<input type="file" accept="video/*,.mp4,.mov" onChange={importFile}/></label>
   {media&&<><small>{media.name}</small><label>{t('Tamaina','Tamaño')}<input aria-label={t('Bigarren PIParen tamaina','Tamaño del segundo PIP')} type="range" min="15" max="48" value={box.width} onChange={e=>update({box:{...box,width:Number(e.target.value),x:Math.min(box.x,100-Number(e.target.value))}})}/></label>
   <button type="button" onClick={()=>{onPlaying(false);setCalibrating(!calibrating);}}>{t('Sinkronizazioa doitu','Ajustar sincronización')}</button>
   {calibrating&&<><label>{t('2. bideoaren segundoa','Segundo del vídeo 2')}<input aria-label={t('2. bideoaren segundoa','Segundo del vídeo 2')} type="number" min="0" max={duration} step=".1" defaultValue={videoRef.current?.currentTime||0} onChange={e=>{if(videoRef.current)videoRef.current.currentTime=Math.max(0,Math.min(duration,Number(e.target.value)));}}/></label>
   <button type="button" disabled={!clock.timed||position.time==null} onClick={()=>{update({videoStartUtc:position.time-videoRef.current.currentTime*1000});setCalibrating(false);}}>{t('Une hau lotu','Vincular este instante')}</button></>}
   <small>{t('Audioa lehen bideotik dator.','El audio procede del primer vídeo.')}</small>
   {media.stored===false&&<small>{t('Berriro irekitzean, hautatu bideoa berriz.','Al reabrir tendrás que volver a seleccionar este vídeo.')}</small>}</>}
   {message&&<p role="status">{message}</p>}
  </details>}
 </div>;
}
