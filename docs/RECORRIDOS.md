# Formación: recorridos y vídeos · 0.3.1

Primera integración de ElorrietaTrack en Basurto. Se abre en Formación → Recorridos y vídeos. La agenda sigue siendo la pantalla inicial. El mapa y la pizarra se cargan al entrar en su apartado.

## Accesos

Se usa la sesión de Basurto. Administración y gerencia pueden publicar o retirar referencias de vídeos; los profesores consultan las publicadas y usan trayectorias y pizarra. La creación de vídeos está reservada a oficina. Las operaciones de publicación se validan en el servidor, con control de revisión para evitar sobrescrituras. No se importan cuentas, alumnos ni fichas de ElorrietaTrack.

La etiqueta Premium identifica el acceso de oficina. Esta primera entrega incluye recorridos, pizarra y vídeos locales. El editor avanzado de vídeo con GPS/PIP de ElorrietaTrack todavía no está integrado.

## Dónde se guarda cada cosa

- Agenda, alumnos, fichas e incidencias: base central existente de Basurto.
- Referencias de vídeos publicadas: base central; título, nombre de archivo, tamaño y una huella parcial para reconocer el original. Nunca se envían los bytes del vídeo.
- Proyectos, trayectorias, pizarras y catálogo privado de vídeos: biblioteca cifrada por cuenta en cada dispositivo.
- Vídeos originales: carpeta elegida por la persona. Se reproducen directamente, sin duplicarlos ni subirlos a R2. Hay que seleccionarlos de nuevo para autorizar su lectura tras cerrar el módulo.
- Mapas descargados: caché local de las zonas elegidas de geoEuskadi/IGN. OpenStreetMap necesita conexión y no se descarga por lotes. La caché de cartografía no está cifrada.
- Los manuales e imágenes ya existentes en Formación mantienen su almacenamiento anterior.

Publicar una referencia no distribuye el vídeo: cada equipo debe recibir el original por USB, carpeta compartida u otro medio del centro. Las bibliotecas de recorridos se trasladan mediante copias, no se sincronizan automáticamente. La copia de recorridos contiene proyectos y pizarras; no contiene vídeos ni su catálogo privado.

## Cifrado y copias

En Chrome se elige una clave local de materiales, distinta de la contraseña de acceso. La biblioteca utiliza AES-256-GCM y PBKDF2-SHA-256 con 600.000 iteraciones. En la aplicación instalada, una clave aleatoria por cuenta se conserva dentro de la caja local cifrada existente; no requiere una segunda clave para abrir el módulo.

Las copias exportadas desde la aplicación instalada piden una clave de transporte para poder abrirlas en otro equipo. En Chrome se puede descargar una copia privada con la clave local o compartirla con otra clave. Conservar la clave y verificar una restauración antes de retirar el dispositivo original. Recuperar la contraseña de acceso no recupera la clave local de materiales.

Los archivos originales y los vídeos exportados no se cifran por esta función. Deben permanecer en dispositivos o unidades protegidas por el centro. No confundir el cifrado de la biblioteca con el cifrado de todas las carpetas del equipo.

## Sin conexión

Abrir el apartado y el editor una vez con conexión en Chrome, y descargar previamente la zona del mapa que se vaya a usar. En los instaladores el editor está incluido. Se requiere una sesión local vigente. La publicación de referencias requiere conexión; los vídeos seleccionados y los proyectos locales se pueden consultar sin ella.

## Validación de entrega

Pruebas automatizadas de servidor/permisos/revisiones, huella de archivos grandes, importación de recorridos y compatibilidad de la caja cifrada. Prueba visual local: apertura del mapa, pizarra, renombrado y recuperación del proyecto tras volver a agenda. Instaladores compilados para macOS universal, Android ARM y Windows x64. Pendiente prueba de reproducción y grabación con vídeos reales en cada plataforma; los formatos compatibles dependen de sus códecs.

Android conserva la firma privada de las versiones anteriores. Windows no tiene firma comercial y macOS no está notarizado por Apple.

## Calendario de vehículos

Vehículos muestra una semana de clases y bloqueos por matrícula, incluidos los remolques. Administración y gerencia registran mantenimiento, avería, ITV u otra indisponibilidad, con final previsto o hasta nuevo aviso. Los profesores ven disponibilidad y sus propias clases, sin notas privadas de taller. El servidor rechaza reservas que coincidan con un bloqueo, incluidas propuestas enviadas tras trabajar offline. Los bloqueos se crean y modifican con conexión; se sincronizan en la copia local. Las clases anteriores se conservan con aviso para reorganizarlas. Retirar un bloqueo conserva el historial.

El alojamiento externo de vídeos se está valorando; no se ha contratado ni activado ningún proveedor. El módulo actual publica referencias y reproduce originales locales.
