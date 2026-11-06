import { DurableObject } from 'cloudflare:workers';
import { Store, Problem, same } from './store.mjs';
import { SCHEMA } from './schema.mjs';
const headers={
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()','Strict-Transport-Security':'max-age=31536000'
};
const json=(data,status=200,cookie)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8',...(cookie?{'Set-Cookie':cookie}:{})}});
function cookie(token,request,expired=false){return 'basurto='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+(expired?'0':'28800')+(new URL(request.url).protocol==='https:'?'; Secure':'')}
export class BasurtoOffice extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;const sql=ctx.storage.sql;
  ctx.storage.transactionSync(()=>{sql.exec(SCHEMA);sql.exec('CREATE TABLE IF NOT EXISTS request_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until REAL NOT NULL)')});
  this.store=new Store({all:(q,...p)=>sql.exec(q,...p).toArray(),run:(q,...p)=>{sql.exec(q,...p).toArray()},tx:fn=>ctx.storage.transactionSync(fn)},env);
 }
 async fetch(request){try{
  const url=new URL(request.url),path=url.pathname,store=this.store;
  if(request.method==='GET'&&path==='/api/config')return json({demo:false,setup:store.setupAvailable()});
  const token=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('basurto='))?.slice(8)||'';
  if(request.method==='GET'){
   const user=store.authenticate(token);
   if(path==='/api/bootstrap')return json(store.bootstrap(user));
   if(path==='/api/incidents')return json(store.incidents(user,url.searchParams.get('id')));
   throw new Problem('No encontrado',404);
  }
  if(request.method!=='POST')throw new Problem('Método no permitido',405);
  if(request.headers.get('Origin')!==url.origin)throw new Problem('Origen no permitido',403);
  if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw new Problem('Formato inválido',415);
  if(Number(request.headers.get('Content-Length'))>16000)throw new Problem('Solicitud demasiado grande',413);
  const reader=request.body?.getReader();if(!reader)throw new Problem('Solicitud inválida');let size=0,chunks=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>16000){await reader.cancel();throw new Problem('Solicitud demasiado grande',413)}chunks.push(value)}
  let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new Problem('Solicitud inválida')}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Problem('Solicitud inválida');
  // Rate limit anonymous expensive auth without keeping plaintext network identifiers.
  if(path==='/api/login'||path==='/api/setup'){
   const {digest}=await import('./store.mjs');const key=digest((request.headers.get('CF-Connecting-IP')||'local')+':'+path),now=Date.now()/1000;
   store.run('DELETE FROM request_limits WHERE until<?',now);
   const row=store.one('SELECT * FROM request_limits WHERE key=?',key);
   if(row&&row.count>=20)throw new Problem('Demasiados intentos. Espera 15 minutos.',429);
   store.run('INSERT OR REPLACE INTO request_limits VALUES(?,?,?)',key,(row?.count||0)+1,row?.until||now+900);
   const session=path==='/api/setup'?store.activate(data):store.login(data);
   return json({csrf:session.csrf},200,cookie(session.token,request));
  }
  const user=store.authenticate(token);
  if(!same(request.headers.get('X-CSRF-Token')||'',user.csrf))throw new Problem('Sesión no válida',403);
  if(path==='/api/logout'){store.logout(token);return json({ok:true},200,cookie('',request,true))}
  if(path==='/api/action')return json(store.mutate(user,data));
  throw new Problem('No encontrado',404);
 }catch(e){return json({error:e instanceof Problem?e.message:'No se pudo completar la operación. Inténtalo de nuevo.'},e instanceof Problem?e.status:500)}}
}
export default {async fetch(request,env){
 if(new URL(request.url).pathname.startsWith('/api/')){
  const namespace=env.LOCAL_DEVELOPMENT==='true'?env.OFFICE:env.OFFICE.jurisdiction('eu');return namespace.get(namespace.idFromName('basurto-office-v1')).fetch(request);
 }
 const response=await env.ASSETS.fetch(request),result=new Response(response.body,response);for(const [k,v] of Object.entries(headers))result.headers.set(k,v);return result;
}};
