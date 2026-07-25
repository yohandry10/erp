# Go-Live Runbook ERP

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `release`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha de creacion: 2026-05-24
Audiencia: operador con credenciales productivas en mano.
Objetivo: ejecutar el primer despliegue productivo real del ERP sin reabrir auditorias ni decisiones tecnicas. Todo lo que NO depende de credenciales productivas ya quedo cerrado y validado.

> Este runbook es la unica via aprobada para llevar el sistema a produccion real. No improvisar pasos fuera de aqui. Si encuentras un gap, anotar en `docs/00_coordination/CURRENT_STATE.md` y volver a este runbook antes de continuar.

## 0. Pre-requisitos que el operador debe tener antes de empezar

Sin estos elementos no se puede arrancar. Detalle de cada uno mas abajo en `0.1`..`0.6`.

| Elemento | Quien lo provee | Donde se guarda | Comentario |
|---|---|---|---|
| Certificado digital SUNAT/OSE PFX productivo + password | Contribuyente / proveedor de firma | Gestor de secretos del despliegue (Vercel/Docker/Supabase/CI) | Vigencia obligatoria > 1 mes; ver `0.1` |
| Credenciales SUNAT directo o OSE API | Contribuyente o proveedor OSE | Gestor de secretos | Solo una de las dos rutas: `SUNAT_DIRECTO` o `OSE_API`; ver `0.2` |
| Secretos productivos: JWT, encryption keys, CSRF, session | Equipo plataforma | Gestor de secretos | Minimo 32 caracteres; rotar antes del primer login real; ver `0.3` |
| URL Supabase productivo + service role key + anon key | Equipo plataforma | Gestor de secretos | Proyecto Supabase DEDICADO para produccion, no reusar el de dev/demo; ver `0.4` |
| Proveedor de email productivo (si aplica) | Equipo plataforma | Gestor de secretos | Solo si se enviara correo (notificaciones, recuperacion, alertas); ver `0.5` |
| Acceso al runner de CI productivo | Equipo plataforma | GitHub Actions / equivalente | Para ejecutar el workflow `infra.yml` y dejar trazabilidad de la primera ejecucion remota; ver `0.6` |

### 0.1 Certificado SUNAT/OSE PFX productivo

- Pedirlo al firmante/contribuyente o al proveedor de firma digital autorizado.
- Confirmar vigencia: el certificado debe tener al menos 1 mes de vigencia restante. Si vence en menos, renovar antes de cargarlo.
- Definir variables: `CERT_ENCRYPTION_KEY` (min 32 chars), `PFX_PATH` y `PFX_PASS` (si se usa certificado global) o cargarlo via wizard del tenant.
- Validacion previa: ejecutar el test `apps/erp-api/src/shared/crypto/xml-signer-runtime.spec.ts` apuntando al PFX productivo (NO al `certs/demo.pfx`).
- Preflight obligatorio sin envio:

```bash
pnpm --filter @erp-suite/erp-api run sunat:readiness-preflight -- --out docs/audits/artifacts/sunat-readiness-preflight/<fecha>/manifest.json
```

El reporte debe tener `productionUsed=false`, cero checks `FAIL` y `canAttemptProductionSend=true` antes de cualquier piloto productivo. Si el certificado no contiene el RUC esperado y no existe confirmacion escrita configurada, el proceso se detiene.

### 0.2 Credenciales SUNAT directo o OSE API

Una de las dos rutas, no ambas:

Ruta A `SUNAT_DIRECTO`:

