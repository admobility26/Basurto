// Bounded, ordered writes: never retain a whole class in renderer memory.
export function movieWriter(sink,{maxPendingBytes=32*1024*1024}={}){
 let pending=0,peak=0,total=0,chain=Promise.resolve(),error=null,ended=false;
 return {
  write(blob){if(ended||error)throw error||Error('El archivo ya está cerrado.');if(pending+blob.size>maxPendingBytes)throw Error('El disco no escribe suficientemente rápido. La exportación se ha detenido sin guardar un MP4 incompleto.');pending+=blob.size;peak=Math.max(peak,pending);const op=chain.then(()=>{if(error)throw error;return sink.write(blob);}).then(()=>{total+=blob.size;}).finally(()=>{pending-=blob.size;});chain=op.catch(e=>{error=e;});return op;},
  async close(){await chain;if(error)throw error;ended=true;await sink.close();return {saved:true,name:sink.name,bytes:total,peakPendingBytes:peak};},
  async abort(){ended=true;await chain;await sink.abort();},
  get pendingBytes(){return pending;},get peakPendingBytes(){return peak;}
 };
}
