# Vídeos por pendrive · Basurto 0.3.2

## Dónde guardar los vídeos exportados

Administración y gerencia conservan los originales en una carpeta del centro, por ejemplo «Vídeos Basurto». Al exportar, elegir esa carpeta cuando el dispositivo ofrezca un selector; si se genera una descarga, localizarla en Descargas y trasladarla a la carpeta del centro. Copiar al pendrive los vídeos terminados. Los originales no se cifran ni se borran automáticamente.

Los profesores no crean ni exportan vídeos. Reciben los materiales publicados y los importan para reproducirlos durante las clases. Pueden utilizar trayectorias y pizarra interactiva.

## Preparación en oficina

1. Exportar un MP4, preferentemente H.264 con audio AAC, y conservar el original.
2. En Formación → Recorridos y vídeos, pulsar «Importar desde pendrive o carpeta». Se pueden seleccionar varios archivos.
3. Esperar a que cada vídeo figure como «Disponible sin conexión».
4. Pulsar «Reproducir», escribir un título y «Publicar o actualizar referencia» con conexión a oficina.
5. Entregar los originales en el pendrive a los profesores.

Publicar transmite únicamente título, nombre, tamaño e identificación del archivo. No sube el vídeo a R2 ni contrata alojamiento.

## En la tablet del profesor

1. Entrar con su cuenta y abrir Formación con conexión para recibir el catálogo.
2. Conectar el pendrive, usando adaptador USB si la tablet lo requiere.
3. Pulsar «Importar desde pendrive o carpeta» y seleccionar los vídeos publicados.
4. Esperar a que finalice la copia. Después se puede retirar el pendrive de forma segura.
5. Buscar el título y pulsar «Reproducir». No vuelve a pedir el archivo original, tampoco al cerrar y reabrir la app.

El catálogo y el permiso de sesión deben haberse recibido previamente. Sin conexión se utiliza el último catálogo; una retirada publicada por oficina se conoce al conectar de nuevo. La sesión offline conserva el límite de vigencia de Basurto.

## Almacenamiento y protección

La importación crea una copia cifrada por cuenta y dispositivo. No hace falta buscar su carpeta: la aplicación la gestiona. En la app instalada se encuentra bajo los datos privados de Basurto; en Chrome, en el almacenamiento del sitio. La lectura del vídeo descifra rangos pequeños, sin cargar todo el archivo en memoria ni generar una copia completa sin cifrar para reproducirlo.

Límite por archivo: 50 GB, sujeto a espacio disponible y a los códecs del dispositivo. Chrome comprueba su cuota de almacenamiento; las aplicaciones muestran el error si el disco no permite completar la copia. Los archivos grandes pueden tardar. Mantener el dispositivo abierto y el pendrive conectado durante la importación. «Cancelar importación» conserva los originales y las copias que ya se hayan completado.

«Quitar copia local» libera espacio en ese dispositivo; conserva la referencia y el original del pendrive. Hay que volver a importar para reproducirlo. No usar esta biblioteca como única copia: desinstalar, limpiar datos o borrar el perfil de Chrome puede eliminar sus archivos. Conservar la clave local y los originales. Cada cuenta mantiene su propia copia, por lo que importar el mismo vídeo con varias cuentas consume espacio adicional.

La copia JSON de recorridos y pizarras no incluye los vídeos. Los mapas se descargan por zona desde el editor y no forman parte de esta importación. Los demás formatos de Formación conservan su funcionamiento anterior.

## Validación

Prueba visual en navegador: importar un MP4, abrir el reproductor, cerrar la biblioteca, retirar el original de su ubicación, reabrir y cargar de nuevo la copia (duración y datos disponibles correctos). Pruebas automatizadas: reapertura cifrada, separación entre cuentas, contraseña incorrecta, cancelación sin sustituir una copia válida, rangos limitados y cruce entre bloques; pruebas de almacenamiento nativo en Rust. Compilación para Mac, Windows y Android. La reproducción en dispositivos Android/Windows y los vídeos concretos del centro deben verificarse en el piloto; no se ha realizado una prueba física de todas esas combinaciones.
