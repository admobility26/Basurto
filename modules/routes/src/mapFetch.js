export function withMapCache(fetcher,cacheStorage,nativeTile){
 return async(resource,options)=>{
  const url=new URL(typeof resource==='string'?resource:resource.url,location.href);
  if(['www.geo.euskadi.eus','www.ign.es'].includes(url.hostname)&&url.protocol==='https:'&&(!options?.method||options.method==='GET')){
   try{const cache=await cacheStorage?.open(url.hostname==='www.ign.es'?'ortofoto-pnoa-v1':'ortofoto-euskadi-v1');const saved=await cache?.match(resource);if(saved)return saved;}catch{/* A native WebView may not support CacheStorage; online maps still work. */}
  }
  if(nativeTile&&['www.geo.euskadi.eus','www.ign.es','tile.openstreetmap.org'].includes(url.hostname)&&url.protocol==='https:'&&(!options?.method||options.method==='GET')){if(options?.signal?.aborted)throw new DOMException('Cancelado','AbortError');const result=await nativeTile(url.href);if(options?.signal?.aborted)throw new DOMException('Cancelado','AbortError');return new Response(Uint8Array.from(atob(result.data),c=>c.charCodeAt(0)),{headers:{'Content-Type':result.mime}})}
  return fetcher(resource,options);
 };
}
