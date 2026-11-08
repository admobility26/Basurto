import HomeLogo from './HomeLogo.jsx';
import HelpControls from './HelpControls.jsx';
import {registerAutosave,writeChanged,BOARD_DRAFT_KEY,reportAutosave} from './autosave.js';
import {boardMediaFile} from './boardMedia.js';
import {startBoardRecording} from './boardRecording.js';
// SPDX-FileCopyrightText: 2026 Aitor Delgado Martínez · AD Mobility
// SPDX-License-Identifier: LicenseRef-RutasAD-Educational-NonCommercial-1.0
import React,{useEffect,useReducer,useRef,useState,useLayoutEffect} from 'react';
import {createPortal} from 'react-dom';
import './didactic-board.css';

import {emptyBoard,boardReducer,boardDocument,vehicleTypes,shapePoints,positionAlong,vehicleSvg,readBoardCases,saveBoardCases} from './boardModel.js';
import {exportBoard} from './boardExport.js';
const coordinates=point=>[point.lng,point.lat];
const colorOptions=['#f3b73e','#57b9f4','#ed7373'];
const tools=[['pointer','Erakuslea','Puntero','◉'],['move','Mapa mugitu','Mover mapa','✥'],['route','Ibilbidea','Trayectoria','⌁'],['arrow','Gezia','Flecha','↗'],['signal','Seinalea','Señal','⚑'],['note','Puntu kritikoa','Punto conflictivo','!'],['edit','Mugitu / editatu','Mover / editar','✎'],['erase','Ezabatu','Borrar','⌫']];

function updateSources(map,items){
 const features=items.filter(i=>i.points?.length>1).map(i=>({type:'Feature',properties:{id:i.id,color:i.color,width:i.width||5,opacity:i.opacity||1,dash:i.shape==='dash'},geometry:{type:'LineString',coordinates:i.points}}));
 map.getSource('board-lines')?.setData({type:'FeatureCollection',features});
 map.getSource('board-areas')?.setData({type:'FeatureCollection',features:items.filter(i=>i.shape==='area'&&i.points?.length>=4).map(i=>({type:'Feature',properties:{id:i.id,color:i.color,opacity:(i.opacity||1)*.25},geometry:{type:'Polygon',coordinates:[i.points]}}))});
}
function orientVehicle(entry,map,angle=entry.currentAngle??entry.item.angle){
 entry.currentAngle=angle;
 const p=entry.marker.getLngLat(),r=angle*Math.PI/180,a=map.project(p),b=map.project([p.lng+Math.sin(r)*.00001/Math.cos(p.lat*Math.PI/180),p.lat+Math.cos(r)*.00001]);
 const rotation=Math.atan2(b.x-a.x,a.y-b.y)*180/Math.PI;
 entry.element.querySelector('.board-vehicle-body').style.transform=`rotate(${rotation}deg)`;
 const cone=entry.element.querySelector('.board-visibility');if(cone)cone.style.transform=`translate(-50%,-100%) rotate(${rotation}deg)`;
}

