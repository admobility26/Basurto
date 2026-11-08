import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Store, Problem, digest } from '../cloudflare/store.mjs';
import { SCHEMA, GOALS } from '../cloudflare/schema.mjs';
const pass='Fictitious-password-123';
function fixture(){const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON;'+SCHEMA);
 const db={all:(q,...p)=>sqlite.prepare(q).all(...p),run:(q,...p)=>sqlite.prepare(q).run(...p),tx:fn=>{sqlite.exec('BEGIN IMMEDIATE');try{const v=fn();sqlite.exec('COMMIT');return v}catch(e){sqlite.exec('ROLLBACK');throw e}}};
 const s=new Store(db,{ADMIN_EMAIL:'office@example.test',ADMIN_ACTIVATION_HASH:digest('private-token'),ADMIN_ACTIVATION_EXPIRES:Date.now()/1000+3600});
 const session=s.activate({username:'office@example.test',activation:'private-token',password:pass,confirmation:pass}),admin=s.authenticate(session.token);
 const act=(user,data)=>s.mutate(user,{operation_id:crypto.randomUUID(),...data});
 const a=act(admin,{action:'create_user',name:'A',username:'a',password:pass,role:'teacher'}).id,b=act(admin,{action:'create_user',name:'B',username:'b',password:pass,role:'teacher'}).id;
 const teacher=name=>s.authenticate(s.login({username:name,password:pass,role:'teacher'}).token);
 const sa=act(admin,{action:'student',name:'Alumno A',permit:'C',teacher_id:a}).id,sb=act(admin,{action:'student',name:'Alumno B',permit:'C',teacher_id:b}).id;
 const v=act(admin,{action:'vehicle',name:'Camión',plate:'1234 TEST',kind:'truck'}).id;
 const booking={action:'book',student_id:sa,vehicle_id:v,start:'2026-11-07T09:00:00+01:00',end:'2026-11-07T10:00:00+01:00',mode:'Pistas'};
 return {s,db,admin,act,a:teacher('a'),b:teacher('b'),sa,sb,v,booking};
}
const denies=(status,fn)=>assert.throws(fn,e=>e instanceof Problem&&e.status===status);
test('activation private, expires, cannot reuse; credentials not in operation payloads',()=>{const f=fixture();assert.equal(f.s.setupAvailable(),false);denies(403,()=>f.s.activate({username:'office@example.test',activation:'private-token',password:pass,confirmation:pass}));assert(!JSON.stringify(f.db.all('SELECT payload FROM operations')).includes(pass));f.db.run('DELETE FROM sessions');f.db.run('DELETE FROM operations');f.s.env.ADMIN_ACTIVATION_EXPIRES=0;assert.equal(f.s.setupAvailable(),false)});
test('admin creates teachers and managers; teachers cannot create accounts',()=>{const f=fixture();for(const role of ['admin'])denies(403,()=>f.act(f.admin,{action:'create_user',name:'x',username:'x',password:pass,role}));denies(403,()=>f.act(f.a,{action:'create_user',name:'x',username:'x',password:pass,role:'teacher'}));denies(403,()=>f.s.login({username:'a',password:pass,role:'admin'}))});
test('server filters other teachers students and lessons',()=>{const f=fixture();f.act(f.a,f.booking);const data=f.s.bootstrap(f.b);assert.equal(data.students.length,1);assert.equal(data.students[0].id,f.sb);assert.equal(data.lessons.length,0);assert.equal(data.users.length,1);assert(!JSON.stringify(data).includes('Alumno A'))});
test('global vehicle collision, adjacent slots, version conflict and idempotency',()=>{const f=fixture(),op={...f.booking,operation_id:'same'};const first=f.s.mutate(f.a,op);assert.deepEqual(f.s.mutate(f.a,op),first);denies(409,()=>f.act(f.b,{...f.booking,student_id:f.sb}));f.act(f.b,{...f.booking,student_id:f.sb,start:'2026-11-07T10:00:00+01:00',end:'2026-11-07T11:00:00+01:00'});denies(409,()=>f.act(f.a,{...f.booking,action:'reschedule',lesson_id:first.id,version:0}));denies(403,()=>f.act(f.b,f.booking))});
test('teacher and student collisions across vehicles and trailer conflicts',()=>{const f=fixture();const trailer=f.act(f.admin,{action:'vehicle',name:'Remolque',plate:'R TEST',kind:'trailer'}).id;const vehicle=f.act(f.admin,{action:'vehicle',name:'Otro',plate:'5678 TEST',kind:'truck'}).id;f.act(f.a,{...f.booking,trailer_id:trailer});denies(409,()=>f.act(f.a,{...f.booking,vehicle_id:vehicle}));denies(409,()=>f.act(f.b,{...f.booking,student_id:f.sb,vehicle_id:vehicle,trailer_id:trailer}));});
test('sheet next goal and ratings retained; office read-only; duplicate does not increment',()=>{const f=fixture(),lesson=f.act(f.a,f.booking).id;const sheet={action:'sheet',operation_id:'sheet',lesson_id:lesson,version:1,ratings:{[GOALS[0]]:3},next_goal:'Practicar',minutes:60};denies(403,()=>f.s.mutate(f.admin,sheet));f.s.mutate(f.a,sheet);f.s.mutate(f.a,sheet);const data=f.s.bootstrap(f.admin);assert.equal(data.lessons[0].next_goal,'Practicar');assert.equal(data.lessons[0].ratings[GOALS[0]],3);assert.equal(data.lessons[0].version,2);assert.equal(data.lessons.filter(x=>x.status==='completed').length,1)});
test('cancelled lesson rejects an offline sheet and does not record operation',()=>{const f=fixture(),lesson=f.act(f.a,f.booking).id;f.act(f.admin,{action:'status',lesson_id:lesson,version:1,status:'cancelled'});denies(409,()=>f.act(f.a,{action:'sheet',lesson_id:lesson,version:1,ratings:{[GOALS[0]]:3},next_goal:'Practicar',minutes:60}));assert.equal(f.db.all('SELECT * FROM sheets').length,0)});
test('incidents online authorization, append-only status and version conflicts',()=>{const f=fixture(),lesson=f.act(f.a,f.booking).id;const inc=f.act(f.a,{action:'incident',lesson_id:lesson,category:'accident',occurred_at:f.booking.start,location:'Pista',description:'Prueba ficticia',measures:'Revisión'}).id;denies(404,()=>f.s.incidents(f.b,inc));denies(403,()=>f.act(f.a,{action:'incident_update',incident_id:inc,version:1,status:'closed',note:'Cerrar'}));f.act(f.admin,{action:'incident_update',incident_id:inc,version:1,status:'closed',note:'Revisado'});const detail=f.s.incidents(f.admin,inc);assert.equal(detail.description,'Prueba ficticia');assert.equal(detail.updates.length,1);assert.equal(detail.status,'closed');denies(409,()=>f.act(f.admin,{action:'incident_update',incident_id:inc,version:1,status:'open',note:'Antiguo'}));assert(!JSON.stringify(f.s.bootstrap(f.admin)).includes('Prueba ficticia'));f.db.run('UPDATE students SET teacher_id=? WHERE id=?',f.b.id,f.sa);denies(404,()=>f.s.incidents(f.a,inc));denies(404,()=>f.s.incidents(f.b,inc))});
test('password rate limit persists failures and logout revokes token',()=>{const f=fixture();for(let i=0;i<5;i++)denies(401,()=>f.s.login({username:'a',password:'wrong'}));denies(429,()=>f.s.login({username:'a',password:pass}));const session=f.s.login({username:'b',password:pass});f.s.logout(session.token);denies(401,()=>f.s.authenticate(session.token))});
test('invalid time or sheet rolls back without creating records',()=>{const f=fixture();denies(400,()=>f.act(f.a,{...f.booking,start:'2026-11-07T09:00:00'}));const lesson=f.act(f.a,f.booking).id;denies(400,()=>f.act(f.a,{action:'sheet',lesson_id:lesson,version:1,ratings:{invalid:4},next_goal:'x',minutes:60}));assert.equal(f.db.all('SELECT * FROM sheets').length,0)});

