export function secondarySecond(clock,media,second){return (clock.start+second*1000-(media.videoStartUtc??clock.start))/1000;}
function mediaEvent(video,event,signal,action){
 return new Promise((resolve,reject)=>{
  let timer;const clean=()=>{clearTimeout(timer);video.removeEventListener(event,done);video.removeEventListener('error',error);signal?.removeEventListener('abort',abort);};
  const done=()=>{clean();resolve();},error=()=>{clean();reject(Error('No se pudo leer el segundo vídeo. Vuelve a seleccionarlo.'));},abort=()=>{clean();reject(new DOMException('Exportación cancelada.','AbortError'));};
  if(signal?.aborted)return abort();
  video.addEventListener(event,done,{once:true});video.addEventListener('error',error,{once:true});signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>{clean();reject(Error('El segundo vídeo no responde.'));},15000);
  try{action?.();}catch(e){clean();reject(e);}
 });
}
export function secondaryVideoFrame(video,media,clock){
 let visible=false;
 return {get visible(){return visible;},async prepare(second,signal){
  if(signal?.aborted)throw new DOMException('Exportación cancelada.','AbortError');
  video.pause();visible=false;
  if(video.error)throw Error('No se pudo leer el segundo vídeo.');
  if(video.readyState<2)await mediaEvent(video,'loadeddata',signal);
  const target=secondarySecond(clock,media,second);
  if(!Number.isFinite(target)||target<0||target>=video.duration)return;
  if(video.seeking||Math.abs(video.currentTime-target)>.001)await mediaEvent(video,'seeked',signal,()=>{video.currentTime=target;});
  if(signal?.aborted)throw new DOMException('Exportación cancelada.','AbortError');
  visible=true;
 }};
}
