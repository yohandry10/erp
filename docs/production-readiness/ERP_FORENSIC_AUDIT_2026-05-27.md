# Auditoria forense pre-produccion ERP - 2026-05-27

## Alcance

Revision estatica y pruebas focalizadas sobre backend NestJS, frontend Next/React, migraciones Supabase y documentacion operativa. No se reconstruyo ni se modifico una base de datos remota. Se priorizaron fallos confirmables en codigo actual y cambios de bajo riesgo antes de pruebas productivas.

## Hallazgos confirmados y corregidos

### 1. XSS en HTML generado para impresion y toasts

- Sintoma: varios flujos construian HTML con datos de API usando `innerHTML` o `document.write`.
- Fuente: `TicketPrint.tsx`, `CpeViewModal.tsx`, `GreViewModal.tsx`, `SireReportModal.tsx`, `GreModal.tsx`.
- Consecuencia: un cliente, producto, transportista, hash, logo o mensaje backend malicioso podia inyectar HTML/script en ventanas de impresion o toasts.
- Remedio aplicado: escape HTML en tickets/CPE/GRE, allowlist de URL de logo (`http`, `https`, imagenes data base64 no-SVG), y toasts creados con `textContent`.
- Impacto: bajo en UX, alto en seguridad. Mantiene impresion y elimina interpolacion HTML no confiable.

### 2. RPC SECURITY DEFINER de migracion expuesta a `authenticated`

- Sintoma: `validar_migracion_apertura(p_tenant_id, p_fecha_corte)` acepta `tenant_id` como parametro y corre como `SECURITY DEFINER`.
- Fuente: `supabase/migrations/336__client_data_migration_external_id_and_audit.sql`.
- Consecuencia: si se invoca directo por PostgREST con rol autenticado, un usuario podria pedir validaciones de otro tenant porque la funcion no validaba contexto.
- Remedio aplicado: nueva migracion local `337__client_migration_rls_rpc_hardening.sql` revoca `authenticated/anon`, deja ejecucion solo a `service_role`, fuerza RLS en tablas de auditoria y corrige politicas a `app.current_tenant_id()`.
- Impacto: medio. El backend sigue funcionando con service role; se reduce superficie RPC directa.

### 3. RLS de auditoria de migracion apuntaba al GUC equivocado

- Sintoma: las politicas de `migration_runs` y `migration_run_rows` usaban `current_setting('app.tenant_id')`.
- Fuente: migracion `336`; el baseline define `app.current_tenant_id()` sobre `app.current_tenant_id`.
- Consecuencia: aislamiento inconsistente frente al patron RLS del resto de la BD; lectura directa podia no funcionar o depender de un contexto no canonico.
- Remedio aplicado: migracion `337` recrea politicas con `app.is_superadmin() OR tenant_id = app.current_tenant_id()`.
- Impacto: bajo en backend actual, medio para consistencia y auditoria de seguridad.

### 4. Idempotencia incompleta en stock inicial migrado

- Sintoma: el importer declaraba idempotencia por `(tenant, producto, sucursal, almacen, fecha_corte)`, pero buscaba duplicados solo por tenant/producto/motivo/referencia.
- Fuente: `apps/erp-api/src/modules/migration/importers/stock-inicial.importer.ts`.
- Consecuencia: el mismo producto en dos sucursales o almacenes durante la misma apertura podia saltarse como duplicado falso.
- Remedio aplicado: la busqueda ahora incluye `metadata.fecha_corte`, `metadata.sucursal_id` y `metadata.almacen_id`; se agrego test unitario.
- Impacto: alto en integridad de inventario de apertura, bajo en compatibilidad.

### 5. `fileBase64` aceptaba entradas malformadas

- Sintoma: `Buffer.from(value, 'base64')` puede decodificar parcialmente basura sin lanzar error.
- Fuente: `MigrationService.decodeCsv`.
- Consecuencia: previews/imports podian operar sobre contenido corrupto y generar errores opacos o parciales.
- Remedio aplicado: validacion estricta de alfabeto/padding, round-trip base64 y UTF-8 fatal; se agrego test unitario.
- Impacto: bajo. Rechaza antes payloads invalidos.

