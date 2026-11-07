import { Problem, digest } from './store.mjs';
import seedSignals from './signals-seed.json' with { type: 'json' };
export const TRAINING_SCHEMA=`
CREATE TABLE IF NOT EXISTS training_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS training_assets(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,kind TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,filename TEXT NOT NULL,object_key TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS training_signals(id TEXT PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,meaning TEXT NOT NULL,category TEXT NOT NULL,source TEXT NOT NULL DEFAULT '',image_id TEXT,builtin_image TEXT,owner_id TEXT,published INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS training_manuals(id TEXT PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,published INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS training_manual_versions(id TEXT PRIMARY KEY,manual_id TEXT NOT NULL REFERENCES training_manuals(id),number INTEGER NOT NULL,asset_id TEXT NOT NULL REFERENCES training_assets(id),created_at TEXT NOT NULL,UNIQUE(manual_id,number));
CREATE TABLE IF NOT EXISTS training_lessons(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,slides TEXT NOT NULL,notes TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
`;
const staff=u=>['admin','manager'].includes(u.role),stamp=()=>new Date().toISOString(),id=()=>crypto.randomUUID();
const req=(d,k,n=160)=>{const v=d[k];if(typeof v!=='string'||!v.trim()||v.length>n)throw new Problem('Revisa el campo '+k);return v.trim()};
const optional=(d,k,n=2000)=>{const v=d[k]??'';if(typeof v!=='string'||v.length>n)throw new Problem('Revisa el campo '+k);return v.trim()};
const revision=(row,d)=>{if(row.revision!==d.revision)throw new Problem('Otro dispositivo ha actualizado este contenido. Ciérralo y vuelve a abrirlo para revisar los cambios.',409)};
export class Training {
 constructor(store){this.s=store}
 initialize(){this.s.tx(()=>{for(const statement of TRAINING_SCHEMA.split(';').filter(x=>x.trim()))this.s.run(statement);if(!this.s.one("SELECT 1 FROM training_meta WHERE key='signals-seed-v1'")){
  for(const v of seedSignals)this.s.run('INSERT OR IGNORE INTO training_signals(id,code,name,meaning,category,source,builtin_image,published,updated_at) VALUES(?,?,?,?,?,?,?,1,?)','seed-'+v.code,v.code,v.name,v.meaning,v.category,'Catálogo de interactive-wiki · importación inicial',v.image,stamp());
  this.s.run("INSERT INTO training_meta VALUES('signals-seed-v1','1')");
 }})}
 signal(user,entity){const r=this.s.one('SELECT * FROM training_signals WHERE id=?',entity);if(!r||(!staff(user)&&r.owner_id!==user.id&&(!r.published||r.archived)))throw new Problem('Señal no disponible',404);return r}
 manual(user,entity){const r=this.s.one('SELECT * FROM training_manuals WHERE id=?',entity);if(!r||(!staff(user)&&(!r.published||r.archived)))throw new Problem('Manual no disponible',404);return r}
 lesson(user,entity){const r=this.s.one('SELECT * FROM training_lessons WHERE id=?',entity);if(!r||(!staff(user)&&r.owner_id!==user.id))throw new Problem('Clase no disponible',404);return {...r,slides:JSON.parse(r.slides)}}
 file(user,entity){const a=this.s.one('SELECT * FROM training_assets WHERE id=?',entity);if(!a)throw new Problem('Archivo no disponible',404);if(staff(user)||a.owner_id===user.id)return a;
  const signal=this.s.one('SELECT 1 FROM training_signals WHERE image_id=? AND published=1 AND archived=0',entity);
  const manual=this.s.one('SELECT 1 FROM training_manual_versions v JOIN training_manuals m ON m.id=v.manual_id WHERE v.asset_id=? AND m.published=1 AND m.archived=0',entity);
  if(!signal&&!manual)throw new Problem('Archivo no disponible',404);return a;
 }
 assetForWrite(user,entity,kind){const a=this.s.one('SELECT * FROM training_assets WHERE id=?',entity);if(!a||a.kind!==kind||(!staff(user)&&a.owner_id!==user.id))throw new Problem('Selecciona un archivo válido',403);return a}
 data(user){const common=staff(user)?'':' AND (published=1 OR owner_id=?)';const signals=this.s.all('SELECT * FROM training_signals WHERE archived=0'+common+' ORDER BY code',...(staff(user)?[]:[user.id]));
  const manuals=this.s.all('SELECT * FROM training_manuals WHERE archived=0'+(staff(user)?'':' AND published=1')+' ORDER BY title');
  const versions=manuals.length?this.s.all('SELECT v.*,a.filename,a.size FROM training_manual_versions v JOIN training_assets a ON a.id=v.asset_id JOIN training_manuals m ON m.id=v.manual_id WHERE m.archived=0'+(staff(user)?'':' AND m.published=1')+' ORDER BY v.number DESC'):[];
  const lessons=this.s.all('SELECT id,owner_id,title,description,revision,updated_at FROM training_lessons WHERE archived=0'+(staff(user)?'':' AND owner_id=?')+' ORDER BY updated_at DESC',...(staff(user)?[]:[user.id]));
  return {signals:signals.map(s=>({...s,owner_id:staff(user)||s.owner_id===user.id?s.owner_id:null})),manuals,versions,lessons};
 }
 // Validate each reference in the user's scope and pin exact PDF versions.
 slides(user,items){if(!Array.isArray(items)||items.length<1||items.length>60)throw new Problem('Añade entre 1 y 60 pasos a la clase');return items.map(d=>{
  const kind=d.kind,title=optional(d,'title',160);
  if(kind==='signal'){const signal_id=req(d,'signal_id');const r=this.signal(user,signal_id);if(r.archived)throw new Problem('La señal está archivada');return {kind,title,signal_id}}
  if(kind==='pdf'){const version_id=req(d,'version_id'),v=this.s.one('SELECT * FROM training_manual_versions WHERE id=?',version_id);if(!v)throw new Problem('Versión de manual no disponible');this.manual(user,v.manual_id);const from=d.page_from,to=d.page_to;if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to>5000||to-from>99)throw new Problem('Revisa el intervalo de páginas (máximo 100)');return {kind,title,version_id,page_from:from,page_to:to}}
  if(kind==='text')return {kind,title,text:req(d,'text',4000)};
  if(kind==='question')return {kind,title,prompt:req(d,'prompt',2000),answer:req(d,'answer',2000),explanation:optional(d,'explanation',2000)};
  throw new Problem('Tipo de paso inválido');
 })}
 presentation(user,entity,signalIds){let items,title;
  if(entity){const lesson=this.lesson(user,entity);if(lesson.archived)throw new Problem('La clase está archivada',404);items=lesson.slides;title=lesson.title}
  else{if(!Array.isArray(signalIds)||!signalIds.length||signalIds.length>60)throw new Problem('Selecciona entre 1 y 60 señales');items=signalIds.map(signal_id=>({kind:'signal',signal_id}));title='Práctica de señales'}
  const slides=items.map(d=>{
   if(d.kind==='signal'){const r=this.signal(user,d.signal_id);if(r.archived)throw new Problem('La clase contiene una señal archivada. Revisa su preparación.',409);return {kind:'signal',title:d.title||r.code,code:r.code,name:r.name,meaning:r.meaning,image:r.image_id?'/api/training/file?id='+encodeURIComponent(r.image_id):r.builtin_image}}
   if(d.kind==='pdf'){const v=this.s.one('SELECT * FROM training_manual_versions WHERE id=?',d.version_id);if(!v)throw new Problem('Versión no disponible',404);const m=this.manual(user,v.manual_id);if(m.archived)throw new Problem('El manual está archivado',409);return {...d,title:d.title||m.title,version:v.number,url:'/api/training/file?id='+encodeURIComponent(v.asset_id)}}
   return d;
  });return {title,slides}; // No author, roster, private notes or student information on the projector.
 }
 mutate(user,data){return this.s.tx(()=>{
  const operation=req(data,'operation_id',100);const payload=digest(JSON.stringify(data));const prior=this.s.one('SELECT * FROM operations WHERE id=?',operation);
  if(prior){if(prior.user_id!==user.id||prior.payload!==payload)throw new Problem('Operación incompatible',409);return JSON.parse(prior.result)}
  let entity=data.id||id();const now=stamp();
  if(data.action==='signal'){
   const old=data.id?this.signal(user,entity):null;
   if(old){revision(old,data);if(!staff(user)&&(old.owner_id!==user.id||old.published))throw new Problem('Solo oficina puede editar señales publicadas',403)}
   if(!staff(user)&&data.published)throw new Problem('Oficina debe publicar las nuevas señales',403);
   const code=req(data,'code',40).toUpperCase();if(!/^[A-Z0-9ÁÉÍÓÚÜÑ._ -]+$/.test(code))throw new Problem('Código inválido');
   if(this.s.one('SELECT 1 FROM training_signals WHERE code=? COLLATE NOCASE AND id!=?',code,entity))throw new Problem('Ya existe una señal con ese código',409);
   const image=data.image_id||null;if(image)this.assetForWrite(user,image,'image');
   const values=[code,req(data,'name'),req(data,'meaning',3000),req(data,'category',100),optional(data,'source',500),image,data.published?1:0,now];
   if(old)this.s.run('UPDATE training_signals SET code=?,name=?,meaning=?,category=?,source=?,image_id=?,published=?,updated_at=?,revision=revision+1 WHERE id=?',...values,entity);
   else this.s.run('INSERT INTO training_signals(code,name,meaning,category,source,image_id,published,updated_at,id,owner_id) VALUES(?,?,?,?,?,?,?,?,?,?)',...values,entity,user.id);
  }else if(data.action==='manual'){
   if(!staff(user))throw new Problem('Solo oficina gestiona la biblioteca',403);
   const old=data.id?this.manual(user,entity):null;if(old)revision(old,data);
   if(!old&&!data.asset_id)throw new Problem('Selecciona el PDF');
   if(data.asset_id)this.assetForWrite(user,data.asset_id,'pdf');
   const values=[req(data,'title'),req(data,'category',100),optional(data,'description',2000),data.published?1:0,now];
   if(old)this.s.run('UPDATE training_manuals SET title=?,category=?,description=?,published=?,updated_at=?,revision=revision+1 WHERE id=?',...values,entity);
   else this.s.run('INSERT INTO training_manuals(title,category,description,published,updated_at,id) VALUES(?,?,?,?,?,?)',...values,entity);
   if(data.asset_id){const n=this.s.one('SELECT COALESCE(MAX(number),0)+1 AS n FROM training_manual_versions WHERE manual_id=?',entity).n;this.s.run('INSERT INTO training_manual_versions VALUES(?,?,?,?,?)',id(),entity,n,data.asset_id,now)}
  }else if(data.action==='lesson'){
   const old=data.id?this.lesson(user,entity):null;if(old)revision(old,data);const slides=this.slides(user,data.slides);
   const values=[req(data,'title'),optional(data,'description',1000),JSON.stringify(slides),optional(data,'notes',4000),now];
   if(old)this.s.run('UPDATE training_lessons SET title=?,description=?,slides=?,notes=?,updated_at=?,revision=revision+1 WHERE id=?',...values,entity);
   else this.s.run('INSERT INTO training_lessons(title,description,slides,notes,updated_at,id,owner_id) VALUES(?,?,?,?,?,?,?)',...values,entity,user.id);
  }else if(data.action==='archive'){
   const kind=data.kind;if(!['signal','manual','lesson'].includes(kind))throw new Problem('Tipo inválido');
   const row=this[kind](user,entity);revision(row,data);
   if(kind!=='lesson'&&!staff(user)&&(kind!=='signal'||row.owner_id!==user.id||row.published))throw new Problem('Acceso no permitido',403);
   const table={signal:'training_signals',manual:'training_manuals',lesson:'training_lessons'}[kind];this.s.run('UPDATE '+table+' SET archived=1,revision=revision+1,updated_at=? WHERE id=?',now,entity);
  }else throw new Problem('Acción desconocida');
  this.s.run('INSERT INTO audit(actor,action,entity,at) VALUES(?,?,?,?)',user.id,'training_'+data.action,entity,now);const result={ok:true,id:entity};this.s.run('INSERT INTO operations VALUES(?,?,?,?)',operation,user.id,payload,JSON.stringify(result));return result;
 })}
}
export function validateUpload(mime,bytes){const b=bytes;
 if(mime==='application/pdf'&&Buffer.from(b.slice(0,5)).toString()==='%PDF-')return 'pdf';
 if(mime==='image/png'&&Buffer.from(b.slice(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image';
 if(mime==='image/jpeg'&&b[0]===255&&b[1]===216&&b[2]===255)return 'image';
 if(mime==='image/webp'&&Buffer.from(b.slice(0,4)).toString()==='RIFF'&&Buffer.from(b.slice(8,12)).toString()==='WEBP')return 'image';
 throw new Problem('Archivo inválido. Usa PDF, PNG, JPG o WebP',415);
}
