# Gestión de registros y sincronización · 0.2.1

Administración y Gerencia pueden eliminar profesores, alumnos, vehículos, clases e incidencias. Es una baja lógica: retira el registro del uso diario y conserva relaciones, fichas y auditoría. No equivale a supresión definitiva de datos personales. La política y ejecución de supresión definitiva siguen siendo trabajo pendiente; no hay un plazo de conservación automático.

- Agenda, Alumnos, Vehículos y Usuarios muestran un botón **Eliminar**. La incidencia se elimina desde su detalle. Cada acción pide confirmación y requiere conexión.
- **Mostrar también eliminados** permite consultar las bajas de agenda, alumnos, vehículos y usuarios. Una clase eliminada conserva su ficha en consulta, libera recursos y deja de sumar al contador. Las incidencias retiradas permanecen en la base de datos con su seguimiento, sin mostrarse en el listado habitual; no hay restauración de incidencias desde la interfaz.
- Antes de retirar un alumno, profesor o vehículo, deben resolverse sus clases futuras. Antes de retirar un profesor, hay que reasignar o retirar sus alumnos activos. Editar alumno permite cambiar la asignación cuando no quedan clases programadas sin resolver.
- La cuenta principal de Administración y la propia cuenta están protegidas. Administración puede editar el nombre, usuario y contraseña de Gerencia y de los profesores; los permisos originales se conservan. La contraseña vacía conserva la anterior. Cambiar credenciales revoca las sesiones de esa cuenta. No se transmite ni muestra el hash de contraseña.
- Un control de revisión rechaza ediciones de cuentas/alumnos o eliminaciones de clases/incidencias que quedaron desactualizadas. Las bajas no se encolan offline. Las fichas pendientes contra una clase retirada se conservan como conflicto y nunca resucitan la clase.

## Incidencias entre dispositivos

El servidor sigue siendo el único registro central. El fallo corregido estaba en la actualización de la vista: una incidencia no modificaba ninguno de los campos usados para detectar cambios de agenda. Ahora bootstrap incluye una huella de las incidencias autorizadas para esa cuenta (sin relatos), y el cliente vuelve a consultar la lista al sincronizar esa pestaña. Se mantiene la comprobación cada 30 segundos, al recuperar conexión, al volver a la ventana y con el botón Sincronizar. Los formularios abiertos no se reemplazan durante una edición. Los relatos y seguimientos siguen consultándose solo con conexión.

## Despliegue y compatibilidad

La migración añade `archived_records`; no modifica ni elimina tablas existentes. Se aplica al iniciar el objeto central y en el piloto Python. La interfaz nativa incorpora sus archivos: instalar **0.2.1** en todos los dispositivos antes de usar las bajas. Una aplicación 0.2.0 puede seguir mostrando registros retirados aunque el servidor rechace las nuevas reservas contra ellos.

Conservar identificador `com.admobility.basurto`, clave Android y directorio de datos permite actualizar la aplicación sin reiniciar la caja cifrada. En Mac, cerrar Basurto y sustituir la aplicación en Aplicaciones. No borrar los datos de la aplicación. Sincronizar pendientes antes de actualizar. En Chrome, recargar la página para recibir la interfaz nueva.

## Verificación

Pruebas de permisos de ambos roles de oficina y denegación a profesores, aislamiento entre profesores, cambios de credenciales y revocación de sesiones, revisión desactualizada, idempotencia, liberación de franjas, bloqueo de recursos con clases futuras, fichas pendientes contra bajas e incidencias entre dos sesiones. Prueba HTTP local del objeto central y comprobación visual de llegada de incidencia desde un segundo cliente. Datos exclusivamente ficticios. La validación en Android y Windows reales sigue pendiente.
