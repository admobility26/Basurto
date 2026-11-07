# Basurto · distribución privada 0.2.0

Tauri 2 empaqueta la interfaz y catálogo dentro de la app. Esta compilación está vinculada exclusivamente a `https://basurto.admobility26.workers.dev`; no debe distribuirse a otra autoescuela. Para otro cliente se prepara otra identidad de aplicación, servidor, base de datos y almacenamiento independientes. No es una aplicación multiempresa.

## Protección implementada

- Caja local AES-256-GCM autenticada, nonce aleatorio por escritura y clave derivada mediante Argon2id (64 MiB, 3 pasadas, paralelismo 1, sal aleatoria de 16 bytes).
- La contraseña local se elige en el primer inicio (mínimo 12 caracteres), no se guarda y se solicita al arrancar. Es distinta de la cuenta central. Esta primera versión usa contraseña local, no biometría ni almacén de claves del sistema. No se ha incorporado SQLCipher: para conservar el modelo actual se cifra el registro completo de caché y pendientes.
- Sesión central y caché se guardan dentro de la caja cifrada; no en cookies persistentes del navegador ni en sessionStorage. Escritura temporal cifrada y sustitución del archivo; permisos 0600 y directorio 0700 en Unix.
- Bloqueo manual y por inactividad de cinco minutos mientras el proceso está activo. Si el sistema suspende la aplicación, el bloqueo por tiempo se comprueba al volver. No hay sincronización garantizada mientras la aplicación está cerrada.
- Solicitudes nativas limitadas a rutas concretas de la API y al servidor HTTPS de Basurto, sin redirecciones. Los permisos se siguen comprobando en el servidor. Recursos empaquetados, sin contenido remoto con permisos nativos.
- Android: copia automática de la aplicación deshabilitada y tráfico HTTP externo deshabilitado en la versión release.
- Instaladores: APK con clave propia, DMG con firma ad hoc, EXE sin certificado comercial. No se han publicado en tiendas ni notarizado por Apple. El cifrado no equivale a una auditoría de seguridad ni a una certificación de cumplimiento.

## Uso

1. Instalar el paquete del dispositivo y abrir Basurto.
2. Elegir una contraseña local larga y conservarla en un gestor de contraseñas. Si se pierde, los cambios no sincronizados no se pueden recuperar; recuperar la cuenta central no descifra la caja local.
3. Con Internet, entrar con la cuenta individual de Profesor, Administración o Gerencia.
4. Antes de salir a pistas comprobar «0 cambios pendientes» y la agenda actualizada.
5. Sin conexión las fichas quedan pendientes. Las nuevas citas son propuestas hasta que el servidor confirma que no hay solapes.
6. Al recuperar conexión abrir la app y sincronizar. La sesión central caduca a las ocho horas; los pendientes se conservan aunque sea necesario identificarse de nuevo.
7. Formación, incidencias y altas de usuarios requieren conexión. Los PDF no están disponibles sin conexión en esta entrega.

El cifrado local no impide que una persona vea los datos mientras la aplicación está desbloqueada. Cada profesor descarga solo su ámbito. No se han incorporado gestión remota de dispositivos, borrado remoto ni recuperación administrativa de la contraseña local.

## Compilación reproducible

Instalar Rust, Node y las herramientas oficiales de cada plataforma. `npm ci`; `npm run test:native`.

- Mac: targets Rust `aarch64-apple-darwin` y `x86_64-apple-darwin`, `npm run native:mac`.
- Android: Java 21, SDK plataforma 36, NDK 29.0.14206865 y targets Rust Android. `npm run native:android:init`, luego `npm run native:android`. Alinear y firmar el APK con `zipalign`/`apksigner` y la clave privada conservada fuera del repositorio.
- Windows: Rust MSVC y herramientas C++/WebView2, `npm run native:windows`. En Mac puede compilarse con cargo-xwin, LLVM y NSIS: `tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis`. La compilación cruzada requiere validación en Windows real.

`prepare-native.mjs` genera native-dist a partir de static y añade el puente nativo. No subir native-dist, claves, contraseñas ni herramientas al repositorio. Los archivos generados de Android se recrean; `prepare-android.mjs` fija API 36 y las opciones de copia de seguridad. Mantener las claves de firma para que futuras versiones puedan actualizar la misma aplicación.

## Validación

Pruebas de caja cifrada: recuperación desde disco, contraseña incorrecta, alteración del archivo, bloqueo y rechazo de escritura estando bloqueada. Pruebas del cliente: recuperación de borradores y pendientes, sesión caducada, aislamiento al cambiar de cuenta, y regresión de la caché web. Comprobación de arranque de la app macOS y verificación del binario universal y firma ad hoc. Queda la prueba de uso con cuentas reales en los equipos Android y Windows de destino antes de trabajar con datos reales.
