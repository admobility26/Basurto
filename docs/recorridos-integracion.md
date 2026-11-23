# Recorridos de Basurto

Base de referencia: `admobility26/elorrietatrack`, revisión `2c7b37a613f88410d6ab5ffc73d20bfe4c77ffd5`, comprobada el 23-11-2026.

El editor, GPX, cámara, montaje, pizarra y composición de vídeo proceden de esa base. Las adaptaciones de cliente son la navegación, marca de agua, permisos y persistencia cifrada. No sustituir el editor por otro flujo de formularios.

## Adaptación 0.4.3

`BasurtoNavigation.jsx` es la navegación común de vídeos, trazada/pizarra y GPX. Sustituye las identidades y enlaces Básica/Premium internos. El anfitrión ya no añade una cabecera adicional. El aislamiento de estilos y almacenamiento del editor se conserva mediante el documento interno, a ventana completa y sin marco visible.

Bloquear se ofrece en la cabecera de Recorridos. El botón flotante nativo no aparece encima del editor. Salir y bloquear pasan por el guardado pendiente del módulo; no se omiten sus comprobaciones de exportación/importación en curso.

En escritorio la lectura para decodificación usa `CustomSource` y el puente de medios autenticado. La URL `basurto-media` sirve para reproducir en el elemento vídeo, pero no estaba permitida en `connect-src` para las peticiones del decodificador. No se amplía la política de red: cada lectura comprueba cuenta, sesión, token, rango y tamaño máximo de 1 MiB en Rust. El archivo permanece cifrado en disco. El navegador conserva su fuente local existente.

## Validación

- 66 pruebas JavaScript y prueba del adaptador nativo correctas.
- 6 pruebas Rust, incluyendo lectura por token, límites, otra cuenta y token cerrado.
- Inspección visual del GPX integrado y navegación de regreso en entorno local con cuenta ficticia.
- Lectura de duración de MP4 con CustomSource y URL deliberadamente no descargable: correcta.
- Pendiente: exportación completa en la aplicación instalada de Mac con el recorrido del usuario. No considerar la prueba de lectura equivalente a esa validación.
