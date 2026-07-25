# Supabase Advisor Security Hardening - 2026-06-18

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `auditoria`.
>
> Leer tambien: `docs/security/supabase-access-audit.md`, `docs/ops/supabase-connection.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## Alcance

Cerrar deuda critica visible en Supabase Advisor para DEV y PROD, sin tocar reglas SUNAT ni emitir documentos fiscales:

- `financial_forensic_repair_log` aparecia como tabla publica sin RLS.
- Vistas publicas de diagnostico aparecian como `SECURITY DEFINER`.
- Funciones propias `SECURITY DEFINER` y funciones sin `search_path` debian quedar fuera del alcance de `anon`/`authenticated`.

Fuentes oficiales consultadas:

- Supabase Database Advisors: <https://supabase.com/docs/guides/database/database-advisors?lint=0010_security_definer_view>
- Supabase RLS: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase Auth architecture sobre `security_invoker`: <https://supabase.com/docs/guides/auth/architecture>

## Cambio Aplicado

Migracion nueva:

- `supabase/migrations/345__supabase_advisor_security_hardening.sql`

Acciones:

- Habilita y fuerza RLS en `public.financial_forensic_repair_log`.
- Revoca privilegios de `PUBLIC`, `anon` y `authenticated` sobre esa tabla.
- Permite acceso backend-only a `postgres`/`service_role`.
- Convierte vistas normales de `public` a `security_invoker=true`.
- Restringe vistas diagnosticas/runtime a `service_role`.
- Fija `search_path` en funciones propias de `public`/`app` que no lo tenian.
- Revoca `EXECUTE` de funciones propias `SECURITY DEFINER` a `PUBLIC`, `anon` y `authenticated`; concede solo `service_role`.
- Excluye funciones pertenecientes a extensiones para no romper objetos administrados por Supabase/Postgres.

## Entornos

| Entorno | Ref | Resultado |
|---|---|---|
| DEV | `hbueraexcbowpfnjlppi` | `343`, `344` y `345` aplicadas/verificadas |
| PROD | `wypnbcptofqdmoynlonq` | Conexion `psql` revalidada; `343`, `344` y `345` aplicadas/verificadas |

## Verificacion

Consulta consolidada posterior a la aplicacion:

| Check | DEV | PROD |
|---|---:|---:|
| `security_definer_views_remaining` | 0 | 0 |
| `rls_disabled_public_tables_remaining` | 0 | 0 |
| `user_functions_without_search_path` | 0 | 0 |
| `secdef_user_functions_client_executable` | 0 | 0 |
| `financial_forensic_anon_select` | false | false |
| `financial_forensic_authenticated_select` | false | false |
| `financial_forensic_service_role_select` | true | true |

Verificaciones adicionales en PROD:

- `acquire_job_lock`/`release_job_lock`: `anon=false`, `authenticated=false`, `service_role=true`, `search_path` fijo, `SECURITY DEFINER=true`.
- Smoke lock no destructivo: primer lock `true`, segundo lock simultaneo `false`, release `true`.
- `cuentas_por_cobrar.total`: columna presente y `cxc_total_mismatches=0`.
- Vistas diagnosticadas originalmente (`v_dashboard_runtime_status_actual`, `v_dashboard_stock_sync_gap`, `v_compras_estado_case_insensitive_runtime_status_actual`) tienen `security_invoker=true`.

## Resultado

La deuda critica de seguridad visible/inferible desde Supabase Advisor queda cerrada en DEV y PROD por catalogo SQL. El panel de Supabase puede requerir re-ejecutar el Advisor desde la UI para refrescar el contador visual; si aparecen issues restantes, tratarlos como una lista nueva y no como persistencia de estos cuatro checks cerrados.

Esto no cambia los bloqueos fiscales externos: certificado SUNAT valido para RUC 20/autorizacion del PFX, credenciales GRE REST si aplica, secretos finales y smoke productivo autorizado siguen regidos por `docs/00_coordination/FLOW_STATUS.md` y `docs/release/GO_LIVE_RUNBOOK.md`.
