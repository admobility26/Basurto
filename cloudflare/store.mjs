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
 setupAvailable(){return Boolean(this.env.ADMIN_EMAIL&&this.env.ADMIN_ACTIVATION_HASH&&Number(this.env.ADMIN_ACTIVATION_EXPIRES)>seconds()&&!this.one("SELECT 1 FROM users WHERE role IN ('admin','manager')"))}
 activate(data){return this.tx(()=>{
  const secret=required(data,'activation',100),username=required(data,'username',100),pass=password(data);
  if(pass!==data.confirmation)throw new Problem('Las contraseñas deben coincidir');
  if(!this.setupAvailable()||username!==this.env.ADMIN_EMAIL||!same(digest(secret),this.env.ADMIN_ACTIVATION_HASH))throw new Problem('Activación no válida o caducada',403);
  const uid=id();this.run('INSERT INTO users VALUES(?,?,?,?,?,1)',uid,'Administración',username,hash(pass),'admin');
  this.run('INSERT INTO audit(actor,action,entity,at) VALUES(?,?,?,?)',uid,'activate_admin',uid,now());return this.session(uid);
 })}
 session(uid){const token=id(),csrf=id();this.run('INSERT INTO sessions VALUES(?,?,?,?)',digest(token),uid,csrf,seconds()+28800);return {token,csrf}}
 login(data){const username=required(data,'username',100);if(typeof data.password!=='string'||data.password.length>200)throw new Problem('Usuario o contraseña incorrectos',401);
  const attempt=this.one('SELECT * FROM login_attempts WHERE username=?',username);
  if(attempt&&attempt.attempts>=5&&attempt.until>seconds())throw new Problem('Espera unos minutos antes de volver a intentarlo',429);
  const u=this.one('SELECT * FROM users WHERE username=? AND active=1',username);
  const check=hash(data.password,u?u.password.split(':')[0]:'0'.repeat(32));
  if(!u||!same(check,u.password)||(data.role!==undefined&&data.role!==u.role)){
   const n=attempt&&attempt.until>seconds()?attempt.attempts+1:1;
   this.run('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)',username,n,seconds()+900);throw new Problem('Usuario o contraseña incorrectos',401);
  }
  this.run('DELETE FROM login_attempts WHERE username=?',username);return this.session(u.id);
 }
 authenticate(token){const u=this.one('SELECT u.id,u.name,u.role,s.csrf,s.expires FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1',digest(token),seconds());if(!u)throw new Problem('Inicia sesión para continuar',401);return u}
 logout(token){this.run('DELETE FROM sessions WHERE token=?',digest(token))}
 bootstrap(user){const teacher=user.role==='teacher',p=teacher?[user.id]:[];
  const students=this.all('SELECT id,name,permit,teacher_id FROM students'+(teacher?' WHERE teacher_id=?':''),...p);
  const lessons=this.all('SELECT l.*,s.ratings,s.note,s.next_goal,s.minutes,s.updated_at FROM lessons l LEFT JOIN sheets s ON s.lesson_id=l.id WHERE '+(teacher?'l.teacher_id=? AND EXISTS(SELECT 1 FROM students st WHERE st.id=l.student_id AND st.teacher_id=?)':'1=1')+' ORDER BY l.start',...(teacher?[user.id,user.id]:[])).map(l=>({...l,ratings:l.ratings?JSON.parse(l.ratings):null}));
  return {user:{id:user.id,name:user.name,role:user.role,expires:user.expires},csrf:user.csrf,students,lessons,vehicles:this.all('SELECT * FROM vehicles'),users:this.all('SELECT id,name,role FROM users WHERE active=1'+(teacher?' AND id=?':''),...p),goals:GOALS,server_time:now()};
 }
 ownedLesson(user,entity){const row=this.one('SELECT l.* FROM lessons l JOIN students s ON s.id=l.student_id WHERE l.id=?'+(user.role==='teacher'?' AND l.teacher_id=? AND s.teacher_id=?':''),entity,...(user.role==='teacher'?[user.id,user.id]:[]));if(!row)throw new Problem('Clase no disponible',404);return row}
 ownedIncident(user,entity){const row=this.one('SELECT i.* FROM incidents i JOIN students s ON s.id=i.student_id WHERE i.id=?'+(user.role==='teacher'?' AND i.teacher_id=? AND s.teacher_id=?':''),entity,...(user.role==='teacher'?[user.id,user.id]:[]));if(!row)throw new Problem('Incidencia no disponible',404);return row}
 incidents(user,entity){if(entity){const item=this.ownedIncident(user,entity);item.updates=this.all('SELECT id,author_id,note,status,created_at FROM incident_updates WHERE incident_id=? ORDER BY created_at,id',entity);this.run('INSERT INTO audit(actor,action,entity,at) VALUES(?,?,?,?)',user.id,'incident_read',entity,now());return item}
  return this.all('SELECT i.id,i.lesson_id,i.student_id,i.vehicle_label,i.occurred_at,i.category,i.status,i.version FROM incidents i JOIN students s ON s.id=i.student_id'+(user.role==='teacher'?' WHERE i.teacher_id=? AND s.teacher_id=?':'')+' ORDER BY i.occurred_at DESC',...(user.role==='teacher'?[user.id,user.id]:[]));
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
   if(user.role==='admin'&&role!=='teacher')throw new Problem('Administración solo puede crear profesores',403);
   if(!['teacher','admin','manager'].includes(role))throw new Problem('Rol inválido');
   if(this.one('SELECT 1 FROM users WHERE username=?',username))throw new Problem('Ese usuario ya existe',409);
   this.run('INSERT INTO users VALUES(?,?,?,?,?,1)',entity,required(data,'name'),username,hash(password(data)),role);
  }else if(action==='book'||action==='reschedule'){
   const student=this.one('SELECT * FROM students WHERE id=?',data.student_id??null);
   if(!student||(!staff&&student.teacher_id!==user.id))throw new Problem('Alumno no disponible',403);
   const teacher=student.teacher_id,vehicle=data.vehicle_id??null,trailer=data.trailer_id||null;
   if(!this.one("SELECT 1 FROM vehicles WHERE id=? AND kind!='trailer'",vehicle))throw new Problem('Selecciona un vehículo');
   if(trailer&&!this.one("SELECT 1 FROM vehicles WHERE id=? AND kind='trailer'",trailer))throw new Problem('Selecciona un remolque válido');
   const start=date(data.start),end=date(data.end);if(end<=start||Date.parse(end)-Date.parse(start)>28800000)throw new Problem('Horario inválido');
   if(!['Pistas','Circulación'].includes(data.mode))throw new Problem('Selecciona pistas o circulación');
   if(action==='reschedule'){entity=required(data,'lesson_id');const old=this.ownedLesson(user,entity);if(old.status!=='planned'||old.version!==data.version)throw new Problem('La clase ha cambiado. Actualiza la agenda.',409)}
   if(this.one("SELECT 1 FROM lessons WHERE status!='cancelled' AND id!=? AND start<? AND end>? AND (teacher_id=? OR student_id=? OR vehicle_id=? OR trailer_id=? OR (? IS NOT NULL AND (vehicle_id=? OR trailer_id=?)))",entity,end,start,teacher,student.id,vehicle,vehicle,trailer,trailer,trailer))throw new Problem('Franja no disponible para el alumno, profesor o vehículo. Elige otro horario.',409);
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
