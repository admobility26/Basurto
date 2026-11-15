// Capture before export so permission errors cannot produce a silent narrated movie.
export async function openNarration(audio, mediaDevices=navigator.mediaDevices) {
 if(!mediaDevices?.getUserMedia) throw Error('El micrófono no está disponible. Abre Basurto con HTTPS o en la aplicación.');
 let stream,source,analyser,timer;
 try {
  await audio.resume();
  stream=await mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  const track=stream.getAudioTracks()[0];
  if(!track||track.readyState!=='live'||!track.enabled)throw Error('El micrófono no está activo. Revisa los permisos de grabación.');
  source=audio.createMediaStreamSource(stream);analyser=audio.createAnalyser();analyser.fftSize=512;source.connect(analyser);
  const samples=new Float32Array(analyser.fftSize);
  return {stream,source,label:track.label||'Micrófono',level(){analyser.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);},assertLive(){if(track.readyState!=='live'||!track.enabled||track.muted)throw Error('Se ha interrumpido el micrófono. Vuelve a activarlo antes de exportar.');},close(){clearInterval(timer);source.disconnect();analyser.disconnect();stream.getTracks().forEach(t=>t.stop());}};
 }catch(error){source?.disconnect();stream?.getTracks().forEach(t=>t.stop());if(error.name==='NotAllowedError'||error.name==='SecurityError')throw Error('Permiso de micrófono denegado. Actívalo para esta aplicación o web y vuelve a probar.');if(error.name==='NotFoundError')throw Error('No se encuentra ningún micrófono. Conecta uno y vuelve a probar.');throw error;}
}
