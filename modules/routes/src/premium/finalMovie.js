import {loadVideoWatermark,drawVideoWatermark} from '../videoWatermark.js';
import {movieWriter} from './movieWriter.js';
// Render uploaded footage and timed incident captions, without editor chrome.
export function movieIncidents(review,clock) {
 const start=review.media?.videoStartUtc??clock.start;
 return (review.incidents||[]).map(i=>({...i,second:Number.isFinite(i.time)&&Number.isFinite(start)?(i.time-start)/1000:i.videoTime})).filter(i=>i.showInVideo!==false&&Number.isFinite(i.second)&&i.second>=0);
}
export function visibleIncidents(incidents,second){return incidents.filter(i=>second>=i.second&&second<i.second+4);}
export function drawMovie(ctx,video,incidents,second,composition){
 const {width:w,height:h}=ctx.canvas;ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
 if(composition){
  const map=composition.mapCanvas.getBoundingClientRect(),stage=composition.stageRect?.()||map,scale=w/stage.width;
  const mx=(map.left-stage.left)*scale,my=(map.top-stage.top)*scale,mw=map.width*scale,mh=map.height*scale;
  ctx.drawImage(composition.mapCanvas,mx,my,mw,mh);
  const r=composition.pipRect(),x=(r.left-stage.left)*scale,y=(r.top-stage.top)*scale,pw=r.width*scale,ph=r.height*scale;
  ctx.fillStyle='#111';ctx.fillRect(x,y,pw,ph);const vw=video.videoWidth||video.width,vh=video.videoHeight||video.height,fit=Math.min(pw/vw,ph/vh);
  ctx.drawImage(video,x+(pw-vw*fit)/2,y+(ph-vh*fit)/2,vw*fit,vh*fit);
  ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(x,y,pw,ph);
  ctx.font=`${Math.max(10,w/110)}px sans-serif`;ctx.fillStyle='#fff';ctx.fillText(composition.attribution||'© geoEuskadi',mx+12,my+mh-12,mw-24);
  ctx.save();ctx.beginPath();ctx.rect(mx,my,mw,mh);ctx.clip();ctx.translate(mx,my);composition.drawMarkers?.(ctx,mw,mh);composition.drawVehicle?.(ctx,mw,mh,second);ctx.restore();
  const extra=composition.secondaryPip?.();if(extra?.image&&extra.rect){
   const er=extra.rect,ex=(er.left-stage.left)*scale,ey=(er.top-stage.top)*scale,ew=er.width*scale,eh=er.height*scale,ivw=extra.image.videoWidth||extra.image.width,ivh=extra.image.videoHeight||extra.image.height,efit=Math.min(ew/ivw,eh/ivh);
   if(ivw>0&&ivh>0){ctx.fillStyle='#111';ctx.fillRect(ex,ey,ew,eh);ctx.drawImage(extra.image,ex+(ew-ivw*efit)/2,ey+(eh-ivh*efit)/2,ivw*efit,ivh*efit);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(ex,ey,ew,eh);}
  }
  const hud=composition.hud?.(second),hr=composition.hudRect?.();if(hud&&hr){
   const hx=(hr.left-stage.left)*scale,hy=(hr.top-stage.top)*scale,lines=hud.split('\n').slice(0,11),fs=Math.max(9,(lines.length===1&&hud.includes('km/h')?22:12)*scale),lineHeight=Math.max(17*scale,fs*1.4),pad=Math.max(6,8*scale);
   ctx.font=`${fs}px sans-serif`;
   const hw=Math.min(w-hx,Math.max(...lines.map(line=>ctx.measureText(line).width))+pad*2),hh=lines.length*lineHeight+pad*2;
   ctx.fillStyle='#172c25ed';ctx.fillRect(hx,hy,hw,hh);ctx.fillStyle='#fff';
   lines.forEach((line,i)=>ctx.fillText(line,hx+pad,hy+pad+fs+i*lineHeight,Math.max(1,hw-pad*2)));
  }
 }else ctx.drawImage(video,0,0,w,h);
 const active=visibleIncidents(incidents,second);if(!active.length)return;composition?.drawIncident?.(ctx,active[0],composition.split?w/2:w);
 const captionWidth=composition?.split?w/2:w;const font=Math.max(16,Math.round(captionWidth/45)),pad=font;ctx.font=`600 ${font}px sans-serif`;
 const words=active.map(i=>[i.title,i.note].filter(Boolean).join(' · ')).join(' / ').split(/\s+/);const lines=[];let line='';
 for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>captionWidth-pad*2&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);
 const shown=lines.slice(0,5);if(lines.length>5)shown[4]+='…';const box=shown.length*font*1.35+pad*2;
 ctx.fillStyle='rgba(10,15,22,.88)';ctx.fillRect(0,h-box,captionWidth,box);ctx.fillStyle='#ffb74d';ctx.fillRect(0,h-box,6,box);ctx.fillStyle='#fff';shown.forEach((text,i)=>ctx.fillText(text,pad,h-box+pad+font+i*font*1.35,captionWidth-pad*2));
}
const movieAudio=new WeakMap();
export function prepareMovieAudio(video,context){
 if(!video)throw Error('Abre el vídeo antes de exportar.');
 let route=movieAudio.get(video);if(!route){const audio=context||new (window.AudioContext||window.webkitAudioContext)();route={audio,source:audio.createMediaElementSource(video)};movieAudio.set(video,route);}return route.audio;
}
export async function releaseMovieVideo(video){const route=movieAudio.get(video);if(!route)return;route.source.disconnect();if(route.audio.state!=='closed')await route.audio.close();movieAudio.delete(video);}
export function videoDecodeError(video){const code=video.error?.code,message=video.error?.message;return Error(code===2?'No se pudo leer el vídeo. Comprueba que su carpeta o disco sigue disponible.':`No se puede decodificar el vídeo${code?' (código '+code+')':''}.${message?' '+message:''}`);}
function waitForVideo(video,event,signal){
 return new Promise((resolve,reject)=>{
  let timer;const clean=()=>{clearTimeout(timer);video.removeEventListener(event,ready);video.removeEventListener('error',error);signal?.removeEventListener('abort',abort);};
  const ready=()=>{clean();resolve();},error=()=>{clean();reject(videoDecodeError(video));},abort=()=>{clean();reject(new DOMException('Exportación cancelada.','AbortError'));};
  video.addEventListener(event,ready,{once:true});video.addEventListener('error',error,{once:true});signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>{clean();reject(Error('El vídeo no responde. Comprueba que la carpeta o disco del original sigue disponible.'));},30000);if(signal?.aborted)abort();
 });
}

