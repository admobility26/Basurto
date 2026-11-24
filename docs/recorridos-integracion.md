# Recorridos de Basurto

Base de referencia: `admobility26/elorrietatrack`, revisión `2c7b37a613f88410d6ab5ffc73d20bfe4c77ffd5`, comprobada el 23-11-2026.

El editor, GPX, cámara, montaje, pizarra y composición de vídeo proceden de esa base. Las adaptaciones de cliente son la navegación, marca de agua, permisos y persistencia cifrada. No sustituir el editor por otro flujo de formularios.

## Adaptación 0.4.3

`BasurtoNavigation.jsx` es la navegación común de vídeos, trazada/pizarra y GPX. Sustituye las identidades y enlaces Básica/Premium internos. El anfitrión ya no añade una cabecera adicional. El aislamiento de estilos y almacenamiento del editor se conserva mediante el documento interno, a ventana completa y sin marco visible.

Bloquear se ofrece en la cabecera de Recorridos. El botón flotante nativo no aparece encima del editor. Salir y bloquear pasan por el guardado pendiente del módulo; no se omiten sus comprobaciones de exportación/importación en curso.

En escritorio la lectura para decodificación usa `CustomSource` y el puente de medios autenticado. La URL `basurto-media` sirve para reproducir en el elemento vídeo, pero no estaba permitida en `connect-src` para las peticiones del decodificador. No se amplía la política de red: cada lectura comprueba cuenta, sesión, token, rango y tamaño máximo de 1 MiB en Rust. El archivo permanece cifrado en disco. El navegador conserva su fuente local existente.

El worker de MapLibre se crea desde el código empaquetado mediante una URL Blob: WKWebView no necesita importar módulos desde el esquema interno de Tauri. La caché de mapas es opcional para la conexión: si CacheStorage falta o rechaza el origen nativo, la petición continúa por red.

La descarga nativa de teselas sigue el adaptador de escritorio de Elorrieta: `map_tile` permite exclusivamente HTTPS de geoEuskadi, PNOA y OpenStreetMap, rechaza redirecciones y respuestas no gráficas, y limita cada imagen a 5 MiB. Los permisos de cuenta se comprueban en el anfitrión; el comando requiere dispositivo desbloqueado. No se relaja CSP ni se desactiva la validación TLS.

## Validación

- 68 pruebas JavaScript y prueba del adaptador nativo correctas.
- 7 pruebas Rust, incluyendo lectura por token, límites, otra cuenta y token cerrado.
- Inspección visual del GPX integrado y navegación de regreso en entorno local con cuenta ficticia.
- Lectura de duración de MP4 con CustomSource y URL deliberadamente no descargable: correcta.
- Exportación completa comprobada en Basurto.app 0.4.3 en Mac: Ruta E10.2, modo Fluida, 117,07 segundos, H.264 1170 × 720 a 25 fps, 2.925 fotogramas y pista AAC estéreo. Decodificación íntegra sin errores; fotograma exportado revisado con mapa, vídeo y marca Basurto.
- La prueba no valida narración con micrófono ni ejecución física en Windows/Android.
- El DMG contiene una aplicación Tauri universal (arm64/x86_64), identificador com.admobility.basurto. Su interfaz usa WKWebView integrado; no lanza Safari para ejecutar la aplicación.