- Para beta/homologacion: `SUNAT_ENVIRONMENT=homologacion`.
- Para produccion real: `SUNAT_ENVIRONMENT=produccion`.
- Credenciales SOAP: usar `SUNAT_USERNAME`/`SUNAT_PASSWORD` o aliases legacy `OSE_USUARIO`/`OSE_PASSWORD`. En produccion debe ser un usuario secundario SOL autorizado para envio de documentos electronicos; no pegar la Clave SOL en tickets, docs ni chat.
- Endpoints por operacion:
  - `SUNAT_CPE_URL`: factura/boleta/nota por `sendBill`.
  - `SUNAT_GRE_URL`: guia de remision por `sendBill` SOAP legacy si se mantiene ese canal.
  - `SUNAT_GRE_TRANSPORT`: `soap` por compatibilidad o `rest` para Plataforma Nueva GRE.
  - `SUNAT_GRE_CLIENT_ID` / `SUNAT_GRE_CLIENT_SECRET`: credenciales API SUNAT requeridas si `SUNAT_GRE_TRANSPORT=rest`.
  - `SUNAT_GRE_REST_BASE_URL`: default `https://api-cpe.sunat.gob.pe/v1`.
  - `SUNAT_SUMMARY_URL`: comunicaciones de baja/resumenes diarios por `sendSummary`.
  - `SUNAT_QUERY_URL`: consulta CDR por `getStatusCdr`.
- Defaults beta cableados: `https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService` para CPE/summary/query y `https://e-beta.sunat.gob.pe/ol-ti-itemision-guia-gem-beta/billService` para GRE. En produccion se usan defaults oficiales separados, pero el operador puede sobreescribirlos con las variables anteriores si SUNAT/OSE publica un cambio.
- SUNAT publica para Plataforma Nueva GRE un flujo REST con token OAuth (`api-seguridad.sunat.gob.pe`) y envio a `api-cpe.sunat.gob.pe/v1/contribuyente/gem/comprobantes/{ruc}-{tipo}-{serie}-{numero}`. Ese canal requiere registrar credenciales API SUNAT en SOL; el usuario SOL secundario por si solo no reemplaza `client_id/client_secret`.
- `SUNAT_API_KEY`, `SUNAT_API_SECRET` solo si el proveedor externo los requiere. SUNAT SOAP directo usa WS-Security UsernameToken con usuario/clave SOL; no enviar HTTP Basic contra hosts `*.sunat.gob.pe`. HTTP Basic queda reservado para endpoints externos no SUNAT que lo exijan.

Ruta B `OSE_API`:

- `OSE_URL` apunta al endpoint productivo del OSE (no homologacion).
- Credenciales segun lo que entregue el OSE: `OSE_USERNAME`/`OSE_PASSWORD`, `oseApiKey`, `oseBearerToken`, `oseAuthTipo` segun el OSE elegido.

### 0.3 Secretos productivos del aplicativo

Generar nuevos, no reusar los de dev:

- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `AUTH_SIGNATURE_SECRET`: minimo 32 chars aleatorios.
- `SESSION_SECRET`, `CSRF_SECRET`: minimo 32 chars aleatorios.
- `DB_ENCRYPTION_KEY`, `ENCRYPTION_KEY`, `CERT_ENCRYPTION_KEY`: minimo 32 chars aleatorios.
- `HEALTH_TOKEN`: minimo 32 chars aleatorios.
- `POS_WORKER_JWT_SECRET`, `WORKER_API_JWT_SECRET`: minimo 32 chars aleatorios.

### 0.4 Proyecto Supabase productivo

- El destino productivo canonico es `.env.production` -> `wypnbcptofqdmoynlonq`; no usar `.env.local`, que pertenece a DEV/demos. Ejecutar `./scripts/db-environment-preflight.ps1 -Environment PROD` y detenerse si no devuelve `OK`.
- PROD debe declarar `NODE_ENV=production`, `DEPLOYMENT_ENV=PROD`, `EXPECTED_SUPABASE_PROJECT_REF=wypnbcptofqdmoynlonq` y `DEMO_API_ENABLED=false`.
- Si se crea un nuevo proyecto productivo, actualizar primero la decision `DB-003`, la marca `app.deployment_environment`, secretos, preflight y `docs/architecture/ENVIRONMENT_DATABASE_BOUNDARIES.md`; no cambiar solo la URL.
- Capturar `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL` (cadena de conexion del pooler).
- En `apps/web` exponer tambien `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` con los valores del proyecto productivo.

### 0.5 Proveedor de email productivo

- Solo si el ERP enviara correo (recuperacion de password, notificaciones, alertas). Si la operacion no usa email, omitir.
- Variables segun proveedor (SendGrid, SES, SMTP), guardarlas en el gestor de secretos.

