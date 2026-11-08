import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { GOALS } from './schema.mjs';
export class Problem extends Error { constructor(message,status=400){super(message);this.status=status} }
const id=()=>randomBytes(24).toString('hex'), now=()=>new Date().toISOString(), seconds=()=>Date.now()/1000;
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function same(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)}
const hash=(password,salt=randomBytes(16).toString('hex'))=>salt+':'+scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');
function required(data,key,limit=160){const v=data[key];if(typeof v!=='string'||!v.trim()||v.length>limit)throw new Problem('Revisa el campo '+key);return v.trim()}
function password(data){if(typeof data.password!=='string'||data.password.length<12||data.password.length>200)throw new Problem('La contraseña debe tener entre 12 y 200 caracteres');return data.password}
function date(v){if(typeof v!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))throw new Problem('Fecha y hora inválidas');return new Date(v).toISOString()}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v}
export class Store {
 constructor(db,env={}){this.db=db;this.env=env}
 all(sql,...params){return this.db.all(sql,...params)}
 one(sql,...params){return this.all(sql,...params)[0]}
 run(sql,...params){return this.db.run(sql,...params)}
 tx(fn){return this.db.tx(fn)}
 archived(kind,entity){return Boolean(this.one('SELECT 1 FROM archived_records WHERE kind=? AND entity=?',kind,entity))}
 revision(row){return digest(JSON.stringify(canonical(row)))}
 account(row){const {password,...safe}=row;return {...safe,revision:this.revision(row)}}
 setupAvailable(){return Boolean(this.env.ADMIN_EMAIL&&this.env.ADMIN_ACTIVATION_HASH&&Number(this.env.ADMIN_ACTIVATION_EXPIRES)>seconds()&&!this.one("SELECT 1 FROM users WHERE role IN ('admin','manager')"))}
 activate(data){return this.tx(()=>{
  const secret=required(data,'activation',100),username=required(data,'username',100),pass=password(data);
  if(pass!==data.confirmation)throw new Problem('Las contraseñas deben coincidir');
  if(!this.setupAvailable()||username!==this.env.ADMIN_EMAIL||!same(digest(secret),this.env.ADMIN_ACTIVATION_HASH))throw new Problem('Activación no válida o caducada',403);
  const uid=id();this.run('INSERT INTO users VALUES(?,?,?,?,?,1)',uid,'Administración',username,hash(pass),'admin');
  this.run('INSERT INTO audit(actor,action,entity,at) VALUES(?,?,?,?)',uid,'activate_admin',uid,now());return this.session(uid);
 })}
 recover(data){return this.tx(()=>{
  const token=required(data,'recovery',160),username=required(data,'username',100),tokenHash=digest(token);
  if(!this.env.ADMIN_RECOVERY_HASH||Number(this.env.ADMIN_RECOVERY_EXPIRES)<=seconds()||!Number.isFinite(Number(this.env.ADMIN_RECOVERY_EXPIRES))||username!==this.env.ADMIN_EMAIL||!same(tokenHash,this.env.ADMIN_RECOVERY_HASH)||this.one("SELECT 1 FROM audit WHERE action='admin_password_recovery' AND entity=?",tokenHash))throw new Problem('Recuperación no válida, caducada o ya utilizada',403);
  const user=this.one("SELECT * FROM users WHERE username=? AND active=1 AND role='admin'",username);
  if(!user)throw new Problem('Recuperación no válida, caducada o ya utilizada',403);
  const pass=password(data);if(pass!==data.confirmation)throw new Problem('Las contraseñas deben coincidir');
  this.run('UPDATE users SET password=? WHERE id=?',hash(pass),user.id);
  this.run('DELETE FROM sessions WHERE user_id=?',user.id);
  this.run('DELETE FROM login_attempts WHERE username=?',username);
  this.run('INSERT INTO audit(actor,action,entity,at) VALUES(?,?,?,?)',user.id,'admin_password_recovery',tokenHash,now());
  return {ok:true};
 })}
 session(uid){const token=id(),csrf=id();this.run('INSERT INTO sessions VALUES(?,?,?,?)',digest(token),uid,csrf,seconds()+28800);return {token,csrf}}
 login(data){const username=required(data,'username',100);if(typeof data.password!=='string'||data.password.length>200)throw new Problem('Usuario o contraseña incorrectos',401);
  const attempt=this.one('SELECT * FROM login_attempts WHERE username=?',username);
  if(attempt&&attempt.attempts>=5&&attempt.until>seconds())throw new Problem('Espera unos minutos antes de volver a intentarlo',429);
  const u=this.one('SELECT * FROM users WHERE username=? AND active=1',username);
  const check=hash(data.password,u?u.password.split(':')[0]:'0'.repeat(32));
  if(!u||!same(check,u.password)){
   const n=attempt&&attempt.until>seconds()?attempt.attempts+1:1;
   this.run('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)',username,n,seconds()+900);throw new Problem('Usuario o contraseña incorrectos',401);
  }
  this.run('DELETE FROM login_attempts WHERE username=?',username);
  if(data.role!==undefined&&data.role!==u.role)throw new Problem('Contraseña correcta. Selecciona '+({teacher:'Profesor',admin:'Administración',manager:'Gerencia'}[u.role])+' para entrar con esta cuenta.',403);
  return this.session(u.id);
 }
 authenticate(token){const u=this.one('SELECT u.id,u.name,u.role,s.csrf,s.expires FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1',digest(token),seconds());if(!u)throw new Problem('Inicia sesión para continuar',401);return u}
 logout(token){this.run('DELETE FROM sessions WHERE token=?',digest(token))}
 bootstrap(user){const teacher=user.role==='teacher',p=teacher?[user.id]:[];
  const students=this.all('SELECT id,name,permit,teacher_id FROM students'+(teacher?' WHERE teacher_id=?':''),...p);
  const lessons=this.all('SELECT l.*,s.ratings,s.note,s.next_goal,s.minutes,s.updated_at FROM lessons l LEFT JOIN sheets s ON s.lesson_id=l.id WHERE '+(teacher?'l.teacher_id=? AND EXISTS(SELECT 1 FROM students st WHERE st.id=l.student_id AND st.teacher_id=?)':'1=1')+' ORDER BY l.start',...(teacher?[user.id,user.id]:[])).map(l=>({...l,ratings:l.ratings?JSON.parse(l.ratings):null}));
  return {user:{id:user.id,name:user.name,role:user.role,expires:user.expires},csrf:user.csrf,students:students.map(r=>({...r,revision:this.revision(r),archived:this.archived('student',r.id)})),lessons:lessons.map(r=>({...r,archived:this.archived('lesson',r.id)})),vehicles:this.all('SELECT * FROM vehicles').map(r=>({...r,archived:this.archived('vehicle',r.id)})),users:teacher?this.all('SELECT id,name,role,active FROM users WHERE id=?',user.id):this.all('SELECT * FROM users').map(r=>this.account(r)),incidents_revision:this.revision(this.incidents(user)),goals:GOALS,server_time:now()};
 }
 ownedLesson(user,entity){const row=this.one('SELECT l.* FROM lessons l JOIN students s ON s.id=l.student_id WHERE l.id=?'+(user.role==='teacher'?' AND l.teacher_id=? AND s.teacher_id=?':''),entity,...(user.role==='teacher'?[user.id,user.id]:[]));if(!row)throw new Problem('Clase no disponible',404);if(this.archived('lesson',entity))throw new Problem('La clase fue eliminada en oficina. Conserva tu propuesta para revisarla.',409);return row}
 ownedIncident(user,entity){const row=this.one('SELECT i.* FROM incidents i JOIN students s ON s.id=i.student_id WHERE i.id=?'+(user.role==='teacher'?' AND i.teacher_id=? AND s.teacher_id=?':''),entity,...(user.role==='teacher'?[user.id,user.id]:[]));if(!row||this.archived('incident',entity))throw new Problem('Incidencia no disponible',404);return row}
 incidents(user,entity){if(entity){const item=this.ownedIncident(user,entity);item.updates=this.all('SELECT id,author_id,note,status,created_at FROM incident_updates WHERE incident_id=? ORDER BY created_at,id',entity);this.run('INSERT INTO audit(actor,action,entity,at) VALUES(?,?,?,?)',user.id,'incident_read',entity,now());return item}
  return this.all('SELECT i.id,i.lesson_id,i.student_id,i.vehicle_label,i.occurred_at,i.category,i.status,i.version FROM incidents i JOIN students s ON s.id=i.student_id'+(user.role==='teacher'?' WHERE i.teacher_id=? AND s.teacher_id=?':'')+' ORDER BY i.occurred_at DESC,i.id',...(user.role==='teacher'?[user.id,user.id]:[])).filter(r=>!this.archived('incident',r.id));
 }
 mutate(user,data){return this.tx(()=>{
  const operation=required(data,'operation_id',100),payload=digest(JSON.stringify(canonical(data)));
  const prior=this.one('SELECT * FROM operations WHERE id=?',operation);
  if(prior){if(prior.user_id!==user.id||prior.payload!==payload)throw new Problem('Operación incompatible',409);return JSON.parse(prior.result)}
  const action=data.action,staff=['admin','manager'].includes(user.role);let entity=id();
  if(action==='student'){
   if(!staff)throw new Problem('Acceso no permitido',403);const teacher=required(data,'teacher_id');
   if(!this.one("SELECT 1 FROM users WHERE id=? AND role='teacher' AND active=1",teacher))throw new Problem('Selecciona un profesor activo');
   this.run('INSERT INTO students VALUES(?,?,?,?,?)',entity,required(data,'name'),required(data,'permit',20),teacher,'');
  }else if(action==='vehicle'){
   if(!staff)throw new Problem('Acceso no permitido',403);const plate=required(data,'plate',20).toUpperCase().replace(/[ -]/g,''),kind=required(data,'kind',20);
   if(!['car','motorcycle','truck','bus','trailer'].includes(kind))throw new Problem('Tipo de vehículo inválido');
   if(this.one('SELECT 1 FROM vehicles WHERE plate=?',plate))throw new Problem('Matrícula ya registrada',409);
   this.run('INSERT INTO vehicles VALUES(?,?,?,?)',entity,required(data,'name'),plate,kind);
  }else if(action==='create_user'){
   if(!staff)throw new Problem('Solo oficina puede crear cuentas',403);const role=required(data,'role',20),username=required(data,'username',100);
   if(user.role==='admin'&&!['teacher','manager'].includes(role))throw new Problem('Administración puede crear profesores y gerentes',403);
   if(!['teacher','admin','manager'].includes(role))throw new Problem('Rol inválido');
   if(this.one('SELECT 1 FROM users WHERE username=?',username))throw new Problem('Ese usuario ya existe',409);
   this.run('INSERT INTO users VALUES(?,?,?,?,?,1)',entity,required(data,'name'),username,hash(password(data)),role);
  }else if(action==='edit_user'){
   if(!staff)throw new Problem('Solo oficina puede editar cuentas',403);
   entity=required(data,'user_id');const target=this.one('SELECT * FROM users WHERE id=? AND active=1',entity);
   if(!target)throw new Problem('Cuenta no disponible',404);
   if(target.role==='admin'||entity===user.id)throw new Problem('Esta cuenta de administración está protegida',403);
   if(data.revision!==this.revision(target))throw new Problem('La cuenta ha cambiado. Actualiza y vuelve a abrirla.',409);
   const username=required(data,'username',100),name=required(data,'name');
   if(this.one('SELECT 1 FROM users WHERE username=? AND id!=?',username,entity))throw new Problem('Ese usuario ya existe',409);
   const pass=data.password?hash(password(data)):target.password;
   this.run('UPDATE users SET name=?,username=?,password=? WHERE id=?',name,username,pass,entity);
   if(username!==target.username||pass!==target.password){this.run('DELETE FROM sessions WHERE user_id=?',entity);this.run('DELETE FROM login_attempts WHERE username IN (?,?)',username,target.username)}
  }else if(action==='delete_record'){
   if(!staff)throw new Problem('Solo Administración y Gerencia pueden eliminar registros',403);
   const kind=required(data,'kind',20),tables={user:'users',student:'students',vehicle:'vehicles',lesson:'lessons',incident:'incidents'};
   if(!Object.hasOwn(tables,kind))throw new Problem('Tipo de registro inválido');
   entity=required(data,'entity_id');const target=this.one('SELECT * FROM '+tables[kind]+' WHERE id=?',entity);
   if(!target||this.archived(kind,entity))throw new Problem('Registro no disponible',404);
   if(kind==='user'){
    if(entity===user.id||target.role==='admin')throw new Problem('No puedes eliminar tu cuenta ni la administración principal',403);
    if(data.revision!==this.revision(target))throw new Problem('La cuenta ha cambiado. Actualiza la lista.',409);
    if(this.one("SELECT 1 FROM students s WHERE teacher_id=? AND NOT EXISTS(SELECT 1 FROM archived_records a WHERE a.kind='student' AND a.entity=s.id)",entity))throw new Problem('Este profesor tiene alumnos activos. Reasígnalos o elimina sus altas antes de eliminar la cuenta.',409);
   }
   if(['user','student','vehicle'].includes(kind)){
    const condition=kind==='user'?'l.teacher_id=?':kind==='student'?'l.student_id=?':'(l.vehicle_id=? OR l.trailer_id=?)';
    if(this.one("SELECT 1 FROM lessons l WHERE l.status='planned' AND l.end>? AND NOT EXISTS(SELECT 1 FROM archived_records a WHERE a.kind='lesson' AND a.entity=l.id) AND "+condition,now(),entity,...(kind==='vehicle'?[entity]:[])))throw new Problem('Tiene clases futuras programadas. Cambia el horario o cancela/elimina esas clases primero.',409);
   }
   if(['lesson','incident'].includes(kind)&&target.version!==data.version)throw new Problem('El registro ha cambiado. Actualiza antes de eliminar.',409);
   this.run('INSERT INTO archived_records VALUES(?,?,?,?)',kind,entity,user.id,now());
   if(kind==='user'){this.run('UPDATE users SET active=0 WHERE id=?',entity);this.run('DELETE FROM sessions WHERE user_id=?',entity)}
   if(kind==='lesson')this.run('UPDATE lessons SET version=version+1 WHERE id=?',entity);
  }else if(action==='edit_student'){
   if(!staff)throw new Problem('Acceso no permitido',403);
   entity=required(data,'student_id');const target=this.one('SELECT id,name,permit,teacher_id FROM students WHERE id=?',entity);
   if(!target||this.archived('student',entity))throw new Problem('Alumno no disponible',404);
   if(data.revision!==this.revision(target))throw new Problem('El alumno ha cambiado. Actualiza la lista.',409);
   const teacher=required(data,'teacher_id');
   if(!this.one("SELECT 1 FROM users WHERE id=? AND role='teacher' AND active=1",teacher))throw new Problem('Selecciona un profesor activo');
   if(teacher!==target.teacher_id&&this.one("SELECT 1 FROM lessons l WHERE student_id=? AND status='planned' AND NOT EXISTS(SELECT 1 FROM archived_records a WHERE a.kind='lesson' AND a.entity=l.id)",entity))throw new Problem('Cancela o elimina las clases pendientes antes de cambiar de profesor.',409);
   this.run('UPDATE students SET name=?,permit=?,teacher_id=? WHERE id=?',required(data,'name'),required(data,'permit',20),teacher,entity);
  }else if(action==='book'||action==='reschedule'){
   const student=this.one('SELECT * FROM students WHERE id=?',data.student_id??null);
   if(!student||this.archived('student',student.id)||(!staff&&student.teacher_id!==user.id))throw new Problem('Alumno no disponible',403);
   const teacher=student.teacher_id,vehicle=data.vehicle_id??null,trailer=data.trailer_id||null;
   if(!this.one("SELECT 1 FROM users WHERE id=? AND active=1 AND role='teacher'",teacher))throw new Problem('Selecciona un profesor activo',409);
   if(this.archived('vehicle',vehicle)||(trailer&&this.archived('vehicle',trailer)))throw new Problem('El vehículo fue eliminado. Actualiza la agenda.',409);
   if(!this.one("SELECT 1 FROM vehicles WHERE id=? AND kind!='trailer'",vehicle))throw new Problem('Selecciona un vehículo');
   if(trailer&&!this.one("SELECT 1 FROM vehicles WHERE id=? AND kind='trailer'",trailer))throw new Problem('Selecciona un remolque válido');
   const start=date(data.start),end=date(data.end);if(end<=start||Date.parse(end)-Date.parse(start)>28800000)throw new Problem('Horario inválido');
   if(!['Pistas','Circulación'].includes(data.mode))throw new Problem('Selecciona pistas o circulación');
   if(action==='reschedule'){entity=required(data,'lesson_id');const old=this.ownedLesson(user,entity);if(old.status!=='planned'||old.version!==data.version)throw new Problem('La clase ha cambiado. Actualiza la agenda.',409)}
   if(this.one("SELECT 1 FROM lessons WHERE NOT EXISTS(SELECT 1 FROM archived_records a WHERE a.kind='lesson' AND a.entity=lessons.id) AND status!='cancelled' AND id!=? AND start<? AND end>? AND (teacher_id=? OR student_id=? OR vehicle_id=? OR trailer_id=? OR (? IS NOT NULL AND (vehicle_id=? OR trailer_id=?)))",entity,end,start,teacher,student.id,vehicle,vehicle,trailer,trailer,trailer))throw new Problem('Franja no disponible para el alumno, profesor o vehículo. Elige otro horario.',409);
   if(action==='book')this.run('INSERT INTO lessons(id,student_id,teacher_id,vehicle_id,trailer_id,start,end,mode) VALUES(?,?,?,?,?,?,?,?)',entity,student.id,teacher,vehicle,trailer,start,end,data.mode);
   else this.run('UPDATE lessons SET student_id=?,teacher_id=?,vehicle_id=?,trailer_id=?,start=?,end=?,mode=?,version=version+1 WHERE id=?',student.id,teacher,vehicle,trailer,start,end,data.mode,entity);
  }else if(action==='sheet'||action==='status'){
   entity=required(data,'lesson_id');const lesson=this.ownedLesson(user,entity);if(lesson.version!==data.version)throw new Problem('La clase cambió en oficina. Conservamos tu propuesta para revisarla.',409);let status;
   if(action==='sheet'){
    if(user.role!=='teacher'||lesson.teacher_id!==user.id)throw new Problem('Solo el profesor de la clase puede valorarla',403);
    if(!['planned','completed'].includes(lesson.status))throw new Problem('Revisa la asistencia antes de guardar la ficha',409);
    const ratings=data.ratings;
    if(!ratings||typeof ratings!=='object'||Array.isArray(ratings)||!Object.keys(ratings).length||Object.entries(ratings).some(([k,v])=>!GOALS.includes(k)||!Number.isInteger(v)||v<1||v>4))throw new Problem('Valora al menos un aprendizaje trabajado');
    if(!Number.isInteger(data.minutes)||data.minutes<1||data.minutes>480)throw new Problem('Duración inválida');
    const note=data.note??'';if(typeof note!=='string'||note.length>600)throw new Problem('Observación demasiado larga');
    this.run('INSERT OR REPLACE INTO sheets VALUES(?,?,?,?,?,?)',entity,JSON.stringify(ratings),note,required(data,'next_goal',300),data.minutes,now());status='completed';
   }else{status=data.status;if(!['absent','cancelled'].includes(status)||lesson.status!=='planned')throw new Problem('Cambio de estado no permitido')}
   this.run('UPDATE lessons SET status=?,version=version+1 WHERE id=?',status,entity);
  }else if(action==='incident'){
   const lesson=this.ownedLesson(user,required(data,'lesson_id'));
   if(['cancelled','absent'].includes(lesson.status))throw new Problem('No se puede registrar una incidencia en una clase cancelada o con ausencia',409);
   if(!['accident','breakdown','safety','other'].includes(data.category))throw new Problem('Tipo de incidencia inválido');
   const vehicle=this.one('SELECT name,plate FROM vehicles WHERE id=?',lesson.vehicle_id);let label=vehicle.name+' · '+vehicle.plate;
   if(lesson.trailer_id){const trailer=this.one('SELECT name,plate FROM vehicles WHERE id=?',lesson.trailer_id);label+=' + '+trailer.name+' · '+trailer.plate}
   this.run('INSERT INTO incidents(id,lesson_id,teacher_id,student_id,vehicle_label,author_id,occurred_at,category,location,description,measures,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',entity,lesson.id,lesson.teacher_id,lesson.student_id,label,user.id,date(data.occurred_at),data.category,required(data,'location',200),required(data,'description',1500),required(data,'measures',1000),now());
  }else if(action==='incident_update'){
   entity=required(data,'incident_id');const incident=this.ownedIncident(user,entity);
   if(data.version!==incident.version)throw new Problem('La incidencia ha cambiado. Vuelve a abrirla.',409);
   const status=data.status??incident.status;if(!['open','reviewing','closed'].includes(status))throw new Problem('Estado inválido');
   if(!staff&&status!==incident.status)throw new Problem('Solo oficina puede cambiar el estado',403);
   this.run('INSERT INTO incident_updates VALUES(?,?,?,?,?,?)',id(),entity,user.id,required(data,'note',1000),status,now());this.run('UPDATE incidents SET status=?,version=version+1 WHERE id=?',status,entity);
  }else throw new Problem('Acción desconocida');
  const result={ok:true,id:entity};this.run('INSERT INTO audit(actor,action,entity,at) VALUES(?,?,?,?)',user.id,action,entity,now());this.run('INSERT INTO operations VALUES(?,?,?,?)',operation,user.id,payload,JSON.stringify(result));return result;
 })}
}
