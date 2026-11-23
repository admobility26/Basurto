import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withMapCache} from '../modules/routes/src/mapFetch.js';

test('native maps load online when CacheStorage is missing or rejects the origin',async()=>{
 const previous=globalThis.location;globalThis.location={href:'tauri://localhost/routes/index.html'};
 const url='https://www.geo.euskadi.eus/tile';let calls=0;const online=new Response('tile');
 try{
  for(const cache of [undefined,{open:async()=>{throw new Error('SecurityError')}}]){
   const fetcher=withMapCache(async input=>{assert.equal(input,url);calls++;return online},cache);
   assert.equal(await fetcher(url),online);
  }
  const cached=new Response('offline tile');assert.equal(await withMapCache(()=>{throw Error('Network must not be used')},{open:async()=>({match:async()=>cached})})(url),cached);
  assert.equal(calls,2);
 }finally{globalThis.location=previous;}
});

test('native tile transport bypasses WebView fetch and honors cancellation',async()=>{
 const previous=globalThis.location;globalThis.location={href:'tauri://localhost/routes/index.html'};let calls=0;
 try{const fetcher=withMapCache(()=>{throw Error('WebView network must not be used')},null,async url=>{calls++;assert(url.startsWith('https://www.geo.euskadi.eus/'));return {mime:'image/png',data:btoa('tile bytes')}});
 const r=await fetcher('https://www.geo.euskadi.eus/tile');assert.equal(await r.text(),'tile bytes');assert.equal(r.headers.get('content-type'),'image/png');
 const c=new AbortController();c.abort();await assert.rejects(()=>fetcher('https://www.geo.euskadi.eus/tile',{signal:c.signal}),{name:'AbortError'});assert.equal(calls,1);
 }finally{globalThis.location=previous;}
});