### 6. Contrato de migracion exponia runTypes sin importer CSV

- Sintoma: `productos`, `plan_cuentas` y `cuentas_bancarias` figuraban como tipos validos para preview/template, pero no tienen importer dedicado.
- Fuente: `MigrationImportDto` y `MigrationController`.
- Consecuencia: contrato confuso para integradores: un valor validado por DTO fallaba despues por "no soportado".
- Remedio aplicado: `MIGRATION_IMPORTER_RUN_TYPES` limita preview/template a importers realmente implementados; `MIGRATION_RUN_TYPES` queda para auditoria/listado.
- Impacto: bajo. Clarifica API sin tocar datos.

### 7. Operaciones de documentos tenant-scoped aceptaban `tenantId` opcional

- Sintoma: el servicio usa Supabase con service role, que puede bypassar RLS; varios metodos filtraban por tenant solo si `tenantId` existia y algunos updates iban por `id` solamente.
- Fuente: `apps/erp-api/src/modules/documentos.service.ts`.
- Consecuencia: si un caller interno omitiera tenant o si hubiera un fallo de contexto, podria haber lectura/actualizacion cross-tenant.
- Remedio aplicado: helper `requireTenantId`, filtros tenant obligatorios en lecturas, conteos, series y auditoria; updates de XML/envio/anulacion/modificacion ahora incluyen `.eq('tenant_id', tenant)`.
- Impacto: medio. Puede revelar callers mal conectados al fallar temprano en lugar de operar sin tenant.

## Medidas preventivas ya presentes

- Backend global con `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, transform), Helmet, CORS configurable, rate limiting, guards JWT/permisos y `TenantBodyInterceptor`.
- React escapa texto renderizado por defecto; los hallazgos XSS estaban concentrados en HTML imperativo.
- Frontend centraliza llamadas en `use-api`, con timeout, retry limitado y sin retry automatico para escrituras no idempotentes segun auditoria previa.
- BD tiene linea extensa de RLS, constraints, triggers de tenant consistency, funciones de validacion runtime y hardening de `search_path`/EXECUTE.
- Migracion externa usa `external_id` unico parcial por tenant y auditoria por lote/fila.

## Riesgos residuales antes de produccion

- Auditoria service-role cross-tenant completa: existen muchos `.from(...)` en backend; se corrigio `DocumentosService`, pero falta una revision sistematica por modulo para exigir tenant o RPC transaccional en cada operacion tenant-scoped.
- Exposicion de errores: varios controllers/servicios devuelven `error.message` o concatenan mensajes de BD en `BadRequestException`. Debe centralizarse sanitizacion de errores antes de exponer API publica.
- Tokens frontend: el snapshot de auth conserva `access_token` en storage para hidratacion. La cookie HttpOnly ayuda, pero ante XSS el token en storage sigue siendo objetivo.
- Transacciones criticas: algunos flujos compuestos aun dependen de varios llamados Supabase desde servicio. Deben migrarse a RPC transaccionales con advisory locks cuando afecten dinero, stock, contabilidad o numeracion fiscal.
- Migracion de balance apertura: tiene rollback manual en servicio, no atomicidad DB completa. Recomendado convertir a RPC transaccional antes de migraciones reales de clientes.
- XML fiscal legacy: los generadores XML usan interpolacion/CDATA; aunque varios caminos legacy estan deshabilitados, no deben usarse para produccion fiscal sin builder XML seguro y validacion contra XSD/CDR real.
- Pruebas: hay cobertura unitaria del modulo migration, pero faltan E2E HTTP con JWT admin contra DEV con tenants reales, pruebas de concurrencia con escrituras controladas y smoke de frontend de impresion.
- Documentacion: se actualizo estado local, pero `337` debe aplicarse y validarse explicitamente en DEV/PROD antes de declararse remoto.

## Verificacion ejecutada

- `pnpm --filter @erp-suite/erp-api run test -- --runInBand migration.spec.ts` -> 34/34 OK.
- `pnpm --filter @erp-suite/erp-api run type-check` -> OK.
- `pnpm --filter @erp-suite/web run type-check` -> OK.
