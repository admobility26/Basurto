import http.client,json,tempfile,threading,unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from server import Store,Handler
class HttpTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.s=Store(Path(self.tmp.name)/'db.sqlite');self.s.seed_demo();self.s.add_user('Usuario de prueba','test','test-password-long','teacher')
  self.http=ThreadingHTTPServer(('127.0.0.1',0),Handler);self.http.store=self.s;self.http.demo=False;self.http.secure=False;self.http.origin='http://127.0.0.1:'+str(self.http.server_port);self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start()
 def tearDown(self):self.http.shutdown();self.http.server_close();self.thread.join();self.tmp.cleanup()
 def req(self,path,data=None,headers=None):
  c=http.client.HTTPConnection('127.0.0.1',self.http.server_port);h={'Content-Type':'application/json','Origin':self.http.origin};h.update(headers or {});c.request('POST' if data is not None else 'GET',path,json.dumps(data) if data is not None else None,h);r=c.getresponse();body=r.read();result=(r.status,dict(r.getheaders()),json.loads(body));c.close();return result
 def test_private_api_requires_authentication(self):
  status,h,_=self.req('/api/bootstrap');self.assertEqual(status,401);self.assertEqual(h['Cache-Control'],'no-store')
 def test_login_cookie_csrf_and_logout(self):
  status,h,data=self.req('/api/login',dict(username='test',password='test-password-long'));self.assertEqual(status,200);self.assertIn('HttpOnly',h['Set-Cookie']);self.assertIn('SameSite=Strict',h['Set-Cookie']);cookie=h['Set-Cookie'].split(';')[0]
  self.assertEqual(self.req('/api/bootstrap',headers={'Cookie':cookie})[0],200)
  self.assertEqual(self.req('/api/logout',{},headers={'Cookie':cookie})[0],403)
  self.assertEqual(self.req('/api/logout',{},headers={'Cookie':cookie,'X-CSRF-Token':data['csrf']})[0],200)
  self.assertEqual(self.req('/api/bootstrap',headers={'Cookie':cookie})[0],401)
 def test_cross_origin_login_blocked(self):self.assertEqual(self.req('/api/login',dict(username='test',password='test-password-long'),{'Origin':'https://foreign.example'})[0],403)
 def test_demo_disabled(self):self.assertEqual(self.req('/api/demo',{'user':'office'})[0],401)
if __name__=='__main__':unittest.main()
