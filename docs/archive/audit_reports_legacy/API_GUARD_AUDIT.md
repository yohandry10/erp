# Auditoría de guards en controllers (heurística)

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `historico_auditoria_archivado`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Generado automáticamente; revisar controllers marcados como sin JwtAuthGuard.

| Controller | Tiene @UseGuards | Menciona JwtAuthGuard | Guards a nivel clase (si aplica) |
|---|---:|---:|---|
| `apps\erp-api\src\app.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\controllers\retenciones.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\analytics.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\audit\audit.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\auth\auth.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\cajas\cajas.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\compras.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\compras\controllers\cotizaciones-compra.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\compras\controllers\devoluciones-proveedor.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\compras\controllers\ordenes-compra.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\compras\controllers\proveedores.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\compras\controllers\recepciones.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\configuracion.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\configuracion\configuracion-fiscal.controller.ts` | ✅ | ✅ | JwtAuthGuard, TenantGuard |
| `apps\erp-api\src\modules\configuracion\configuration.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\contabilidad.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\cotizaciones.controller.ts` | ✅ | ✅ | JwtAuthGuard, PermissionGuard |
| `apps\erp-api\src\modules\cpe\comunicacion-baja.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\cpe\cpe.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\dashboard.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\demo\demo.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\demo\webhook.controller.ts` | ❌ | ❌ |  |
| `apps\erp-api\src\modules\documentos.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\finanzas.controller.ts` | ✅ | ✅ | JwtAuthGuard, PermissionGuard |
| `apps\erp-api\src\modules\finanzas\bancos\bancos.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\finanzas\conciliacion\conciliacion.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\finanzas\cxc\cxc.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\finanzas\cxp\cxp.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\finanzas\tesoreria\tesoreria.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\gre\gre.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\import-export\import-export.controller.ts` | ✅ | ✅ | JwtAuthGuard, PermissionGuard |
| `apps\erp-api\src\modules\inventario\inventario.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\inventario\logistica\logistica.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\metrics\metrics.controller.ts` | ❌ | ❌ |  |
| `apps\erp-api\src\modules\notifications.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\paises\paises.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\permissions\permission.controller.ts` | ✅ | ✅ | JwtAuthGuard |
| `apps\erp-api\src\modules\permissions\role.controller.ts` | ✅ | ✅ | JwtAuthGuard |
| `apps\erp-api\src\modules\pos\pos.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\reports.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\rrhh\rrhh.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\security\security.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\sire\sire.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\tenants\tenant-management.controller.ts` | ✅ | ✅ | JwtAuthGuard |
| `apps\erp-api\src\modules\usuarios.controller.ts` | ✅ | ✅ | JwtAuthGuard, PermissionGuard |
| `apps\erp-api\src\modules\usuarios\user-management.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\validations\validation.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\ventas\clientes\clientes.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\ventas\cotizaciones\cotizaciones.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\ventas\pedidos\pedidos.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\ventas\reportes\reportes.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\modules\ventas\rma\rma.controller.ts` | ✅ | ✅ |  |
| `apps\erp-api\src\shared\observability\observability.controller.ts` | ❌ | ❌ |  |
