# Logs de comandos (root)

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `historico_auditoria_archivado`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Generado: 2025-12-13 08:21:13

## Actualización (2025-12-13)

### pnpm type-check (re-ejecución)
- Resultado: OK (monorepo).
- Nota: se eliminó `apps/web/components/modals/TenantModal.tsx` (archivo truncado y sin referencias) para corregir `TS1002`.

### apps/erp-api tests (re-ejecución)
- Resultado: 65 suites / 749 tests PASS.

## pnpm type-check

> erp-suite@1.0.0 type-check C:\Users\PC\Desktop\erp
> turbo run type-check

• Packages in scope: @erp-suite/crypto, @erp-suite/dtos, @erp-suite/erp-api, @erp-suite/web, @erp-suite/worker
• Running type-check in 5 packages
• Remote caching disabled
@erp-suite/crypto:type-check: cache hit, replaying logs 05ea14fc0333d514
@erp-suite/dtos:type-check: cache hit, replaying logs c0595a3705fb30b8
@erp-suite/crypto:type-check:
@erp-suite/crypto:type-check: > @erp-suite/crypto@1.0.0 type-check C:\Users\PC\Desktop\erp\libs\crypto
@erp-suite/dtos:type-check:
@erp-suite/dtos:type-check: > @erp-suite/dtos@1.0.0 type-check C:\Users\PC\Desktop\erp\libs\dtos
@erp-suite/crypto:type-check: > tsc --noEmit
@erp-suite/crypto:type-check:
@erp-suite/dtos:type-check: > tsc --noEmit
@erp-suite/dtos:type-check:
@erp-suite/crypto:build: cache hit, replaying logs fa09d61533cd7364
@erp-suite/crypto:build:
@erp-suite/crypto:build: > @erp-suite/crypto@1.0.0 build C:\Users\PC\Desktop\erp\libs\crypto
@erp-suite/crypto:build: > tsc
@erp-suite/crypto:build:
@erp-suite/dtos:build: cache hit, replaying logs 5e206548c4993843
@erp-suite/dtos:build:
@erp-suite/dtos:build: > @erp-suite/dtos@1.0.0 build C:\Users\PC\Desktop\erp\libs\dtos
@erp-suite/dtos:build: > tsc
@erp-suite/dtos:build:
@erp-suite/worker:type-check: cache miss, executing 7b0311fb51286b82
@erp-suite/web:type-check: cache miss, executing 454afbbbf133d2aa
@erp-suite/web:type-check:
@erp-suite/web:type-check: > @erp-suite/web@1.0.0 type-check C:\Users\PC\Desktop\erp\apps\web
@erp-suite/web:type-check: > tsc --noEmit
@erp-suite/web:type-check:
@erp-suite/worker:type-check:
@erp-suite/worker:type-check: > @erp-suite/worker@1.0.0 type-check C:\Users\PC\Desktop\erp\apps\worker
@erp-suite/worker:type-check: > tsc --noEmit
@erp-suite/worker:type-check:
@erp-suite/web:type-check: components/modals/TenantModal.tsx(34,31): error TS1002: Unterminated string literal.
@erp-suite/web:type-check:  ELIFECYCLE  Command failed with exit code 2.
@erp-suite/web:type-check: ERROR: command finished with error: command (C:\Users\PC\Desktop\erp\apps\web) C:\Users\PC\AppData\Roaming\npm\pnpm.cmd run type-check exited (2)
@erp-suite/web#type-check: command (C:\Users\PC\Desktop\erp\apps\web) C:\Users\PC\AppData\Roaming\npm\pnpm.cmd run type-check exited (2)

 Tasks:    5 successful, 6 total
Cached:    4 cached, 6 total
  Time:    7.724s
Failed:    @erp-suite/web#type-check

 ERROR  run failed: command  exited (2)
 ELIFECYCLE  Command failed with exit code 2.

## pnpm build

> erp-suite@1.0.0 build C:\Users\PC\Desktop\erp
> turbo run build

