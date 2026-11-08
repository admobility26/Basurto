// Bounded content fingerprint for relinking a user-selected original, not a signature of the entire file.
export async function mediaIdentity(file){
 if(!file||file.size<=0||file.size>50*1024**3)throw Error('Selecciona un vídeo de hasta 50 GB.');
 if(!['video/mp4','video/webm','video/quicktime'].includes(file.type)&&!/\.(mp4|webm|mov)$/i.test(file.name))throw Error('Selecciona un vídeo MP4, WebM o MOV.');
 const sample=await new Blob([String(file.size),file.slice(0,65536),file.slice(Math.max(0,file.size-65536))]).arrayBuffer();
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',sample))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