test('correct password and wrong area gives clear guidance without password lockout',()=>{const f=fixture();for(let i=0;i<6;i++)assert.throws(()=>f.s.login({username:'office@example.test',password:pass,role:'teacher'}),e=>e.status===403&&e.message.includes('Administración'));assert.equal(f.db.all('SELECT * FROM login_attempts').length,0);const session=f.s.login({username:'office@example.test',password:pass,role:'admin'});assert.equal(f.s.authenticate(session.token).role,'admin');denies(401,()=>f.s.login({username:'office@example.test',password:'wrong',role:'teacher'}))});
test('admin recovery is scoped, expiring, single-use and revokes old sessions without losing data',()=>{const f=fixture(),s=f.s;const original=s.login({username:'office@example.test',password:pass}).token;const before=s.all('SELECT * FROM students');s.env.ADMIN_RECOVERY_HASH=digest('recovery-test');s.env.ADMIN_RECOVERY_EXPIRES=Date.now()/1000+300;const data={username:'office@example.test',recovery:'recovery-test',password:'New-private-password-456',confirmation:'New-private-password-456'};denies(403,()=>s.recover({...data,username:'a'}));denies(403,()=>s.recover({...data,recovery:'invalid'}));denies(400,()=>s.recover({...data,confirmation:'different'}));s.env.ADMIN_RECOVERY_EXPIRES=0;denies(403,()=>s.recover(data));s.env.ADMIN_RECOVERY_EXPIRES=Date.now()/1000+300;assert.deepEqual(s.recover(data),{ok:true});denies(401,()=>s.authenticate(original));denies(401,()=>s.login({username:data.username,password:pass}));assert.equal(s.authenticate(s.login({username:data.username,password:data.password,role:'admin'}).token).role,'admin');denies(403,()=>s.recover(data));assert.deepEqual(s.all('SELECT * FROM students'),before);assert.equal(s.authenticate(s.login({username:'a',password:pass}).token).role,'teacher')});

