import SecondaryPip from './SecondaryPip.jsx';
import {gpsOptions,gpsStorageKey,readGpsFields,gpsHud} from './movieGps.js';
import './movieGps.css';
import {trimMovieClip,trimMovieClips,movieSourceDuration} from './movieRange.js';
import {createFastMovie,fastMovieSupported} from './fastMovie.js';
import {fastComposition} from './fastComposition.js';
import {assemblyPartAt,partMedia,editReviewPart,assemblyClips} from './reviewAssembly.js';
import {registerAutosave} from './autosave.js';
import ClipEditor from './ClipEditor.jsx';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {pointAt,speedAt,timeline} from './reviewTime.js';
import {loadVideo,saveVideo} from './lessonStore.js';
import {workspaceMedia,openMovieSink} from './workspace.js';
import {createSequenceMovie,prepareMovieAudio,releaseMovieVideo,videoDecodeError} from './finalMovie.js';

export default function ReviewStudio({exportAllowed=true,review,onReview,progress,onProgress,playing,onPlaying,speed,language,live,getComposition,onMovieFrame,onMapResize,onEditIncident,clipRequest,onBoard}){
 const [clipOpen,setClipOpen]=useState(false),[previewRange,setPreviewRange]=useState(null);
 useEffect(()=>{if(clipRequest){onPlaying(false);setClipOpen(true);}},[clipRequest]);
 useEffect(()=>{setClipOpen(false);setPreviewRange(null);},[review.libraryId,review.sessionId]);
 const t=(eu,es)=>language==='eu'?eu:es;
 const clock=useMemo(()=>timeline(review.points),[review.points]);
 const position=pointAt(review.points,live?1:progress,clock),point=position.point;
 const velocity=position.gap?{value:null,estimated:false}:speedAt(review.points,position.index);
 const [finalView,setFinalView]=useState(false),[exporting,setExporting]=useState(false),[exportProgress,setExportProgress]=useState(0),[result,setResult]=useState(''),[narration,setNarration]=useState(false),[imagePaused,setImagePaused]=useState(false),[exportMode,setExportMode]=useState('realtime'),[exportSpeed,setExportSpeed]=useState(0);
 const [gpsFields,setGpsFields]=useState(readGpsFields);
 const changeGps=next=>{setGpsFields(next);try{localStorage.setItem(gpsStorageKey,JSON.stringify(next));}catch{}};
 const [secondOpen,setSecondOpen]=useState(false),secondApi=useRef(null);
 const imagePausedRef=useRef(false);
 useEffect(()=>{let active=true;fastMovieSupported().then(ok=>{if(active&&!ok)setExportMode('realtime');}).catch(()=>{if(active)setExportMode('realtime');});return()=>{active=false;};},[]);
 const activePart=assemblyPartAt(review,position.time),media=activePart?partMedia(activePart):review.media;
 const updateMedia=next=>onReview(activePart?editReviewPart(review,activePart.id,{media:next?{...next,videoStartUtc:(next.videoStartUtc??activePart.startTime)-activePart.shift}:null}):{...review,media:next});
 const videoRef=useRef(null),raf=useRef(0),state=useRef(null),urlRef=useRef(null),selectedFile=useRef(new Map()),drag=useRef(null);
 const [videoUrl,setVideoUrl]=useState(''),[duration,setDuration]=useState(0),[message,setMessage]=useState(''),[calibrating,setCalibrating]=useState(false),[layout,setLayout]=useState(()=>{try{return localStorage.getItem('basurto-premium-pip-layout')==='split'?'split':'large';}catch{return 'large';}}),[corner,setCorner]=useState({x:12,y:58});
 state.current={progress,onProgress,onPlaying,speed,clock,live,previewRange};
 useEffect(()=>{
  if(exporting)return;
  let cancelled=false,opened;setDuration(0);setVideoUrl('');setCalibrating(false);
  if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current=null;}
  if(media?.id)(media.workspace?workspaceMedia(media):selectedFile.current.has(media.id)?Promise.resolve(selectedFile.current.get(media.id)):loadVideo(media.id)).then(file=>{if(cancelled){file?.close?.();return;}opened=file;if(!file){setMessage(t('Bideoa berriz hautatu behar da.','Debes volver a seleccionar el vídeo.'));return;}const url=file.url||URL.createObjectURL(file.file||file);if(!file.url)urlRef.current=url;setVideoUrl(url);}).catch(error=>{if(!cancelled)setMessage(error.message||t('Ezin izan da bideoa ireki.','No se pudo abrir el vídeo.'));});
  return()=>{cancelled=true;opened?.close?.();};
 },[media?.id,exporting]);
 useEffect(()=>()=>{if(urlRef.current)URL.revokeObjectURL(urlRef.current);},[]);
 useEffect(()=>{
  if(!playing||live)return;
  let previous=0;
  const tick=now=>{const s=state.current;if(!previous)previous=now;const dt=Math.min((now-previous)/1000,.25);previous=now;const next=Math.min(s.previewRange?.end??1,s.progress+dt*s.speed/s.clock.duration);s.onProgress(next);if(next>=(s.previewRange?.end??1))s.onPlaying(false);else raf.current=requestAnimationFrame(tick);};
  raf.current=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf.current);
 },[playing,live,review.sessionId,clock.duration]);
 useEffect(()=>{if(['large','split'].includes(media?.layout))setLayout(media.layout);},[media?.id,media?.layout]);
 const changeLayout=value=>{setLayout(value);try{localStorage.setItem('basurto-premium-pip-layout',value);}catch{}if(media)updateMedia({...media,layout:value});};
 const exportAbort=useRef(null),resultRef=useRef(''),movieDoneRef=useRef(null);
 useEffect(()=>registerAutosave('movie-export',{busy:()=>!!exportAbort.current,finish:()=>movieDoneRef.current}),[]);
 useEffect(()=>()=>{exportAbort.current?.abort();if(resultRef.current)URL.revokeObjectURL(resultRef.current);},[]);
 useEffect(()=>{if(resultRef.current)URL.revokeObjectURL(resultRef.current);resultRef.current='';setResult('');},[review.media?.id,review.media?.videoStartUtc,review.parts,review.incidents,review.secondaryMedia,layout,gpsFields]);
 useEffect(()=>{const panel=videoRef.current?.closest(".map-panel");if(!panel)return;panel.classList.toggle("movie-preview",finalView);requestAnimationFrame(()=>onMapResize?.());return()=>{panel.classList.remove("movie-preview");requestAnimationFrame(()=>onMapResize?.());};},[finalView]);
 useEffect(()=>{const panel=videoRef.current?.closest('.map-panel')||document.querySelector('.map-panel');if(!panel)return;panel.classList.toggle('pip-split',layout==='split'&&!live&&review.points.length>0);const id=requestAnimationFrame(()=>onMapResize?.());return()=>{cancelAnimationFrame(id);panel.classList.remove('pip-split');requestAnimationFrame(()=>onMapResize?.());};},[layout,videoUrl,live,review.points.length>0]);


 useEffect(()=>{const panel=document.querySelector('.map-panel');panel?.classList.toggle('movie-exporting',exporting);return()=>panel?.classList.remove('movie-exporting');},[exporting]);
 const exportMovie=async()=>{
  if(!clock.timed){setMessage('El GPX necesita horas para sincronizar el vídeo.');return;}
  try{
   const selected=review.parts?.length?assemblyClips(review).find(c=>c.partId===activePart?.id):{name:review.name,startSecond:(clock.start-(media?.videoStartUtc??clock.start))/1000,endSecond:(clock.end-(media?.videoStartUtc??clock.start))/1000};
   if(!media||!videoRef.current){setMessage('Selecciona y carga el vídeo antes de exportar.');return;}
   if(selected)trimMovieClip(selected,videoRef.current.duration);
  }catch(error){setMessage(error.message);return;}
  if(!exportAllowed){setMessage('Este mapa no permite exportar MP4.');return;}const compositionPromise=getComposition?.();compositionPromise?.catch(()=>{});onPlaying(false);setExporting(true);setExportProgress(0);setExportSpeed(0);setMessage('');imagePausedRef.current=false;setImagePaused(false);if(resultRef.current)URL.revokeObjectURL(resultRef.current);setResult('');const controller=new AbortController();exportAbort.current=controller;let exportAudio,sink;const urls=[],players=[];
  try{const sinkPromise=openMovieSink();if(exportMode==='realtime'){exportAudio=prepareMovieAudio(videoRef.current);await exportAudio.resume();}sink=await sinkPromise;if(!sink&&clock.duration>300)throw Error('Para clases largas usa Chrome o la app y guarda directamente en disco.');let composition=await compositionPromise;if(!composition)throw Error('El mapa no está disponible para grabar.');if(!clock.timed)throw Error('El GPX necesita horas para sincronizar el vídeo.');
   let clips=review.parts?.length?assemblyClips(review):[{name:review.name,media,startSecond:(clock.start-(media?.videoStartUtc??clock.start))/1000,endSecond:(clock.end-(media?.videoStartUtc??clock.start))/1000,offset:0,duration:clock.duration}];
   clips=clips.map(c=>{let ownedUrl;const getSource=async()=>{let file;if(c.media?.workspace)file=await workspaceMedia(c.media);else file=await loadVideo(c.media?.id);if(!file)throw Error('Vuelve a seleccionar el vídeo de «'+c.name+'».');if(file.close)players.push(file);return file.url?{url:file.url}:{blob:file.file||file};};return {...c,getSource,release:()=>{if(ownedUrl){URL.revokeObjectURL(ownedUrl);ownedUrl=null;}},getUrl:async()=>{const source=await getSource();if(source.url)return source.url;const url=URL.createObjectURL(source.blob);urls.push(url);ownedUrl=url;return url;}};});
   const durations=[];for(const clip of clips){const source=await clip.getSource();durations.push(await movieSourceDuration(source));}
   const originalDuration=clips.reduce((sum,c)=>sum+c.duration,0);clips=trimMovieClips(clips,durations);const exportedDuration=clips.reduce((sum,c)=>sum+c.duration,0),trimmed=exportedDuration<originalDuration-.15;
   const trimNote=trimmed?t(' · GPXaren eta bideoaren zati komuna soilik. Jatorrizkoak ez dira aldatu.',' · Solo el tramo común entre GPX y vídeo. Los originales no se han modificado.'):'';
   const captions=(review.incidents||[]).filter(i=>i.showInVideo!==false).map(i=>({...i,second:Number.isFinite(i.time)?(i.time-clock.start)/1000:(i.fraction||0)*clock.duration}));
   if(exportMode==='fast')composition=await fastComposition(composition,review,language);
   composition={...composition,...(secondApi.current?.createExport()||{}),hud:second=>gpsHud(review,second,language,gpsFields,clock)};
   const blob=exportMode==='fast'?await createFastMovie({clips,incidents:captions,composition,sink,signal:controller.signal,onProgress:(fraction,stats)=>{setExportProgress(fraction);setExportSpeed(stats.seconds/Math.max(.01,stats.elapsed));}}):await createSequenceMovie({videoElement:videoRef.current,clips,incidents:captions,composition,audioContext:exportAudio,sink,narration,isImagePaused:()=>imagePausedRef.current,onProgress:(fraction,sourceSecond)=>{setExportProgress(fraction);const sourceFraction=sourceSecond/clock.duration;onProgress(sourceFraction);if(!composition.prepareFrame)onMovieFrame?.(sourceFraction);},signal:controller.signal});
   if(blob.saved)setMessage(t('MP4 diskoan gordeta: ','MP4 guardado en disco: ')+blob.name+trimNote);else{const url=URL.createObjectURL(blob);resultRef.current=url;setResult(url);if(trimmed)setMessage(trimNote.slice(3));}
  }catch(e){await sink?.abort().catch(()=>{});setMessage(e.name==='AbortError'?t('Esportazioa bertan behera.','Exportación cancelada.'):e.message);}finally{await Promise.all(players.map(p=>p.close()));urls.forEach(url=>URL.revokeObjectURL(url));setExporting(false);imagePausedRef.current=false;setImagePaused(false);exportAbort.current=null;}
 };
 const targetTime=clock.timed&&position.time!=null?(position.time-(media?.videoStartUtc??clock.start))/1000:null;
 const outside=targetTime==null||targetTime<0||targetTime>duration;
 useEffect(()=>{
  const video=videoRef.current;if(!video||!videoUrl||calibrating||exporting)return;
  if(!clock.timed||outside){video.pause();return;}
  video.playbackRate=Math.max(.1,Math.min(4,speed));
  if(Number.isFinite(targetTime)&&(!playing||Math.abs(video.currentTime-targetTime)>.35))video.currentTime=Math.min(duration,Math.max(0,targetTime));
  if(playing){video.play().catch(()=>{onPlaying(false);setMessage(t('Sakatu erreproduzitu bideoa aktibatzeko.','Pulsa reproducir para activar el vídeo.'));});}else video.pause();
 },[videoUrl,targetTime,playing,speed,calibrating,outside,duration,clock.timed,exporting]);
 useEffect(()=>{const video=videoRef.current;return()=>{if(video)releaseMovieVideo(video).catch(()=>{});};},[videoUrl]);
 const importVideo=async e=>{
  const file=e.target.files?.[0];if(!file)return;onPlaying(false);
  try{const id=crypto.randomUUID();let stored=false;await saveVideo(id,file);stored=true;updateMedia({id,name:file.name,stored,size:file.size,layout,videoStartUtc:media?.name===file.name&&media?.size===file.size?media.videoStartUtc:(activePart?.startTime??clock.start)});setMessage(t('Aukeratu une bera bideoan eta ibilbidean, eta sinkronizatu.','Elige el mismo instante en vídeo y recorrido y pulsa sincronizar.'));}
  catch(error){setMessage(t('Ezin izan da bideoa gorde: ','No se pudo guardar el vídeo: ')+error.message);}
  finally{e.target.value='';}
 };
 const align=()=>{if(!clock.timed||!videoRef.current)return;updateMedia({...media,videoStartUtc:position.time-videoRef.current.currentTime*1000});setCalibrating(false);setMessage(t('Sinkronizazioa gordeta. Gorde saioa historia eguneratzeko.','Sincronización guardada. Guarda la sesión para actualizar el historial.'));};
 const mark=()=>{if(!point||live||position.gap)return;onPlaying(false);const incident={id:crypto.randomUUID(),coordinates:[...point.coordinates],pointIndex:position.index,time:position.time??point.time,fraction:progress,videoTime:targetTime!=null&&!outside?targetTime:null,title:t('Gorabehera','Incidencia'),note:''};onReview({...review,incidents:[...review.incidents,incident]});onEditIncident?.(incident);};
 const format=(n,d=1)=>Number.isFinite(n)?n.toFixed(d):'—';
 const zero=review.calibration;
 const force=axis=>point?.gForce&&!position.gap?point.gForce[axis]-(zero?.[axis]||0):null;
 const startDrag=e=>{if(layout==='split'||exporting||!e.target.closest('header')||e.target.closest('button,input,video'))return;drag.current={x:e.clientX,y:e.clientY,corner};e.currentTarget.setPointerCapture(e.pointerId);};
 const moveDrag=e=>{if(!drag.current)return;const box=e.currentTarget,parent=box.parentElement;setCorner({x:Math.max(0,Math.min(parent.clientWidth-box.clientWidth,drag.current.corner.x+e.clientX-drag.current.x)),y:Math.max(0,Math.min(parent.clientHeight-box.clientHeight,drag.current.corner.y+e.clientY-drag.current.y))});};
 return <>
  {!live&&review.points.length>0&&(secondOpen||review.secondaryMedia)&&<SecondaryPip review={review} onReview={onReview} clock={clock} position={position} playing={playing} onPlaying={onPlaying} speed={speed} language={language} exporting={exporting} apiRef={secondApi} onClose={()=>{setSecondOpen(false);onReview({...review,secondaryMedia:null});secondApi.current=null;}}/>}
  {clipOpen&&<ClipEditor review={review} progress={progress} onProgress={onProgress} playing={playing} onPlaying={onPlaying} onRange={setPreviewRange} onClose={()=>{onPlaying(false);setPreviewRange(null);setClipOpen(false);}} onBoard={seed=>{setClipOpen(false);onBoard(seed);}} videoUrl={videoUrl} language={language}/>}
  {!live&&review.points.length>0&&<div className="pip-layout-selector" role="group" aria-label={t('Bideoaren tamaina','Tamaño del vídeo')}><button disabled={exporting} aria-pressed={layout==='large'} onClick={()=>changeLayout('large')}>{t('Handia','Grande')}</button><button disabled={exporting} aria-pressed={layout==='split'} onClick={()=>changeLayout('split')}>{t('Pantaila erdia','Media pantalla')}</button></div>}
  {finalView&&<div className="movie-toolbar"><details className="movie-gps-options"><summary>{t('GPS datuak','Datos GPS')}</summary><fieldset disabled={exporting}><legend>{t('Bideoan ikusgai','Visibles en el vídeo')}</legend><div>{gpsOptions.map(([key,eu,es])=><label key={key}><input type="checkbox" checked={!!gpsFields[key]} onChange={e=>changeGps({...gpsFields,[key]:e.target.checked})}/>{t(eu,es)}</label>)}</div><button type="button" onClick={()=>changeGps({speed:true})}>{t('Abiadura bakarrik','Solo velocidad')}</button><button type="button" onClick={()=>changeGps({})}>{t('Dena ezkutatu','Ocultar todo')}</button></fieldset></details><button disabled={exporting} onClick={()=>{onPlaying(false);setSecondOpen(true);}}>{t("＋ Bigarren bideoa","＋ Segundo vídeo")}</button><button disabled={exporting} onClick={()=>setFinalView(false)}>{t("Itzuli","Volver")}</button><button disabled={exporting} onClick={()=>{if(progress>=1)onProgress(0);onPlaying(!playing);}}>{playing?'Ⅱ':'▶'}</button><button disabled={exporting||position.gap} onClick={mark}>＋ {t("Puntu kritikoa","Punto crítico")}</button><button disabled={exporting} onClick={()=>{movieDoneRef.current=exportMovie();}}>{t("MP4 esportatu","Exportar MP4")}</button>{exporting&&<><span>{Math.round(exportProgress*100)}%{exportMode==='fast'&&exportSpeed>0?' · '+exportSpeed.toFixed(1)+'×':''}</span>{exportMode==='realtime'&&<button onClick={()=>{imagePausedRef.current=!imagePausedRef.current;setImagePaused(imagePausedRef.current);}}>{imagePaused?t('Irudia jarraitu','Reanudar imagen'):t('Irudia pausatu','Pausar imagen')}</button>}<button onClick={()=>exportAbort.current?.abort()}>{t("Utzi","Cancelar")}</button></>}{!exporting&&<label>{t('Esportazioa','Exportación')}<select aria-label={t('Esportazio modua','Modo de exportación')} value={exportMode} onChange={e=>{setExportMode(e.target.value);if(e.target.value==='fast')setNarration(false);}}><option value="fast">{t('Azkarra · mapa finkoa','Rápida · mapa fijo')}</option><option value="realtime">{t('Denbora errealean · mapa mugikorra','Tiempo real · mapa en movimiento')}</option></select></label>}{!exporting&&<label><input type="checkbox" checked={narration} onChange={e=>{setNarration(e.target.checked);if(e.target.checked)setExportMode('realtime');}}/>{t('Azalpena mikrofonoarekin','Narrar con micrófono')}</label>}{result&&!exporting&&<a download="traza-mapa-pip.mp4" href={result}>{t("MP4 deskargatu","Descargar MP4")}</a>}{message&&<p role="status">{message}</p>}<small>{t("Bi moduek maparen inklinazioa, orientazioa eta zooma mantentzen dituzte. Denbora errealean: mapak ibilbideari jarraitzen dio. Azkarra: uneko ikuspegia finkoa da. Mantendu aplikazioa ikusgai.","Ambos modos conservan la inclinación, orientación y zoom del mapa. Tiempo real: sigue el recorrido y permite narrar. Rápida: mantiene fijo el encuadre actual. Se exporta solo el tramo común de GPX y vídeo. Mantén la app visible.")}</small></div>}
  {review.points.length>0&&(!finalView||gpsOptions.some(([key])=>gpsFields[key]))&&<aside className="telemetry-hud" aria-label={t('Telemetria','Telemetría')}>
   {(!finalView||gpsFields.speed)&&<strong>{format(velocity.value)} <small>km/h{velocity.estimated?' ≈':''}</small></strong>}
   {(!finalView||gpsFields.x)&&<div><span>{t('Luzetarakoa','Longitudinal')} X</span><b>{format(force('x'),3)} g</b></div>}
   {(!finalView||gpsFields.y)&&<div><span>{t('Albokoa','Lateral')} Y</span><b>{format(force('y'),3)} g</b></div>}
   {(!finalView||gpsFields.z)&&<div><span>{t('Bertikala','Vertical')} Z</span><b>{format(force('z'),3)} g</b></div>}
   {(!finalView||gpsFields.rotation)&&<div><span>{t('Biraketa','Giro')} Z</span><b>{format(point?.rotation?.z,2)} °/s</b></div>}
   {(!finalView||gpsFields.heading)&&<div><span>{t('Norabidea','Rumbo')}</span><b>{format(point?.heading,0)}°</b></div>}{(!finalView||gpsFields.battery)&&<div><span>{t('Bateria','Batería')}</span><b>{format(point?.battery,0)}%</b></div>}{(!finalView||gpsFields.accuracy)&&<div><span>GPS</span><b>±{format(point?.accuracy)} m</b></div>}
   {(!finalView||gpsFields.speed)&&position.gap&&<small>{t('GPS etenaldia','Hueco en el GPS')}</small>}{(!finalView||gpsFields.time)&&<small>{point?.time!=null?new Date(point.sourceTime??position.time??point.time).toLocaleTimeString(language==='eu'?'eu-ES':'es-ES'):'—'} · {zero?t('Zeroa kenduta','Con cero restado'):t('Datu gordinak','Datos brutos')}</small>}
   {point?.gForce&&!live&&!finalView&&<button onClick={()=>onReview({...review,calibration:zero?null:{...point.gForce}})}>{zero?t('Zeroa kendu','Quitar cero'):t('Zeroa ezarri geldirik','Fijar cero en reposo')}</button>}
  </aside>}
  {!live&&review.points.length>0&&<div className={`review-pip ${layout==='split'?'split':'large'}`} style={layout==='split'?undefined:{left:corner.x,top:corner.y,maxHeight:`calc(100% - ${corner.y+110}px)`}} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}>
   <header><button disabled={exporting} onClick={()=>setSecondOpen(true)}>{t("＋ 2. bideoa","＋ Vídeo 2")}</button><strong>{activePart?activePart.name+' · ':''}Dashcam · {layout==='split'?t('Pantaila erdia','Media pantalla'):t('Mugitu','Mover')}</strong></header>
   {videoUrl?<><video ref={videoRef} src={videoUrl} preload="metadata" muted playsInline controls={calibrating} onLoadedMetadata={e=>setDuration(e.currentTarget.duration)} onError={e=>{onPlaying(false);setMessage(videoDecodeError(e.currentTarget).message);}}/>{outside&&!calibrating&&<p className="video-uncovered">{clock.timed?t('Une honetarako bideorik ez','Sin vídeo para este instante'):t('GPXak ez dauka ordutegi osoa','El GPX no tiene tiempos completos')}</p>}</>:<p>{t('Gehitu dashcam grabazioa','Añade la grabación de dashcam')}</p>}
   <label className="video-upload">{t('Zatiaren bideoa hautatu','Seleccionar vídeo de este tramo')}<input disabled={exporting} aria-label={t('Bideoa hautatu','Seleccionar vídeo')} type="file" accept="video/*,.mp4,.mov" onChange={importVideo}/></label>
   {videoUrl&&<><button className="final-movie-open" onClick={()=>{onPlaying(false);setFinalView(true);}}>{t('Mapa + PIP · MP4','Mapa + PIP · MP4')}</button><small>{media?.name}</small><div className="pip-actions"><button disabled={!clock.timed} onClick={()=>{onPlaying(false);setCalibrating(!calibrating);}}>{t('Sinkronizazioa doitu','Ajustar sincronización')}</button>{calibrating&&<button onClick={align}>{t('Une hau lotu','Vincular este instante')}</button>}<button onClick={()=>{onPlaying(false);updateMedia(null);}}>{t('Kendu','Quitar')}</button></div>{calibrating&&<label>{t('Bideoaren segundoa','Segundo del vídeo')}<input aria-label={t('Bideoaren segundoa','Segundo del vídeo')} type="number" min="0" max={duration} step="0.1" defaultValue={videoRef.current?.currentTime||0} onChange={e=>{if(videoRef.current)videoRef.current.currentTime=Math.max(0,Math.min(duration,Number(e.target.value)));}}/></label>}</>}
   {!clock.timed&&<small>{t('Sinkronizatzeko, puntu guztiek ordu balioduna izan behar dute.','Para sincronizar, todos los puntos deben tener una hora válida.')}</small>}
   {media?.stored===false&&!media?.workspace&&<p>{t('Bideoa ez da lokalean gorde; berriro hautatu beharko duzu aplikazioa irekitzean.','El vídeo no se ha guardado localmente; tendrás que seleccionarlo de nuevo al abrir la app.')}</p>}{message&&<p role="status">{message}</p>}
  </div>}
  {!live&&review.points.length>0&&<div className="review-clock">
   <button className="map-cut-open" onClick={()=>{onPlaying(false);setClipOpen(true);}}>{t("✂ Moztu","✂ Recortar")}</button>
   <button onClick={()=>{if(progress>=1)onProgress(0);onPlaying(!playing);}} aria-label={t(playing?'Gelditu berrikuspena':'Erreproduzitu berrikuspena',playing?'Pausar revisión':'Reproducir revisión')}>{playing?'Ⅱ':'▶'}</button>
   <input aria-label={t('Berrikuspenaren posizioa','Posición de revisión')} type="range" min="0" max="10000" value={Math.round(progress*10000)} onChange={e=>{onPlaying(false);setCalibrating(false);onProgress(Number(e.target.value)/10000);}}/>
   <button disabled={position.gap} onClick={mark}>＋ {t('Puntu kritikoa','Punto crítico')}</button>
   <small>{clock.timed?`${Math.round(progress*clock.duration)} / ${Math.round(clock.duration)} s`:t('Denborarik gabeko puntuak','Puntos sin tiempo')}</small>
  </div>}
 </>;
}
