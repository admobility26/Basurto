import concurrent.futures,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import Store,Problem
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.s=Store(Path(self.tmp.name)/'db.sqlite');self.s.seed_demo();self.a=dict(id='teacher-a',name='A',role='teacher',csrf='x',expires=9999999999);self.b={**self.a,'id':'teacher-b'};self.admin={**self.a,'id':'office','role':'admin'}
 def tearDown(self):self.tmp.cleanup()
 def book(self,op='one',**kw):return dict(action='book',operation_id=op,**(dict(student_id='s1',vehicle_id='v1',start='2027-01-01T09:00:00+00:00',end='2027-01-01T09:45:00+00:00',mode='Pistas')|kw))
 def fails(self,status,call):
  with self.assertRaises(Problem) as ctx:call()
  self.assertEqual(ctx.exception.status,status)
 def sheet(self,**kw):return dict(action='sheet',**(dict(operation_id='sheet',lesson_id='lesson-0',version=1,ratings={'Marcha atrás':3},note='Prueba',next_goal='Repetir',minutes=45)|kw))
 def test_isolation(self):
  data=self.s.bootstrap(self.a);self.assertEqual({x['id'] for x in data['students']},{'s1','s2'});self.assertEqual({x['teacher_id'] for x in data['lessons']},{'teacher-a'});self.assertEqual([x['id'] for x in data['users']],['teacher-a']);self.assertNotIn('password',json.dumps(data));self.assertEqual(len(self.s.bootstrap(self.admin)['students']),3)
 def test_forbidden_student_and_foreign_book(self):
  self.fails(403,lambda:self.s.mutate(self.a,dict(action='student',operation_id='s',name='Prueba',teacher_id='teacher-a',permit='C')));self.fails(403,lambda:self.s.mutate(self.a,self.book(student_id='s3')))
 def test_foreign_class(self):self.fails(404,lambda:self.s.mutate(self.a,dict(action='status',operation_id='x',lesson_id='lesson-2',version=1,status='cancelled')))
 def test_vehicle_conflict(self):
  self.s.mutate(self.a,self.book());self.fails(409,lambda:self.s.mutate(self.b,self.book('b',student_id='s3')))
 def test_adjacency(self):
  self.s.mutate(self.a,self.book());self.s.mutate(self.a,self.book('next',start='2027-01-01T09:45:00+00:00',end='2027-01-01T10:30:00+00:00'));self.fails(400,lambda:self.s.mutate(self.a,self.book('bad',end='2027-01-01T08:00:00+00:00')))
 def test_trailer(self):
  self.s.mutate(self.a,self.book(trailer_id='v4'));self.fails(409,lambda:self.s.mutate(self.b,self.book('b',student_id='s3',vehicle_id='v3',trailer_id='v4')))
 def test_race(self):
  def run(pair):
   try:self.s.mutate(*pair);return 200
   except Problem as e:return e.status
  with concurrent.futures.ThreadPoolExecutor() as pool:results=list(pool.map(run,[(self.a,self.book('a')),(self.b,self.book('b',student_id='s3'))]))
  self.assertEqual(sorted(results),[200,409])
 def test_idempotency_and_revision(self):
  d=self.sheet();self.assertEqual(self.s.mutate(self.a,d),self.s.mutate(self.a,d));self.assertEqual(len([l for l in self.s.bootstrap(self.a)['lessons'] if l['status']=='completed']),1);self.fails(409,lambda:self.s.mutate(self.a,self.sheet(operation_id='new')));self.fails(403,lambda:self.s.mutate(self.admin,self.sheet(operation_id='admin',version=2)))
 def test_cancel_offline(self):
  self.s.mutate(self.admin,dict(action='status',operation_id='cancel',lesson_id='lesson-0',version=1,status='cancelled'));self.fails(409,lambda:self.s.mutate(self.a,self.sheet()))
 def test_plate(self):
  d=dict(action='vehicle',operation_id='v',name='Prueba',plate='1234 ABC',kind='car');self.s.mutate(self.admin,d);self.fails(409,lambda:self.s.mutate(self.admin,{**d,'operation_id':'v2','plate':'1234-abc'}))
 def test_login_throttle(self):
  self.s.add_user('Prueba','login','test-password-long','teacher');token,_=self.s.login('login','test-password-long');self.assertEqual(self.s.authenticate(token)['role'],'teacher')
  for _ in range(5):self.fails(401,lambda:self.s.login('login','bad'))
  self.fails(429,lambda:self.s.login('login','bad'))
 def test_reassignment(self):
  with self.s.db() as c:c.execute("UPDATE students SET teacher_id='teacher-b' WHERE id='s1'")
  self.assertFalse(any(l['student_id']=='s1' for l in self.s.bootstrap(self.a)['lessons']));self.fails(404,lambda:self.s.mutate(self.a,dict(action='status',operation_id='x',lesson_id='lesson-0',version=1,status='cancelled')))
if __name__=='__main__':unittest.main()
