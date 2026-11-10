// Crop only the export plan; source GPX, videos and incidents are never modified.
export function trimMovieClip(clip,videoDuration,offset=0){
 if(!Number.isFinite(videoDuration)||videoDuration<=0)throw Error('Espera a que se cargue el vídeo antes de exportar.');
 const originalStart=clip.startSecond,originalEnd=clip.endSecond;
 if(!Number.isFinite(originalStart)||!Number.isFinite(originalEnd)||originalEnd<=originalStart)throw Error('El tramo seleccionado no tiene un intervalo válido para exportar.');
 const startSecond=Math.max(0,originalStart),endSecond=Math.min(videoDuration,originalEnd);
 if(endSecond<=startSecond)throw Error('El GPX y el vídeo de «'+clip.name+'» no tienen un tramo común. Ajusta su sincronización antes de exportar.');
 return {...clip,startSecond,endSecond,duration:endSecond-startSecond,offset,sourceOffset:(clip.sourceOffset??clip.offset??0)+startSecond-originalStart};
}
export function trimMovieClips(clips,durations){let offset=0;return clips.map((clip,i)=>{const cropped=trimMovieClip(clip,durations[i],offset);offset+=cropped.duration;return cropped;});}
export async function movieSourceDuration(source){
 const {Input,BlobSource,UrlSource,ALL_FORMATS}=await import('mediabunny');
 const input=new Input({source:source.blob?new BlobSource(source.blob):new UrlSource(source.url),formats:ALL_FORMATS});
 try{const track=await input.getPrimaryVideoTrack();if(!track)throw Error('El archivo no contiene una pista de vídeo.');return await track.computeDuration();}finally{input.dispose();}
}