export async function createFinalMovie({videoElement,url,incidents,onProgress,signal,composition,startSecond=0,endSecond,audioContext,sink}){
 const watermark=await loadVideoWatermark();
 const mime=['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4;codecs=avc1,mp4a.40.2','video/mp4'].find(m=>globalThis.MediaRecorder?.isTypeSupported(m));
 if(!mime)throw Error('Este navegador no permite exportar MP4. Usa Safari o Chrome actualizado.');
 const borrowed=!!videoElement,video=videoElement||document.createElement('video'),original={muted:video.muted,rate:video.playbackRate};
 if(!borrowed){video.muted=true;video.playsInline=true;video.preload='auto';video.style.cssText='position:fixed;left:-2px;bottom:0;width:1px;height:1px;opacity:.01;pointer-events:none';document.body.append(video);video.src=url;}
 let stream,audio,destination,recorder,frame,wake,source,completed=false;const writer=sink?movieWriter(sink):null;let failed=null;
 try{
  if(video.error)throw videoDecodeError(video);
  if(video.readyState<2)await waitForVideo(video,'loadeddata',signal);
  video.pause();video.playbackRate=1;
  if(signal.aborted)throw Error('Exportación cancelada.');
  const canvas=document.createElement('canvas'),width=composition?.stageRect?.().width*devicePixelRatio||composition?.mapCanvas.width||video.videoWidth,height=composition?.stageRect?.().height*devicePixelRatio||composition?.mapCanvas.height||video.videoHeight,scale=Math.min(1,1280/width,720/height);canvas.width=Math.max(2,Math.round(width*scale/2)*2);canvas.height=Math.max(2,Math.round(height*scale/2)*2);const end=Math.min(video.duration,endSecond??video.duration);if(startSecond>=end)throw Error('El vídeo y el GPX no coinciden en el tiempo. Ajusta la sincronización.');if(Math.abs(video.currentTime-startSecond)>.001){const sought=waitForVideo(video,'seeked',signal);video.currentTime=startSecond;await sought;}const ctx=canvas.getContext('2d');drawMovie(ctx,video,incidents,startSecond,composition);drawVideoWatermark(ctx,watermark,canvas.width,canvas.height);stream=canvas.captureStream(30);
  audio=prepareMovieAudio(video,audioContext);source=movieAudio.get(video).source;destination=audio.createMediaStreamDestination();source.connect(destination);video.muted=false;await audio.resume();destination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4000000});const chunks=[];recorder.ondataavailable=e=>{if(!e.data.size)return;if(!writer){chunks.push(e.data);return;}try{writer.write(e.data).catch(error=>{failed=error;stop();});}catch(error){failed=error;stop();}};
  const stop=()=>{if(recorder.state!=='inactive')recorder.stop();};const abort=()=>{failed=Error('Exportación cancelada.');stop();};const hidden=()=>{if(document.hidden){failed=Error('Exportación interrumpida: mantén la app visible y vuelve a intentarlo.');stop();}};
  const done=new Promise((resolve,reject)=>{recorder.onstop=async()=>{try{if(failed)throw failed;resolve(writer?await writer.close():new Blob(chunks,{type:recorder.mimeType}));}catch(e){reject(e);}};recorder.onerror=e=>{failed=e.error||Error('No se pudo generar el MP4.');stop();};});
  signal.addEventListener('abort',abort);document.addEventListener('visibilitychange',hidden);video.onended=stop;video.onerror=()=>{failed=videoDecodeError(video);stop();};
  try{
   wake=await navigator.wakeLock?.request('screen').catch(()=>null);recorder.start(1000);
   const paint=()=>{onProgress((video.currentTime-startSecond)/(end-startSecond),video.currentTime);drawMovie(ctx,video,incidents,video.currentTime,composition);drawVideoWatermark(ctx,watermark,canvas.width,canvas.height);if(video.currentTime>=end){stop();return;}frame=requestAnimationFrame(paint);};paint();
   try{await video.play();}catch(e){failed=e;stop();}const blob=await done;if((blob.saved?blob.bytes:blob.size)<100)throw Error('El MP4 está vacío.');completed=true;return blob;
  }finally{signal.removeEventListener('abort',abort);document.removeEventListener('visibilitychange',hidden);}
 }finally{if(writer&&!completed)await writer.abort().catch(()=>{});cancelAnimationFrame(frame);video.pause();stream?.getTracks().forEach(t=>t.stop());if(source&&destination)source.disconnect(destination);await wake?.release();video.onended=null;video.onerror=null;video.muted=original.muted;video.playbackRate=original.rate;if(!borrowed){await releaseMovieVideo(video);video.removeAttribute('src');video.load();video.remove();}}
}