• Packages in scope: @erp-suite/crypto, @erp-suite/dtos, @erp-suite/erp-api, @erp-suite/web, @erp-suite/worker
• Running build in 5 packages
• Remote caching disabled
@erp-suite/crypto:build: cache hit, replaying logs c2d7f112a76ef0cb
@erp-suite/crypto:build:
@erp-suite/crypto:build: > @erp-suite/crypto@1.0.0 build C:\Users\PC\Desktop\erp\libs\crypto
@erp-suite/crypto:build: > tsc
@erp-suite/crypto:build:
@erp-suite/dtos:build: cache hit, replaying logs fd750820f1930e26
@erp-suite/dtos:build:
@erp-suite/dtos:build: > @erp-suite/dtos@1.0.0 build C:\Users\PC\Desktop\erp\libs\dtos
@erp-suite/dtos:build: > tsc
@erp-suite/dtos:build:
@erp-suite/worker:build: cache miss, executing 4640b2fb40ae2475
@erp-suite/erp-api:build: cache miss, executing f7e30dff3c85a471
@erp-suite/web:build: cache miss, executing c34fd34f5f382de6
@erp-suite/erp-api:build:
@erp-suite/erp-api:build: > @erp-suite/erp-api@1.0.0 build C:\Users\PC\Desktop\erp\apps\erp-api
@erp-suite/erp-api:build: > nest build
@erp-suite/erp-api:build:
@erp-suite/web:build:
@erp-suite/web:build: > @erp-suite/web@1.0.0 build C:\Users\PC\Desktop\erp\apps\web
@erp-suite/web:build: > next build
@erp-suite/web:build:
@erp-suite/worker:build:
@erp-suite/worker:build: > @erp-suite/worker@1.0.0 build C:\Users\PC\Desktop\erp\apps\worker
@erp-suite/worker:build: > tsc
@erp-suite/worker:build:
@erp-suite/web:build:    ▲ Next.js 15.3.3
@erp-suite/web:build:    - Environments: .env.local
@erp-suite/web:build:
@erp-suite/web:build:    Creating an optimized production build ...
@erp-suite/web:build: Browserslist: browsers data (caniuse-lite) is 7 months old. Please run:
@erp-suite/web:build:   npx update-browserslist-db@latest
@erp-suite/web:build:   Why you should do it regularly: https://github.com/browserslist/update-db#readme
@erp-suite/web:build:  ✓ Compiled successfully in 44s
@erp-suite/web:build:    Skipping validation of types
@erp-suite/web:build:    Skipping linting
@erp-suite/web:build:    Collecting page data ...
@erp-suite/web:build:    Generating static pages (0/86) ...
@erp-suite/web:build:    Generating static pages (21/86)
@erp-suite/web:build:    Generating static pages (42/86)
@erp-suite/web:build:    Generating static pages (64/86)
@erp-suite/web:build:  ✓ Generating static pages (86/86)
@erp-suite/web:build:    Finalizing page optimization ...
@erp-suite/web:build:    Collecting build traces ...
@erp-suite/web:build:
@erp-suite/web:build: Route (app)                                                Size  First Load JS
@erp-suite/web:build: ┌ ○ /                                                   3.54 kB         106 kB
@erp-suite/web:build: ├ ○ /_not-found                                           986 B         103 kB
@erp-suite/web:build: ├ ○ /admin/dashboard                                    27.8 kB         177 kB
@erp-suite/web:build: ├ ƒ /api/configuracion-fiscal                             153 B         102 kB
@erp-suite/web:build: ├ ƒ /api/help/search                                      153 B         102 kB
@erp-suite/web:build: ├ ƒ /api/help/sugerencias                                 153 B         102 kB
@erp-suite/web:build: ├ ƒ /api/public/paises                                    153 B         102 kB
@erp-suite/web:build: ├ ○ /dashboard                                          10.3 kB         138 kB
@erp-suite/web:build: ├ ○ /dashboard/analytics                                3.71 kB         114 kB
@erp-suite/web:build: ├ ○ /dashboard/audit-logs                                4.4 kB         115 kB
@erp-suite/web:build: ├ ○ /dashboard/ayuda                                    5.09 kB         117 kB
@erp-suite/web:build: ├ ○ /dashboard/cajas                                    11.4 kB         122 kB
@erp-suite/web:build: ├ ○ /dashboard/compras                                   9.8 kB         128 kB
@erp-suite/web:build: ├ ○ /dashboard/compras/cotizaciones                     4.53 kB         115 kB
@erp-suite/web:build: ├ ƒ /dashboard/compras/cotizaciones/[id]                 4.4 kB         115 kB
@erp-suite/web:build: ├ ○ /dashboard/compras/cotizaciones/nueva               5.51 kB         146 kB
@erp-suite/web:build: ├ ○ /dashboard/compras/devoluciones                     6.96 kB         117 kB
@erp-suite/web:build: ├ ƒ /dashboard/compras/devoluciones/[id]                4.14 kB         115 kB
@erp-suite/web:build: ├ ○ /dashboard/compras/devoluciones/nueva               4.49 kB         115 kB
@erp-suite/web:build: ├ ○ /dashboard/compras/ordenes                          6.35 kB         117 kB
@erp-suite/web:build: ├ ƒ /dashboard/compras/ordenes/[id]                     11.8 kB         122 kB
@erp-suite/web:build: ├ ○ /dashboard/compras/ordenes/nueva                    6.09 kB         147 kB
@erp-suite/web:build: ├ ○ /dashboard/compras/proveedores                      4.46 kB         115 kB
@erp-suite/web:build: ├ ƒ /dashboard/compras/proveedores/[id]                 3.32 kB         114 kB
@erp-suite/web:build: ├ ƒ /dashboard/compras/proveedores/[id]/editar          1.62 kB         137 kB
@erp-suite/web:build: ├ ○ /dashboard/compras/proveedores/nuevo                1.25 kB         137 kB
@erp-suite/web:build: ├ ○ /dashboard/compras/recepciones                      3.81 kB         114 kB
@erp-suite/web:build: ├ ƒ /dashboard/compras/recepciones/[id]                 3.92 kB         114 kB
@erp-suite/web:build: ├ ○ /dashboard/compras/recepciones/nueva                6.77 kB         117 kB
@erp-suite/web:build: ├ ○ /dashboard/contabilidad                             2.59 kB         113 kB
@erp-suite/web:build: ├ ○ /dashboard/contabilidad/asientos                    4.55 kB         115 kB
@erp-suite/web:build: ├ ƒ /dashboard/contabilidad/asientos/[id]               4.11 kB         115 kB
@erp-suite/web:build: ├ ○ /dashboard/contabilidad/asientos/nuevo              4.53 kB         115 kB
@erp-suite/web:build: ├ ○ /dashboard/contabilidad/centros-costo               3.82 kB         114 kB
@erp-suite/web:build: ├ ƒ /dashboard/contabilidad/centros-costo/[id]          4.41 kB         115 kB
@erp-suite/web:build: ├ ƒ /dashboard/contabilidad/centros-costo/[id]/editar   2.88 kB         113 kB
@erp-suite/web:build: ├ ○ /dashboard/contabilidad/centros-costo/nuevo          2.5 kB         113 kB
@erp-suite/web:build: ├ ○ /dashboard/contabilidad/estados                      158 kB         492 kB
@erp-suite/web:build: ├ ○ /dashboard/contabilidad/monitoreo                   3.74 kB         114 kB
@erp-suite/web:build: ├ ○ /dashboard/contabilidad/periodos                    3.24 kB         121 kB
@erp-suite/web:build: ├ ƒ /dashboard/contabilidad/periodos/[id]               4.27 kB         122 kB
@erp-suite/web:build: ├ ○ /dashboard/contabilidad/periodos/nuevo              5.68 kB         116 kB
@erp-suite/web:build: ├ ○ /dashboard/contabilidad/presupuestos                2.52 kB         105 kB
@erp-suite/web:build: ├ ƒ /dashboard/contabilidad/presupuestos/[id]            1.1 kB         115 kB
@erp-suite/web:build: ├ ○ /dashboard/contabilidad/presupuestos/alertas        6.69 kB         117 kB
@erp-suite/web:build: ├ ○ /dashboard/contabilidad/presupuestos/comparacion    8.82 kB         341 kB
@erp-suite/web:build: ├ ○ /dashboard/contabilidad/presupuestos/lista          5.52 kB         116 kB
@erp-suite/web:build: ├ ○ /dashboard/contabilidad/presupuestos/nuevo            525 B         114 kB
@erp-suite/web:build: ├ ○ /dashboard/cpe                                      8.75 kB         133 kB
@erp-suite/web:build: ├ ○ /dashboard/cpe/cotizaciones                         8.78 kB         127 kB
@erp-suite/web:build: ├ ○ /dashboard/documentos                               10.4 kB         129 kB
@erp-suite/web:build: ├ ○ /dashboard/documentos/descargas                     2.29 kB         121 kB
@erp-suite/web:build: ├ ○ /dashboard/finanzas/bancos                          4.01 kB         114 kB
@erp-suite/web:build: ├ ƒ /dashboard/finanzas/bancos/[id]                     5.57 kB         116 kB
@erp-suite/web:build: ├ ƒ /dashboard/finanzas/bancos/[id]/editar              3.65 kB         114 kB
@erp-suite/web:build: ├ ○ /dashboard/finanzas/bancos/nueva                    3.33 kB         114 kB
@erp-suite/web:build: ├ ○ /dashboard/finanzas/conciliacion                    4.33 kB         115 kB
@erp-suite/web:build: ├ ƒ /dashboard/finanzas/conciliacion/[id]               4.57 kB         178 kB
@erp-suite/web:build: ├ ○ /dashboard/finanzas/cxc                             4.47 kB         178 kB
@erp-suite/web:build: ├ ○ /dashboard/finanzas/cxp                             5.17 kB         119 kB
@erp-suite/web:build: ├ ƒ /dashboard/finanzas/cxp/[id]                         3.1 kB         176 kB
@erp-suite/web:build: ├ ○ /dashboard/finanzas/reportes                        7.18 kB         121 kB
@erp-suite/web:build: ├ ○ /dashboard/finanzas/tesoreria                       4.47 kB         115 kB
@erp-suite/web:build: ├ ○ /dashboard/finanzas/tesoreria/flujo-caja            4.14 kB         115 kB
@erp-suite/web:build: ├ ○ /dashboard/finanzas/tesoreria/lote                  5.71 kB         150 kB
@erp-suite/web:build: ├ ○ /dashboard/finanzas/tesoreria/programacion          4.43 kB         115 kB
@erp-suite/web:build: ├ ○ /dashboard/gre                                      6.08 kB         122 kB
@erp-suite/web:build: ├ ○ /dashboard/inventario                               3.44 kB         117 kB
@erp-suite/web:build: ├ ○ /dashboard/inventario/almacenes                     3.53 kB         117 kB
@erp-suite/web:build: ├ ○ /dashboard/inventario/kardex                        4.07 kB         118 kB
@erp-suite/web:build: ├ ○ /dashboard/inventario/logistica/listo-despacho      5.24 kB         124 kB
@erp-suite/web:build: ├ ○ /dashboard/inventario/logistica/ordenes-pendientes  10.3 kB         129 kB
@erp-suite/web:build: ├ ○ /dashboard/inventario/productos                     3.61 kB         117 kB
@erp-suite/web:build: ├ ƒ /dashboard/inventario/productos/[id]/editar         3.08 kB         113 kB
@erp-suite/web:build: ├ ○ /dashboard/inventario/productos/nuevo               2.78 kB         113 kB
@erp-suite/web:build: ├ ○ /dashboard/inventario/recepciones                   4.84 kB         119 kB
@erp-suite/web:build: ├ ○ /dashboard/pos                                      15.1 kB         126 kB
@erp-suite/web:build: ├ ○ /dashboard/rrhh                                     5.18 kB         119 kB
@erp-suite/web:build: ├ ○ /dashboard/rrhh/asistencia                          1.96 kB         112 kB
@erp-suite/web:build: ├ ○ /dashboard/rrhh/candidatos                          6.52 kB         117 kB
@erp-suite/web:build: ├ ○ /dashboard/rrhh/contratos                           6.39 kB         117 kB
@erp-suite/web:build: ├ ○ /dashboard/rrhh/pagos                               4.38 kB         115 kB
@erp-suite/web:build: ├ ○ /dashboard/rrhh/planillas                           13.7 kB         124 kB
@erp-suite/web:build: ├ ○ /dashboard/sire                                     6.85 kB         117 kB
@erp-suite/web:build: ├ ○ /dashboard/usuarios                                 6.34 kB         117 kB
@erp-suite/web:build: ├ ○ /dashboard/ventas/aprobaciones                      4.05 kB         114 kB
@erp-suite/web:build: ├ ○ /dashboard/ventas/clientes                          4.36 kB         115 kB
@erp-suite/web:build: ├ ƒ /dashboard/ventas/clientes/[id]                     2.38 kB         113 kB
@erp-suite/web:build: ├ ƒ /dashboard/ventas/clientes/[id]/editar              1.25 kB         139 kB
@erp-suite/web:build: ├ ○ /dashboard/ventas/clientes/nuevo                    1.16 kB         139 kB
@erp-suite/web:build: ├ ○ /dashboard/ventas/cotizaciones                      4.03 kB         123 kB
@erp-suite/web:build: ├ ƒ /dashboard/ventas/cotizaciones/[id]                 4.38 kB         139 kB
@erp-suite/web:build: ├ ○ /dashboard/ventas/cotizaciones/nueva                 1.4 kB         128 kB
@erp-suite/web:build: ├ ○ /dashboard/ventas/pedidos                           4.18 kB         123 kB
@erp-suite/web:build: ├ ƒ /dashboard/ventas/pedidos/[id]                      7.56 kB         140 kB
@erp-suite/web:build: ├ ○ /dashboard/ventas/pedidos/nuevo                     4.53 kB         127 kB
@erp-suite/web:build: ├ ○ /dashboard/ventas/reportes                          17.6 kB         136 kB
@erp-suite/web:build: ├ ○ /dashboard/wizard                                   22.9 kB         133 kB
@erp-suite/web:build: ├ ○ /demo                                                5.4 kB         108 kB
@erp-suite/web:build: ├ ○ /demo/convert                                       5.12 kB         107 kB
@erp-suite/web:build: ├ ○ /login                                              5.73 kB         144 kB
@erp-suite/web:build: ├ ○ /reset-password                                     5.39 kB         111 kB
@erp-suite/web:build: ├ ƒ /reset-password/[token]                             6.07 kB         112 kB
@erp-suite/web:build: ├ ○ /superadmin/dashboard                               7.83 kB         146 kB
@erp-suite/web:build: └ ○ /superadmin/dashboard/security                      2.58 kB         113 kB
@erp-suite/web:build: + First Load JS shared by all                            102 kB
@erp-suite/web:build:   ├ chunks/2840-ae51612611e9c8ad.js                     46.9 kB
@erp-suite/web:build:   ├ chunks/d01aa972-5e7a382c1db8b976.js                 53.2 kB
@erp-suite/web:build:   └ other shared chunks (total)                         2.17 kB
@erp-suite/web:build:
@erp-suite/web:build:
@erp-suite/web:build: ƒ Middleware                                            32.2 kB
@erp-suite/web:build:
@erp-suite/web:build: ○  (Static)   prerendered as static content
@erp-suite/web:build: ƒ  (Dynamic)  server-rendered on demand
@erp-suite/web:build:

 Tasks:    5 successful, 5 total
