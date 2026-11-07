# Basurto · agenda y formación práctica

Piloto web para Chrome, con servidor local y adaptación para Cloudflare Workers. Agenda central, ficha reducida y aislamiento por profesor. Solo datos ficticios durante esta fase; no es todavía un despliegue de producción ni una certificación de cumplimiento RGPD.

## Cloudflare: acceso central

La dirección es https://basurto.admobility26.workers.dev. El servidor de `cloudflare/` implementa la misma API y sirve la interfaz existente. Usa un Durable Object con SQLite y transacciones síncronas para comprobar y reservar horarios de forma indivisible. La instancia central se crea con jurisdicción UE. No se migran datos ni contraseñas de las pruebas locales.

Primer acceso: **Activar administración · primer acceso**, correo autorizado, clave privada de activación y contraseña elegida por el titular (dos veces). La clave caduca a las 24 horas y el alta se bloquea cuando existe la primera cuenta de oficina. Después: **Administración → Usuarios → Crear usuario** para profesores; **Alumnos** para asignar alumnos y **Vehículos** para registrar matrículas.

Despliegue técnico: `npm ci` y `npm run deploy`, con la cuenta Cloudflare autorizada. La configuración de `wrangler.jsonc` conserva el nombre `basurto` y el enlace a la base. No cambiar el nombre de la clase, la jurisdicción ni el identificador `basurto-office-v1`: seleccionan la base existente. Configurar mediante secretos `ADMIN_EMAIL`, `ADMIN_ACTIVATION_HASH` (SHA-256 de una clave aleatoria de 32 bytes) y `ADMIN_ACTIVATION_EXPIRES` (segundos Unix). Nunca subir la clave ni contraseñas al repositorio. No configurar `LOCAL_DEVELOPMENT` en producción.

La versión Python continúa disponible para pruebas locales. Una cuenta creada allí no existe en Cloudflare. Antes de usar datos reales, completar las medidas operativas de `docs/PRIVACIDAD.md`.

## Probar en Chrome localmente

Requiere Python 3.11 o posterior, sin paquetes externos.

```sh
python3 server.py --demo
```

Abrir http://127.0.0.1:8765 en Chrome. La entrada ofrece Profesor, Administración y Gerencia, siempre con usuario y contraseña. Al crear la demostración se generan contraseñas aleatorias en `.runtime/demo-access.json` (archivo privado, no se sube a GitHub). Para renovar las cuentas de una demo anterior, arrancar con `--demo --reset-demo-passwords`; se revocan sus sesiones anteriores. Solo se escucha en el equipo local. Matrículas y alumnos de prueba son ficticios. Usar un perfil de Chrome normal y otro de incógnito para probar dos cuentas simultáneas (las pestañas del mismo perfil comparten cookie).

El archivo `.runtime/demo.sqlite` conserva las pruebas entre reinicios y no se sube a GitHub. Para otra base de pruebas, usar `--db /ruta/a/otra-demo.sqlite`.

## Funciones

- Profesor: planificación diaria y siete días, solo alumnos propios, reserva y cambio de horario, matrícula del vehículo y remolque, asistencia, ficha práctica y progreso.
- Administración/gerencia: agenda conjunta con filtro por profesor, alta de alumnos y asignación, alta de vehículos y consulta de fichas.
- La ficha usa cuatro niveles constantes. No trabajado no puntúa; se conserva el histórico por clase y se muestra la valoración previa de cada aprendizaje, su fecha y el próximo objetivo.
- Solo el profesor responsable puede escribir la valoración; oficina puede consultar y gestionar horarios/asistencia.
- Solapes comprobados en una transacción central para profesor, alumno, vehículo y remolque. Los mensajes no revelan citas ajenas.
- Reintentos idempotentes, revisiones por clase y discrepancias conservadas. Una reserva offline es una propuesta hasta que el servidor la confirma.
- Caché de interfaz sin datos personales; copia local cifrada de los datos autorizados y cola de cambios en IndexedDB. La clave permanece en la sesión de la pestaña.

## Identidad, accesos e incidencias

Logo aportado por la autoescuela y amarillo corporativo. Cada persona entra con una cuenta individual; elegir un área no concede permisos.

- Profesor: únicamente sus alumnos, clases y sus incidencias autorizadas.
- Administración: agenda y alumnos de todos los profesores, consulta de fichas, seguimiento de incidencias y creación de cuentas de profesores desde Usuarios.
- Gerencia: acceso global y alta de usuarios con su rol.

Desde la ficha de clase o desde Incidencias se registra fecha, lugar, tipo, relato y medidas tomadas. La matrícula queda conservada junto al parte. El relato inicial no se sobrescribe: se añaden actuaciones con autor y fecha; administración y gerencia pueden pasar el parte a En revisión o Cerrada. Los profesores pueden añadir seguimiento, pero no cerrar partes.

