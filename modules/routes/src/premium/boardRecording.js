import {loadVideoWatermark,drawVideoWatermark} from '../videoWatermark.js';
import {assertMapExportAllowed} from './googleMaps.js';
// SPDX-FileCopyrightText: 2026 Aitor Delgado Martínez · AD Mobility
// SPDX-License-Identifier: LicenseRef-RutasAD-Educational-NonCommercial-1.0
import {rememberBoardMedia} from './boardMedia.js';
import {renderBoardCanvas} from './boardExport.js';
import {openMovieSink} from './workspace.js';
// One serialized render and write queue; no full-length video is held in memory on Chrome/Mac.
export async function startBoardRecording({snapshot,withAudio=true,onError=()=>{},onSeconds=()=>{}}){
 assertMapExportAllowed(snapshot().map);
 const mime=['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4;codecs=avc1,mp4a.40.2','video/mp4'].find(m=>globalThis.MediaRecorder?.isTypeSupported(m));
 if(!mime)throw Error('Este navegador no admite grabación MP4. Usa Chrome actualizado o Basurto Recorridos.');
 let pendingBytes=0;
 let mic,sink,stream,recorder,timer,visibility,writing=Promise.resolve(),failed,finished=false,frames=0,paused=false,suspended=false,elapsed=0,last=performance.now(),rendering=false;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),chunks=[];
 const release=()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);stream?.getTracks().forEach(t=>t.stop());mic?.getTracks().forEach(t=>t.stop());};
 try{
  // Keep the file picker within the user gesture; request the microphone only after a destination is chosen.
  sink=await openMovieSink({suggestedName:'Basurto Recorridos-clase-pizarra-'+new Date().toISOString().replace(/[:.]/g,'-')+'.mp4'});
  if(withAudio){if(!navigator.mediaDevices?.getUserMedia)throw Error('El micrófono no está disponible.');mic=await navigator.mediaDevices.getUserMedia({audio:true});}
  const map=snapshot().map,gl=map?.getCanvas().getContext('webgl2')||map?.getCanvas().getContext('webgl');if(!gl?.getContextAttributes()?.preserveDrawingBuffer)throw Error('El mapa no conserva la imagen necesaria para grabar. Vuelve a abrir la pizarra.');if(!map?.loaded())await new Promise((resolve,reject)=>{const done=()=>{if(!map.loaded())return;clearTimeout(timeout);map.off('idle',done);resolve();};const timeout=setTimeout(()=>{map.off('idle',done);reject(Error('El mapa sigue cargando. Espera y vuelve a grabar.'));},20000);map.on('idle',done);done();});
  const watermark=await loadVideoWatermark();const first=await renderBoardCanvas({...snapshot(),frame:true}),ratio=Math.min(1,1280/first.width,720/first.height);canvas.width=Math.max(2,Math.round(first.width*ratio/2)*2);canvas.height=Math.max(2,Math.round(first.height*ratio/2)*2);ctx.drawImage(first,0,0,canvas.width,canvas.height);drawVideoWatermark(ctx,watermark,canvas.width,canvas.height);
  stream=canvas.captureStream(15);mic?.getAudioTracks().forEach(t=>stream.addTrack(t));recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000});
  let resolveDone,rejectDone;const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});done.catch(()=>{});
  const fail=error=>{if(failed)return;failed=error;onError(error);if(recorder.state!=='inactive')recorder.stop();};
  recorder.ondataavailable=e=>{if(!e.data.size)return;if(sink){pendingBytes+=e.data.size;if(pendingBytes>32*1024*1024){fail(Error('El disco no puede guardar al ritmo de la grabación.'));return;}writing=writing.then(()=>sink.write(e.data)).then(()=>{pendingBytes-=e.data.size;});writing.catch(fail);}else chunks.push(e.data);};
  recorder.onerror=e=>fail(e.error||Error('No se pudo grabar la explicación.'));
  recorder.onstop=async()=>{finished=true;release();try{await writing;if(failed)throw failed;let result;if(sink){const closed=await sink.close();let mediaId;if(sink.handle){mediaId=crypto.randomUUID();await rememberBoardMedia(mediaId,sink.handle).catch(()=>{mediaId=null;});}result={name:sink.name,saved:true,file:sink.file?await sink.file().catch(()=>null):null,mediaId,nativeFile:!!closed?.url};}else{const blob=new Blob(chunks,{type:recorder.mimeType});result={name:'Basurto Recorridos-clase-pizarra.mp4',saved:false,blob};}resolveDone({...result,seconds:elapsed,withAudio,frames});}catch(error){await sink?.abort().catch(()=>{});rejectDone(error);}};
  // Manual image pause stops the board transports, not this recorder: voice, pointer and teaching annotations keep their real time.
 const draw=async()=>{if(finished)return;const now=performance.now();if(!suspended){elapsed+=(now-last)/1000;onSeconds(elapsed);}last=now;if(!suspended&&!rendering&&snapshot().map?.loaded()){rendering=true;try{const s=snapshot(),frame=await renderBoardCanvas({...s,frame:true});ctx.drawImage(frame,0,0,canvas.width,canvas.height);const mapRect=s.map.getCanvas().getBoundingClientRect(),sx=canvas.width/frame.width,sy=canvas.height/frame.height,scale=Math.min(1,1280/mapRect.width,540/mapRect.height);
    // Include live PIP video and map-only teaching pointer, never the controls.
    const v=s.video;if(v?.readyState>=2&&v.style.visibility!=='hidden'){const r=v.getBoundingClientRect();ctx.drawImage(v,(r.left-mapRect.left)*scale*sx,(r.top-mapRect.top)*scale*sy,r.width*scale*sx,r.height*scale*sy);}
    if(s.gps&&!s.gps.hidden){const r=s.gps.getBoundingClientRect();ctx.fillStyle='#167ab4';ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc((r.left+r.width/2-mapRect.left)*scale*sx,(r.top+r.height/2-mapRect.top)*scale*sy,8,0,Math.PI*2);ctx.fill();ctx.stroke();}
    if(s.pointer&&!s.pointer.hidden){const r=s.pointer.getBoundingClientRect(),x=(r.left+r.width/2-mapRect.left)*scale*sx,y=(r.top+r.height/2-mapRect.top)*scale*sy;ctx.strokeStyle='#ffe06a';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,18*scale*sx,0,Math.PI*2);ctx.stroke();}drawVideoWatermark(ctx,watermark,canvas.width,canvas.height);frames++;
   }catch(e){fail(e);}finally{rendering=false;}}
   if(!sink&&elapsed>=300){onError(Error('Se alcanzó el límite de cinco minutos. Se ha finalizado la grabación; descarga el MP4. Para clases largas usa Chrome o Basurto Recorridos.'));recorder.stop();return;}timer=setTimeout(draw,66);
  };
  mic?.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>fail(Error('Se perdió el micrófono. La grabación se ha detenido.')),{once:true}));last=performance.now();recorder.start(1000);visibility=()=>{if(document.hidden&&!suspended&&recorder.state==='recording'){suspended=true;paused=true;recorder.pause();onError(Error('Grabación pausada al ocultar la ventana. Vuelve y pulsa Reanudar.'));}};document.addEventListener('visibilitychange',visibility);timer=setTimeout(draw,66);
  return {done,stop:()=>{if(recorder.state!=='inactive')recorder.stop();return done;},pause:()=>{paused=true;},resume:()=>{last=performance.now();paused=false;suspended=false;if(recorder.state==='paused')recorder.resume();},get paused(){return paused;},get suspended(){return suspended;},cancel:async()=>{failed=Error('Grabación cancelada.');if(recorder.state!=='inactive')recorder.stop();await done.catch(()=>{});}};
 }catch(e){release();await sink?.abort().catch(()=>{});throw e;}
}
