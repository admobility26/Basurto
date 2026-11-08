// Unit tests for the actual client functions with an in-memory storage adapter.
// No browser automation: the UI is verified separately in Chrome.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const storage=new Map(),records=new Map();
const db={transaction(){const tx={objectStore(){return {put(value,key){records.set(key,structuredClone(value));setTimeout(()=>tx.oncomplete?.(),0)},delete(key){records.delete(key);setTimeout(()=>tx.oncomplete?.(),0)},get(key){const r={};setTimeout(()=>{r.result=records.get(key);r.onsuccess?.()},0);return r}}}};return tx},close(){}};
const context={crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Date,JSON,Number,String,Set,Map,Promise,Array,Object,console,AbortSignal,setTimeout,clearTimeout,setInterval(){},navigator:{onLine:true},window:{addEventListener(){}},document:{querySelector(){return {classList:{add(){},remove(){}},querySelectorAll(){return [{},{},{}]}}}},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},indexedDB:{open(){const r={};setTimeout(()=>{r.result=db;r.onsuccess?.()},0);return r}},btoa:v=>Buffer.from(v,'binary').toString('base64'),atob:v=>Buffer.from(v,'base64').toString('binary'),fetch:async()=>{throw new Error('offline')}};
vm.createContext(context);let src=fs.readFileSync('static/app.js','utf8');src=src.slice(0,src.lastIndexOf('(async()=>'));vm.runInContext(src,context);
(async()=>{
 await vm.runInContext(`state={user:{id:'teacher-a',expires:Date.now()/1000+3600},students:[],lessons:[],server_time:new Date().toISOString()};csrf='test';drafts={lesson:{note:'Nota ficticia'}};persist()`,context);
 const key=storage.get('basurto-key'),id=storage.get('basurto-cache-id');assert.notEqual(key,id);assert(records.has(id));assert(!records.has(key));assert(!JSON.stringify([...records]).includes('Nota ficticia'));
 assert.equal(await vm.runInContext(`state=null;drafts={};restore()`,context),true);assert.equal(vm.runInContext('drafts.lesson.note',context),'Nota ficticia');
 await vm.runInContext(`offline=true;saveAction({action:'book',student_id:'s1',start:'2027-01-01T09:00:00Z'})`,context);assert.equal(vm.runInContext('pending.length',context),1);assert.equal(vm.runInContext('state.lessons.length',context),0);
 await vm.runInContext(`state=null;pending=[];restore()`,context);assert.equal(vm.runInContext('pending.length',context),1);
 storage.set('basurto-key',Buffer.alloc(32,9).toString('base64'));assert.equal(await vm.runInContext('restore()',context),false);storage.set('basurto-key',key);
 await vm.runInContext('wipe()',context);assert.equal(records.size,0);assert.equal(storage.has('basurto-key'),false);
 let nativeRecord=null;context.window.NativeVault={write:async r=>{nativeRecord=structuredClone(r)},read:async()=>structuredClone(nativeRecord),clear:async()=>{nativeRecord=null}};
 await vm.runInContext(`state={user:{id:'teacher-a',expires:0},students:[],lessons:[]};pending=[{data:{action:'sheet',note:'Pending after restart'}}];drafts={lesson:{note:'Draft after restart'}};persist()`,context);assert.equal(storage.size,0);
 assert.equal(await vm.runInContext(`state=null;pending=[];drafts={};restore()`,context),true);assert.equal(vm.runInContext('pending[0].data.note',context),'Pending after restart');
 context.fetch=async()=>({ok:true,json:async()=>({user:{id:'another-account'}})});await assert.rejects(()=>vm.runInContext('refresh()',context),/pendientes/);assert.equal(nativeRecord.state.user.id,'teacher-a');assert.equal(vm.runInContext('pending.length',context),1);
 await vm.runInContext('wipe()',context);assert.equal(nativeRecord,null);
 let renderCount=0;context.recordRender=()=>renderCount++;
 vm.runInContext(`render=()=>recordRender();state={user:{id:'office',expires:Date.now()/1000+3600},incidents_revision:'old'};pending=[];drafts={};offline=false;tab='incidents';`,context);
 context.fetch=async()=>({ok:true,json:async()=>({user:{id:'office',expires:vm.runInContext('state.user.expires',context)},incidents_revision:'new',server_time:new Date().toISOString()})});
 await vm.runInContext('sync()',context);assert.equal(renderCount,1,'An incident-only server change must refresh the view');
 await assert.rejects(()=>vm.runInContext(`saveAction({action:'delete_record'})`,context),/conexión/);
 await assert.rejects(()=>vm.runInContext(`saveAction({action:'edit_user',password:'private'})`,context),/conexión/);
 assert.equal(vm.runInContext('pending.length',context),0);
 console.log('PASS: native encrypted adapter restart, expired-session pending retention, account isolation; encrypted cache, separate key/id, reload recovery, provisional offline reservation, wrong-key rejection and logout cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