// This board owns its map and its in-memory history. It never calls
// project, microphone or recorder APIs. Only an explicit Save persists a case.
export default function DidacticBoard({createMap,Marker,catalog,signalDefinition,signalHtml,SignalFace,arrows,defaultDraft,language,onClose,seed,onSaveTrajectory}){
 const t=(eu,es)=>language==='eu'?eu:es;
 const container=useRef(null),mapRef=useRef(null),ringRef=useRef(null),panelRef=useRef(null),stateRef=useRef(null),draggingRef=useRef(false);
 const [state,dispatch]=useReducer(boardReducer,seed,initial=>initial?.document?{...structuredClone(initial.document),items:structuredClone(initial.document.steps[initial.document.activeStep].items),past:[]}:emptyBoard()),[tool,setTool]=useState(seed?.autosave?.tool||'pointer'),[ready,setReady]=useState(false),[error,setError]=useState('');
 const [draftPath,setDraftPath]=useState(seed?.autosave?.draftPath||null),[selected,setSelected]=useState(seed?.autosave?.selected||null),[editor,setEditor]=useState(seed?.autosave?.editor||null),[signal,setSignal]=useState({...defaultDraft,signalCode:'R-2',title:''});
 const [color,setColor]=useState(colorOptions[0]),[locating,setLocating]=useState(false),[view,setView]=useState({lat:'',lng:''});
 const markersRef=useRef([]),arrowTipsRef=useRef([]),vehicleMarkersRef=useRef(new Map()),playbackRef=useRef({}),animationRef=useRef(0),drawingRef=useRef(null),suppressClickRef=useRef(0);
 const [group,setGroup]=useState(seed?.autosave?.group||'basic'),[presenting,setPresenting]=useState(false),[answerVisible,setAnswerVisible]=useState(false),[,setPlaybackVersion]=useState(0);
 const [vehicle,setVehicle]=useState({vehicleType:'car',size:88,angle:0}),[drawing,setDrawing]=useState({shape:'free',width:6,opacity:1}),[modal,setModal]=useState(null),[caseName,setCaseName]=useState(seed?.autosave?.caseName||''),[caseId,setCaseId]=useState(seed?.autosave?.caseId||null),[cases,setCases]=useState([]),[message,setMessage]=useState(''),[exporting,setExporting]=useState(false);
 const step=state.steps[state.activeStep],showSignals=step.showSignals!==false;
 const recordingRef=useRef(null),captureState=useRef(null),recordingUrlRef=useRef(''),pausedVehicles=useRef([]);
 const [capturing,setCapturing]=useState(false),[captureBusy,setCaptureBusy]=useState(false),[capturePaused,setCapturePaused]=useState(false),[withVoice,setWithVoice]=useState(true),[captureSeconds,setCaptureSeconds]=useState(0),[recordingUrl,setRecordingUrl]=useState('');
 captureState.current={map:mapRef.current,items:state.items,markers:markersRef.current,name:caseName||t('Klaseko azalpena','Explicación en clase'),step,answerVisible,showSignals,signalDefinition,signalHtml,pointer:ringRef.current,video:panelRef.current?.querySelector('.board-clip video')};
 const showRecording=blob=>{if(recordingUrlRef.current)URL.revokeObjectURL(recordingUrlRef.current);recordingUrlRef.current=blob?URL.createObjectURL(blob):'';setRecordingUrl(recordingUrlRef.current);};
 const beginCapture=async()=>{if(!window.basurtoCanCreateVideos)return;finalRecordingRef.current=null;setCaptureBusy(true);setError('');try{const controller=await startBoardRecording({snapshot:()=>({...captureState.current,map:mapRef.current,markers:markersRef.current,pointer:ringRef.current,video:panelRef.current?.querySelector('.board-clip video'),gps:panelRef.current?.querySelector('.board-real-gps')}),withAudio:withVoice,onSeconds:setCaptureSeconds,onError:e=>{setError(e.message);setCapturePaused(true);}});recordingRef.current=controller;setCapturing(true);setCapturePaused(false);setCaptureSeconds(0);controller.done.then(result=>{const meta={name:result.name,seconds:result.seconds,withAudio:result.withAudio,...(result.mediaId?{mediaId:result.mediaId}:{}),...(result.nativeFile?{nativeFile:true}:{}),createdAt:new Date().toISOString()};finalRecordingRef.current=meta;dispatch({type:'recording',value:meta});showRecording(result.file||result.blob);setMessage(t('Grabazioa prest. Gorde azalpena edo ibilbide-proiektua.','Grabación preparada. Guarda la explicación o el proyecto de trayectoria.'));}).catch(e=>setError(e.message)).finally(()=>{setCapturing(false);setCapturePaused(false);recordingRef.current=null;});}catch(e){if(e.name!=='AbortError')setError(e.message);}finally{setCaptureBusy(false);}};
 const openRecording=async()=>{setModal('recording');if(recordingUrl)return;try{if(state.recording?.nativeFile&&window.elorrietaDesktop){const url='basurto-routes://app/__recordings/'+encodeURIComponent(state.recording.name);const response=await fetch(url,{method:'HEAD'});if(response.ok)setRecordingUrl(url);else throw Error('No se encuentra el MP4 guardado. Selecciona su ubicación actual.');}else{const file=await boardMediaFile(state.recording?.mediaId);if(file)showRecording(file);}}catch(e){setError(e.message);}};
 const stopCapture=()=>recordingRef.current?.stop();
 const pauseCapture=()=>{if(capturePaused){recordingRef.current?.resume();for(const id of pausedVehicles.current){const motion=playbackRef.current[id];if(motion&&state.items.some(i=>i.id===id)){motion.playing=true;motion.last=performance.now();}}pausedVehicles.current=[];if(!animationRef.current&&Object.values(playbackRef.current).some(m=>m.playing))animationRef.current=requestAnimationFrame(animate);setCapturePaused(false);}else{pausedVehicles.current=Object.entries(playbackRef.current).filter(([,m])=>m.playing).map(([id])=>id);pauseMotion();recordingRef.current?.pause();setCapturePaused(true);}};
 useEffect(()=>()=>{recordingRef.current?.cancel();if(recordingUrlRef.current)URL.revokeObjectURL(recordingUrlRef.current);},[]);
 const saveTrajectory=()=>{try{if(capturing||captureBusy)throw Error(t('Lehenik grabazioa amaitu.','Finaliza primero la grabación.'));if(!caseName.trim())throw Error(t('Idatzi proiektuaren izena.','Escribe un nombre para el proyecto.'));onSaveTrajectory?.(caseName.trim(),boardDocument(state),readView());setMessage(t('Ibilbide-proiektu independentea liburutegian gordeta.','Proyecto de trayectoria independiente guardado en la biblioteca.'));setModal(null);}catch(e){setError(e.message);}};

 const setShowSignals=value=>dispatch({type:'step-field',field:'showSignals',value});
 const stopMotion=()=>{cancelAnimationFrame(animationRef.current);animationRef.current=0;playbackRef.current={};setPlaybackVersion(v=>v+1);};
 const changeStep=index=>{if(index<0||index>=state.steps.length)return;stopMotion();drawingRef.current=null;setDraftPath(null);setSelected(null);setEditor(null);setAnswerVisible(false);dispatch({type:'navigate',index});};
 const modifyStep=action=>{stopMotion();drawingRef.current=null;setDraftPath(null);setSelected(null);setEditor(null);setAnswerVisible(false);dispatch(action);};
 const pauseMotion=()=>{for(const motion of Object.values(playbackRef.current))motion.playing=false;setPlaybackVersion(v=>v+1);};
 const beginTool=next=>{pauseMotion();setMessage('');selectTool(next);};
 const updateSelected=patch=>{pauseMotion();delete playbackRef.current[selected];commit(items=>items.map(i=>i.id===selected?{...i,...patch}:i));};
 const selectedVehicle=state.items.find(i=>i.id===selected&&i.type==='vehicle');
 const routes=state.items.filter(i=>['route','arrow'].includes(i.type)&&i.points?.length>1);
 const openCases=()=>{try{setError('');setCases(readBoardCases());setModal('library');}catch(e){setError(e.message);}};
 const readView=()=>{const map=mapRef.current,p=map.getCenter();return {center:[p.lng,p.lat],zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch()};};
 const boardSaveRef=useRef(null),finalRecordingRef=useRef(null),discardedRef=useRef(false);
 const checkpointBoard=()=>{if(discardedRef.current)return;const document=boardDocument(state);if(finalRecordingRef.current)document.recording=finalRecordingRef.current;const drawing=drawingRef.current;if(drawing?.points.length>1&&!document.steps[document.activeStep].items.some(i=>i.id===drawing.id))document.steps[document.activeStep].items.push(structuredClone(drawing));writeChanged(BOARD_DRAFT_KEY,{version:1,document,caseName,caseId,editor,draftPath,selected,tool,group,view:mapRef.current?readView():seed?.view||null});};
 boardSaveRef.current=checkpointBoard;
 useEffect(()=>registerAutosave('board',{checkpoint:()=>boardSaveRef.current(),busy:()=>!!recordingRef.current||captureBusy,finish:async()=>{if(recordingRef.current){await recordingRef.current.stop();boardSaveRef.current();}}}),[captureBusy]);
 useLayoutEffect(()=>{try{checkpointBoard();}catch(e){setError(e.message);reportAutosave('error',e.message);}},[state.steps,state.activeStep,state.recording,caseName,caseId,editor,draftPath,selected,tool,group]);
 useEffect(()=>{if(!ready)return;const map=mapRef.current,save=()=>{try{boardSaveRef.current();}catch(e){reportAutosave('error',e.message);}};map.on('moveend',save);return()=>map.off('moveend',save);},[ready]);
 const saveCase=(asNew=false)=>{try{if(!caseName.trim())return;const previous=readBoardCases(),id=(!asNew&&caseId)||crypto.randomUUID(),entry={id,name:caseName.trim(),updatedAt:new Date().toISOString(),view:readView(),document:boardDocument(state)};if(!previous.some(c=>c.id===id)&&previous.length>=60)throw Error(t('Gehienez 60 azalpen gorde daitezke.','Puedes guardar hasta 60 explicaciones.'));saveBoardCases([...previous.filter(c=>c.id!==id),entry]);setCaseId(id);setModal(null);setMessage(t('Azalpena gordeta.','Explicación guardada.'));}catch(e){setError(e.message);}};
 const loadCase=entry=>{if(capturing||captureBusy){setError(t('Lehenik grabazioa amaitu.','Finaliza primero la grabación.'));return;}if(state.items.length&&!confirm(t('Uneko pizarra ordezkatu? Gorde gabeko aldaketak galduko dira.','¿Sustituir la pizarra actual? Se perderán los cambios no guardados.')))return;finalRecordingRef.current=null;showRecording(null);stopMotion();dispatch({type:'replace',document:structuredClone(entry.document)});setCaseId(entry.id);setCaseName(entry.name);setModal(null);setSelected(null);setDraftPath(null);setEditor(null);setAnswerVisible(false);if(entry.view?.center?.length===2&&entry.view.center.every(Number.isFinite)&&Math.abs(entry.view.center[0])<=180&&Math.abs(entry.view.center[1])<=85&&Number.isFinite(entry.view.zoom))mapRef.current?.jumpTo({center:entry.view.center,zoom:Math.max(0,Math.min(22,entry.view.zoom)),bearing:Number(entry.view.bearing)||0,pitch:Math.max(0,Math.min(60,Number(entry.view.pitch)||0))});setMessage(t('Azalpena berreskuratuta.','Explicación recuperada.'));};
 const doExport=async format=>{setExporting(true);setError('');for(const motion of Object.values(playbackRef.current))motion.playing=false;setPlaybackVersion(v=>v+1);try{await exportBoard({map:mapRef.current,items:state.items,markers:markersRef.current,name:caseName||t('Arbel didaktikoa','Pizarra didáctica'),step,answerVisible,showSignals,signalDefinition,signalHtml,format});setModal(null);setMessage(t('Esportazioa prest.','Exportación preparada.'));}catch(e){setError(e.message);}finally{setExporting(false);}};
 useEffect(()=>{const bar=panelRef.current.querySelector('.board-tools');const measure=()=>panelRef.current?.style.setProperty('--board-tools-bottom',`${bar.offsetTop+bar.offsetHeight+12}px`);const resize=new ResizeObserver(measure);resize.observe(bar);measure();return()=>resize.disconnect();},[]);
 stateRef.current={items:state.items,tool:presenting?'pointer':tool,draftPath,selected,signal,color,editor,vehicle,drawing,exporting,activeStep:state.activeStep};
 const commit=items=>dispatch({type:'set',items});
 const selectTool=next=>{setTool(next);setLocating(false);if(ringRef.current)ringRef.current.hidden=true;};
 const remove=id=>{pauseMotion();delete playbackRef.current[id];commit(items=>items.filter(i=>i.id!==id).map(i=>i.routeId===id?{...i,routeId:null}:i));setSelected(null);setDraftPath(null);};
 const close=()=>{if(capturing||captureBusy){setError(t('Lehenik grabazioa amaitu eta gorde.','Finaliza y guarda la grabación antes de salir.'));return;}if(state.steps.some(s=>s.items.length||s.question||s.answer)&&!confirm(t('Pizarra itxi eta behin-behineko elementuak baztertu?','¿Salir de la pizarra y descartar los elementos temporales?')))return;discardedRef.current=true;localStorage.removeItem(BOARD_DRAFT_KEY);onClose();};
 const closeRef=useRef(close);closeRef.current=close;

 useEffect(()=>{
  const root=document.getElementById('root'),previous=document.activeElement,wasInert=root?.inert;
  if(root)root.inert=true;
  const key=event=>{
   if(event.key==='Escape'){event.preventDefault();if(stateRef.current.exporting)return;if(panelRef.current.querySelector('.board-modal'))setModal(null);else if(stateRef.current.editor)setEditor(null);else closeRef.current();}
   if(event.key==='Tab'){
    const focusRoot=panelRef.current.querySelector('.board-modal-card')||panelRef.current;const nodes=[...focusRoot.querySelectorAll('button:not(:disabled),input,select,textarea')].filter(e=>e.getClientRects().length);
    const first=nodes[0],last=nodes.at(-1);
    if(!focusRoot.contains(document.activeElement)){event.preventDefault();first?.focus();}
    else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }
  };
  const hide=()=>{if(ringRef.current)ringRef.current.hidden=true;};
  window.addEventListener('blur',hide);document.addEventListener('visibilitychange',hide);
  document.addEventListener('keydown',key);
  panelRef.current.querySelector('button')?.focus();
  return()=>{cancelAnimationFrame(animationRef.current);window.removeEventListener('blur',hide);document.removeEventListener('visibilitychange',hide);document.removeEventListener('keydown',key);if(root)root.inert=wasInert;previous?.focus();};
 },[]);
 useEffect(()=>{if(!modal)return;if(ringRef.current)ringRef.current.hidden=true;const previous=document.activeElement,frame=requestAnimationFrame(()=>panelRef.current?.querySelector('.board-modal-card input,.board-modal-card button')?.focus());return()=>{cancelAnimationFrame(frame);previous?.focus();};},[modal]);

 useEffect(()=>{
  let map;
  try{map=createMap(container.current);mapRef.current=map;}catch(e){setError(e.message);return;}
  const load=()=>{
   map.addSource('board-lines',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
   map.addSource('board-areas',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
   map.addLayer({id:'board-areas',type:'fill',source:'board-areas',paint:{'fill-color':['get','color'],'fill-opacity':['get','opacity']}});
   map.addLayer({id:'board-outline',type:'line',source:'board-lines',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#163b30','line-width':['+',4,['get','width']],'line-opacity':['get','opacity']}});
   map.addLayer({id:'board-lines',type:'line',source:'board-lines',layout:{'line-cap':'round','line-join':'round'},filter:['!=',['get','dash'],true],paint:{'line-color':['get','color'],'line-width':['get','width'],'line-opacity':['get','opacity']}});
   map.addLayer({id:'board-dashes',type:'line',source:'board-lines',filter:['==',['get','dash'],true],paint:{'line-color':['get','color'],'line-width':['get','width'],'line-opacity':['get','opacity'],'line-dasharray':[2,2]}});
   if(seed?.autosave?.view?.center?.length===2&&seed.autosave.view.center.every(Number.isFinite)){map.jumpTo(seed.autosave.view);}else if(seed?.document?.sourceClip?.points.length){const ps=seed.document.sourceClip.points;const bounds=ps.reduce((b,p)=>[[Math.min(b[0][0],p.coordinates[0]),Math.min(b[0][1],p.coordinates[1])],[Math.max(b[1][0],p.coordinates[0]),Math.max(b[1][1],p.coordinates[1])]],[[180,85],[-180,-85]]);map.fitBounds(bounds,{padding:100,maxZoom:18,duration:0});}
   setReady(true);
  };
  map.on('load',load);
  const click=event=>{
   if(draggingRef.current||Date.now()<suppressClickRef.current||!map.getLayer('board-lines'))return;
   const s=stateRef.current,point=coordinates(event.lngLat);if(s.editor)return;
   if(['move','pointer','draw'].includes(s.tool))return;
   const hit=map.queryRenderedFeatures(event.point,{layers:['board-lines','board-dashes','board-areas']})[0];
   if(s.tool==='erase'){if(hit)remove(hit.properties.id);return;}
   if(s.tool==='edit'){if(hit)setSelected(hit.properties.id);return;}
   if(s.tool==='route'||s.tool==='arrow'){
    const active=s.items.find(i=>i.id===s.draftPath&&i.type===s.tool);
    if(active){commit(items=>items.map(i=>i.id===active.id?{...i,points:[...i.points,point]}:i));if(s.tool==='arrow'){setDraftPath(null);}}
    else {const id=crypto.randomUUID();commit(items=>[...items,{id,type:s.tool,points:[point],color:s.color}]);setDraftPath(id);setSelected(id);}
   }else if(s.tool==='vehicle'){
    const id=crypto.randomUUID(),count=s.items.filter(i=>i.type==='vehicle').length;commit(items=>[...items,{id,type:'vehicle',coordinates:point,...s.vehicle,color:s.vehicle.color||colorOptions[count%colorOptions.length],label:String.fromCharCode(65+count%26),duration:10,visibility:false,visibilityAngle:70}]);setSelected(id);
   }else if(s.tool==='signal'){
    const id=crypto.randomUUID();commit(items=>[...items,{...structuredClone(s.signal),id,type:'signal',coordinates:point,phase:'red'}]);setSelected(id);
   }else if(s.tool==='note'){
    setEditor({id:crypto.randomUUID(),type:'note',coordinates:point,title:'',description:''});
   }
  };
  map.on('click',click);
  const canvas=map.getCanvas();
  const pointOf=e=>{const rect=canvas.getBoundingClientRect(),p=map.unproject([e.clientX-rect.left,e.clientY-rect.top]);return [p.lng,p.lat];};
  const drawStart=e=>{const s=stateRef.current;if(s.tool!=='draw'||s.editor||e.button>0)return;e.preventDefault();drawingRef.current={id:crypto.randomUUID(),type:'drawing',points:[pointOf(e)],startCoordinates:pointOf(e),color:s.color,...s.drawing};canvas.setPointerCapture(e.pointerId);};
  const drawMove=e=>{const draft=drawingRef.current;if(!draft)return;e.preventDefault();const p=pointOf(e),previous=map.project(draft.points.at(-1)),next=map.project(p);if(draft.shape==='free'){if(Math.hypot(next.x-previous.x,next.y-previous.y)<3||draft.points.length>=5000)return;draft.points.push(p);}else draft.points=shapePoints(draft.shape,draft.startCoordinates,p,map);updateSources(map,[...stateRef.current.items,draft]);};
  const drawEnd=e=>{const draft=drawingRef.current;if(!draft)return;drawingRef.current=null;suppressClickRef.current=Date.now()+400;if(e.type!=='pointercancel'&&draft.points.length>1)commit(items=>[...items,draft]);else updateSources(map,stateRef.current.items);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);};
  canvas.addEventListener('pointerdown',drawStart);canvas.addEventListener('pointermove',drawMove);canvas.addEventListener('pointerup',drawEnd);canvas.addEventListener('pointercancel',drawEnd);
  map.on('move',()=>{for(const entry of vehicleMarkersRef.current.values())orientVehicle(entry,map);for(const tip of arrowTipsRef.current){const a=map.project(tip.previous),b=map.project(tip.last);tip.element.style.transform=`rotate(${Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI}deg)`;}});
  map.on('error',event=>{if(event.error?.message)setError(event.error.message);});
  const resize=new ResizeObserver(()=>map.resize());resize.observe(container.current);
  return()=>{canvas.removeEventListener('pointerdown',drawStart);canvas.removeEventListener('pointermove',drawMove);canvas.removeEventListener('pointerup',drawEnd);canvas.removeEventListener('pointercancel',drawEnd);resize.disconnect();markersRef.current.forEach(m=>m.remove());markersRef.current=[];mapRef.current=null;map.remove();};
 },[]);

 useEffect(()=>{
  const map=mapRef.current;if(!map)return;
  for(const name of ['dragPan','scrollZoom','boxZoom','dragRotate','keyboard','doubleClickZoom','touchZoomRotate','touchPitch']){
   if(tool==='move'&&!editor&&!presenting)map[name]?.enable();else map[name]?.disable();
  }
  map.getCanvas().style.cursor=tool==='move'?'grab':tool==='pointer'?'default':'crosshair';
 },[ready,tool,editor,presenting]);

 useEffect(()=>{
  const map=mapRef.current;if(!ready||!map)return;
  updateSources(map,state.items);
  markersRef.current.forEach(m=>m.remove());markersRef.current=[];arrowTipsRef.current=[];vehicleMarkersRef.current.clear();
  const add=(element,point,draggable,onDragEnd)=>{
   const marker=new Marker({element,draggable,anchor:'center'}).setLngLat(point).addTo(map);
   marker.on('dragstart',()=>{draggingRef.current=true;});
   marker.on('dragend',()=>{onDragEnd?.(coordinates(marker.getLngLat()));setTimeout(()=>{draggingRef.current=false;},0);});
   markersRef.current.push(marker);return marker;
  };
  for(const item of state.items){
   if(item.points){
    if(!presenting&&item.id===selected&&(tool==='edit'||item.id===draftPath))item.points.forEach((p,index)=>{
     const element=document.createElement('button');element.type='button';element.className='board-vertex';element.textContent=String(index+1);element.setAttribute('aria-label',t(`Ibilbideko ${index+1}. puntua`,`Punto ${index+1} de la pizarra`));
     element.onclick=e=>{e.stopPropagation();if(draggingRef.current)return;if(tool==='edit')setEditor({type:'vertex',pathId:item.id,index});};
     add(element,p,tool==='edit',next=>commit(items=>items.map(i=>i.id===item.id?{...i,points:i.points.map((p,n)=>n===index?next:p)}:i)));
    });
    if((item.type==='arrow'||['arrow','curve'].includes(item.shape))&&item.points.length>1){
     const last=item.points.at(-1),a=map.project(item.points.at(-2)),b=map.project(last),angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
     const element=document.createElement('div');element.className='board-arrow-tip';const tip=document.createElement('span');tip.style.transform=`rotate(${angle}deg)`;tip.style.borderLeftColor=item.color;element.append(tip);arrowTipsRef.current.push({element:tip,previous:item.points.at(-2),last});element.setAttribute('aria-hidden','true');add(element,last,false);
    }
    continue;
   }
   if(item.type==='signal'&&!showSignals)continue;
   const element=document.createElement('button');element.type='button';element.className=`board-map-item board-${item.type}`;element.dataset.itemId=item.id;
   element.setAttribute('aria-label',item.type==='vehicle'?`${t('Ibilgailua','Vehículo')} ${item.label}`:item.type==='signal'?`${item.signalCode} · ${signalDefinition(item.signalCode).name}`:item.title||t('Puntu kritikoa','Punto conflictivo'));
   if(item.type==='vehicle'){element.style.width=`${item.size}px`;element.style.height=`${item.size*1.15}px`;element.innerHTML=`<span class="board-vehicle-body">${vehicleSvg(item)}</span>`;element.dataset.selected=String(item.id===selected);if(item.visibility){const cone=document.createElement('span');cone.className='board-visibility';const a=Math.max(20,Math.min(140,item.visibilityAngle||70))*Math.PI/360,x=Math.sin(a)*140,y=145-Math.cos(a)*140;cone.innerHTML=`<svg viewBox="0 0 300 160" aria-hidden="true"><path d="M150 145 L${150-x} ${y} Q150 -10 ${150+x} ${y} Z"/></svg>`;element.prepend(cone);}}
   else if(item.type==='signal'){element.innerHTML=`<div class="signal-face-wrap">${signalHtml(item)}</div>`;element.dataset.phase=item.phase||'red';}
   else {element.textContent='!';}
   element.onclick=e=>{
    e.stopPropagation();if(draggingRef.current)return;
    if(tool==='erase'&&!presenting)remove(item.id);
    else if(item.type==='vehicle'){setSelected(item.id);if(!presenting){setGroup('vehicles');setTool('vehicle');}}
    else if(tool==='edit'&&!presenting)setEditor(structuredClone(item));
    else if(item.signalCode==='SEMÁFORO')commit(items=>items.map(i=>i.id===item.id?{...i,phase:{red:'amber',amber:'green',green:'blink',blink:'off',off:'red'}[i.phase||'red']}:i));
    else setSelected(item.id);
   };
   const marker=add(element,item.coordinates,!presenting&&(tool==='edit'||(item.type==='vehicle'&&tool==='vehicle')),point=>{stopMotion();commit(items=>items.map(i=>i.id===item.id?{...i,coordinates:point}:i));});marker.boardItemId=item.id;
   if(item.type==='vehicle'){const entry={marker,element,item};vehicleMarkersRef.current.set(item.id,entry);marker.on('dragstart',()=>{const motion=playbackRef.current[item.id];if(motion){motion.playing=false;setPlaybackVersion(v=>v+1);}});orientVehicle(entry,map);const motion=playbackRef.current[item.id],route=state.items.find(r=>r.id===item.routeId);if(motion&&route?.points.length>1){const p=positionAlong(route.points,motion.progress);marker.setLngLat(p.coordinates);orientVehicle(entry,map,p.angle);}}
  }
 },[ready,state.items,tool,selected,draftPath,presenting,showSignals]);

 const hints={vehicle:t('Sakatu ibilgailu bat jartzeko; arrastatu birkokatzeko.','Pulsa para colocar un vehículo; arrástralo para recolocarlo.'),draw:t('Marraztu saguarekin, hatzarekin edo arkatzarekin.','Dibuja con ratón, dedo o lápiz.'),pointer:t('Seinalatu mapan. Sakatu semaforoa kolorea aldatzeko.','Señala sobre el mapa. Toca un semáforo para cambiar su color.'),move:t('Kokatu mapa azaldu nahi duzun lekuan.','Desplaza y acerca el mapa al lugar que quieras explicar.'),route:t('Sakatu puntuak gehitzeko; bukatutakoan amaitu trazua.','Pulsa para añadir puntos; termina el trazo cuando esté listo.'),arrow:t('Sakatu geziaren hasiera eta amaiera.','Pulsa el inicio y el final de la flecha.'),signal:t('Sakatu mapan hautatutako seinalea jartzeko.','Pulsa en el mapa para colocar la señal elegida.'),note:t('Sakatu puntu kritikoa kokatzeko.','Pulsa para situar el punto conflictivo.'),edit:t('Arrastatu elementuak; sakatu seinalea editatzeko edo trazua puntuak mugitzeko.','Arrastra elementos. Pulsa señales o trazos para editarlos.'),erase:t('Sakatu elementua edo trazua ezabatzeko.','Pulsa un elemento o un trazo para borrarlo.')};
 const selectedItem=state.items.find(i=>i.id===selected);
 const pointerMove=event=>{
  const ring=ringRef.current;if(!ring)return;
  if((tool!=='pointer'&&!presenting)||editor||modal||event.target.closest('.board-ui,.maplibregl-control-container,.mapboxgl-control-container')){ring.hidden=true;return;}
  const rect=container.current.getBoundingClientRect();ring.hidden=false;ring.style.left=(event.clientX-rect.left)+'px';ring.style.top=(event.clientY-rect.top)+'px';
 };
 const animate=time=>{
  let active=false;for(const [id,motion] of Object.entries(playbackRef.current)){
   if(!motion.playing)continue;const item=stateRef.current.items.find(i=>i.id===id),route=stateRef.current.items.find(i=>i.id===item?.routeId),entry=vehicleMarkersRef.current.get(id);
   if(!entry||!route?.points?.length){motion.playing=false;continue;}
   motion.progress=Math.min(1,motion.progress+Math.min(100,time-motion.last)/((item.duration||10)*1000));motion.last=time;
   const position=positionAlong(route.points,motion.progress);entry.marker.setLngLat(position.coordinates);orientVehicle(entry,mapRef.current,position.angle);
   if(motion.progress>=1){motion.playing=false;setPlaybackVersion(v=>v+1);}else active=true;
  }if(active)animationRef.current=requestAnimationFrame(animate);else animationRef.current=0;
 };
 const toggleVehicle=id=>{
  if(capturing&&capturePaused){setMessage(t('Lehenik irudia berrabiarazi. Ahotsa grabatzen jarraitzen du.','Reanuda primero la imagen. La voz sigue grabándose.'));return;}
  const item=state.items.find(i=>i.id===id),route=state.items.find(i=>i.id===item?.routeId);if(!route?.points?.length)return;
  const motion=playbackRef.current[id]||{progress:0,playing:false,last:performance.now()};if(motion.progress>=1)motion.progress=0;motion.playing=!motion.playing;motion.last=performance.now();playbackRef.current[id]=motion;
  setPlaybackVersion(v=>v+1);if(motion.playing&&!animationRef.current)animationRef.current=requestAnimationFrame(animate);
 };
 const stepTitle=(entry,n)=>entry.name||t(`Urratsa ${n+1}`,`Paso ${n+1}`);
 const editField=(key,value)=>setEditor(previous=>({...previous,[key]:value}));
 const signalFields=(value,update)=><>
  <label>{t('Seinalearen katalogoa','Señal del catálogo')}<select aria-label={t('Seinalearen katalogoa','Señal del catálogo')} value={value.signalCode} onChange={e=>{const code=e.target.value;update({...value,signalCode:code,title:signalDefinition(code).name});}}>{catalog.map(s=><option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}</select></label>
  <SignalFace marker={value}/>
  {value.signalCode==='SEMÁFORO'&&value.type!=='signal-template'&&<label>{t('Semaforoaren egoera','Estado del semáforo')}<select aria-label={t('Semaforoaren egoera','Estado del semáforo')} value={value.phase||'red'} onChange={e=>update({...value,phase:e.target.value})}>{[['red','Gorria','Rojo'],['amber','Anbarra','Ámbar'],['green','Berdea','Verde'],['blink','Anbar keinukaria','Ámbar intermitente'],['off','Itzalita','Apagado']].map(([id,eu,es])=><option key={id} value={id}>{t(eu,es)}</option>)}</select></label>}
  {signalDefinition(value.signalCode).kind==='speed'&&<label>{t('Gehieneko abiadura','Velocidad máxima')}<input type="number" min="10" max="120" step="10" required value={value.speed||''} onChange={e=>update({...value,speed:e.target.value})} placeholder="km/h"/></label>}
  {signalDefinition(value.signalCode).kind==='direction'&&<>
   {value.signalCode==='S-220a'&&<label>{t('Distantzia','Distancia')}<input value={value.distance||''} maxLength={20} onChange={e=>update({...value,distance:e.target.value})}/></label>}
   {(value.destinations||[]).map((d,n)=><div className="board-destination" key={n}><label>{t('Helmuga','Destino')} {n+1}<input value={d.text} maxLength={32} onChange={e=>update({...value,destinations:value.destinations.map((x,j)=>j===n?{...x,text:e.target.value}:x)})}/></label><label>{t('Norabidea','Dirección')}<select value={d.arrow} onChange={e=>update({...value,destinations:value.destinations.map((x,j)=>j===n?{...x,arrow:e.target.value}:x)})}>{arrows.map(a=><option key={a.value} value={a.value}>{a.icon} {a.label}</option>)}</select></label><button type="button" aria-label={t('Helmuga kendu','Quitar destino')+` ${n+1}`} disabled={value.destinations.length<=1} onClick={()=>update({...value,destinations:value.destinations.filter((_,j)=>j!==n)})}>×</button></div>)}
   <button type="button" disabled={value.destinations.length>=6} onClick={()=>update({...value,destinations:[...(value.destinations||[]),{text:'',arrow:'right'}]})}>{t('Helmuga gehitu','Añadir destino')}</button>
  </>}
 </>;
 return createPortal(<section ref={panelRef} className={`didactic-board ${presenting?'board-presenting':''}`} role="dialog" aria-modal="true" aria-label={t('Arbel didaktikoa','Pizarra didáctica')}>
  <header className="board-header"><div className="board-institution-title"><HomeLogo language={language}/><div><strong>Basurto Recorridos <span>/ {t('Arbel didaktikoa','Pizarra didáctica')}</span></strong><small>{caseId?caseName:t('Autogordetzea · proiektutik bereizita','Autoguardado · independiente del proyecto')}</small></div></div><div className="board-header-actions board-ui"><HelpControls language={language}/><button disabled={capturing||captureBusy} onClick={openCases}>{t('Azalpenak','Mis explicaciones')}</button><button disabled={capturing||captureBusy} onClick={()=>{setModal('save');if(!caseName)setCaseName(t('Azalpen berria','Nueva explicación'));}}>{t('Gorde azalpena','Guardar explicación')}</button><button aria-pressed={presenting} onClick={()=>{setPresenting(!presenting);setEditor(null);setLocating(false);setDraftPath(null);}}>{presenting?t('Arbela editatu','Editar pizarra'):t('Aurkeztu','Presentar')}</button><button onClick={close}>{t('Pizarratik irten','Salir de pizarra')}</button></div></header>
  <div className="board-stage" onPointerMove={pointerMove} onPointerLeave={()=>{if(ringRef.current)ringRef.current.hidden=true;}}>
   <div className="board-map" ref={container}/>

   <div className="board-pointer" ref={ringRef} hidden/>
   <nav className="board-tools board-ui" aria-label={t('Arbelaren tresnak','Herramientas de pizarra')}>
    <div className="board-groups">{[['basic','Erakuslea','Puntero'],['vehicles','Ibilgailuak','Vehículos'],['draw','Marraztu','Dibujar'],['signals','Seinaleak','Señales'],['explain','Azaldu','Explicar']].map(([id,eu,es])=><button key={id} aria-pressed={group===id} onClick={()=>{setGroup(id);beginTool({basic:'pointer',vehicles:'vehicle',draw:'route',signals:'signal',explain:'pointer'}[id]);}}>{t(eu,es)}</button>)}</div>
    <div className="board-subtools"><button aria-pressed={tool==='move'} onClick={()=>beginTool('move')}>{t('Mapa mugitu','Mover mapa')}</button>{draftPath&&state.items.some(i=>i.id===draftPath)&&!['route','arrow'].includes(tool)&&<button onClick={()=>{const path=state.items.find(i=>i.id===draftPath);setGroup('draw');beginTool(path.type);setSelected(path.id);}}>{t('Trazua jarraitu','Continuar trazo')}</button>}{tools.filter(([id])=>({basic:['edit','erase'],draw:['route','arrow','edit','erase'],signals:['signal','note','edit','erase'],explain:['note'],vehicles:[]}[group]).includes(id)).map(([id,eu,es,icon])=><button key={id} aria-pressed={tool===id} onClick={()=>{if(id==='signal')setEditor({...structuredClone(signal),type:'signal-template'});beginTool(id);}}><b aria-hidden="true">{icon}</b>{t(eu,es)}</button>)}
    {group==='signals'&&<><button onClick={()=>{setSignal(s=>({...s,signalCode:'SEMÁFORO',title:t('Semaforoa','Semáforo')}));beginTool('signal');}}>{t('Semaforoa','Semáforo')}</button><button aria-pressed={!showSignals} onClick={()=>setShowSignals(!showSignals)}>{showSignals?t('Seinaleak ezkutatu','Ocultar señales'):t('Seinaleak erakutsi','Mostrar señales')}</button></>}
    <button aria-expanded={locating} onClick={()=>{const p=mapRef.current?.getCenter();if(!p)return;setView({lat:p.lat.toFixed(6),lng:p.lng.toFixed(6)});setLocating(!locating);}}>{t('Koordenatuak','Coordenadas')}</button></div>
   </nav>
   {!presenting&&group==='vehicles'&&!editor&&<aside className="board-properties board-ui" aria-label={t('Ibilgailuaren ezarpenak','Propiedades del vehículo')}>
    <strong>{selectedVehicle?t(`Ibilgailua ${selectedVehicle.label}`,`Vehículo ${selectedVehicle.label}`):t('Ibilgailu berria','Nuevo vehículo')}</strong>
    <label>{t('Ibilgailu mota','Tipo de vehículo')}<select aria-label={t('Ibilgailu mota','Tipo de vehículo')} value={selectedVehicle?.vehicleType||vehicle.vehicleType} onChange={e=>selectedVehicle?updateSelected({vehicleType:e.target.value}):setVehicle(v=>({...v,vehicleType:e.target.value}))}>{vehicleTypes.map(([id,eu,es])=><option key={id} value={id}>{t(eu,es)}</option>)}</select></label>
    <label>{t('Kolorea','Color')}<input type="color" value={selectedVehicle?.color||vehicle.color||colorOptions[state.items.filter(i=>i.type==='vehicle').length%colorOptions.length]} onChange={e=>selectedVehicle?updateSelected({color:e.target.value}):setVehicle(v=>({...v,color:e.target.value}))}/></label>
    {selectedVehicle&&<label>{t('Etiketa','Etiqueta')}<input maxLength={2} value={selectedVehicle.label} onChange={e=>updateSelected({label:e.target.value})}/></label>}
    <label>{t('Orientazioa','Orientación')} · {Math.round(selectedVehicle?.angle||vehicle.angle)}°<input type="range" min="-180" max="180" value={selectedVehicle?.angle??vehicle.angle} onChange={e=>selectedVehicle?updateSelected({angle:Number(e.target.value)}):setVehicle(v=>({...v,angle:Number(e.target.value)}))}/></label>
    <label>{t('Tamaina','Tamaño')}<input type="range" min="40" max="140" value={selectedVehicle?.size||vehicle.size} onChange={e=>selectedVehicle?updateSelected({size:Number(e.target.value)}):setVehicle(v=>({...v,size:Number(e.target.value)}))}/></label>
    {selectedVehicle&&<><label>{t('Lotutako ibilbidea','Trayectoria asignada')}<select aria-label={t('Lotutako ibilbidea','Trayectoria asignada')} value={selectedVehicle.routeId||''} onChange={e=>updateSelected({routeId:e.target.value||null})}><option value="">{t('Ibilbiderik gabe','Sin trayectoria')}</option>{routes.map((r,n)=><option value={r.id} key={r.id}>{t('Ibilbidea','Trayectoria')} {n+1}</option>)}</select></label><label>{t('Iraupena (segundoak)','Duración (segundos)')}<input type="number" min="1" max="180" value={selectedVehicle.duration||10} onChange={e=>updateSelected({duration:Math.max(1,Math.min(180,Number(e.target.value)||10))})}/></label><label className="board-check"><input type="checkbox" checked={!!selectedVehicle.visibility} onChange={e=>updateSelected({visibility:e.target.checked})}/>{t('Behaketa-eremua erakutsi','Mostrar zona de observación')}</label>{selectedVehicle.visibility&&<label>{t('Ikusmen-angelua','Apertura de visión')}<input type="range" min="20" max="140" value={selectedVehicle.visibilityAngle||70} onChange={e=>updateSelected({visibilityAngle:Number(e.target.value)})}/></label>}<button disabled={!selectedVehicle.routeId} onClick={()=>toggleVehicle(selectedVehicle.id)}>{playbackRef.current[selectedVehicle.id]?.playing?t('Pausatu','Pausar'):t('Erreproduzitu','Reproducir')}</button><button onClick={()=>remove(selectedVehicle.id)}>{t('Ibilgailua ezabatu','Eliminar vehículo')}</button></>}
    <button onClick={()=>{setSelected(null);beginTool('vehicle');}}>{t('Beste ibilgailu bat jarri','Colocar otro vehículo')}</button>
   </aside>}
   {!presenting&&group==='draw'&&!editor&&<aside className="board-draw-options board-ui" aria-label={t('Marrazteko aukerak','Opciones de dibujo')}><label>{t('Marrazteko tresna','Herramienta de dibujo')}<select aria-label={t('Marrazteko tresna','Herramienta de dibujo')} value={tool==='draw'?drawing.shape:'points'} onChange={e=>{if(e.target.value==='points')beginTool('route');else {setDrawing(v=>({...v,shape:e.target.value}));beginTool('draw');}}}><option value="points">{t('Ibilbidea puntuz','Trayectoria por puntos')}</option>{[['free','Eskuz','Trazo libre'],['line','Lerro zuzena','Línea recta'],['dash','Lerro etena','Línea discontinua'],['circle','Zirkulua','Círculo'],['rect','Laukizuzena','Rectángulo'],['area','Eremu itzaleztatua','Área sombreada'],['arrow','Gezia','Flecha dibujada'],['curve','Gezi kurbatua','Flecha curva']].map(([id,eu,es])=><option value={id} key={id}>{t(eu,es)}</option>)}</select></label><label>{t('Kolorea','Color')}<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><label>{t('Lodiera','Grosor')}<input type="range" min="2" max="20" value={drawing.width} onChange={e=>setDrawing(v=>({...v,width:Number(e.target.value)}))}/></label><label>{t('Opakutasuna','Opacidad')}<input type="range" min=".1" max="1" step=".1" value={drawing.opacity} onChange={e=>setDrawing(v=>({...v,opacity:Number(e.target.value)}))}/></label></aside>}
   {!presenting&&group==='explain'&&!editor&&<aside className="board-properties board-ui" aria-label={t('Urratsa prestatu','Preparar paso')}><label>{t('Urratsaren izena','Nombre del paso')}<input maxLength={80} value={step.name} onChange={e=>dispatch({type:'step-field',field:'name',value:e.target.value})}/></label><label>{t('Klaseko galdera','Pregunta para la clase')}<input maxLength={200} value={step.question} onChange={e=>dispatch({type:'step-field',field:'question',value:e.target.value})}/></label><label>{t('Erakusteko azalpena','Explicación para revelar')}<textarea rows="3" maxLength={1000} value={step.answer} onChange={e=>dispatch({type:'step-field',field:'answer',value:e.target.value})}/></label><button disabled={state.steps.length>=20} onClick={()=>modifyStep({type:'add-step',id:crypto.randomUUID()})}>{t('Urratsa kopiatu eta gehitu','Duplicar y añadir paso')}</button><div className="board-header-actions"><button disabled={!state.activeStep} onClick={()=>modifyStep({type:'move-step',direction:-1})}>{t('Lehenago','Adelantar paso')}</button><button disabled={state.activeStep===state.steps.length-1} onClick={()=>modifyStep({type:'move-step',direction:1})}>{t('Geroago','Retrasar paso')}</button></div><button disabled={state.steps.length===1} onClick={()=>{if(confirm(t('Urrats hau ezabatu?','¿Eliminar este paso?')))modifyStep({type:'delete-step'});}}>{t('Urratsa ezabatu','Eliminar paso')}</button></aside>}
   {(step.question||step.answer)&&selectedItem?.type!=='note'&&!editor&&<aside className="board-question board-ui"><small>{t('Klaseko galdera','Pregunta para la clase')}</small><strong>{step.question||stepTitle(step,state.activeStep)}</strong>{answerVisible&&<p>{step.answer}</p>}{step.answer&&<button onClick={()=>setAnswerVisible(!answerVisible)}>{answerVisible?t('Azalpena ezkutatu','Ocultar explicación'):t('Azalpena erakutsi','Mostrar explicación')}</button>}</aside>}
   {locating&&<form className="board-location board-ui" onSubmit={e=>{e.preventDefault();const lat=Number(view.lat),lng=Number(view.lng);if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>85||Math.abs(lng)>180)return;mapRef.current?.jumpTo({center:[lng,lat],zoom:Math.max(17,mapRef.current.getZoom())});setLocating(false);}}><label>{t('Latitudea','Latitud')}<input required type="number" min="-85" max="85" step="any" value={view.lat} onChange={e=>setView(v=>({...v,lat:e.target.value}))}/></label><label>{t('Longitudea','Longitud')}<input required type="number" min="-180" max="180" step="any" value={view.lng} onChange={e=>setView(v=>({...v,lng:e.target.value}))}/></label><button>{t('Joan','Ir')}</button></form>}
   {selectedItem?.type==='note'&&!editor&&<aside className="board-note-card board-ui"><small>{t('Puntu kritikoa','Punto conflictivo')}</small><strong>{selectedItem.title}</strong>{selectedItem.description&&<p>{selectedItem.description}</p>}<button onClick={()=>setSelected(null)}>{t('Ezkutatu','Ocultar')}</button></aside>}
   {editor&&<form className="board-editor board-ui" aria-label={t('Arbeleko elementua editatu','Editar elemento de pizarra')} onSubmit={e=>{
    e.preventDefault();
    if(editor.type==='signal-template'){const {type,...template}=editor;setSignal(template);setEditor(null);setTool('signal');return;}
    if(editor.type==='vertex')return;
    const item={...editor,title:editor.title?.trim()||t('Puntu kritikoa','Punto conflictivo')};commit(items=>items.some(i=>i.id===item.id)?items.map(i=>i.id===item.id?item:i):[...items,item]);setSelected(item.id);setEditor(null);
   }}><div className="board-editor-heading"><strong>{editor.type==='vertex'?t('Ibilbideko puntua','Punto de trayectoria'):editor.type==='note'?t('Puntu kritikoa','Punto conflictivo'):t('Seinalea','Señal')}</strong><button type="button" aria-label={t('Editorea itxi','Cerrar editor')} onClick={()=>setEditor(null)}>×</button></div>
    {editor.type==='vertex'?<><p>{t('Arrastatu puntua mapan birkokatzeko.','Arrastra el punto sobre el mapa para recolocarlo.')}</p><button type="button" onClick={()=>{commit(items=>items.flatMap(i=>i.id!==editor.pathId?[i]:i.points.length>1?[{...i,points:i.points.filter((_,n)=>n!==editor.index)}]:[]));setEditor(null);}}>{t('Puntu hau ezabatu','Eliminar este punto')}</button></>:<>
     {editor.type!=='note'&&signalFields(editor,setEditor)}
     <label>{t('Izenburua','Título')}<input required={editor.type==='note'} maxLength={80} value={editor.title||''} onChange={e=>editField('title',e.target.value)}/></label>
     <label>{t('Azalpena','Explicación')}<textarea rows="3" maxLength={500} value={editor.description||''} onChange={e=>editField('description',e.target.value)}/></label>
     <button type="submit">{editor.type==='signal-template'?t('Mapan kokatu','Colocar en el mapa'):t('Arbelera gehitu','Aplicar en pizarra')}</button>
    </>}
    <button type="button" onClick={()=>setEditor(null)}>{t('Utzi','Cancelar')}</button>
   </form>}
   {error&&<div className="board-error board-ui" role="alert">{t('Ezin izan da eragiketa amaitu','No se pudo completar la operación')}: {error}<button onClick={()=>window.dispatchEvent(new Event('basurto-routes:retry-save'))}>{t('Berriz saiatu','Reintentar')}</button><button onClick={()=>setError('')}>{t('Itxi','Cerrar')}</button></div>}
  </div>
  <div className="board-stepbar board-ui"><div className="board-step-list" aria-label={t('Azalpenaren urratsak','Pasos de la explicación')}>{state.steps.map((entry,n)=><button key={entry.id} aria-pressed={n===state.activeStep} onClick={()=>changeStep(n)}>{n+1} · {stepTitle(entry,n)}</button>)}</div><button disabled={!state.activeStep} onClick={()=>changeStep(state.activeStep-1)}>{t('Aurrekoa','Anterior')}</button><button disabled={state.activeStep===state.steps.length-1} onClick={()=>changeStep(state.activeStep+1)}>{t('Hurrengoa','Siguiente')}</button></div>
  <div className="board-playback board-ui">{state.items.filter(i=>i.type==='vehicle'&&i.routeId&&routes.some(r=>r.id===i.routeId)).map(item=><div key={item.id}><button aria-pressed={!!playbackRef.current[item.id]?.playing} onClick={()=>toggleVehicle(item.id)}>{playbackRef.current[item.id]?.playing?t('Pausatu','Pausar'):t('Erreproduzitu','Reproducir')} {item.label}</button><button aria-label={t(`${item.label} berrabiarazi`,`Reiniciar ${item.label}`)} onClick={()=>{const motion=playbackRef.current[item.id];if(motion){motion.progress=0;motion.playing=false;}const route=routes.find(r=>r.id===item.routeId),entry=vehicleMarkersRef.current.get(item.id);if(entry&&route){entry.marker.setLngLat(route.points[0]);orientVehicle(entry,mapRef.current,positionAlong(route.points,0).angle);}setPlaybackVersion(v=>v+1);}}>↺</button></div>)}{state.items.some(i=>i.type==='vehicle'&&i.routeId)&&<small>{t('Mugimendu didaktikoa; lehentasunak ez dira automatikoki kalkulatzen.','Movimiento didáctico; no calcula prioridades automáticamente.')}</small>}</div>
  <section className="board-record-controls board-ui" aria-label={t('Klasea grabatu','Grabar clase')}><label><input type="checkbox" checked={withVoice} disabled={capturing||captureBusy} onChange={e=>setWithVoice(e.target.checked)}/>{t('Mikrofonoaren ahotsa','Voz del micrófono')}</label>{!capturing?<button disabled={!ready||captureBusy} onClick={beginCapture}>{captureBusy?t('Prestatzen…','Preparando…'):t('● Klasea grabatu','● Grabar clase')}</button>:<><strong role="status">● {Math.floor(captureSeconds/60)}:{String(Math.floor(captureSeconds%60)).padStart(2,'0')} · {capturePaused?(recordingRef.current?.suspended?t('Grabazio osoa pausatuta','Grabación completa pausada'):withVoice?t('Irudia pausatuta · ahotsa grabatzen','Imagen en pausa · audio grabando'):t('Irudia pausatuta','Imagen en pausa')):t('Grabatzen','Grabando')}</strong><button onClick={pauseCapture}>{capturePaused?t('Irudia berrabiarazi','Reanudar imagen'):t('Irudia pausatu','Pausar imagen')}</button><button onClick={stopCapture}>{t('Amaitu eta MP4 gorde','Finalizar y guardar MP4')}</button></>}{!window.elorrietaDesktop?.beginMovie&&!window.showSaveFilePicker&&<small>{t('Gehienez 5 minutu nabigatzaile honetan. Klase luzeetarako, Chrome edo Basurto Recorridos.','Máximo 5 minutos en este navegador. Para clases largas, Chrome o Basurto Recorridos.')}</small>}{state.recording&&!capturing&&<><span>{state.recording.name}</span><button onClick={openRecording}>{t('Grabazioa ikusi','Ver grabación')}</button></>}<small>{t('Mapa eta ahotsa; kontrolak ez dira grabatzen. Mantendu leihoa ikusgai.','Mapa y voz; los controles no se graban. Mantén la ventana visible.')}</small></section>
  <footer className="board-footer board-ui"><span role="status">{message|| (ready?(presenting?hints.pointer:hints[tool]):t('Mapa kargatzen…','Cargando mapa…'))}</span><div className="board-actions">
   <div className="board-path-actions" style={{visibility:(tool==='route'||tool==='arrow')?'visible':'hidden'}} aria-hidden={tool!=='route'&&tool!=='arrow'}><label>{t('Trazuaren kolorea','Color del trazo')}<select disabled={tool!=='route'&&tool!=='arrow'} value={color} onChange={e=>setColor(e.target.value)}>{colorOptions.map((c,n)=><option key={c} value={c}>{[t('Horia','Amarillo'),t('Urdina','Azul'),t('Gorria','Rojo')][n]}</option>)}</select></label><button disabled={!draftPath||(tool!=='route'&&tool!=='arrow')} onClick={()=>setDraftPath(null)}>{t('Trazua amaitu','Terminar trazo')}</button></div>
   <small className="board-count">{state.items.length} {t('elementu','elementos')}</small>
   <button disabled={!state.past.length} onClick={()=>{stopMotion();dispatch({type:'undo'});setDraftPath(null);setSelected(null);setEditor(null);}}>{t('Desegin','Deshacer')}</button>
   <button disabled={!state.items.length} onClick={()=>{if(confirm(t('Behin-behineko pizarra garbitu?','¿Limpiar todos los elementos temporales de la pizarra?'))){stopMotion();commit([]);setDraftPath(null);setSelected(null);setEditor(null);}}}>{t('Pizarra garbitu','Limpiar pizarra')}</button>
   <button disabled={!ready||exporting||capturing||captureBusy} onClick={()=>setModal('export')}>{t('Esportatu','Exportar')}</button>
  </div></footer>
  {modal&&<div className="board-modal board-ui"><section className="board-modal-card" role="dialog" aria-modal="true" aria-label={modal==='save'?t('Gorde azalpena','Guardar explicación'):modal==='library'?t('Nire azalpenak','Mis explicaciones'):t('Esportatu azalpena','Exportar explicación')}>
   {modal==='recording'?<><h2>{t('Klaseko grabazioa','Grabación de clase')}</h2><p>{state.recording?.name}</p>{recordingUrl?<><video className="board-recording-preview" src={recordingUrl} controls playsInline/><a href={recordingUrl} download={state.recording?.name||'Basurto Recorridos-clase.mp4'}>{t('MP4 deskargatu','Descargar MP4')}</a></>:<p>{t('Ireki gordetako MP4a berriro ikusteko.','Selecciona el MP4 guardado para volver a verlo.')}</p>}<label>{t('Gordetako MP4a ireki','Abrir MP4 guardado')}<input type="file" accept="video/mp4,.mp4" onChange={e=>{const file=e.target.files?.[0];if(file)showRecording(file);}}/></label></>:modal==='save'?<form onSubmit={e=>{e.preventDefault();saveCase();}}><h2>{t('Gorde azalpena','Guardar explicación')}</h2><label>{t('Azalpenaren izena','Nombre de la explicación')}<input autoFocus required maxLength={100} value={caseName} onChange={e=>setCaseName(e.target.value)}/></label><p>{t('Kokapena, urratsak eta elementuak aparte gordeko dira.','Se guardan el lugar, los pasos y los elementos, separados de los proyectos.')}</p><button type="submit">{t('Gorde','Guardar')}</button>{caseId&&<button type="button" onClick={()=>saveCase(true)}>{t('Kopia berri gisa gorde','Guardar como nueva copia')}</button>}</form>:modal==='library'?<><h2>{t('Nire azalpenak','Mis explicaciones')}</h2>{!cases.length&&<p>{t('Ez duzu azalpenik gorde oraindik.','Todavía no has guardado explicaciones.')}</p>}{cases.map(entry=><article className="board-saved-case" key={entry.id}><div><strong>{entry.name}</strong><small>{entry.document.steps.length} {t('urrats','pasos')}</small></div><button onClick={()=>loadCase(entry)}>{t('Ireki','Abrir')}</button><button aria-label={t(`${entry.name} ezabatu`,`Eliminar ${entry.name}`)} onClick={()=>{if(!confirm(t('Gordetako azalpen hau ezabatu?','¿Eliminar esta explicación guardada?')))return;try{const next=readBoardCases().filter(c=>c.id!==entry.id);saveBoardCases(next);setCases(next);if(caseId===entry.id)setCaseId(null);}catch(e){setError(e.message);}}}>{t('Ezabatu','Eliminar')}</button></article>)}</>:<><h2>{t('Esportatu uneko urratsa','Exportar paso actual')}</h2><p>{t('Mapa, elementuak eta ikusgai dagoen azalpena.','Mapa, elementos y explicación visible.')}</p><label>{t('Proiektuaren izena','Nombre del proyecto')}<input value={caseName} maxLength={100} onChange={e=>setCaseName(e.target.value)}/></label><button disabled={exporting||!caseName.trim()} onClick={saveTrajectory}>{t('Ibilbide-proiektu gisa gorde','Guardar como proyecto de trayectoria')}</button><p>{t('Urrats eta elementu guztiak mantentzen dira pizarra berriro irekitzean. MP4a fitxategi bereizi batean gordetzen da.','Se conservan todos los pasos y elementos al reabrir la pizarra. El MP4 se guarda en un archivo independiente.')}</p>{state.recording&&<button onClick={openRecording}>{t('MP4 ikusi edo deskargatu','Ver o descargar MP4')}</button>}<button disabled={exporting} onClick={()=>doExport('png')}>PNG</button><button disabled={exporting} onClick={()=>doExport('pdf')}>PDF</button>{exporting&&<p role="status">{t('Esportatzen…','Preparando exportación…')}</p>}</>}
   {error&&<p role="alert">{error}</p>}<button disabled={exporting} onClick={()=>setModal(null)}>{t('Itxi','Cerrar')}</button>
  </section></div>}

 </section>,document.body);
}
