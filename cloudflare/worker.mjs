import { DurableObject } from 'cloudflare:workers';
import { Store, Problem, same } from './store.mjs';
import { SCHEMA } from './schema.mjs';
import { Training, validateUpload } from './training.mjs';
const headers={
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-src 'self'; worker-src 'self'; font-src 'self' blob: data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()','Strict-Transport-Security':'max-age=31536000'
};
const json=(data,status=200,cookie)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8',...(cookie?{'Set-Cookie':cookie}:{})}});
function cookie(token,request,expired=false){return 'basurto='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+(expired?'0':'28800')+(new URL(request.url).protocol==='https:'?'; Secure':'')}
export class BasurtoOffice extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;const sql=ctx.storage.sql;
  ctx.storage.transactionSync(()=>{sql.exec(SCHEMA);sql.exec('CREATE TABLE IF NOT EXISTS request_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until REAL NOT NULL)')});
  this.store=new Store({all:(q,...p)=>sql.exec(q,...p).toArray(),run:(q,...p)=>{sql.exec(q,...p).toArray()},tx:fn=>ctx.storage.transactionSync(fn)},env);
  this.training=new Training(this.store);this.training.initialize();
 }
 async fetch(request){try{
  const url=new URL(request.url),path=url.pathname,store=this.store;
  if(request.method==='GET'&&path==='/api/config')return json({demo:false,setup:store.setupAvailable()});
  const token=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('basurto='))?.slice(8)||'';
  if(request.method==='GET'){
   const user=store.authenticate(token);
   if(path==='/api/bootstrap')return json(store.bootstrap(user));
   if(path==='/api/training')return json(this.training.data(user));
   if(path==='/api/training/lesson')return json(this.training.lesson(user,url.searchParams.get('id')));
   if(path==='/api/training/presentation')return json(this.training.presentation(user,url.searchParams.get('id'),url.searchParams.get('signals')?.split(',')));
   if(path==='/api/training/file'){
    const asset=this.training.file(user,url.searchParams.get('id'));
    const object=await this.env.TRAINING_FILES.get(asset.object_key,{range:request.headers});
    if(!object)throw new Problem('Archivo no encontrado',404);
    const h={...headers,'Content-Type':asset.mime,'Content-Disposition':'inline; filename="'+asset.filename.replace(/[^a-zA-Z0-9._-]/g,'_')+'"','Accept-Ranges':'bytes','Content-Length':String(object.range?.length??object.size),'Content-Security-Policy':"default-src 'none'; frame-ancestors 'self'; sandbox"};
    if(object.range)h['Content-Range']=`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`;
    return new Response(object.body,{status:object.range?206:200,headers:h});
   }
   if(path==='/api/incidents')return json(store.incidents(user,url.searchParams.get('id')));
   throw new Problem('No encontrado',404);
  }
  if(request.method!=='POST')throw new Problem('Método no permitido',405);
  if(request.headers.get('Origin')!==url.origin)throw new Problem('Origen no permitido',403);
  if(path==='/api/training/upload')return await this.upload(request,token);
  if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw new Problem('Formato inválido',415);
  const bodyLimit=path==='/api/training/action'?240000:16000;
  if(Number(request.headers.get('Content-Length'))>bodyLimit)throw new Problem('Solicitud demasiado grande',413);
  const reader=request.body?.getReader();if(!reader)throw new Problem('Solicitud inválida');let size=0,chunks=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>bodyLimit){await reader.cancel();throw new Problem('Solicitud demasiado grande',413)}chunks.push(value)}
  let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new Problem('Solicitud inválida')}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Problem('Solicitud inválida');
  // Rate limit anonymous expensive auth without keeping plaintext network identifiers.
  if(path==='/api/login'||path==='/api/setup'||path==='/api/recover'){
   const {digest}=await import('./store.mjs');const key=digest((request.headers.get('CF-Connecting-IP')||'local')+':'+path),now=Date.now()/1000;
   store.run('DELETE FROM request_limits WHERE until<?',now);
   const row=store.one('SELECT * FROM request_limits WHERE key=?',key);
   if(row&&row.count>=20)throw new Problem('Demasiados intentos. Espera 15 minutos.',429);
   store.run('INSERT OR REPLACE INTO request_limits VALUES(?,?,?)',key,(row?.count||0)+1,row?.until||now+900);
   if(path==='/api/recover')return json(store.recover(data),200,cookie('',request,true));
   const session=path==='/api/setup'?store.activate(data):store.login(data);
   return json({csrf:session.csrf},200,cookie(session.token,request));
  }
  const user=store.authenticate(token);
  if(!same(request.headers.get('X-CSRF-Token')||'',user.csrf))throw new Problem('Sesión no válida',403);
  if(path==='/api/logout'){store.logout(token);return json({ok:true},200,cookie('',request,true))}
  if(path==='/api/training/action')return json(this.training.mutate(user,data));
  if(path==='/api/action')return json(store.mutate(user,data));
  throw new Problem('No encontrado',404);
 }catch(e){return json({error:e instanceof Problem?e.message:'No se pudo completar la operación. Inténtalo de nuevo.'},e instanceof Problem?e.status:500)}}
 async upload(request,token){
  let user=this.store.authenticate(token);
  if(!same(request.headers.get('X-CSRF-Token')||'',user.csrf))throw new Problem('Sesión no válida',403);
  const mime=request.headers.get('Content-Type')?.split(';')[0];
  if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(mime))throw new Problem('Formato no admitido',415);
  if(mime==='application/pdf'&&user.role==='teacher')throw new Problem('Solo oficina sube manuales',403);
  const limit=mime==='application/pdf'?25*1024*1024:5*1024*1024;
  if(Number(request.headers.get('Content-Length'))>limit)throw new Problem('El archivo supera el tamaño permitido',413);
  const reader=request.body?.getReader();if(!reader)throw new Problem('Archivo vacío');let size=0;const chunks=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Problem('El archivo supera el tamaño permitido',413)}chunks.push(value)}
  const bytes=Buffer.concat(chunks);const kind=validateUpload(mime,bytes);user=this.store.authenticate(token);
  const since=new Date(Date.now()-86400000).toISOString();
  const usage=this.store.one('SELECT COUNT(*) AS n,COALESCE(SUM(size),0) AS size FROM training_assets WHERE owner_id=? AND created_at>?',user.id,since);
  if(usage.n>=100||usage.size+size>200*1024*1024)throw new Problem('Límite diario de archivos alcanzado',429);
  const assetId=crypto.randomUUID(),key='formation/assets/'+assetId;
  let filename='archivo';try{filename=decodeURIComponent(request.headers.get('X-File-Name')||'archivo').slice(0,160)}catch{}
  await this.env.TRAINING_FILES.put(key,bytes,{httpMetadata:{contentType:mime}});
  try{user=this.store.authenticate(token);this.store.run('INSERT INTO training_assets VALUES(?,?,?,?,?,?,?,?)',assetId,user.id,kind,mime,size,filename,key,new Date().toISOString())}catch(e){await this.env.TRAINING_FILES.delete(key);throw e}
  return json({id:assetId,filename,size,kind},201);
 }

}
export default {async fetch(request,env){
 if(new URL(request.url).pathname.startsWith('/api/')){
  const namespace=env.LOCAL_DEVELOPMENT==='true'?env.OFFICE:env.OFFICE.jurisdiction('eu');return namespace.get(namespace.idFromName('basurto-office-v1')).fetch(request);
 }
 const response=await env.ASSETS.fetch(request),result=new Response(response.body,response);for(const [k,v] of Object.entries(headers))result.headers.set(k,v);if(new URL(request.url).pathname.replace(/\.html$/,'')==='/pdf-viewer')result.headers.set('Content-Security-Policy',headers['Content-Security-Policy'].replace("frame-ancestors 'none'","frame-ancestors 'self'"));return result;
}};
