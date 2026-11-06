# Privacidad y alcance del piloto

Fecha: 6 de noviembre de 2026. Documento de diseño técnico; no certifica cumplimiento legal.

La AEPD exige incorporar garantías desde el diseño y durante el ciclo de vida, adecuadas al tratamiento y sus riesgos. La configuración por defecto debe limitar cantidad, extensión, conservación y accesibilidad de los datos.

Fuentes oficiales:
- https://www.aepd.es/derechos-y-deberes/cumple-tus-deberes/medidas-de-cumplimiento/proteccion-de-datos-desde-el-diseno
- https://www.aepd.es/derechos-y-deberes/cumple-tus-deberes/medidas-de-cumplimiento/proteccion-de-datos-por-defecto

## Aplicado en el piloto

- Solo nombre, permiso y asignación del alumno. No se solicitan DNI, domicilio, pagos, fotografías ni datos de salud; el software administrativo puede seguir siendo la fuente de esos datos.
- Profesores no reciben listados de otros profesores ni alumnos o clases ajenas. La API filtra antes de enviar; no se limita a ocultar botones.
- Matrículas compartidas visibles para seleccionar vehículo, sin revelar a quién está reservado. Comprobación de disponibilidad mediante respuesta genérica.
- Escritura de fichas solo por el profesor de la clase. Altas de alumnos/vehículos solo por administración/gerencia.
- Autenticación individual también en modo demo, sesiones de ocho horas, contraseñas scrypt, protección CSRF/origen, consultas parametrizadas y registros de auditoría mínimos.
- Los datos del servidor están en un archivo fuera del control de versiones, con permisos 0600. La base SQLite NO está cifrada por la aplicación: depende de la protección del equipo. No equivale a cifrado de servidor de producción.
- No se envían datos a GitHub ni a proveedores de analítica. El repositorio es público y solo debe contener código, documentación y pruebas ficticias.
- Copia offline AES-GCM, clave en sessionStorage de la pestaña. No protege contra un usuario con la sesión desbloqueada, extensiones maliciosas o un XSS ejecutado en el mismo origen. La política de contenido reduce superficie; no elimina esos riesgos.
- Logout revoca la sesión en servidor y elimina la copia de esta pestaña. Se impide salir con cambios/borradores sin resolver. El límite offline y el cierre de pestañas requieren especial cuidado en el piloto.
- Revocaciones o cambios de asignación se aplican online inmediatamente; un equipo desconectado puede conservar la última copia hasta caducar la autorización. No se promete borrado remoto instantáneo offline.

- Incidencias disponibles solo online, excluidas del bootstrap y la copia local. Relato inicial y seguimiento separados, autorización por clase/alumno y registro de consulta. Los datos permanecen en SQLite y sus copias: es necesario definir acceso y conservación antes del uso real.
- Las operaciones conservan una huella del contenido para detectar reintentos, no una segunda copia de narrativas ni contraseñas. Las cuentas nuevas solo las crea gerencia; no existe acceso demo sin contraseña.

## Antes de datos reales y acceso entre dispositivos

1. Confirmar responsable, finalidades, base jurídica y contenido de la información a alumnos/profesores con el asesor responsable; no asumir que todo se resuelve solicitando consentimiento.
2. Seleccionar alojamiento y encargados, formalizar contratos y revisar ubicación/transferencias internacionales según corresponda.
3. Desplegar en HTTPS con cookies Secure, servidor apropiado de producción, autenticación recuperable, política de contraseñas/MFA, gestión de altas/bajas y dispositivos.
4. Definir retención por tipo de dato y obligaciones aplicables. Implementar borrado/anonimización, exportación para derechos y política de copias coherente. No se ha inventado un plazo legal genérico.
5. Copias cifradas, restauración ensayada, separación entre prueba/producción, gestión de incidentes, alertas y revisión de accesos/auditoría.
6. Cifrado y bloqueo del dispositivo, perfil Chrome dedicado, política de extensiones y tratamiento de pérdida/robo. Resolver almacenamiento offline entre cierres y renovación/revocación de autorizaciones.
7. Análisis de riesgos y valoración de necesidad de EIPD según el tratamiento concreto. Verificar que las observaciones se limitan al aprendizaje; evitar incorporar información médica u otras categorías innecesarias.
8. Probar de nuevo autorización por objeto, acceso horizontal, simultaneidad, recuperación de datos y sincronización en las tablets/ordenadores reales.

No publicar este servidor de desarrollo directamente en Internet. El modo demo no puede usarse para datos reales. Convertir el repositorio en privado es una decisión separada; no sustituye las protecciones de los datos operativos y no se ha cambiado su visibilidad.
