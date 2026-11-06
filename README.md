# Basurto · agenda y formación práctica

Piloto web local para Chrome. Agenda central, ficha reducida y aislamiento por profesor. Solo datos ficticios durante esta fase; no es todavía un despliegue de producción ni una certificación de cumplimiento RGPD.

## Probar en Chrome

Requiere Python 3.11 o posterior, sin paquetes externos.

```sh
python3 server.py --demo
```

Abrir http://127.0.0.1:8765 en Chrome. La entrada ofrece Profesor A, Profesor B, Administración y Gerencia. Los accesos sin contraseña existen **únicamente** al arrancar con `--demo`; solo se escucha en el equipo local. Matrículas y alumnos de prueba son ficticios. Usar un perfil de Chrome normal y otro de incógnito para probar dos cuentas simultáneas (las pestañas del mismo perfil comparten cookie).

El archivo `.runtime/demo.sqlite` conserva las pruebas entre reinicios y no se sube a GitHub. Para otra base de pruebas, usar `--db /ruta/a/otra-demo.sqlite`.

## Funciones

- Profesor: planificación diaria y siete días, solo alumnos propios, reserva y cambio de horario, matrícula del vehículo y remolque, asistencia, ficha práctica y progreso.
- Administración/gerencia: agenda conjunta con filtro por profesor, alta de alumnos y asignación, alta de vehículos y consulta de fichas.
- La ficha usa cuatro niveles constantes. No trabajado no puntúa; se conserva el histórico por clase y se muestra la valoración previa de cada aprendizaje, su fecha y el próximo objetivo.
- Solo el profesor responsable puede escribir la valoración; oficina puede consultar y gestionar horarios/asistencia.
- Solapes comprobados en una transacción central para profesor, alumno, vehículo y remolque. Los mensajes no revelan citas ajenas.
- Reintentos idempotentes, revisiones por clase y discrepancias conservadas. Una reserva offline es una propuesta hasta que el servidor la confirma.
- Caché de interfaz sin datos personales; copia local cifrada de los datos autorizados y cola de cambios en IndexedDB. La clave permanece en la sesión de la pestaña.

## Límites deliberados del piloto

- Solo localhost: no se ha publicado un servicio central accesible desde la autoescuela. Oficina y profesor se simulan como cuentas distintas sobre este servidor. No basta abrir el HTML ni activar GitHub Pages.
- Offline admite recargar la **misma pestaña** dentro de la sesión de ocho horas previamente iniciada. Cerrar la pestaña puede perder la clave local: sincronizar antes de cerrarla. La persistencia offline duradera entre cierres queda pendiente del diseño de dispositivos/autenticación. La interfaz avisa al cerrar con datos pendientes.
- No se garantiza reserva global offline; se confirma al reconectar. Sincronización al abrir/recuperar foco/conexión, manual y cada 30 segundos con la aplicación abierta. No hay sincronización garantizada con el navegador cerrado.
- Sin gestión web de cuentas, edición/reasignación de alumnos, múltiples matrículas formativas por alumno, mantenimiento, capacidad de pista, márgenes de preparación, recurrencias, recuperación de contraseña ni MFA en esta versión.
- La agenda inicial utiliza lista diaria/semanal propia, sin dependencia de calendario externo. FullCalendar sigue siendo candidato para una futura cuadrícula de oficina; no reemplaza las restricciones del servidor.
- Se conserva intacto el proyecto anterior [FichaAutoescuela](https://github.com/promociones7819-stack/FichaAutoescuela). No se han importado ni convertido sus datos. Basurto toma la ficha reducida como referencia funcional; la migración requiere copia, correspondencia de alumnos/profesores y verificación de históricos antes de operar con datos reales.

## Cuentas sin modo demostración

```sh
python3 server.py --create-user
python3 server.py
```

Crear primero una cuenta `admin` o `manager` y las cuentas `teacher`. Contraseña de al menos 12 caracteres mediante entrada oculta. Nunca introducir alumnos reales en el piloto local sin completar la revisión de privacidad y operación descrita en `docs/PRIVACIDAD.md`.

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
