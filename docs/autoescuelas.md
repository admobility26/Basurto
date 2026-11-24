# Autoescuelas · versión 0.5.0

La misma aplicación muestra un inicio con las autoescuelas registradas. Cada centro conserva su nombre, logo PNG/JPG/WebP, imagen de portada opcional y dos colores. Los ajustes se guardan en el servidor; no se necesita recompilar para añadir o cambiar una marca.

Desde la cuenta de administración de Basurto, abrir **Autoescuelas**. Para dar de alta un centro: nombre, colores, logo, correo del primer administrador y clave del centro de al menos 12 caracteres. El identificador se genera automáticamente a partir del nombre y queda estable al editar el centro. La clave no se puede consultar después: se guarda mediante scrypt con sal. Al editar puede dejarse vacía para conservarla.

El primer administrador selecciona el centro, introduce su clave y pulsa **Activar administración · primer acceso**. Usa su correo y esa clave para elegir su contraseña personal. La activación inicial caduca a los 30 días. Luego crea profesores y gerente desde Usuarios. La clave del centro permite llegar al acceso personal; nunca sustituye el usuario, contraseña y permisos.

## Datos y compatibilidad

- Basurto mantiene el Durable Object existente `basurto-office-v1`, sus usuarios y todos sus datos. No se migra ni borra la base actual.
- Cada centro nuevo utiliza un Durable Object separado `school-office-v1:<identificador>`, en la misma jurisdicción europea. Sesiones, agenda, usuarios, incidencias y catálogo no se comparten.
- Las peticiones llevan el centro seleccionado. Un token de otra oficina no autentica. La lista pública solo expone nombre, imagen y colores, nunca correos ni hashes ni claves.
- Los archivos R2 se acceden a través del catálogo autenticado de cada oficina. Los identificadores de archivo/curso son aleatorios. Los vídeos locales siguen separados por cuenta y cifrados.
- Cambiar de centro exige finalizar la sesión sin pendientes. La copia cifrada local incluye la identidad del centro, para restaurar el espacio correcto sin conexión. Una autoescuela nueva requiere conexión para su primer acceso.
- La identidad del instalador se conserva para actualizar sin perder el almacén local; el nombre/icono del instalador siguen siendo Basurto. El nombre, logo, portada, colores y marca de agua dentro de la aplicación cambian con el centro.
- Basurto mantiene el acceso existente sin una nueva clave de centro hasta que su administrador la establezca en Autoescuelas. No se cambia ninguna contraseña del usuario durante el despliegue.

## Comprobaciones

78 pruebas JavaScript correctas, incluyendo claves, permisos de gestión, campos públicos, caducidad de concesiones y sesiones aisladas. Prueba HTTP local de alta de un segundo centro, activación de administrador, acceso con clave, rechazo de clave incorrecta y rechazo de sesiones cruzadas. Prueba visual de selección, acceso personal y regreso al selector con datos ficticios; ningún centro de prueba se crea en producción.

Pendiente de datos reales: añadir las marcas que proporcione el propietario. La recuperación de contraseña de nuevos centros requiere un flujo de recuperación específico; no reutiliza la clave de recuperación de Basurto. Los documentos/cursos importados conservan su contenido original, incluyendo los logotipos que tengan dentro.

Corrección del alta: se admiten mayúsculas, espacios y acentos enviados como identificador por instaladores 0.5.0. Se normalizan solo al guardar; el enrutado de oficinas sigue validando identificadores canónicos. Una colisión en un alta devuelve 409 y nunca sobrescribe otro centro.

## Inicio neutro y mantenimiento · 0.5.1

El selector usa colores neutros y el título Autoescuelas · AD Mobility, incluso al elegir una tarjeta y escribir la clave. La marca de cada centro se aplica después de verificar el acceso. La pantalla local de desbloqueo no muestra el logo de Basurto. El nombre del paquete se conserva para actualizar las instalaciones existentes.

Mantenimiento · AD Mobility permite entrar al centro elegido con la cuenta central del propietario, admobility26@gmail.com, y su contraseña habitual. Se verifica en la oficina central con límite de intentos. No se piden las claves de los centros ni se distribuye la contraseña. El servidor crea una sesión de administración del centro, de hasta una hora, con actor específico y registro de acceso y cambios. No consume la activación del administrador del centro. Los administradores y gerentes de los centros no adquieren acceso global. El propietario puede usar su acceso normal en Basurto. La variable de servidor PLATFORM_OWNER_EMAIL permite cambiar al propietario de forma controlada; no forma parte del formulario público.

Bloquear protege el almacén cifrado del dispositivo hasta volver a introducir su contraseña local. No elimina los datos ni sustituye Salir, que termina la sesión de cuenta. Sigue activo el bloqueo automático por inactividad.

Pruebas adicionales: autorización del propietario, rechazo de otros roles y cuentas, sesión limitada, auditoría, aislamiento, conservación de la primera activación, flujo HTTP completo y acceso visual en un centro ficticio.