Cached:    2 cached, 5 total
  Time:    1m13.58s


## pnpm test

> erp-suite@1.0.0 test C:\Users\PC\Desktop\erp
> turbo run test

• Packages in scope: @erp-suite/crypto, @erp-suite/dtos, @erp-suite/erp-api, @erp-suite/web, @erp-suite/worker
• Running test in 5 packages
• Remote caching disabled
@erp-suite/crypto:build: cache hit, replaying logs c2d7f112a76ef0cb
@erp-suite/crypto:build:
@erp-suite/crypto:build: > @erp-suite/crypto@1.0.0 build C:\Users\PC\Desktop\erp\libs\crypto
@erp-suite/crypto:build: > tsc
@erp-suite/crypto:build:
@erp-suite/dtos:build: cache hit, replaying logs fd750820f1930e26
@erp-suite/dtos:build:
@erp-suite/dtos:build: > @erp-suite/dtos@1.0.0 build C:\Users\PC\Desktop\erp\libs\dtos
@erp-suite/dtos:build: > tsc
@erp-suite/dtos:build:
@erp-suite/erp-api:test: cache miss, executing 0d4b54f873f0224d
@erp-suite/erp-api:test:
@erp-suite/erp-api:test: > @erp-suite/erp-api@1.0.0 test C:\Users\PC\Desktop\erp\apps\erp-api
@erp-suite/erp-api:test: > jest
@erp-suite/erp-api:test:
@erp-suite/erp-api:test: PASS src/modules/contabilidad/services/outbox-events.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/contabilidad/listeners/contabilidad-events.listener.spec.ts
@erp-suite/erp-api:test: PASS src/modules/finanzas/cxc/cxc-cobro-event.spec.ts
@erp-suite/erp-api:test: PASS src/modules/compras/services/proveedores.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/compras/services/recepciones.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/auth/auth.service.spec.ts (5.277 s)
@erp-suite/erp-api:test: PASS src/common/guards/feature-flag.guard.spec.ts
@erp-suite/erp-api:test: PASS src/modules/contabilidad/services/presupuestos.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/pos/pos.service.spec.ts (5.429 s)
@erp-suite/erp-api:test: PASS src/modules/ventas/cotizaciones/cotizaciones.service.spec.ts (5.551 s)
@erp-suite/erp-api:test: PASS src/modules/cpe/cpe.service.spec.ts (5.535 s)
@erp-suite/erp-api:test: PASS src/modules/ventas/pedidos/pedidos.service.spec.ts (5.589 s)
@erp-suite/erp-api:test: PASS src/modules/compras/services/recepciones-inventario-integration.spec.ts
@erp-suite/erp-api:test: PASS src/modules/cajas/services/cash-reports.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/cajas/services/cash-flow.spec.ts
@erp-suite/erp-api:test: PASS src/modules/usuarios/user-management.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/tenants/tenant-management.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/finanzas/cxc/cxc-service-actions.spec.ts
@erp-suite/erp-api:test: PASS src/modules/compras/services/devoluciones-proveedor.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/contabilidad/services/asientos-generator.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/finanzas/cxp/cxp.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/compras/services/cotizaciones-compra.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/compras/services/ordenes-compra.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/finanzas/tesoreria/tesoreria.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/finanzas/cxc/cxc-factura-event.spec.ts
@erp-suite/erp-api:test: PASS src/modules/permissions/permission.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/ventas/pedidos/cpe-integration.verify.spec.ts (7.826 s)
@erp-suite/erp-api:test: PASS src/shared/email/email.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/contabilidad/services/plan-cuentas.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/inventario/inventario.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/finanzas/conciliacion/conciliacion.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/finanzas/bancos/__tests__/bancos.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/contabilidad/services/periodos.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/finanzas/conciliacion/csv-parser.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/compras/dto/__tests__/dtos.spec.ts
@erp-suite/erp-api:test: PASS src/modules/finanzas/bancos/__tests__/bancos-sobregiro.spec.ts
@erp-suite/erp-api:test: PASS src/modules/finanzas/conciliacion/conciliacion.service.unit.spec.ts
@erp-suite/erp-api:test: PASS src/modules/finanzas/cxp/cxp-event-emission.spec.ts
@erp-suite/erp-api:test: PASS src/modules/compras/repositories/ordenes-compra.repository.spec.ts
@erp-suite/erp-api:test: PASS src/modules/notifications/notifications.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/audit/audit.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/finanzas/bancos/__tests__/bancos-event-emission.spec.ts
@erp-suite/erp-api:test: PASS src/modules/contabilidad/services/estados-financieros.service.spec.ts
@erp-suite/erp-api:test: PASS src/shared/integration/accounting-entries.service.spec.ts
@erp-suite/erp-api:test: PASS src/common/guards/permission.guard.spec.ts
@erp-suite/erp-api:test: PASS src/shared/integration/accounting-books.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/validations/validation.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/import-export/import-export.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/finanzas/shared/retenciones-validation.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/cajas/services/cash-fraud-detection.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/rrhh/rrhh-accounting-integration.service.spec.ts
@erp-suite/erp-api:test: PASS src/shared/jobs/background-jobs.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/retenciones/retenciones.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/cajas/services/cash-shift-changes.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/contabilidad/utils/accounting-formatter.util.spec.ts
@erp-suite/erp-api:test: PASS src/modules/finanzas/cxp/listeners/__tests__/cxp-events.listener.spec.ts
@erp-suite/erp-api:test: PASS src/modules/contabilidad/services/cashflow.service.spec.ts
@erp-suite/erp-api:test: PASS src/common/interceptors/tenant-body.interceptor.spec.ts
@erp-suite/erp-api:test: PASS src/modules/documentos/documentos.service.spec.ts
@erp-suite/erp-api:test: PASS src/common/interceptors/tenant-context.interceptor.spec.ts
@erp-suite/erp-api:test: PASS src/modules/sire/sire.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/dashboard/dashboard-metrics.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/metrics/metrics.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/gre/gre.service.spec.ts
@erp-suite/erp-api:test: PASS src/modules/security/security-dashboard.service.spec.ts
@erp-suite/erp-api:test:
@erp-suite/erp-api:test: Test Suites: 65 passed, 65 total
@erp-suite/erp-api:test: Tests:       749 passed, 749 total
@erp-suite/erp-api:test: Snapshots:   0 total
@erp-suite/erp-api:test: Time:        11.367 s
@erp-suite/erp-api:test: Ran all test suites.

 Tasks:    3 successful, 3 total
Cached:    2 cached, 3 total
  Time:    14.036s
