"""Management controls for the local pilot; production equivalents live in Store."""
import hashlib, json

def revision(row):
    return hashlib.sha256(json.dumps(dict(row),sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()

def archived(c,kind,entity):
    return bool(c.execute('SELECT 1 FROM archived_records WHERE kind=? AND entity=?',(kind,entity)).fetchone())

def account(row):
    value=dict(row);value['revision']=revision(row);value.pop('password');return value

def mutate(c,user,data,required,Problem,password_hash,now):
    if user['role'] not in ('admin','manager'): raise Problem('Solo Administración y Gerencia pueden gestionar registros',403)
    action=data['action']
    if action=='edit_user':
        entity=required(data,'user_id');target=c.execute('SELECT * FROM users WHERE id=? AND active=1',(entity,)).fetchone()
        if not target: raise Problem('Cuenta no disponible',404)
        if target['role']=='admin' or entity==user['id']: raise Problem('Esta cuenta está protegida',403)
        if data.get('revision')!=revision(target): raise Problem('La cuenta ha cambiado. Actualiza y vuelve a abrirla.',409)
        name=required(data,'name');username=required(data,'username',100)
        if c.execute('SELECT 1 FROM users WHERE username=? AND id!=?',(username,entity)).fetchone(): raise Problem('Ese usuario ya existe',409)
        password=data.get('password');hashed=target['password']
        if password:
            if not isinstance(password,str) or not 12<=len(password)<=200: raise Problem('La contraseña debe tener entre 12 y 200 caracteres')
            hashed=password_hash(password)
        c.execute('UPDATE users SET name=?,username=?,password=? WHERE id=?',(name,username,hashed,entity))
        if username!=target['username'] or hashed!=target['password']:
            c.execute('DELETE FROM sessions WHERE user_id=?',(entity,));c.execute('DELETE FROM login_attempts WHERE username IN (?,?)',(username,target['username']))
    elif action=='edit_student':
        entity=required(data,'student_id');target=c.execute('SELECT id,name,permit,teacher_id FROM students WHERE id=?',(entity,)).fetchone()
        if not target or archived(c,'student',entity): raise Problem('Alumno no disponible',404)
        if data.get('revision')!=revision(target): raise Problem('El alumno ha cambiado. Actualiza la lista.',409)
        teacher=required(data,'teacher_id')
        if not c.execute("SELECT 1 FROM users WHERE id=? AND role='teacher' AND active=1",(teacher,)).fetchone(): raise Problem('Selecciona un profesor activo')
        if teacher!=target['teacher_id'] and c.execute("SELECT 1 FROM lessons l WHERE student_id=? AND status='planned' AND NOT EXISTS(SELECT 1 FROM archived_records a WHERE a.kind='lesson' AND a.entity=l.id)",(entity,)).fetchone(): raise Problem('Cancela o elimina las clases pendientes antes de cambiar de profesor.',409)
        c.execute('UPDATE students SET name=?,permit=?,teacher_id=? WHERE id=?',(required(data,'name'),required(data,'permit',20),teacher,entity))
    else:
        kind=required(data,'kind',20);tables={'user':'users','student':'students','vehicle':'vehicles','lesson':'lessons','incident':'incidents'}
        if kind not in tables: raise Problem('Tipo de registro inválido')
        entity=required(data,'entity_id');target=c.execute('SELECT * FROM '+tables[kind]+' WHERE id=?',(entity,)).fetchone()
        if not target or archived(c,kind,entity): raise Problem('Registro no disponible',404)
        if kind=='user':
            if entity==user['id'] or target['role']=='admin': raise Problem('No puedes eliminar tu cuenta ni la administración principal',403)
            if data.get('revision')!=revision(target): raise Problem('La cuenta ha cambiado. Actualiza la lista.',409)
            if c.execute("SELECT 1 FROM students s WHERE teacher_id=? AND NOT EXISTS(SELECT 1 FROM archived_records a WHERE a.kind='student' AND a.entity=s.id)",(entity,)).fetchone(): raise Problem('Este profesor tiene alumnos activos. Reasígnalos o elimina sus altas antes de eliminar la cuenta.',409)
        if kind in ('user','student','vehicle'):
            condition={'user':'l.teacher_id=?','student':'l.student_id=?','vehicle':'(l.vehicle_id=? OR l.trailer_id=?)'}[kind]
            params=(now(),entity,entity) if kind=='vehicle' else (now(),entity)
            if c.execute("SELECT 1 FROM lessons l WHERE l.status='planned' AND l.end>? AND NOT EXISTS(SELECT 1 FROM archived_records a WHERE a.kind='lesson' AND a.entity=l.id) AND "+condition,params).fetchone(): raise Problem('Tiene clases futuras programadas. Cancela o elimina esas clases primero.',409)
        if kind in ('lesson','incident') and target['version']!=data.get('version'): raise Problem('El registro ha cambiado. Actualiza antes de eliminar.',409)
        c.execute('INSERT INTO archived_records VALUES(?,?,?,?)',(kind,entity,user['id'],now()))
        if kind=='user':
            c.execute('UPDATE users SET active=0 WHERE id=?',(entity,));c.execute('DELETE FROM sessions WHERE user_id=?',(entity,))
        if kind=='lesson': c.execute('UPDATE lessons SET version=version+1 WHERE id=?',(entity,))
    return entity
