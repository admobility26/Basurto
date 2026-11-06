# Verificación del piloto

## Automatizadas

- Aislamiento de alumnos, agendas y listado de profesores.
- Prohibición de crear alumnos desde profesor y de reservar alumnos ajenos.
- Prohibición de modificar una clase ajena por identificador.
- Solape global de vehículo, remolque y concurrencia: solo una de dos reservas simultáneas se confirma.
- Clases contiguas permitidas; duración inválida rechazada.
- Reenvío idempotente de ficha sin duplicar contador.
- Edición con versión antigua rechazada; oficina no escribe la valoración pedagógica.
- Cancelación en oficina frente a ficha offline: conflicto explícito.
- Matrícula normalizada y única.
- Contraseña/sesión y limitación de intentos.
- Cambio de asignación revoca la visibilidad online del profesor anterior.

## Pruebas manuales reproducibles en Chrome

1. Arrancar `python3 server.py --demo` y abrir `http://127.0.0.1:8765`.
2. Entrar como Profesor A: dos alumnos y dos citas del día; sin altas de alumnos ni catálogo de otros profesores.
3. Abrir ficha, elegir Marcha atrás, valorar Casi autónomo, escribir próximo paso y finalizar. Debe aparecer una clase realizada y cero cambios pendientes.
4. Abrir Administración en un perfil/incógnito separado. La misma ficha debe ser visible en consulta y el contador actualizado; no debe poder sobrescribir su valoración.
5. Profesor B solo debe ver su alumno y su cita. Intentar reservar el camión en la franja de Profesor A: mensaje genérico de no disponibilidad sin identificar a personas.
6. Sin conexión al servidor, editar una ficha y guardar. Debe aparecer pendiente y conservarse al recargar la misma pestaña. Restablecer el servidor y sincronizar: una sola ficha y contador correcto.
7. Con una propuesta offline pendiente, cambiar/cancelar esa cita desde oficina. Al sincronizar, debe mantenerse la propuesta en Pendientes con el conflicto. Al retirarla, la valoración debe quedar como borrador para revisión.
8. Intentar cerrar sesión con borradores/pendientes: debe pedir resolverlos. Tras guardarlos, cerrar sesión y comprobar que no hay acceso a datos sin autenticación.

Las pruebas manuales realizadas en esta entrega se registran en el mensaje de entrega; la lista anterior también incluye escenarios de aceptación para repetir antes de producción.

## Resultado de esta entrega

- 25 pruebas de servidor/API aprobadas: incluye autenticación, CSRF, origen, cierre de sesión y modo demo deshabilitado.
- Pruebas de cliente con almacenamiento simulado aprobadas: cifrado sin clave en IndexedDB, recuperación en la misma pestaña, reserva provisional offline sin inventar confirmación, rechazo de clave incorrecta y limpieza al salir.
- Chrome real: entrada como profesor A, ficha de Marcha atrás guardada con nivel Casi autónomo, contador actualizado; administración ve las tres citas y la clase realizada; profesor B solo ve su alumno y su cita. Cierre de sesión verificado.
- Inspección visual de la agenda realizada.
- Desconexión/reconexión completa en Chrome: pendiente de repetir. Se intentó interrumpiendo el servidor local, pero no se obtuvo verificación concluyente de la interacción durante el corte. No se presenta como prueba superada.

## Ampliación de marca, cuentas e incidencias

- Pruebas automatizadas de permisos por rol, alta de profesores por administración y de otros roles solo por gerencia, aislamiento de incidencias, reasignación, validación, reintentos, versiones y seguimiento sin sobrescribir el relato.
- Chrome: acceso con contraseña de gerencia y registro de un accidente ficticio verificados; detalle con matrícula, clase, fecha, autor, relato y medidas. No se considera verificado manualmente el ciclo completo de cierre del parte.
- Para la demo, consultar las credenciales generadas en `.runtime/demo-access.json`; no hay botones que omitan la contraseña.

## Adaptación Cloudflare

- 10 pruebas de la API adaptada con SQLite real: activación, aislamiento, roles, solapes, remolques, revisiones, reintentos, fichas, incidencias y revocación de sesión.
- Prueba HTTP con workerd local: activación y login, cookies, CSRF, origen, alta de profesor por administración, aislamiento y logout. Usuarios ficticios exclusivamente locales.
- 27 pruebas Python y las comprobaciones existentes de cliente siguen aprobadas.
- La activación real del administrador queda para el titular: no se crea una contraseña de producción durante las pruebas.
