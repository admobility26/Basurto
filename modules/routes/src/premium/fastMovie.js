import {Input,BlobSource,UrlSource,ALL_FORMATS,CanvasSink,AudioSampleSink,AudioSample,Output,Mp4OutputFormat,BufferTarget,AppendOnlyStreamTarget,CanvasSource,AudioSampleSource,Quality,canEncodeVideo,canEncodeAudio} from 'mediabunny';
import {drawMovie} from './finalMovie.js';
import {loadVideoWatermark,drawVideoWatermark} from '../videoWatermark.js';
const abortIf=signal=>{if(signal?.aborted)throw new DOMException('Exportación cancelada.','AbortError');};
export async function fastMovieSupported(){return typeof VideoEncoder!=='undefined'&&typeof VideoDecoder!=='undefined'&&await canEncodeVideo('avc',{width:1280,height:720,frameRate:25})&&await canEncodeAudio('aac',{sampleRate:48000,numberOfChannels:2});}
// Encode against media timestamps, not elapsed wall time. Decode and write in bounded chunks.
export async function createFastMovie({clips,incidents=[],composition,onProgress=()=>{},signal,sink,frameRate=25}){
 if(!await fastMovieSupported())throw Error('Este navegador no permite exportación rápida H.264/AAC. Usa Chrome actualizado o la app, o selecciona Tiempo real.');
 const total=clips.reduce((s,c)=>s+c.duration,0);if(!(total>0))throw Error('El montaje está vacío.');if(!sink&&total>300)throw Error('Para vídeos largos guarda directamente en disco con Chrome o la app.');
 const canvas=document.createElement('canvas'),w=composition.stageRect?.().width*devicePixelRatio||composition.mapCanvas.width,h=composition.stageRect?.().height*devicePixelRatio||composition.mapCanvas.height,scale=Math.min(1,1280/w,720/h);canvas.width=Math.max(2,Math.round(w*scale/2)*2);canvas.height=Math.max(2,Math.round(h*scale/2)*2);const ctx=canvas.getContext('2d'),watermark=await loadVideoWatermark();
 let bytes=0,completed=false,input,videoIterator,audioIterator,currentAudio,audioSource,output,wake;const started=performance.now();
 const target=sink?new AppendOnlyStreamTarget(new WritableStream({async write(chunk){abortIf(signal);await sink.write(new Blob([chunk]));bytes+=chunk.byteLength;}})):new BufferTarget();
 try{
  output=new Output({format:new Mp4OutputFormat({fastStart:'fragmented',minimumFragmentDuration:1}),target});
  const videoSource=new CanvasSource(canvas,{codec:'avc',quality:new Quality({bitrate:4000000}),keyFrameInterval:2,hardwareAcceleration:'no-preference'});
  audioSource=new AudioSampleSource({codec:'aac',quality:new Quality({bitrate:128000}),transform:{sampleRate:48000,numberOfChannels:2}});
  output.addVideoTrack(videoSource,{frameRate});output.addAudioTrack(audioSource);await output.start();wake=await navigator.wakeLock?.request('screen').catch(()=>null);
  let audioCursor=0;
  async function silence(until){while(audioCursor<until-1/48000){abortIf(signal);const frames=Math.max(1,Math.min(4800,Math.round((until-audioCursor)*48000))),sample=new AudioSample({data:new Float32Array(frames*2),format:'f32',sampleRate:48000,numberOfChannels:2,timestamp:audioCursor});try{await audioSource.add(sample);}finally{sample.close();}audioCursor+=frames/48000;}}
  for(const clip of clips){
   abortIf(signal);const source=clip.getSource?await clip.getSource():{url:await clip.getUrl()};input=new Input({source:source.blob?new BlobSource(source.blob):new UrlSource(source.url),formats:ALL_FORMATS});
   const track=await input.getPrimaryVideoTrack();if(!track||!await track.canDecode())throw Error('No se puede decodificar «'+clip.name+'» en modo rápido. Prueba Tiempo real.');
   const end=await track.computeDuration();if(clip.startSecond<-.001||clip.endSecond>end+.15||clip.endSecond<=clip.startSecond)throw Error('El vídeo de «'+clip.name+'» no cubre su GPX. Ajusta la sincronización o recorta el tramo.');
   const audioTrack=await input.getPrimaryAudioTrack();if(audioTrack&&!await audioTrack.canDecode())throw Error('No se puede procesar el audio de «'+clip.name+'». Prueba Tiempo real.');
   audioIterator=audioTrack?new AudioSampleSink(audioTrack).samples(clip.startSecond,clip.endSecond):null;currentAudio=audioIterator?await audioIterator.next():{done:true};
   async function audioUntil(until){
    const mediaUntil=clip.startSecond+until-clip.offset;
    while(!currentAudio.done&&currentAudio.value.timestamp<mediaUntil){abortIf(signal);const original=currentAudio.value,rate=original.sampleRate,start=Math.max(0,Math.ceil((clip.startSecond-original.timestamp)*rate)),end=Math.min(original.numberOfFrames,Math.floor((clip.endSecond-original.timestamp)*rate));
     try{if(end>start){const sample=original.trim(start,end);try{const timestamp=clip.offset+sample.timestamp-clip.startSecond;await silence(Math.max(audioCursor,timestamp));sample.setTimestamp(timestamp);await audioSource.add(sample);audioCursor=Math.max(audioCursor,timestamp+sample.duration);}finally{sample.close();}}}finally{original.close();}
     currentAudio=await audioIterator.next();
    }
    // Audio may start late or be absent; keep the output clock continuous.
    const nextTime=currentAudio.done?until:clip.offset+currentAudio.value.timestamp-clip.startSecond;await silence(Math.min(until,Math.max(audioCursor,nextTime)));
   }
   const count=Math.ceil(clip.duration*frameRate),timestamps=(function*(){for(let i=0;i<count;i++)yield clip.startSecond+i/frameRate;})();
   videoIterator=new CanvasSink(track,{width:640,poolSize:2}).canvasesAtTimestamps(timestamps);
   let index=0;
   for await(const wrapped of videoIterator){abortIf(signal);if(!wrapped)throw Error('Falta imagen al inicio de «'+clip.name+'». Ajusta su sincronización.');const second=clip.offset+index/frameRate,duration=Math.min(1/frameRate,total-second,clip.duration-index/frameRate);
    await audioUntil(Math.min(total,second+duration));await composition.prepareVideoFrame?.((clip.sourceOffset??clip.offset)+index/frameRate,signal);drawMovie(ctx,wrapped.canvas,incidents,(clip.sourceOffset??clip.offset)+index/frameRate,composition);drawVideoWatermark(ctx,watermark,canvas.width,canvas.height);await videoSource.add(second,duration);index++;if(index%5===0||index===count)onProgress(Math.min(1,(second+duration)/total),{seconds:second+duration,elapsed:(performance.now()-started)/1000});
   }
   videoIterator=null;await audioUntil(clip.offset+clip.duration);if(currentAudio&&!currentAudio.done)currentAudio.value.close();currentAudio=null;await audioIterator?.return();audioIterator=null;input.dispose();input=null;clip.release?.();
  }
  await silence(total);videoSource.close();audioSource.close();abortIf(signal);await output.finalize();abortIf(signal);if(sink){await sink.close();completed=true;return {saved:true,name:sink.name,bytes,elapsed:(performance.now()-started)/1000};}
  const blob=new Blob([target.buffer],{type:'video/mp4'});if(blob.size<100)throw Error('El MP4 está vacío.');completed=true;return blob;
 }finally{
  if(!completed)await output?.cancel().catch(()=>{});await videoIterator?.return().catch(()=>{});if(currentAudio&&!currentAudio.done)currentAudio.value.close();await audioIterator?.return().catch(()=>{});input?.dispose();await wake?.release();if(!completed)await sink?.abort().catch(()=>{});
 }
}
