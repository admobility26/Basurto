import json,sqlite3,tempfile,unittest
from pathlib import Path
from server import Store,Problem
class IncidentTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.s=Store(Path(self.tmp.name)/'db.sqlite');self.s.seed_demo();self.a=dict(id='teacher-a',name='A',role='teacher',csrf='x',expires=9999999999);self.b={**self.a,'id':'teacher-b'};self.admin={**self.a,'id':'office','role':'admin'};self.manager={**self.a,'id':'manager','role':'manager'}
 def tearDown(self):self.tmp.cleanup()
 def incident(self,**kw):return dict(action='incident',operation_id='incident1',lesson_id='lesson-0',category='accident',occurred_at='2026-11-06T09:20:00+01:00',location='Pista de pruebas',description='Roce ficticio durante maniobra',measures='Clase interrumpida y oficina avisada')|kw
 def fail(self,status,call):
  with self.assertRaises(Problem) as e:call()
  self.assertEqual(e.exception.status,status)
 def test_record_snapshot_and_idempotency(self):
  d=self.incident();r=self.s.mutate(self.a,d);self.assertEqual(self.s.mutate(self.a,d),r);items=self.s.incidents(self.a);self.assertEqual(len(items),1);self.assertEqual(items[0]['vehicle_label'],'Camión · DEMO-C');self.assertNotIn('description',items[0]);self.assertNotIn('incidents',self.s.bootstrap(self.a))
  with self.s.db() as c:
   payload=c.execute('SELECT payload FROM operations WHERE id=?',('incident1',)).fetchone()['payload'];self.assertEqual(len(payload),64);self.assertNotIn('Roce',payload)
 def test_teacher_cannot_read_or_write_other_incident(self):
  self.fail(404,lambda:self.s.mutate(self.b,self.incident()))
  incident=self.s.mutate(self.a,self.incident())['id'];self.assertEqual(self.s.incidents(self.b),[]);self.fail(404,lambda:self.s.incidents(self.b,incident));self.fail(404,lambda:self.s.mutate(self.b,dict(action='incident_update',operation_id='follow',incident_id=incident,version=1,note='Ajena')))
 def test_staff_access_and_append_only_followup(self):
  incident=self.s.mutate(self.a,self.incident())['id']
  self.assertEqual(len(self.s.incidents(self.admin)),1);self.assertEqual(len(self.s.incidents(self.manager)),1)
  self.s.mutate(self.admin,dict(action='incident_update',operation_id='follow',incident_id=incident,version=1,status='reviewing',note='Oficina revisa el parte'))
  self.s.mutate(self.a,dict(action='incident_update',operation_id='teacher-follow',incident_id=incident,version=2,note='Ampliación factual'))
  item=self.s.incidents(self.admin,incident);self.assertEqual(item['description'],'Roce ficticio durante maniobra');self.assertEqual(len(item['updates']),2);self.assertEqual(item['status'],'reviewing')
  self.fail(409,lambda:self.s.mutate(self.admin,dict(action='incident_update',operation_id='stale',incident_id=incident,version=1,status='closed',note='Antigua')))
  self.fail(403,lambda:self.s.mutate(self.a,dict(action='incident_update',operation_id='close',incident_id=incident,version=3,status='closed',note='No autorizado')))
  self.s.mutate(self.manager,dict(action='incident_update',operation_id='manager-close',incident_id=incident,version=3,status='closed',note='Revisión concluida'))
  self.assertEqual(self.s.incidents(self.manager,incident)['status'],'closed')
 def test_incident_validation(self):
  self.fail(400,lambda:self.s.mutate(self.a,self.incident(description='')))
  self.fail(400,lambda:self.s.mutate(self.a,self.incident(category='invalid')))
  self.fail(400,lambda:self.s.mutate(self.a,self.incident(occurred_at='2026-11-06T09:00')))
  self.s.mutate(self.admin,dict(action='status',operation_id='cancel',lesson_id='lesson-0',version=1,status='cancelled'))
  self.fail(409,lambda:self.s.mutate(self.a,self.incident()))
 def test_reassignment_revokes_incident_access(self):
  incident=self.s.mutate(self.a,self.incident())['id']
  with self.s.db() as c:c.execute("UPDATE students SET teacher_id='teacher-b' WHERE id='s1'")
  self.assertEqual(self.s.incidents(self.a),[]);self.fail(404,lambda:self.s.incidents(self.a,incident));self.fail(404,lambda:self.s.incidents(self.b,incident));self.assertEqual(len(self.s.incidents(self.admin)),1)
 def test_role_login_cannot_escalate(self):
  self.s.add_user('Prueba','test','valid-password-123','teacher');self.fail(401,lambda:self.s.login('test','valid-password-123','manager'));token,_=self.s.login('test','valid-password-123','teacher');self.assertEqual(self.s.authenticate(token)['role'],'teacher')
 def test_only_manager_creates_users_no_password_in_operations(self):
  data=dict(action='create_user',operation_id='new-user',name='Cuenta prueba',username='new-office',role='admin',password='New-test-password-123')
  self.fail(403,lambda:self.s.mutate(self.a,data));self.fail(403,lambda:self.s.mutate(self.admin,data));self.s.mutate(self.manager,data)
  token,_=self.s.login('new-office','New-test-password-123','admin');self.assertEqual(self.s.authenticate(token)['role'],'admin')
  with self.s.db() as c:
   self.assertNotIn('New-test',c.execute('SELECT payload FROM operations WHERE id=?',('new-user',)).fetchone()['payload'])
 def test_old_payloads_migrate_to_fingerprints(self):
  raw=json.dumps({'note':'Legacy personal note'},sort_keys=True)
  with self.s.db() as c:c.execute('INSERT INTO operations VALUES(?,?,?,?)',('legacy','teacher-a',raw,'{}'))
  Store(self.s.path)
  with self.s.db() as c:self.assertEqual(len(c.execute('SELECT payload FROM operations WHERE id=?',('legacy',)).fetchone()['payload']),64)
