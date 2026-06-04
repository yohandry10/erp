# Cierre offline desktop pre-produccion

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `auditoria_forense`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha: 2026-06-01

Actualizacion: 2026-06-03

## Alcance

Esta revision deja la app desktop en modo local-first para los flujos controlables por codigo. La base local SQLite de Tauri actua como cache operativa, outbox de sincronizacion, storage de respuestas locales y registro fiscal local hasta que exista conexion.

## Brechas cerradas

- Escrituras offline: `fetchWithOfflineSupport` encola operaciones `POST/PUT/PATCH/DELETE` cuando no hay conexion o cuando el modo offline local esta activo.
- Adjuntos multipart: las peticiones con `FormData` ahora se serializan en la cola offline y se reconstruyen como `FormData` real al sincronizar, sin forzar `Content-Type`.
- Lecturas local-first: los endpoints de negocio se hidratan desde SQLite cuando hay cache local disponible.
- Binarios y comprobantes: las respuestas binarias/cacheables quedan cubiertas por el almacenamiento binario local.
- Validaciones externas: endpoints de validacion devuelven respuesta diferida offline con marca `validation_deferred`, para no bloquear el flujo operativo cuando la validacion depende de servicios externos.
- Autenticacion offline: un usuario con sesion previa puede seguir operando offline usando la sesion local cacheada.
- Permisos offline: los permisos se persisten como snapshot local y se reutilizan por hasta 30 dias si la API no responde.
- Fiscal local: la numeracion/documentacion fiscal local queda registrada en SQLite con estado trazable.
- SUNAT/OSE offline: el envio se convierte en pendiente/encolado cuando no hay conectividad o falta respuesta externa.
- SIRE local: la exportacion SIRE desktop genera un archivo local desde `local_fiscal_documents`.
- Backup local: el backup desktop incluye outbox offline y documentos fiscales locales.
- Aislamiento local por tenant: snapshots API, cache binario, POS, caja, clientes, ventas, registros genericos, SIRE y documentos fiscales locales quedan filtrados por `tenant_id`.
- Correlativos fiscales locales por tenant: `local_fiscal_series` usa clave `(tenant_id, document_type, serie)` y `local_fiscal_documents` evita duplicados por `(tenant_id, document_type, serie, numero)`.
- Contrato de sincronizacion offline: las escrituras locales incorporan `local_id`, `external_id`, `idempotency_key` y `offline_entity_type` para converger con el backend al sincronizar.
- Seguridad desktop: contrasena local de certificado protegida con DPAPI en Windows, backups con secretos redactados y runtime Tauri sin `tauri-plugin-shell`/`shell:default`.
- Cabeceras tenant: el cliente desktop/web envia `x-tenant-id` y el backend acepta tambien `x-erp-tenant-id` para mantener contexto multi-tenant en sincronizacion.

## Dependencias externas inevitables

- Primera autenticacion de un usuario sin sesion local previa.
- Certificado productivo real y credenciales SUNAT/OSE.
- Envio, aceptacion, rechazo, CDR y ticket oficial de SUNAT/OSE.
- Validaciones externas reales de identidad, estado tributario o servicios regulatorios.

## Advertencia fiscal tecnica

El paquete fiscal local permite operar, numerar, registrar, trazar y encolar documentos en modo offline. La aceptacion oficial sigue dependiendo del canal externo SUNAT/OSE y de sus respuestas. Si se exige firma XMLDSig UBL homologada completamente local antes de conectarse, debe integrarse una implementacion criptografica local validada con el certificado real; eso no puede verificarse sin el insumo externo productivo.

## Verificacion ejecutada

- `pnpm --filter @erp-suite/web run type-check`
- `pnpm --filter @erp-suite/web run test:offline`
- `cargo check`
- `git diff --check`
- `pnpm --filter @erp-suite/web run build:tauri`

Revalidacion 2026-06-03:

- `pnpm --filter @erp-suite/web run tauri:build`
- `pnpm --filter @erp-suite/web run test:offline`
- `pnpm --filter @erp-suite/web run type-check`
- `pnpm --filter @erp-suite/erp-api run type-check`
- `cargo check`
- `git diff --check`

Resultado: todas las verificaciones pasaron. `cargo check` conserva warnings existentes en funciones de impresion no usadas.
