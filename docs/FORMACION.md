# Formación

Disponible en el despliegue Cloudflare, con conexión. La agenda y ficha práctica mantienen su comportamiento previo. El servidor Python conserva el piloto anterior; no implementa la API de Formación.

## Uso

- **Señales**: 339 señales iniciales, búsqueda por código o texto y filtro por categoría. Oficina puede añadir, editar y publicar señales con imagen y significado. El profesor puede proponer señales privadas; oficina decide su publicación. Practicar abre el proyector y permite revelar el significado.
- **Biblioteca**: inicialmente vacía, sin importar manuales del otro proyecto. Administración/gerencia suben PDF de hasta 25 MB y publican para profesores. Cada actualización añade una versión; las clases conservan la versión elegida.
- **Mis clases**: preparar una secuencia de señales, páginas PDF, explicaciones y preguntas con respuesta. Cada profesor accede a sus clases; oficina tiene acceso global. Las notas de preparación no se envían al proyector. La presentación requiere sesión iniciada.
- Las modificaciones simultáneas se rechazan si la versión cambió; recargar antes de repetir. No hay edición de Formación sin conexión ni participación de alumnos por QR en esta fase.

## Almacenamiento y permisos

Metadatos, permisos, versiones y clases se guardan en la base central del Durable Object europeo. Nuevos PDF e imágenes se guardan en el bucket privado R2 `basurto`, binding `TRAINING_FILES`, bajo claves aleatorias. Las descargas pasan por autenticación y autorización del servidor. No se habilita acceso público al bucket ni se cachean archivos privados con el service worker. El catálogo inicial de imágenes se distribuye con los recursos estáticos de la aplicación.

Imágenes PNG/JPEG/WebP hasta 5 MB; se comprueba la firma del archivo. Hasta 100 archivos y 200 MB por usuario/día. No se admiten SVG ni HTML. El visor PDF local dibuja las páginas; no ejecuta scripts ni formularios del documento. No equivale a un escáner antivirus. Archivo de elementos conserva registros y versiones; clases con materiales archivados deben actualizarse. No hay purga ni copia de seguridad integral en R2 implementada por este módulo.

## Procedencia y mantenimiento

Catálogo e imágenes reutilizados de `promociones7819-stack/interactive-wiki`, commit `d4bcd053183294cb52b131a1045ba6d49649f295`, archivos `src/lib/signs.json`, `signImages.json` y las 339 imágenes referenciadas en `public/signs`. No se han importado manuales ni configuración o credenciales. El catálogo se conserva como contenido editable, sin afirmar una revisión normativa de su vigencia.

Visor Mozilla PDF.js 6.5.438 (Apache-2.0), copia local y licencia en `static/vendor/pdfjs`. Para regenerar: `npm ci` y `node scripts/vendor-pdf.mjs`. No requiere CDN ni transmite manuales a terceros.

## Validación

Pruebas de servidor cubren aislamiento de profesores, publicación, acceso a archivos privados, versiones PDF, conflictos de edición, operaciones repetidas y ausencia de notas privadas en la presentación. Prueba HTTP local sobre workerd/R2: subida real, rechazo de CSRF/tipo falso, descarga parcial y denegación sin sesión. Prueba visual de alta de señal, preparación de clase, revelado de respuestas y PDF en proyector con datos ficticios locales.