Las incidencias requieren conexión y no se incluyen en la copia offline. El registro queda disponible en la aplicación de oficina; no envía emergencias, correos ni partes a aseguradoras. Evitar diagnósticos y datos innecesarios de terceros. No admite archivos adjuntos.

## Límites deliberados del piloto

- El servidor Python se limita a localhost. El despliegue Cloudflare utiliza otro servidor y otra base central: las cuentas y datos locales no se transfieren automáticamente. No basta abrir el HTML ni activar GitHub Pages.
- Offline admite recargar la **misma pestaña** dentro de la sesión de ocho horas previamente iniciada. Cerrar la pestaña puede perder la clave local: sincronizar antes de cerrarla. La persistencia offline duradera entre cierres queda pendiente del diseño de dispositivos/autenticación. La interfaz avisa al cerrar con datos pendientes.
- No se garantiza reserva global offline; se confirma al reconectar. Sincronización al abrir/recuperar foco/conexión, manual y cada 30 segundos con la aplicación abierta. No hay sincronización garantizada con el navegador cerrado.
- Sin edición/reasignación de alumnos, múltiples matrículas formativas por alumno, mantenimiento, capacidad de pista, márgenes de preparación, recurrencias, recuperación de contraseña ni MFA en esta versión.
- La agenda inicial utiliza lista diaria/semanal propia, sin dependencia de calendario externo. FullCalendar sigue siendo candidato para una futura cuadrícula de oficina; no reemplaza las restricciones del servidor.
- Se conserva intacto el proyecto anterior [FichaAutoescuela](https://github.com/promociones7819-stack/FichaAutoescuela). No se han importado ni convertido sus datos. Basurto toma la ficha reducida como referencia funcional; la migración requiere copia, correspondencia de alumnos/profesores y verificación de históricos antes de operar con datos reales.

## Cuentas sin modo demostración

```sh
python3 server.py --create-user
python3 server.py
```

Crear primero una cuenta `admin` (administración) o `manager` (gerencia) con el comando anterior, eligiendo usuario y contraseña privados. Administración entra seleccionando su área en la pantalla de acceso; desde Usuarios → Crear usuario introduce el nombre, usuario y contraseña inicial de cada profesor. Desde Gerencia → Usuarios se pueden crear cuentas de profesor, administración y gerencia; administración puede crear cuentas de profesor, pero no administradores ni gerentes. El área elegida al entrar debe coincidir con el permiso guardado en el servidor. Contraseña de al menos 12 caracteres mediante entrada oculta. Nunca introducir alumnos reales en el piloto local sin completar la revisión de privacidad y operación descrita en `docs/PRIVACIDAD.md`.

## Arquitectura

JavaScript y CSS locales, API Python y SQLite. Sin CDN, analítica ni fuentes remotas. `BEGIN IMMEDIATE` serializa comprobación y reserva. Una instancia del servidor y una base compartida; para un despliegue distribuido, migrar a PostgreSQL con restricciones de exclusión y conservar la API y las pruebas de concurrencia.

Las sesiones usan cookies HttpOnly/SameSite Strict, CSRF y validación de origen. Contraseñas con scrypt; limitación de intentos; consultas parametrizadas, validación de entradas, política de contenido y sin caché HTTP de respuestas privadas. El servidor vuelve a comprobar permisos en cada lectura y escritura. Los registros de auditoría guardan autor/acción/identificador/fecha, no notas personales.

## Pruebas

```sh
python3 -m unittest discover -s tests -v
node --check static/app.js
node tests/test_client.cjs
```

Ver `docs/PRUEBAS.md` y `docs/PRIVACIDAD.md` antes de ampliar el piloto.

## Primer acceso: elegir la contraseña de administración

En una base nueva, el operador prepara el correo autorizado con `python3 server.py --setup-admin CORREO`. La clave aleatoria se guarda en `.runtime/admin-activation.txt`, con permisos privados y caducidad de 24 horas. Reiniciar con `python3 server.py`, abrir la web y pulsar **Activar administración · primer acceso**. El titular introduce su correo, la clave de activación y una contraseña elegida por él, repetida para confirmar.

La clave no es una contraseña predeterminada: se consume al activar. Solo se guarda su huella en la base. No se permite preparar ni completar el alta si ya existe una cuenta de oficina. El correo no se publica en la configuración anónima ni se fija en el código. Este flujo requiere la API del servidor; alojar únicamente los archivos estáticos en Cloudflare no permite activar ni iniciar sesión.

### Formación

Nueva pestaña con catálogo de 339 señales editable, biblioteca de PDF versionados y preparación/proyección de clases. [Uso, permisos y almacenamiento](docs/FORMACION.md). Requiere Cloudflare y el binding privado R2 `TRAINING_FILES` al bucket `basurto`. La biblioteca parte vacía.
