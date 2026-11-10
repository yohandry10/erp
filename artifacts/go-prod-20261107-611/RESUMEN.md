# Validación local del candidato612

**NO_GO para producción.** Continúa el PR153 en borrador; sin merge, migración remota ni promoción. Gasto nuevo0.

- **611:** la fábrica PE crea CPE01/coreFACTURA como borrador simulado, sin XML/CDR ni aceptación fiscal. Conserva importes, numeración, replay y muestras existentes; no habilita NC fiscal desde el borrador. Prueba roja en610, rollback exacto, doble reaplicación y tres verificaciones pasan. Catálogo01: [SUNAT](https://www.sunat.gob.pe/legislacion/superin/2017/anexosV-318-2017.pdf).
- **612:** concede únicamente SELECT del historial de aprobaciones al backend. La lectura ausente producía503 en un intento tardío sobre un pedido resuelto; ahora devuelve409 y la UI explica el motivo, cierra el diálogo y actualiza la bandeja. Creador403, aprobación segregada y una sola decisión por pedido comprobados. Se sustituyen los grants correctores de los fixtures por aserciones de la ACL contractual. No se cambian filas, RLS/políticas, funciones, owner ni permisos de usuarios/DML. Prueba roja, rollback exacto y doble reaplicación pasan.
- **SQL:** base nueva,608migraciones hasta612,121verificadores vigentes y67históricos pasan;6obsoletos enumerados. La cadena611 anterior pasó607/120. El primer arranque611 alcanzó PostgreSQL temporal durante su reinicio; se preserva ese fallo y se reintentó sólo después de comprobar que la DB seguía vacía.
- **Código:** suite completa6115843/402; delta61264/4. No se suman. Tipos, buildAPI, lint y seis documentos canónicos pasan. Next de producción612 termina140páginas, con913fuentes intactas y metadatos generados restaurados; conserva avisos existentes.
- **Navegador real (CUA):** nueva demo creada desdeUI; banco y caja conservan sus cambios tras recargar. Diez tablas financieras intactas, caja sin sesiones, una edición auditada y cambio metadata.last_writer exactamente contrastado con antes/después. La prueba inicial de huella incluía ese metadato de auditoría previsto; se investigó y conservó, sin cambiar datos para aprobar. Aprobaciones reproducida en build611 con DB612:503 antes/409 después. El build612 posterior contiene el mismo código de pantalla y el cambio de su prueba E2E.

La aceptación manual usa una demo propia; no recertifica los tres E2E fallidos de primer ADMIN, la mora, el fallo de carga ni el resto del recorrido. Preparación de aprobación: umbral30 sólo en ese tenant efímero; sin normativa global ni elevación de usuarios.

Faltan CI del candidato final (2030 no arrancó por facturación/minutos), CodeQL disponible y revisiónSAST/humana; casos A–J, reversas, AFP2026-11 y gates operativos/fiscales/piloto. No se deshabilitan checks ni se contratan planes. Las89ejecuciones/18hallazgos/10bloqueos históricos no se recertifican.

Evidencia y huellas exactas: [validacion.json](validacion.json). Los artefactos completos, logs y capturas se conservan en el worktree histórico de UAT, artifacts/go-prod-20261107-611/.
