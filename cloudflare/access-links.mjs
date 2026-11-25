import {randomBytes} from 'node:crypto';
import {Problem,digest} from './store.mjs';
const emailOf=v=>{const email=String(v||'').trim().toLowerCase();if(email.length>100||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Problem('Introduce un correo válido');return email};
export class AccessLinks{
 constructor(store){this.s=store;store.run('CREATE TABLE IF NOT EXISTS access_links(token TEXT PRIMARY KEY,purpose TEXT NOT NULL,email TEXT NOT NULL,name TEXT NOT NULL,user_id TEXT,revision TEXT,expires REAL NOT NULL,used INTEGER NOT NULL DEFAULT 0)')}
 issue(actor,data,setup=false){
  if(!setup&&!['admin','manager'].includes(actor.role))throw new Problem('Solo administración y gerencia pueden gestionar invitaciones',403);
  const email=emailOf(data.email),purpose=setup?(data.purpose==='reset'?'reset':'setup'):data.purpose;
  if(!['setup','invite','reset'].includes(purpose)||(!setup&&purpose==='setup'))throw new Problem('Operación no permitida',403);
  let target=null,name=String(data.name||'').trim();
  if(purpose==='setup'){if(this.s.one("SELECT 1 FROM users WHERE role IN ('admin','manager') AND substr(id,1,9)!='platform_'"))throw new Problem('Administración ya está activada',409);name='Administración';}
  if(purpose==='invite'){if(!name||name.length>160)throw new Problem('Indica el nombre del profesor');if(this.s.one('SELECT 1 FROM users WHERE lower(username)=?',email))throw new Problem('La cuenta ya existe. Utiliza restablecer contraseña.',409)}
  if(purpose==='reset'){target=setup?this.s.one("SELECT * FROM users WHERE lower(username)=? AND active=1 AND substr(id,1,9)!='platform_'",email):this.s.one("SELECT * FROM users WHERE id=? AND active=1 AND role='teacher'",data.user_id||'');if(!target||target.username.toLowerCase()!==email)throw new Problem('No hay una cuenta activa con esos datos',400);name=target.name;}
  const token=randomBytes(32).toString('hex'),expires=Date.now()/1000+(purpose==='reset'?3600:48*3600);
  this.s.tx(()=>{this.s.run('UPDATE access_links SET used=1 WHERE purpose=? AND (email=? OR purpose=\'setup\')',purpose,email);this.s.run('INSERT INTO access_links VALUES(?,?,?,?,?,?,?,0)',digest(token),purpose,email,name,target?.id||null,target?this.s.revision(target):null,expires);this.s.run('INSERT INTO audit(actor,action,entity,at) VALUES(?,?,?,?)',actor.id,'access_link_'+purpose,target?.id||'invitation',new Date().toISOString())});
  return {token,email,expires,purpose};
 }
 accept(data){return this.s.tx(()=>{
  if(typeof data.token!=='string'||! /^[a-f0-9]{64}$/.test(data.token))throw new Problem('Enlace no válido o caducado',403);
  const row=this.s.one('SELECT * FROM access_links WHERE token=? AND used=0 AND expires>?',digest(data.token),Date.now()/1000);if(!row)throw new Problem('Enlace no válido, caducado o ya utilizado',403);
  if(typeof data.password!=='string'||data.password.length<12||data.password.length>200)throw new Problem('Usa una contraseña de entre 12 y 200 caracteres');if(data.password!==data.confirmation)throw new Problem('Las contraseñas no coinciden');
  this.s.completeAccessLink(row,data.password);this.s.run('UPDATE access_links SET used=1 WHERE token=?',row.token);this.s.run('UPDATE access_links SET used=1 WHERE email=?',row.email);
  return {ok:true,email:row.user_id?this.s.one('SELECT username FROM users WHERE id=?',row.user_id).username:row.email};
 })}
}
