"""Basurto: local Chrome pilot. Only stdlib; no personal data in source control."""
import argparse, datetime as dt, getpass, hashlib, hmac, json, os, secrets, sqlite3, time
from contextlib import contextmanager
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent
GOALS = ['Preparación y mandos', 'Observación', 'Posición y trayectoria', 'Velocidad y control', 'Intersecciones', 'Señalización y maniobras', 'Seguridad y convivencia', 'Autonomía', 'Marcha atrás', 'Acoplamiento y desacoplamiento']
class Problem(Exception):
    def __init__(self, message, status=400): self.message, self.status = message, status

def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    return salt + ':' + hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()

def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def required(data, key, limit=160):
    value = data.get(key)
    if not isinstance(value, str) or not value.strip() or len(value)>limit: raise Problem('Revisa el campo ' + key)
    return value.strip()

class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.db() as c:
            c.executescript('''
            CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('teacher','admin','manager')), active INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY, name TEXT NOT NULL, permit TEXT NOT NULL, teacher_id TEXT NOT NULL REFERENCES users(id), reference TEXT NOT NULL DEFAULT '');
            CREATE TABLE IF NOT EXISTS vehicles(id TEXT PRIMARY KEY, name TEXT NOT NULL, plate TEXT UNIQUE NOT NULL, kind TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS lessons(id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), teacher_id TEXT NOT NULL REFERENCES users(id), vehicle_id TEXT NOT NULL REFERENCES vehicles(id), trailer_id TEXT REFERENCES vehicles(id), start TEXT NOT NULL, end TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned', version INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE IF NOT EXISTS sheets(lesson_id TEXT PRIMARY KEY REFERENCES lessons(id), ratings TEXT NOT NULL, note TEXT NOT NULL, next_goal TEXT NOT NULL, minutes INTEGER NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, payload TEXT NOT NULL, result TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS login_attempts(username TEXT PRIMARY KEY, attempts INTEGER NOT NULL, until REAL NOT NULL);
            ''')
        os.chmod(path, 0o600)
    @contextmanager
    def db(self):
        c=sqlite3.connect(self.path, timeout=15)
        c.row_factory=sqlite3.Row
        c.execute('PRAGMA foreign_keys=ON')
        try:
            with c:
                yield c
        finally:
            c.close()
    def add_user(self, name, username, password, role):
        if role not in ('teacher','admin','manager') or len(password)<12: raise Problem('Rol inválido o contraseña inferior a 12 caracteres')
        with self.db() as c: c.execute('INSERT INTO users VALUES(?,?,?,?,?,1)', (secrets.token_hex(12),name,username,password_hash(password),role))
    def session(self, c, user):
        token, csrf=secrets.token_urlsafe(32),secrets.token_urlsafe(24)
        c.execute('INSERT INTO sessions VALUES(?,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),user['id'],csrf,time.time()+8*3600))
        return token,csrf
    def login(self, username, password):
        with self.db() as c:
            c.execute('BEGIN IMMEDIATE')
            attempt=c.execute('SELECT * FROM login_attempts WHERE username=?',(username,)).fetchone()
            if attempt and attempt['attempts']>=5 and attempt['until']>time.time(): raise Problem('Espera unos minutos antes de volver a intentarlo',429)
            user=c.execute('SELECT * FROM users WHERE username=? AND active=1',(username,)).fetchone()
            check=password_hash(password, user['password'].split(':')[0] if user else '0'*32)
            if not user or not hmac.compare_digest(check,user['password']):
                n=attempt['attempts']+1 if attempt and attempt['until']>time.time() else 1
                c.execute('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)',(username,n,time.time()+900));c.commit()
                raise Problem('Usuario o contraseña incorrectos',401)
            c.execute('DELETE FROM login_attempts WHERE username=?',(username,))
            return self.session(c,user)
    def authenticate(self, token):
        with self.db() as c:
            r=c.execute('SELECT u.id,u.name,u.role,s.csrf,s.expires FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1',(hashlib.sha256(token.encode()).hexdigest(),time.time())).fetchone()
            if not r: raise Problem('Inicia sesión para continuar',401)
            return dict(r)
    def bootstrap(self, user):
        with self.db() as c:
            teacher=user['role']=='teacher'
            students=[dict(r) for r in c.execute('SELECT id,name,permit,teacher_id FROM students'+(' WHERE teacher_id=?' if teacher else ''), (user['id'],) if teacher else ())]
            lessons=[dict(r) for r in c.execute('SELECT l.*,s.ratings,s.note,s.next_goal,s.minutes,s.updated_at FROM lessons l LEFT JOIN sheets s ON s.lesson_id=l.id WHERE '+('l.teacher_id=? AND EXISTS(SELECT 1 FROM students st WHERE st.id=l.student_id AND st.teacher_id=?)' if teacher else '1=1')+' ORDER BY l.start', (user['id'],user['id']) if teacher else ())]
            for lesson in lessons:
                if lesson['ratings']: lesson['ratings']=json.loads(lesson['ratings'])
            users=[dict(r) for r in c.execute('SELECT id,name,role FROM users WHERE active=1'+(' AND id=?' if teacher else ''),(user['id'],) if teacher else ())]
            return dict(user={k:user[k] for k in ('id','name','role','expires')}, csrf=user['csrf'],students=students,lessons=lessons,vehicles=[dict(r) for r in c.execute('SELECT * FROM vehicles')],users=users,goals=GOALS,server_time=now())
    def mutate(self, user, data):
        operation=required(data,'operation_id',100)
        payload=json.dumps(data,sort_keys=True)
        with self.db() as c:
            c.execute('BEGIN IMMEDIATE')
            prior=c.execute('SELECT * FROM operations WHERE id=?',(operation,)).fetchone()
            if prior:
                if prior['user_id']!=user['id'] or prior['payload']!=payload: raise Problem('Operación incompatible',409)
                return json.loads(prior['result'])
            action=data.get('action'); entity=secrets.token_hex(12)
            staff=user['role'] in ('admin','manager')
            if action=='student':
                if not staff: raise Problem('Acceso no permitido',403)
                teacher=required(data,'teacher_id')
                if not c.execute("SELECT 1 FROM users WHERE id=? AND role='teacher' AND active=1",(teacher,)).fetchone(): raise Problem('Selecciona un profesor activo')
                c.execute('INSERT INTO students VALUES(?,?,?,?,?)',(entity,required(data,'name'),required(data,'permit',20),teacher,''))
            elif action=='vehicle':
                if not staff: raise Problem('Acceso no permitido',403)
                plate=required(data,'plate',20).upper().replace(' ','').replace('-','')
                kind=required(data,'kind',20)
                if kind not in ('car','motorcycle','truck','bus','trailer'): raise Problem('Tipo de vehículo inválido')
                try: c.execute('INSERT INTO vehicles VALUES(?,?,?,?)',(entity,required(data,'name'),plate,kind))
                except sqlite3.IntegrityError: raise Problem('Matrícula ya registrada',409)
            elif action in ('book','reschedule'):
                student=c.execute('SELECT * FROM students WHERE id=?',(data.get('student_id'),)).fetchone()
                if not student or (not staff and student['teacher_id']!=user['id']): raise Problem('Alumno no disponible',403)
                teacher=student['teacher_id']; vehicle=data.get('vehicle_id');trailer=data.get('trailer_id') or None
                if not c.execute("SELECT 1 FROM vehicles WHERE id=? AND kind!='trailer'",(vehicle,)).fetchone(): raise Problem('Selecciona un vehículo')
                if trailer and not c.execute("SELECT 1 FROM vehicles WHERE id=? AND kind='trailer'",(trailer,)).fetchone(): raise Problem('Selecciona un remolque válido')
                try:
                    start,end=(dt.datetime.fromisoformat(data[k]) for k in ('start','end'))
                    if not start.tzinfo or not end.tzinfo or end<=start or end-start>dt.timedelta(hours=8): raise ValueError()
                except (KeyError,ValueError,TypeError): raise Problem('Horario inválido')
                start,end=start.astimezone(dt.timezone.utc).isoformat(),end.astimezone(dt.timezone.utc).isoformat()
                mode=data.get('mode')
                if mode not in ('Pistas','Circulación'): raise Problem('Selecciona pistas o circulación')
                if action=='reschedule':
                    entity=required(data,'lesson_id'); old=self.owned_lesson(c,user,entity)
                    if old['status']!='planned' or old['version']!=data.get('version'): raise Problem('La clase ha cambiado. Actualiza la agenda.',409)
                # Serialized check+write prevents races across all teachers and shared resources.
                collision=c.execute("SELECT 1 FROM lessons WHERE status!='cancelled' AND id!=? AND start<? AND end>? AND (teacher_id=? OR student_id=? OR vehicle_id=? OR trailer_id=? OR (? IS NOT NULL AND (vehicle_id=? OR trailer_id=?)))",(entity,end,start,teacher,student['id'],vehicle,vehicle,trailer,trailer,trailer)).fetchone()
                if collision: raise Problem('Franja no disponible para el alumno, profesor o vehículo. Elige otro horario.',409)
                if action=='book': c.execute('INSERT INTO lessons(id,student_id,teacher_id,vehicle_id,trailer_id,start,end,mode) VALUES(?,?,?,?,?,?,?,?)',(entity,student['id'],teacher,vehicle,trailer,start,end,mode))
                else: c.execute('UPDATE lessons SET student_id=?,teacher_id=?,vehicle_id=?,trailer_id=?,start=?,end=?,mode=?,version=version+1 WHERE id=?',(student['id'],teacher,vehicle,trailer,start,end,mode,entity))
            elif action in ('sheet','status'):
                entity=required(data,'lesson_id'); lesson=self.owned_lesson(c,user,entity)
                if lesson['version']!=data.get('version'): raise Problem('La clase cambió en oficina. Conservamos tu propuesta para revisarla.',409)
                if action=='sheet':
                    if user['role']!='teacher' or lesson['teacher_id']!=user['id']: raise Problem('Solo el profesor de la clase puede valorarla',403)
                    if lesson['status'] not in ('planned','completed'): raise Problem('Revisa la asistencia antes de guardar la ficha',409)
                    ratings=data.get('ratings',{})
                    if not isinstance(ratings,dict) or not ratings or any(k not in GOALS or type(v)!=int or v not in (1,2,3,4) for k,v in ratings.items()): raise Problem('Valora al menos un aprendizaje trabajado')
                    minutes=data.get('minutes')
                    if type(minutes)!=int or not 1<=minutes<=480: raise Problem('Duración inválida')
                    note=data.get('note','');next_goal=required(data,'next_goal',300)
                    if not isinstance(note,str) or len(note)>600: raise Problem('Observación demasiado larga')
                    c.execute('INSERT OR REPLACE INTO sheets VALUES(?,?,?,?,?,?)',(entity,json.dumps(ratings),note,next_goal,minutes,now()))
                    status='completed'
                else:
                    status=data.get('status')
                    if status not in ('absent','cancelled') or lesson['status']!='planned': raise Problem('Cambio de estado no permitido')
                c.execute('UPDATE lessons SET status=?,version=version+1 WHERE id=?',(status,entity))
            else: raise Problem('Acción desconocida')
            result={'ok':True,'id':entity}
            c.execute('INSERT INTO audit(actor,action,entity,at) VALUES(?,?,?,?)',(user['id'],action,entity,now()))
            c.execute('INSERT INTO operations VALUES(?,?,?,?)',(operation,user['id'],payload,json.dumps(result)))
            return result
    def owned_lesson(self,c,user,entity):
        l=c.execute('SELECT l.* FROM lessons l JOIN students s ON s.id=l.student_id WHERE l.id=?'+(' AND l.teacher_id=? AND s.teacher_id=?' if user['role']=='teacher' else ''),(entity,user['id'],user['id']) if user['role']=='teacher' else (entity,)).fetchone()
        if not l: raise Problem('Clase no disponible',404)
        return l
    def seed_demo(self):
        with self.db() as c:
            if c.execute('SELECT 1 FROM users').fetchone(): return
            for uid,name,role in [('office','Oficina de pruebas','admin'),('manager','Gerencia de pruebas','manager'),('teacher-a','Profesor A · prueba','teacher'),('teacher-b','Profesor B · prueba','teacher')]:
                c.execute('INSERT INTO users VALUES(?,?,?,?,?,1)',(uid,name,uid,password_hash(secrets.token_urlsafe(32)),role))
            for sid,name,teacher,permit in [('s1','Alumno de prueba 01','teacher-a','C'),('s2','Alumna de prueba 02','teacher-a','D'),('s3','Alumno de prueba 03','teacher-b','B')]: c.execute('INSERT INTO students VALUES(?,?,?,?,?)',(sid,name,permit,teacher,''))
            for vid,name,plate,kind in [('v1','Camión','DEMO-C','truck'),('v2','Autobús','DEMO-D','bus'),('v3','Coche 1','DEMO-B','car'),('v4','Remolque','DEMO-R','trailer')]:c.execute('INSERT INTO vehicles VALUES(?,?,?,?)',(vid,name,plate,kind))
            today=dt.datetime.now().astimezone().replace(hour=9,minute=0,second=0,microsecond=0)
            for i,s,t,v in [(0,'s1','teacher-a','v1'),(1,'s2','teacher-a','v2'),(2,'s3','teacher-b','v3')]:
                start=today+dt.timedelta(hours=i)
                c.execute('INSERT INTO lessons(id,student_id,teacher_id,vehicle_id,start,end,mode) VALUES(?,?,?,?,?,?,?)',('lesson-'+str(i),s,t,v,start.astimezone(dt.timezone.utc).isoformat(),(start+dt.timedelta(minutes=45)).astimezone(dt.timezone.utc).isoformat(),'Pistas'))

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass # Do not log URLs, names or request bodies.
    def send(self,status,data,cookie=None,ctype='application/json'):
        body=json.dumps(data,ensure_ascii=False).encode() if ctype=='application/json' else data
        self.send_response(status)
        for k,v in {'Content-Type':ctype,'Content-Length':str(len(body)),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Permissions-Policy':'camera=(), microphone=(), geolocation=()'}.items():self.send_header(k,v)
        if cookie:self.send_header('Set-Cookie',cookie)
        self.end_headers();self.wfile.write(body)
    def cookie(self,token,expired=False):return 'basurto='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+('0' if expired else '28800')+('; Secure' if self.server.secure else '')
    def user(self):
        cookies=SimpleCookie(self.headers.get('Cookie','')); token=cookies.get('basurto')
        return self.server.store.authenticate(token.value if token else '')
    def do_GET(self):
        try:
            path=urlparse(self.path).path
            if path=='/api/config':return self.send(200,{'demo':self.server.demo})
            if path=='/api/bootstrap':return self.send(200,self.server.store.bootstrap(self.user()))
            assets={'/':('index.html','text/html; charset=utf-8'),'/app.js':('app.js','text/javascript'),'/style.css':('style.css','text/css'),'/sw.js':('sw.js','text/javascript')}
            if path not in assets:raise Problem('No encontrado',404)
            f,ct=assets[path];self.send(200,(ROOT/'static'/f).read_bytes(),ctype=ct)
        except Problem as e:self.send(e.status,{'error':e.message})
    def do_POST(self):
        try:
            if self.headers.get('Origin')!=self.server.origin:raise Problem('Origen no permitido',403)
            if self.headers.get('Content-Type','').split(';')[0]!='application/json':raise Problem('Formato inválido',415)
            length=int(self.headers.get('Content-Length',0))
            if length>16000:raise Problem('Solicitud demasiado grande',413)
            try:data=json.loads(self.rfile.read(length))
            except (ValueError,UnicodeError):raise Problem('Solicitud inválida')
            if not isinstance(data,dict):raise Problem('Solicitud inválida')
            path=urlparse(self.path).path;store=self.server.store
            if path=='/api/login':
                token,csrf=store.login(required(data,'username',100),required(data,'password',200));return self.send(200,{'csrf':csrf},self.cookie(token))
            if path=='/api/demo' and self.server.demo:
                with store.db() as c:
                    user=c.execute('SELECT * FROM users WHERE id=?',(data.get('user'),)).fetchone()
                    if not user:raise Problem('Usuario no disponible')
                    token,csrf=store.session(c,user)
                return self.send(200,{'csrf':csrf},self.cookie(token))
            user=self.user()
            if not hmac.compare_digest(self.headers.get('X-CSRF-Token',''),user['csrf']):raise Problem('Sesión no válida',403)
            if path=='/api/logout':
                cookies=SimpleCookie(self.headers.get('Cookie',''))
                with store.db() as c:c.execute('DELETE FROM sessions WHERE token=?',(hashlib.sha256(cookies['basurto'].value.encode()).hexdigest(),))
                return self.send(200,{'ok':True},self.cookie('',True))
            if path=='/api/action':return self.send(200,store.mutate(user,data))
            raise Problem('No encontrado',404)
        except Problem as e:self.send(e.status,{'error':e.message})
        except (ValueError,TypeError,sqlite3.Error):self.send(400,{'error':'No se pudo guardar. Revisa los datos e inténtalo de nuevo.'})

def main():
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8765);p.add_argument('--db');p.add_argument('--demo',action='store_true');p.add_argument('--create-user',action='store_true');args=p.parse_args()
    store=Store(args.db or ROOT/('.runtime/demo.sqlite' if args.demo else '.runtime/basurto.sqlite'))
    if args.create_user:
        store.add_user(input('Nombre: '),input('Usuario: '),getpass.getpass('Contraseña (12+ caracteres): '),input('Rol (teacher/admin/manager): '));return
    if args.demo:store.seed_demo()
    http=ThreadingHTTPServer(('127.0.0.1',args.port),Handler);http.store=store;http.demo=args.demo;http.secure=False;http.origin=f'http://127.0.0.1:{args.port}'
    print(f'Basurto: {http.origin} — '+('DEMOSTRACIÓN: solo datos ficticios' if args.demo else 'Piloto local'),flush=True)
    http.serve_forever()
if __name__=='__main__':main()
