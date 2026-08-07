## Objetivo

<!-- DOC-NAV:START -->
> Documentación canónica: `docs/README.md`. Estado vigente: `docs/CURRENT_STATE.md`.
<!-- DOC-NAV:END -->

Prueba E2E real de cierre de caja que valide:
- Inserción real de corte (`cortes_caja`) y asiento contable asociado en Supabase.
- Mapeo correcto de cuentas por tenant (10111/10411/10412/7011/40111) y cuadratura Debe=Haber.

## Precondiciones
- Tenant con plan de cuentas cargado y cuentas 10111, 10411, 10412, 7011, 40111 activas.
- Sesión de caja abierta con ventas registradas y resumen fiscal calculado.
- Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Flags/ENV: `PLANILLA_OUTBOX_ENABLED=true` (si quieres que planillas usen outbox en el mismo entorno).

## Escenario feliz
1. Abrir sesión de caja (si no existe) y registrar ventas de prueba (efectivo, tarjeta, transferencia).
2. Ejecutar `cash-reports.service.registrarAsientoCierre(tenantId, sesionId)`.
3. Verificar en BD:
   - `asientos_contables` tiene una fila con `referencia = 'SESION:<sesionId>'`.
   - `detalle_asientos` tiene 5 líneas con las cuentas esperadas.
   - `total_debe` ≈ `total_haber` y coincide con total ventas (base + IGV).
4. Validar que el asiento queda en estado `BORRADOR` y puede aprobarse/manualizarse si aplica.

## Escenario de error
- Sin cuentas mapeadas -> servicio debe lanzar error y no crear asiento.
- Sesión sin resumen fiscal -> debe fallar con mensaje claro.

## Implementación sugerida
- Test E2E en `apps/erp-api/tests/cash-reports.e2e.ts` usando `@supabase/supabase-js` y datos reales del tenant.
- Helpers para crear ventas/ingresos de caja y limpiar datos al final.
- Ejecución (ejemplo):
  ```bash
  SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  pnpm ts-node apps/erp-api/tests/cash-reports.e2e.ts --tenant <tenant-id> --sesion <sesion-id>
  ```