// One recorder and one output file across source changes; never concatenate MP4 blobs.
export async function createSequenceMovie({videoElement:video,clips,incidents,composition,onProgress,signal,audioContext,sink,narration=false,isImagePaused=()=>false}){
 const watermark=await loadVideoWatermark(),mime=['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4'].find(m=>globalThis.MediaRecorder?.isTypeSupported(m));
 if(!mime)throw Error('Este navegador no permite exportar MP4.');
 const original={src:video.src,muted:video.muted,rate:video.playbackRate};
 let destination,source,mic,micSource,stream,recorder,frame,wake,failed,done,completed=false;const writer=sink?movieWriter(sink):null,chunks=[];
 const total=clips.reduce((sum,c)=>sum+c.duration,0);if(!(total>0))throw Error('El montaje está vacío.');
 const audio=prepareMovieAudio(video,audioContext);await audio.resume();
 const canvas=document.createElement('canvas'),w=composition.stageRect?.().width*devicePixelRatio||composition.mapCanvas.width,h=composition.stageRect?.().height*devicePixelRatio||composition.mapCanvas.height,scale=Math.min(1,1280/w,720/h);canvas.width=Math.max(2,Math.round(w*scale/2)*2);canvas.height=Math.max(2,Math.round(h*scale/2)*2);const ctx=canvas.getContext('2d');
 function stop(){if(recorder&&recorder.state!=='inactive')recorder.stop();}
 const abort=()=>{failed=new DOMException('Exportación cancelada.','AbortError');stop();},hidden=()=>{if(document.hidden){failed=Error('Mantén la app visible durante la exportación.');stop();}};
 async function ready(clip){if(signal.aborted)throw new DOMException('Exportación cancelada.','AbortError');const url=await clip.getUrl();if(video.src!==url){const loaded=waitForVideo(video,'loadeddata',signal);video.src=url;video.load();await loaded;}else if(video.readyState<2)await waitForVideo(video,'loadeddata',signal);
  if(clip.startSecond<-.05||clip.endSecond>video.duration+.15||clip.endSecond<=clip.startSecond)throw Error('El vídeo de «'+clip.name+'» no cubre todo su GPX. Ajusta la sincronización o recorta el tramo.');
  if(Math.abs(video.currentTime-Math.max(0,clip.startSecond))>.001){const sought=waitForVideo(video,'seeked',signal);video.currentTime=Math.max(0,clip.startSecond);await sought;}video.playbackRate=1;
 }
 try{
  await ready(clips[0]);
  destination=audio.createMediaStreamDestination();source=movieAudio.get(video).source;source.connect(destination);video.muted=false;
  if(narration){mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true},video:false});micSource=audio.createMediaStreamSource(mic);micSource.connect(destination);}
  stream=canvas.captureStream(30);destination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4000000});
  done=new Promise((resolve,reject)=>{recorder.onstop=async()=>{try{if(failed)throw failed;resolve(writer?await writer.close():new Blob(chunks,{type:recorder.mimeType}));}catch(e){reject(e);}};recorder.onerror=e=>{failed=e.error||Error('No se pudo generar el MP4.');stop();};});
  done.catch(()=>{});
  recorder.ondataavailable=e=>{if(!e.data.size)return;if(!writer){chunks.push(e.data);return;}try{writer.write(e.data).catch(e=>{failed=e;stop();});}catch(e){failed=e;stop();}};
  signal.addEventListener('abort',abort);document.addEventListener('visibilitychange',hidden);wake=await navigator.wakeLock?.request('screen').catch(()=>null);
  recorder.start(1000);
  for(let index=0;index<clips.length;index++){
   const clip=clips[index];if(index){recorder.pause();await ready(clip);clips[index-1].release?.();if(signal.aborted)throw new DOMException('Exportación cancelada.','AbortError');recorder.resume();}
   await new Promise((resolve,reject)=>{
    let settled=false;const finish=error=>{if(settled)return;settled=true;cancelAnimationFrame(frame);video.pause();video.removeEventListener('error',errorHandler);signal.removeEventListener('abort',cancel);error?reject(error):resolve();};
    const errorHandler=()=>finish(videoDecodeError(video)),cancel=()=>finish(new DOMException('Exportación cancelada.','AbortError'));
    video.addEventListener('error',errorHandler);signal.addEventListener('abort',cancel,{once:true});
    const paint=async()=>{if(failed)return finish(failed);if(signal.aborted)return cancel();const second=clip.offset+Math.max(0,Math.min(clip.duration,video.currentTime-clip.startSecond));const sourceSecond=(clip.sourceOffset??clip.offset)+Math.max(0,Math.min(clip.duration,video.currentTime-clip.startSecond));onProgress(second/total,sourceSecond);try{await composition.prepareFrame?.(sourceSecond,signal);await composition.prepareVideoFrame?.(sourceSecond,signal);if(failed)return finish(failed);if(signal.aborted)return cancel();}catch(error){return finish(error);}drawMovie(ctx,video,incidents,sourceSecond,composition);drawVideoWatermark(ctx,watermark,canvas.width,canvas.height);
     if(video.currentTime>=clip.endSecond-.02||video.ended)return finish();
     if(isImagePaused()){video.pause();}else if(video.paused)video.play().catch(finish);
     frame=requestAnimationFrame(paint);
    };paint();
   });
  }
  stop();const blob=await done;if((blob.saved?blob.bytes:blob.size)<100)throw Error('El MP4 está vacío.');completed=true;return blob;
 }catch(e){failed=e;stop();if(done)await done.catch(()=>{});throw e;}
 finally{signal.removeEventListener('abort',abort);document.removeEventListener('visibilitychange',hidden);cancelAnimationFrame(frame);video.pause();stream?.getTracks().forEach(t=>t.stop());mic?.getTracks().forEach(t=>t.stop());micSource?.disconnect();if(source&&destination)source.disconnect(destination);await wake?.release();video.muted=original.muted;video.playbackRate=original.rate;if(original.src&&video.src!==original.src){video.src=original.src;video.load();}if(writer&&!completed)await writer.abort().catch(()=>{});}
}
