import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Store,digest} from '../cloudflare/store.mjs';
import {SCHEMA} from '../cloudflare/schema.mjs';
import {AccessLinks} from '../cloudflare/access-links.mjs';
const password='Private-test-password-123';
function fixture(){const db=new DatabaseSync(':memory:');db.exec(SCHEMA);const s=new Store({all:(q,...p)=>db.prepare(q).all(...p),run:(q,...p)=>db.prepare(q).run(...p),tx:fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}});return {s,links:new AccessLinks(s)}}
const owner={id:'platform-owner',role:'admin'};
const accept=(links,token)=>links.accept({token,password,confirmation:password});
test('initial invite creates first admin once and remains isolated per school',()=>{
 const a=fixture(),b=fixture(),link=a.links.issue(owner,{email:' Admin@Example.test '},true);
 assert.equal(link.email,'admin@example.test');assert(!JSON.stringify(a.s.all('SELECT * FROM access_links')).includes(link.token));
 assert.throws(()=>accept(b.links,link.token));assert.throws(()=>a.links.accept({token:link.token,password,confirmation:'wrong'}));
 accept(a.links,link.token);assert.equal(a.s.authenticate(a.s.login({username:link.email,password}).token).role,'admin');
 assert.throws(()=>accept(a.links,link.token));assert.throws(()=>a.links.issue(owner,{email:'other@example.test'},true));
 assert(!JSON.stringify(a.s.all('SELECT * FROM audit')).includes(link.token));
});
test('manager invites only teachers; reissuing and expiry invalidate tokens',()=>{
 const a=fixture(),manager={id:'m',role:'manager'};
 assert.throws(()=>a.links.issue({id:'t',role:'teacher'},{email:'teacher@example.test',name:'T',purpose:'invite'}),e=>e.status===403);
 assert.throws(()=>a.links.issue(manager,{email:'teacher@example.test',purpose:'setup'}),e=>e.status===403);
 const first=a.links.issue(manager,{email:'teacher@example.test',name:'Teacher',purpose:'invite',role:'admin'});
 const second=a.links.issue(manager,{email:'teacher@example.test',name:'Teacher',purpose:'invite'});
 assert.throws(()=>accept(a.links,first.token));accept(a.links,second.token);
 const user=a.s.authenticate(a.s.login({username:second.email,password}).token);assert.equal(user.role,'teacher');
 const expired=a.links.issue(manager,{email:'expired@example.test',name:'Expired',purpose:'invite'});
 a.s.run('UPDATE access_links SET expires=0 WHERE token=?',digest(expired.token));assert.throws(()=>accept(a.links,expired.token));
});
test('reset does not change password until consumed; revokes sessions; cannot reactivate or elevate',()=>{
 const a=fixture(),teacherInvite=a.links.issue(owner,{email:'teacher@example.test',name:'Teacher',purpose:'invite'});accept(a.links,teacherInvite.token);
 const auth=a.s.login({username:teacherInvite.email,password}),user=a.s.authenticate(auth.token);
 const reset=a.links.issue(owner,{email:teacherInvite.email,user_id:user.id,purpose:'reset'});
 assert(a.s.authenticate(auth.token));assert.throws(()=>a.links.issue(owner,{email:'different@example.test',user_id:user.id,purpose:'reset'}));
 a.links.accept({token:reset.token,password:'Changed-password-456',confirmation:'Changed-password-456'});
 assert.throws(()=>a.s.authenticate(auth.token));assert.throws(()=>a.s.login({username:teacherInvite.email,password}));
 assert.equal(a.s.authenticate(a.s.login({username:teacherInvite.email,password:'Changed-password-456'}).token).role,'teacher');
 const stale=a.links.issue(owner,{email:teacherInvite.email,user_id:user.id,purpose:'reset'});a.s.run('UPDATE users SET active=0 WHERE id=?',user.id);assert.throws(()=>accept(a.links,stale.token));
});
test('only trusted platform path can issue administrator recovery',()=>{
 const a=fixture(),initial=a.links.issue(owner,{email:'admin@example.test'},true);accept(a.links,initial.token);const admin=a.s.authenticate(a.s.login({username:initial.email,password}).token);
 assert.throws(()=>a.links.issue({id:'manager',role:'manager'},{purpose:'reset',email:initial.email,user_id:admin.id}));
 const reset=a.links.issue(owner,{purpose:'reset',email:initial.email},true);accept(a.links,reset.token);
});