test('administrator creates manager with password and server-enforced manager permissions',()=>{const f=fixture();const data={action:'create_user',name:'Gerente de prueba',username:'manager-test',password:pass,role:'manager'};denies(403,()=>f.act(f.a,data));const created=f.act(f.admin,data);const manager=f.s.authenticate(f.s.login({username:'manager-test',password:pass,role:'manager'}).token);assert.equal(manager.id,created.id);assert.equal(manager.role,'manager');assert.equal(f.s.bootstrap(manager).students.length,2);assert(!JSON.stringify(f.db.all('SELECT * FROM operations')).includes(pass));denies(401,()=>f.s.login({username:'manager-test',password:'wrong',role:'manager'}))});

test('incident changes sync between independent sessions without leaking another teacher or narratives',()=>{
 const f=fixture(),second=f.s.authenticate(f.s.login({username:'office@example.test',password:pass}).token);
 const before=f.s.bootstrap(second),other=f.s.bootstrap(f.b),lesson=f.act(f.a,f.booking).id;
 const incident=f.act(f.a,{action:'incident',lesson_id:lesson,category:'accident',occurred_at:f.booking.start,location:'Pista',description:'Private narrative',measures:'Private measures'}).id;
 assert.notEqual(f.s.bootstrap(second).incidents_revision,before.incidents_revision);
 assert.equal(f.s.bootstrap(f.b).incidents_revision,other.incidents_revision);
 assert(!JSON.stringify(f.s.bootstrap(second)).includes('Private narrative'));
 assert.equal(f.s.incidents(second)[0].id,incident);
 const revision=f.s.bootstrap(second).incidents_revision;
 f.act(f.admin,{action:'incident_update',incident_id:incident,version:1,note:'Seguimiento',status:'reviewing'});
 assert.notEqual(f.s.bootstrap(second).incidents_revision,revision);
 denies(403,()=>f.act(f.a,{action:'delete_record',kind:'incident',entity_id:incident,version:2}));
 f.act(f.admin,{action:'delete_record',kind:'incident',entity_id:incident,version:2});
 assert.equal(f.s.incidents(second).length,0);assert.equal(f.db.all('SELECT * FROM incident_updates').length,1);
});
test('admin edits manager credentials, revokes sessions, preserves role, rejects stale and unauthorized edits',()=>{
 const f=fixture(),mid=f.act(f.admin,{action:'create_user',name:'Manager',username:'manager',role:'manager',password:pass}).id;
 const token=f.s.login({username:'manager',password:pass}).token;
 const row=f.s.bootstrap(f.admin).users.find(u=>u.id===mid);assert(!('password' in row));
 const edit={action:'edit_user',user_id:mid,revision:row.revision,name:'Gerencia',username:'new-manager',password:'Changed-password-456',role:'admin'};
 denies(403,()=>f.act(f.a,edit));f.act(f.admin,edit);denies(401,()=>f.s.authenticate(token));
 assert.equal(f.s.authenticate(f.s.login({username:edit.username,password:edit.password}).token).role,'manager');
 denies(409,()=>f.act(f.admin,edit));
 assert(!JSON.stringify(f.db.all('SELECT * FROM operations')).includes(edit.password));
 denies(403,()=>f.act(f.admin,{...edit,user_id:f.admin.id}));
});
test('administration and manager remove records without erasing history; offline sheets cannot resurrect lessons',()=>{
 const f=fixture(),mid=f.act(f.admin,{action:'create_user',name:'M',username:'m',role:'manager',password:pass}).id;
 const manager=f.s.authenticate(f.s.login({username:'m',password:pass}).token);
 const lesson=f.act(f.a,f.booking).id;
 const sheet={action:'sheet',lesson_id:lesson,version:1,ratings:{[GOALS[0]]:2},next_goal:'Practicar',minutes:45};f.act(f.a,sheet);
 denies(403,()=>f.act(f.a,{action:'delete_record',kind:'lesson',entity_id:lesson,version:2}));
 denies(409,()=>f.act(manager,{action:'delete_record',kind:'lesson',entity_id:lesson,version:1}));
 const removal={action:'delete_record',kind:'lesson',entity_id:lesson,version:2,operation_id:'remove-once'};
 f.s.mutate(manager,removal);f.s.mutate(manager,removal);
 assert.equal(f.db.all('SELECT * FROM sheets').length,1);
 assert.equal(f.s.bootstrap(f.admin).lessons[0].archived,true);
 denies(409,()=>f.act(f.a,{...sheet,version:2}));
 f.act(f.a,f.booking); // Freed slot, even if the removed class had been completed.
 for(const kind of ['student','vehicle']){const entity_id=kind==='student'?f.sa:f.v;f.act(manager,{action:'delete_record',kind,entity_id})}
 denies(403,()=>f.act(f.a,f.booking));
 const teacherRow=f.s.bootstrap(f.admin).users.find(u=>u.id===f.a.id);
 f.act(f.admin,{action:'delete_record',kind:'user',entity_id:f.a.id,revision:teacherRow.revision});
 denies(401,()=>f.s.login({username:'a',password:pass}));
 denies(403,()=>f.act(manager,{action:'delete_record',kind:'user',entity_id:mid}));
 denies(403,()=>f.act(manager,{action:'delete_record',kind:'user',entity_id:f.admin.id}));
});
test('future bookings block resource removal; student reassignment requires resolution and revokes teacher visibility',()=>{
 const f=fixture(),lesson=f.act(f.a,{...f.booking,start:'2099-01-01T09:00:00Z',end:'2099-01-01T10:00:00Z'}).id;
 for(const [kind,entity_id]of [['student',f.sa],['vehicle',f.v]])denies(409,()=>f.act(f.admin,{action:'delete_record',kind,entity_id}));
 const row=f.s.bootstrap(f.admin).students.find(s=>s.id===f.sa),edit={action:'edit_student',student_id:f.sa,revision:row.revision,name:row.name,permit:row.permit,teacher_id:f.b.id};
 denies(409,()=>f.act(f.admin,edit));
 f.act(f.admin,{action:'delete_record',kind:'lesson',entity_id:lesson,version:1});
 f.act(f.admin,edit);assert(!f.s.bootstrap(f.a).students.some(s=>s.id===f.sa));
 denies(409,()=>f.act(f.admin,edit));
 f.act(f.admin,{action:'delete_record',kind:'vehicle',entity_id:f.v});
 denies(409,()=>f.act(f.b,{...f.booking,student_id:f.sb}));
});
