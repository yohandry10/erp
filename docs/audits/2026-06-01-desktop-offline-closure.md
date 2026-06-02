# Cierre offline desktop pre-produccion

Fecha: 2026-06-01

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

Resultado: todas las verificaciones pasaron. `cargo check` conserva warnings existentes en funciones de impresion no usadas.