### 0.6 Runner CI productivo

- Garantizar acceso al workflow `.github/workflows/infra.yml`.
- Tener permisos para `workflow_dispatch` en la rama productiva.

## 1. Aplicar baseline de BD en el proyecto productivo

Las migraciones `000..346` forman la linea canonica vigente en repo. La linea `000..335` fue validada desde cero el 2026-05-24; `337..346` ya fueron aplicadas/verificadas en DEV y PROD remoto por `psql` segun `docs/00_coordination/CURRENT_STATE.md`. Si el go-live se hace en un proyecto Supabase nuevo distinto de `wypnbcptofqdmoynlonq`, aplicar toda la linea canonica completa, configurar su marca de entorno y actualizar el contrato antes del piloto fiscal.

### 1.1 Pre-requisitos no-Supabase (saltable en Supabase, requerido en Postgres puro)

Supabase ya entrega estos elementos por defecto en proyectos nuevos. Si el destino fuese un Postgres puro:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, created_at timestamptz DEFAULT now());
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
END $$;
```

### 1.2 Aplicar las migraciones en orden

Definir `POSTGRES_URL` apuntando al proyecto productivo (NO al de dev). Desde la raiz del repo:

```bash
PG_URL="<POSTGRES_URL productivo>"
for f in $(ls supabase/migrations/*.sql | sort); do
  echo "--- $(basename $f) ---"
  psql --dbname="$PG_URL" -v ON_ERROR_STOP=1 -q -f "$f" || { echo "FAIL $(basename $f)"; break; }
done
```

Si alguna migracion falla, no continuar. Anotar el error en `CURRENT_STATE.md` y abrir un fix antes de retomar.

### 1.3 Verificar artefactos clave 327..341

```bash
psql --dbname="$PG_URL" -c "
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','app')
  AND proname IN (
    'pos_registrar_venta_full_tx',
    'create_demo_tenant',
    'ensure_demo_admin_rbac_for_tenant',
    'seed_operational_defaults_for_tenant',
    'validar_accounting_production_compliance_runtime',
    'validar_inventory_stock_reconciliation_runtime',
    'validar_tesoreria_caja_bancos_runtime',
    'descontar_stock_y_liberar_reserva',
    'registrar_cxc_pago_tx',
    'conciliar_movimientos_bancarios_tx',
    'cerrar_recepcion_tx',
    'reservar_pedido_stock_tx'
  )
ORDER BY proname;
"
```

Debe devolver las 12 funciones.

### 1.4 Correr los 3 validadores runtime

```bash
psql --dbname="$PG_URL" -c "SELECT * FROM public.validar_accounting_production_compliance_runtime(NULL);"
psql --dbname="$PG_URL" -c "SELECT * FROM public.validar_inventory_stock_reconciliation_runtime(NULL);"
psql --dbname="$PG_URL" -c "SELECT * FROM public.validar_tesoreria_caja_bancos_runtime(NULL);"
```

Sobre BD nueva sin datos debe devolver TODO en `ok=true` / `estado=OK`. Si algun control no esta OK, parar y diagnosticar antes de continuar.

## 2. Cargar secretos productivos en el deploy

Cargar en el gestor de secretos del proveedor (Vercel/Docker/Supabase/CI, segun arquitectura):

- Variables de `0.1`..`0.5` arriba.
- No commitear nunca estos valores. `.env` y `.env.local` ya estan ignorados; mantener asi.
- Verificar con un dry-run del deploy que las variables esten visibles dentro del contenedor productivo, NO logueadas.

## 3. Configurar el tenant productivo desde la UI

Una vez la app esta arriba contra el Supabase productivo:

1. Loguearse como superadmin del tenant productivo.
2. Completar el wizard de configuracion de empresa (RUC, razon social, direccion fiscal, ubigeo, regimen, moneda, series, modo de emision).
3. Cargar el certificado PFX por `POST /api/configuration/wizard/validate-certificate` y luego `POST /api/configuration/complete`.
4. Si se usa OSE: marcar `emisionCpeModo=OSE_API`, `oseActivo=true`, `oseUrl` y el metodo de autenticacion.
5. Si se usa SUNAT directo: marcar `SUNAT_DIRECTO` y validar credenciales reales.

Verificar:

```bash
curl -H "Authorization: Bearer <token>" https://<dominio-productivo>/api/configuration/status
# Debe devolver complete=true, certificado existente y vigente.

curl -H "Authorization: Bearer <token>" https://<dominio-productivo>/api/configuration/empresa
# Debe reflejar RUC, series, modo de emision, OSE/SUNAT y fecha de vencimiento del certificado.
```

## 4. Smoke fiscal con SUNAT/OSE real (beta/homologacion -> produccion)

Antes de emitir contra produccion real:

1. **Preparacion sin envio**:
   - Validar certificado con `POST /api/configuration/wizard/validate-certificate`.
   - Generar/firma XML CPE sin envio y conservar hash.
   - Verificar que `SUNAT_ENVIRONMENT` y las URLs por operacion son las esperadas.
   - Ejecutar `sunat:readiness-preflight` y archivar el JSON. Si `canAttemptProductionSend=false`, no continuar a produccion.
2. **Beta SUNAT CPE**:
   - Usar `SUNAT_ENVIRONMENT=homologacion`.
   - Para el servicio beta SUNAT usar usuario `[RUC]MODDATOS` y password `MODDATOS` cuando aplique a la prueba beta. No usar la clave SOL productiva en esta fase si no corresponde.
   - Emitir factura `01`, boleta `03`, nota de credito `07` y nota de debito `08` con montos de prueba.
   - Guardar evidencia: XML sin firma, XML firmado, ZIP, SOAP request/response, CDR si retorna, estado CPE y `integration_logs`.
   - Evidencia interna ya disponible: factura `01`, boleta `03`, nota de credito `07` y nota de debito `08` fueron aceptadas por SUNAT beta el 2026-06-16 con CDR `responseCode=0`; ver `docs/audits/2026-06-16-sunat-beta-cpe-evidence.md`. Repetir la prueba con el tenant/certificado real antes de go-live.
3. **Beta SUNAT RA/RC/GRE**:
   - Enviar comunicacion de baja/resumen diario por `sendSummary`.
   - Consultar ticket por `getStatus`.
   - Enviar GRE por el endpoint de guia (`SUNAT_GRE_URL`) si el contribuyente requiere GRE.
   - Guardar ticket/CDR/acuse y estado persistido. Al 2026-06-16, beta devolvio tickets RA/RC pero `getStatus` respondio fallos tecnicos `code=99` por XML incompleto; no tratar ese caso como rechazo fiscal definitivo.
4. **Produccion controlada**:
   - Solo si beta paso, cambiar a `SUNAT_ENVIRONMENT=produccion`.
   - Usar certificado vigente registrado/valido y usuario secundario SOL productivo con permisos correctos. No usar la clave SOL principal como credencial de integracion.
   - Antes del primer `sendBill` productivo, validar la credencial secundaria con una consulta read-only `getStatusCdr` contra un comprobante inexistente. Evidencia interna 2026-06-17: `ERPFE001` valido por UsernameToken; ver `docs/audits/2026-06-17-sunat-secondary-sol-evidence.md`.
   - Emitir 1 CPE piloto de monto minimo con contraparte conocida, teniendo preparada nota de credito/comunicacion de baja.
5. Generar SIRE RVIE/RCE del periodo y validar ticket/acuse real.
6. Exportar PLE del periodo y validarlo con el software/servicio oficial antes de declararlo libro definitivo.
7. Confirmar que `integration_logs`, asientos contables, CxC/CxP, SIRE/PLE y dashboard reflejan la misma operacion.

## 5. Verificar salud de la aplicacion productiva

Ejecutar despues de cada paso anterior:

```bash
curl -H "X-Health-Token: $HEALTH_TOKEN" https://<dominio-productivo>/api/health
curl https://<dominio-productivo>/api/health/live
curl https://<dominio-productivo>/api/health/ready
```

Revisar:

- `outbox_events` sin `dead_letter`, `failed`, `pending` ni `processing` viejos.
- Redis real responde `PONG`.
- Logs sin secretos/tokens expuestos.
- Metricas Prometheus: error rate, latencia P95, tasa de 5xx.
- Grafana dashboard `ERP Infra Readiness`: todos los targets `UP`.

## 6. Validacion operativa real

Antes de declarar Go-Live:

- Crear 1 usuario operativo real y validar login + permisos.
- Crear 1 cliente real y emitir 1 factura piloto real (montos minimos).
- Confirmar que el flujo cierra: venta -> CPE -> CDR -> asiento -> CxC -> cobro -> banco -> conciliacion.
- Confirmar que el flujo de compras cierra: OC -> aprobacion -> recepcion -> CxP -> pago bancario -> conciliacion.
- Confirmar que POS opera: apertura caja -> ventas -> cierre caja.
- Si aplica RRHH: correr una planilla piloto del periodo.

## 7. Rollback (si algo falla en 4..6)

Si Smoke o validacion operativa fallan:

1. **No emitir mas comprobantes**. Marcar el sistema como freeze (bloquear endpoints publicos).
2. Anular los comprobantes piloto via comunicacion de baja y notas de credito si ya generaron CDR.
3. Revertir deploy a la version anterior. Mantener BD (las migraciones son aditivas/idempotentes).
4. Si el fallo es de BD/datos, hacer rollback con backup point-in-time de Supabase.
5. Registrar causa, evidencia y plan preventivo en el documento de incidente.
6. Reabrir el bloque de hardening correspondiente. NO retomar Go-Live hasta tener fix verificado en sandbox.

## 8. Post Go-Live (24h iniciales)

- Monitorear `validar_accounting_production_compliance_runtime`, `validar_tesoreria_caja_bancos_runtime`, `validar_inventory_stock_reconciliation_runtime` cada 4-6h el primer dia.
- Revisar `outbox_events` cada hora el primer dia.
- Revisar logs por errores 5xx, intentos de auth fallidos, picos de rate limit.
- Mantener canal de comunicacion abierto con el contribuyente para reportar cualquier rechazo SUNAT/OSE.
- 24h despues: ejecutar smoke E2E critico segun manifest documentado en `ERP_PRODUCTION_READINESS.md`.

## 9. Cuando declarar el Go-Live como cerrado

- Pasos 1..6 ejecutados con evidencia.
- 48h de operacion real sin incidentes criticos.
- CDR/ticket/acuse SUNAT/OSE archivados.
- `validar_*_runtime(NULL)` siguen en `ok=true` para todos los controles.
- Actualizar `docs/00_coordination/CURRENT_STATE.md` con la fecha de Go-Live efectivo y mover los pendientes restantes a "Operacionales continuos".

## Apendice A. Comandos de referencia rapida

Aplicar UNA migracion individual a la BD productiva:

```bash
PG_URL="<POSTGRES_URL productivo>"
psql --dbname="$PG_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/<file>.sql
```

Verificar que una RPC existe:

```bash
psql --dbname="$PG_URL" -t -A -c "
SELECT EXISTS(
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='<nombre_rpc>'
);"
```

Forzar refresh del schema de PostgREST tras cambios:

```bash
psql --dbname="$PG_URL" -c "NOTIFY pgrst, 'reload schema';"
```

## Apendice B. Documentos fuente referenciados

- `docs/00_coordination/CURRENT_STATE.md` (estado vivo y resultados verificacion 327..335)
- `docs/00_coordination/FLOW_STATUS.md` (matriz por flujo)
- `docs/00_coordination/AGENT_SYNC.md` (protocolo de coordinacion)
- `docs/production-readiness/ERP_PRODUCTION_READINESS.md` (gate 21/22, smoke historicos)
- `docs/release/production-checklist.md` (checklist tecnica generica)
- `docs/auditoria_forense_contable_2026-05.md` (cierre fiscal/contable)
- `docs/auditoria_forense_inventario_logistica_costeo_2026-05.md` (cierre inventario)
- `docs/auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md` (cierre tesoreria)
- `docs/ops/supabase-connection.md` (operacion Supabase y aplicacion manual de migraciones)
- `docs/security/route-access-matrix.md` (matriz de autorizacion por endpoint)
