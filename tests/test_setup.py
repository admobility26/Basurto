import tempfile, unittest, time
from pathlib import Path
from server import Store, Problem

class SetupTest(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.s=Store(Path(self.temp.name)/'test.sqlite')
 def test_activation_is_private_one_use_and_admin(self):
  token=self.s.prepare_admin('office@example.test')
  data=dict(username='office@example.test',activation=token,password='A-private-password-123',confirmation='A-private-password-123')
  self.assertTrue(self.s.setup_available())
  for changes in ({'activation':'wrong'},{'username':'other@example.test'},{'confirmation':'different'}):
   with self.assertRaises(Problem):self.s.activate_admin(dict(data,**changes))
  session,_=self.s.activate_admin(data)
  self.assertEqual(self.s.authenticate(session)['role'],'admin')
  self.assertFalse(self.s.setup_available())
  with self.assertRaises(Problem):self.s.activate_admin(data)
  with self.assertRaises(Problem):self.s.prepare_admin('other@example.test')
  session,_=self.s.login(data['username'],data['password'],'admin')
  self.assertEqual(self.s.authenticate(session)['role'],'admin')
 def test_expiry_and_no_plaintext_token(self):
  token=self.s.prepare_admin('office@example.test')
  with self.s.db() as c:
   self.assertNotEqual(c.execute('SELECT token_hash FROM admin_setup').fetchone()[0],token)
   c.execute('UPDATE admin_setup SET expires=?',(time.time()-1,))
  self.assertFalse(self.s.setup_available())
  with self.assertRaises(Problem):self.s.activate_admin(dict(username='office@example.test',activation=token,password='A-private-password-123',confirmation='A-private-password-123'))
