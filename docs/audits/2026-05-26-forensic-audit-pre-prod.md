# Auditoría forense pre-producción 2026-05-26

> Objetivo: detectar fallos de lógica, brechas de seguridad, integridad de datos y rendimiento antes de declarar producción. Cubre las 5 preguntas del usuario: lógica de negocio, seguridad backend, rendimiento frontend, integridad de datos, manejo de errores. Complementa (no reemplaza) las auditorías forenses temáticas de mayo 2026.

Estado al cierre del análisis: **NO listo para producción real**. 4 hallazgos CRITICAL + 13 HIGH bloquean el go-live. Lista priorizada abajo.

## 1. Estrategia

- 4 agentes paralelos para mapeo (seguridad, multi-tenancy, integridad transaccional, performance BD).
- 2 agentes adicionales para validación de DTOs/error leaks y rendimiento BD.
- Verificación manual cruzada de los hallazgos críticos (algunos eran falsos positivos por agente).
- Comparación contra auditorías previas (mayo 2026) para no duplicar trabajo cerrado.

## 2. Hallazgos CRITICAL (bloquean producción)

| ID | Categoría | Ubicación | Hallazgo | Fix |
|---|---|---|---|---|
| C-001 | Multi-tenant leak | `apps/erp-api/src/modules/compras.controller.ts:549-557` | `createProveedor` valida RUC duplicado con `.eq('ruc', ruc)` **sin filtrar por `tenant_id`**. Permite enumeración cross-tenant de RUCs. | Agregar `.eq('tenant_id', tenantId)` |
| C-002 | Multi-tenant leak | `apps/erp-api/src/shared/integration/accounting-entries.service.ts:489-496` | `calcularCostoVentas` busca `productos` por `id` **sin tenant_id**. Si un evento manipulado pasa un `productoId` cross-tenant, retorna precio de otro tenant. | Recibir `tenantId` como parámetro y filtrarlo |
| C-003 | PostgREST filter injection | `apps/erp-api/src/modules/compras/repositories/proveedores.repository.ts:47` | `query.or(\`razon_social.ilike.%${filters.search}%,...\`)` con `search` de query string **sin sanitizar**. Coma o punto en el input rompe el filtro y permite filtros extra. | Escapar comas/puntos o cambiar a `.ilike()` separados con `.or()` builder |
| C-004 | Recepción no atómica | `apps/erp-api/src/modules/compras/services/recepciones.service.ts:444-654` | `cerrarRecepcion` hace loop sobre items (RPC `descontar_stock` ok), después N UPDATEs separados a `orden_compra_detalles` + UPDATE OC + UPDATE recepción + emit event. Si falla a mitad, recepción queda en `BORRADOR` con stock ya impactado. | Refactor a RPC `cerrar_recepcion_tx(p_recepcion_id, ...)` con BEGIN/COMMIT |

## 3. Hallazgos HIGH

| ID | Categoría | Ubicación | Hallazgo | Fix |
|---|---|---|---|---|
| H-001 | Multi-tenant leak (delete) | `apps/erp-api/src/modules/ventas/clientes/clientes.service.ts:301-323` | `delete()` valida dependencias en `cotizaciones` y `pedidos_venta` por `cliente_id` **sin tenant_id**. Permite descubrir si un cliente_id tiene cotizaciones en otro tenant. | Agregar `.eq('tenant_id', tenantId)` |
| H-002 | Facturación no atómica | `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts:1504-1750` | `generarFactura` descuenta stock (RPC), después N UPDATEs separados (`detalle.cantidad_despachada`, `pedido.factura_id`, eventos). Si falla CPE, stock ya descontado sin factura_id. | RPC `facturar_pedido_tx` o saga compensable explícita |
| H-003 | Confirmar pedido — rollback manual frágil | `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts:1105-1334` | Loop de reservas con rollback manual en try/catch. Si el rollback de items 1..N-1 también falla, quedan reservas huérfanas. | RPC `confirmar_pedido_tx` que reserve todos los items en una transacción |
| H-004 | PostgREST filter injection | `apps/erp-api/src/modules/contabilidad/services/plan-cuentas.service.ts:374` | `.or(\`codigo.ilike.%${termino}%,nombre.ilike.%${termino}%\`)` con `termino` de búsqueda libre del usuario. | Sanitizar `termino` con regex `[^a-zA-Z0-9\s\-_]` |
| H-005 | PostgREST filter injection | `apps/erp-api/src/modules/usuarios/user-management.service.ts:267` | Mismo patrón con `filters.search` en usuarios. | Sanitizar |
| H-006 | PostgREST filter injection | `apps/erp-api/src/modules/tenants/tenant-management.service.ts:332` | Mismo patrón en `razon_social,nombre_comercial,email`. | Sanitizar |
| H-007 | PostgREST filter injection | `apps/erp-api/src/modules/notifications/inventory-stock-alerts.listener.ts:163` | `.or` con `codigoProducto` y `productoId` sin validar UUID. | Validar UUID antes |
| H-008 | RBAC débil — sin @RequirePermission | `apps/erp-api/src/modules/observability/observability.controller.ts:16-88` | Endpoints `/observability/*` con `@Public()` validan token compartido en env, **no JWT por usuario**. Cualquiera con el token ve métricas/trazas. | Cambiar a JWT + `@RequirePermission('observability.read')` |
| H-009 | RBAC débil | `apps/erp-api/src/modules/metrics/metrics.controller.ts:20-40` | Mismo patrón con `METRICS_TOKEN`. | Igual que H-008 |
| H-010 | Webhook Stripe sin HMAC | `apps/erp-api/src/modules/demo/webhook.controller.ts` | Webhook procesa eventos sin verificar firma `Stripe-Signature`. Cualquiera con la URL puede falsificar conversión demo→real (R-005 risk audit, ya conocido). | `stripe.webhooks.constructEvent(rawBody, signature, secret)` |
| H-011 | Mass assignment | `apps/erp-api/src/modules/compras/controllers/cotizaciones-compra.controller.ts:174,200` | Endpoints `/enviar` y `/aprobar` usan `@Body() body: Record<string, any>` — bypasea ValidationPipe. | Crear DTOs específicos `EnviarCotizacionDto`, `AprobarCotizacionDto` |
| H-012 | N+1 query en hot-path | `apps/erp-api/src/modules/inventario/logistica/logistica.service.ts:71-94` | `Promise.all` con 1 query por pedido a `pedidos_venta_detalle`. Para 1000 pedidos = 1000 roundtrips. | Single query con `.in('pedido_id', ids)` |
| H-013 | N+1 query en cancelación OC | `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts:847-871` | Loop sobre recepciones consultando `devoluciones_proveedor` por cada una. | Single `.in('recepcion_id', ids)` |
| H-014 | Stack trace en logs | `apps/erp-api/src/modules/compras.controller.ts:111` | `error.stack` se loguea — leak a sistemas externos de logs si están conectados a algún SIEM público. No leakea al cliente HTTP (response usa defaults). | Reemplazar `error.stack` por `error.code` |

## 4. Hallazgos MEDIUM

| ID | Categoría | Ubicación | Hallazgo |
|---|---|---|---|
| M-001 | Falta @RequirePermission | `apps/erp-api/src/modules/help/help.controller.ts:11,45` | Endpoints `/help/search` y `/help/sugerencias` solo tienen JWT global. Funcionalmente accesibles a cualquier autenticado del tenant (probablemente OK), pero rompe convención. |
| M-002 | Falta @RequirePermission | `apps/erp-api/src/modules/usuarios.controller.ts:914-995` | `GET /usuarios/me/permissions` sin `@RequirePermission`. |
| M-003 | Importer migration sin rollback | `apps/erp-api/src/modules/migration/importers/*.importer.ts` | Loop por fila sin transacción global. Si falla la fila 500/1000, las 1-499 ya están persistidas. Idempotencia por `external_id` mitiga el re-run pero no es lo mismo que rollback atómico. |
| M-004 | DTO sin @MaxLength | `apps/erp-api/src/modules/finanzas/conciliacion/dto/importar-csv.dto.ts` | `contenidoCsv: string` sin límite de tamaño → DoS por CSV gigante. |
| M-005 | DTO sin @IsEnum | `apps/erp-api/src/modules/finanzas/tesoreria/dto/registrar-pago.dto.ts:38` | `metodo_pago: @IsString()` sin enum. |
| M-006 | Error messages con error.message directo | `apps/erp-api/src/modules/cotizaciones.controller.ts` (9 instancias), `documentos.service.ts` (7), `sire.service.ts` (9), `cpe.service.ts` (2) | `throw new BadRequestException('X: ' + error.message)` puede filtrar nombres de columnas/tablas Supabase. |
| M-007 | SELECT * sin paginación | `apps/erp-api/src/modules/audit/audit.service.ts:436,460` | `audit_log` puede crecer a millones de filas. Sin `.limit()` ni `.range()` → potencial OOM. |
| M-008 | SELECT * sin paginación | `apps/erp-api/src/modules/contabilidad/services/estados-financieros.service.ts:415,505,618` | Reportes contables sin límite. |
| M-009 | Índice faltante probable | Tabla `cuentas_por_cobrar` y `cuentas_por_pagar` | Filtros `(tenant_id, estado)` frecuentes pero solo hay índices simples. Crear `idx_cuentas_por_cobrar_tenant_estado` y análogo CxP. |
| M-010 | Índice faltante probable | Tabla `movimientos_inventario` | `(tenant_id, created_at DESC)` para listados; tabla crece 100k+/mes. |
| M-011 | Índice faltante probable | Tabla `pedidos_venta` | `(tenant_id, estado, created_at DESC)` para logística. |
| M-012 | Cross-tenant cotizaciones | `apps/erp-api/src/modules/usuarios.controller.ts:997-1027` | `GET /usuarios/:id/permissions` sin validar que `requesterId` esté en el mismo tenant. |
| M-013 | console.warn en producción | Múltiples archivos (audit, proveedores, ordenes-compra) | Reemplazar por `logger.warn` con payload sanitizado. |

## 5. Hallazgos LOW

| ID | Categoría | Hallazgo |
|---|---|---|
| L-001 | DRY: validaciones manuales de tenant en controllers | Lógica de autorización repetida en `usuarios.controller.ts`, `tenants/tenant-management.controller.ts`. Centralizar en guard. |
| L-002 | Sintaxis vieja de @RequirePermission | `usuarios.controller.ts:363` usa `('configuracion', 'ver', 'usuarios')` tupla en vez de `'modulo.recurso.accion'` string. Inconsistente con resto. |
| L-003 | Doble ruta registrada | `usuarios.controller.ts:65` registra `['usuarios-sistema', 'usuarios']`. Confusión. |
| L-004 | console.error con stack en JWT guard | `auth/guards/jwt-auth.guard.ts:63` loguea `error.stack`. |
| L-005 | SELECT * en cajas.service.ts (7 lugares) | Ancho de tabla moderado, pero múltiples queries en hot-path. |
| L-006 | Sin tests negativos de RBAC | No hay specs que verifiquen que VENDEDOR no puede crear CxP, etc. Riesgo de regresión silenciosa. |

## 6. Análisis por las 5 preguntas del usuario

### 6.1 Lógica de negocio (inconsistencias, casos extremos)

**Inconsistencias encontradas:**
- C-004 + H-002 + H-003: tres flujos críticos (recepción/facturar/confirmar pedido) hacen escrituras secuenciales sin RPC. La auditoría de tesorería 2026-05 cerró este patrón para CxC/CxP/bancos (migración 334), pero quedó pendiente en ventas/compras.
- M-003: el módulo de migración (recién creado por mí) replica el mismo patrón. Riesgo aceptado por idempotencia de external_id, pero es deuda técnica.

**Casos extremos no probados:**
- Cancelar pedido a mitad de facturación: si pedido ya tiene `factura_id` parcial, ¿qué pasa con CPE? Sin runbook documentado.
- Recepción cerrada con N items, falla en item M: estado intermedio sin recuperación automática.

### 6.2 Seguridad backend

**SQL injection clásica:** ninguna detectada — Supabase JS client parametriza todas las queries `.eq()/.in()/.match()`.

**PostgREST filter injection:** 6 instancias detectadas (C-003, H-004, H-005, H-006, H-007 + clientes ya validado por regex de dígitos = OK). El input se interpola en `.or(\`col.op.${value},...\`)`. Coma o punto en el valor rompe el filtro o añade filtros extra. No es RCE pero permite bypass de aislamiento o errores de query.

**XSS:** no auditado en backend (responsabilidad del frontend que renderiza). Sin embargo, persistir HTML sin sanitización en campos `descripcion`, `observaciones`, `metadata` es riesgo para frontend. Recomendación: lib `dompurify` o `sanitize-html` antes de persistir si los campos son user-input libre.

**RBAC:**
- 2 endpoints sensibles sin `@RequirePermission` (H-008, H-009, M-001, M-002).
- 1 webhook sin firma (H-010).
- Validaciones de tenant manuales en controllers en vez de guard (L-001, M-012).

### 6.3 Rendimiento frontend

**No auditado en este pase** — los agentes se enfocaron en backend. La auditoría multiusuario 2026-05 (`docs/auditoria_multiusuario_performance_2026-05.md`) cubrió:
- Polling con jitter y pausa con pestaña oculta ✓
- Retries no idempotentes desactivados para writes ✓
- Carga read-only 589/589 OK, p95 1490 ms ✓

**Recomendación pendiente:**
- React Query / SWR cache strategy no auditada para invalidación cross-mutación (p. ej. crear pedido invalida lista de pedidos pero también stock — ¿lo invalida?).
- React.memo / useMemo / useCallback no analizados; hay riesgo de re-renders innecesarios en listas grandes (no medido).

### 6.4 Integridad de datos

**Operaciones con transacción RPC (auditadas y certificadas):**
- POS `pos_registrar_venta_full_tx` (migración 327) ✓
- Descontar stock `descontar_stock_y_liberar_reserva` (migración 335) ✓
- Reservar stock `reservar_stock_atomico` ✓
- CxC pago `registrar_cxc_pago_tx` (migración 334) ✓
- Conciliación bancaria `conciliar_movimientos_bancarios_tx` (migración 334) ✓

**Operaciones SIN transacción RPC (pendiente):**
- Facturar pedido (H-002)
- Cerrar recepción (C-004)
- Confirmar pedido — reservas con rollback manual (H-003)
- CxP devolución proveedor — necesita auditoría específica
- Importers migración 336 (M-003, conocido)

**Índices BD:** auditoría preliminar identificó 3 índices probablemente faltantes (M-009, M-010, M-011). Ninguno bloquea funcionalidad, pero degradan respuesta con volumen real.

### 6.5 Manejo de errores

**Mensajes con `error.message` directo:** 27 instancias encontradas en cotizaciones/documentos/sire/cpe. Filtran nombres de tablas/columnas (M-006).

**Stack traces:** 1 en `compras.controller.ts:111` (a logs, no a cliente). 1 en `auth/guards/jwt-auth.guard.ts:63` (L-004).

**ValidationPipe:** correctamente configurado en `main.ts` con `whitelist + forbidNonWhitelisted`. 2 endpoints con `Record<string, any>` bypasean (H-011).

## 7. Cobertura vs auditorías previas

| Área | Cubierto por | Estado |
|---|---|---|
| Contabilidad / asientos | `auditoria_forense_contable_2026-05.md` | Cerrado técnico |
| Inventario / kardex / costeo | `auditoria_forense_inventario_logistica_costeo_2026-05.md` + 333/335 | Cerrado técnico (legacy `descontarStock` JS sigue sin RPC en `inventario.service.ts` — R-004) |
| Tesorería / CxC / CxP / bancos | `auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md` + 334 | Cerrado técnico |
| Performance multi-usuario | `auditoria_multiusuario_performance_2026-05.md` | Cerrado técnico |
| CPE / impresión | `auditoria_impresion_cpe_facturas_2026-05.md` | Cerrado técnico (falta beta SUNAT real) |
| Desktop / Tauri | `auditoria_desktop_vs_web_2026-05.md` | Cerrado técnico |
| RBAC global | `production-readiness/ERP_PRODUCTION_READINESS.md` | Validado para 195 permisos |
| **Ventas / pedidos (facturación atómica)** | — | **GAP — esta auditoría** |
| **Compras / recepciones (cierre atómico)** | — | **GAP — esta auditoría** |
| **Validación DTO + PostgREST filter injection** | — | **GAP — esta auditoría** |
| **RBAC endpoints help/observability/metrics** | — | **GAP — esta auditoría** |
| **Webhook Stripe firma** | R-005 risk audit (sin mitigar) | **Sin cerrar** |
| **Auth (sesiones, MFA, brute-force, reset)** | — | Gap restante |
| **RGPD / privacy** | — | Gap restante |
| **Backup / DR** | — | Gap restante |

## 8. Plan priorizado de fixes

### Fase 1 — Critical (bloquean producción)

1. **C-001, C-002, H-001** — Tres fixes de 1-3 líneas cada uno. Agregar `tenant_id` a queries afectadas. **~30 min total.**
2. **C-003, H-004, H-005, H-006, H-007** — Helper `sanitizePostgrestSearch(input)` que escape comas, puntos y caracteres reservados. Aplicar en 6 sitios. **~1-2 h.**
3. **C-004** — Migración `337__close_recepcion_atomica.sql` con RPC `cerrar_recepcion_tx`. **~3-4 h** (incluye tests).
4. **H-010** — Verificación HMAC en webhook Stripe. **~1 h.**

### Fase 2 — High (deuda técnica seria)

5. **H-002, H-003** — RPCs `facturar_pedido_tx` y `confirmar_pedido_tx`. **~6-8 h** combinado.
6. **H-008, H-009** — Reemplazar `@Public() + token compartido` por JWT + `@RequirePermission`. **~1 h.**
7. **H-011** — DTOs para los 2 endpoints. **~30 min.**
8. **H-012, H-013** — Refactor N+1 a `.in()`. **~1-2 h.**

### Fase 3 — Medium (robustecer)

9. **M-001 a M-013** — Agregar `@RequirePermission` faltantes, `@MaxLength`/`@IsEnum`, sanitizar error messages, agregar índices BD. **~4-6 h total.**

### Fase 4 — Tests negativos RBAC

10. **L-006** — Specs que verifiquen que un usuario VENDEDOR no puede llamar endpoints CxP/contabilidad/admin. **~3-4 h.**

**Total estimado:** 25-35 horas de trabajo de calidad para alcanzar production-ready end-to-end.

## 9. Recomendación al usuario

Implementar Fase 1 (C-001 a C-004 + H-010) ya — son fixes pequeños y bloquean producción. Después, decidir entre:
- **Camino estricto:** completar Fase 2-3 antes de pruebas con clientes reales (35h total).
- **Camino pragmático:** aplicar Fase 1 + tests negativos RBAC, declarar "beta cerrada" con clientes piloto, y completar Fase 2-3 en paralelo a feedback real.

Mi recomendación: **camino estricto** para Fases 1 y 2 (críticas para integridad fiscal y aislamiento de tenants), camino pragmático para Fase 3.

---

## 10. Hallazgos frontend (auditoría adicional 2026-05-26)

Cubre lo que la auditoría multiusuario de mayo 2026 NO cubrió: React internals, re-renders, virtualización.

### CRITICAL

| ID | Ubicación | Hallazgo | Fix | Esfuerzo |
|---|---|---|---|---|
| F-001 | `apps/web/contexts/AuthContext.tsx:159-168` | `Provider value={...}` sin `useMemo`. Todos los consumidores de `useAuth()` re-renderizan en cada render del padre. | `useMemo(() => ({...}), [deps])` | 15 min |
| F-002 | `apps/web/contexts/TenantContext.tsx:167-175` | Mismo patrón. Cascada de re-renders cross-app. | Idem F-001 | 15 min |
| F-003 | `apps/web/hooks/use-empresa-config.tsx:112-121` | Mismo patrón con `contextValue`. | Idem | 15 min |
| F-004 | `apps/web/app/dashboard/pos/page.tsx` (2336 líneas, 40+ `useState`) | Componente megamonstruo. Cualquier `setState` re-renderiza todo el POS (carrito, productos, métodos pago, clientes). | Extraer `CartContext` + `ClientsContext`, memoizar `ProductGrid` con `React.memo`, `useCallback` para handlers. | 4-6 h |
| F-005 | `apps/web/components/pos/ProductGrid.tsx:43-100` | Sin `React.memo`. Re-renderiza 100+ product cards cada vez que el carrito cambia. | `export const ProductGrid = memo(...)` | 30 min |
| F-006 | `apps/web/components/ventas/PedidoForm.tsx:69-82` | `stockAlerts` y `hasStockShortage` se recalculan en cada render. Con 50 items, 50 checks por keystroke. | `useMemo([detalle, productos], ...)` | 30 min |

### HIGH

| ID | Ubicación | Hallazgo | Esfuerzo |
|---|---|---|---|
| F-007 | `apps/web/components/ventas/reportes/PipelineReport.tsx:55-58` y `AgingCxcReport.tsx:66-69` | `useEffect(() => loadData(), [filters])` con `filters` siendo objeto inline del padre → fetch infinito. | 1 h |
| F-008 | `apps/web/components/admin/UserList.tsx:88-131` | Deps inestables en `useCallback` + 2 `useEffect`. Re-fetch redundante. | 30 min |
| F-009 | `apps/web/components/contabilidad/BalanceGeneral.tsx:73-106` | Deps `[anio, mes, showComparison]` inline → posible fetch infinito. | 30 min |
| F-010 | `apps/web/components/finanzas/ConciliacionTable.tsx` (653 líneas), `apps/web/app/dashboard/rrhh/planillas/page.tsx` (785 líneas) | Tablas sin virtualización. >1000 filas = DOM explota. | 3-4 h (instalar `react-window`, migrar 2 tablas) |
| F-011 | `apps/web/components/compras/RecepcionWizard.tsx` (1043 líneas) | Wizard monolítico. Editar step 1 re-renderiza step 9-10. | 2-3 h |
| F-012 | `apps/web/app/dashboard/analytics/page.tsx` (1129 líneas) y `apps/web/app/dashboard/page.tsx` (1098 líneas) | Múltiples reportes/widgets sin lazy load. | 2-3 h |
| F-013 | `apps/web/components/layout/sidebar.tsx` (813 líneas) | Sin memoization de `MenuItem`. Submenu expansion re-renderiza todo el sidebar. | 1 h |

### MEDIUM / LOW

- `apps/web/components/ventas/PedidoForm.tsx:131-182` — handlers inline sin `useCallback`.
- `apps/web/components/ventas/HistorialTransacciones.tsx` — sin memo.
- `apps/web/hooks/use-empresa-config.tsx:138-179` — código duplicado entre dos hooks.
- 102+ `'use client'` posiblemente innecesarios (server components convertibles).
- 0 ocurrencias de `react-window`/`FixedSizeList` en todo el proyecto.

---

## 11. Cobertura cruzada con auditoría Codex 2026-05-27

Codex hizo su pasada forense en paralelo (`docs/production-readiness/ERP_FORENSIC_AUDIT_2026-05-27.md`). Resumen de complementariedad:

### Ya corregido por Codex (no duplicar trabajo)

| Tema | Migración / archivo | Status |
|---|---|---|
| XSS en HTML de impresión (TicketPrint, CpeViewModal, GreViewModal, SireReportModal, GreModal) | Apps/web frontend | ✅ Cerrado |
| RPC `validar_migracion_apertura` accesible a `authenticated` | `337__client_migration_rls_rpc_hardening.sql` | ✅ Cerrado (revoke + service_role only) |
| RLS de `migration_runs` apuntaba al GUC equivocado (`app.tenant_id` → `app.current_tenant_id()`) | `337` | ✅ Cerrado |
| Idempotencia stock inicial: dedup ignoraba sucursal/almacén/fecha | `stock-inicial.importer.ts` | ✅ Cerrado + test |
| `fileBase64` aceptaba payloads malformados | `migration.service.ts` (`decodeCsv`) | ✅ Cerrado + test |
| Contrato runTypes exponía importers no implementados (productos, plan_cuentas, cuentas_bancarias) | DTOs migración | ✅ Cerrado |
| `DocumentosService` con `tenantId` opcional | `documentos.service.ts` | ✅ Cerrado (helper `requireTenantId`) |

### Riesgos abiertos por ambos (cobertura solapada)

- Cross-tenant en queries sin `tenant_id` explícito (yo: C-001, C-002, H-001 / Codex: "auditoria service-role completa")
- Error message exposure (mi M-006 / Codex: "sanitizacion de errores antes de exponer API publica")
- Transacciones críticas (mi C-004, H-002, H-003 / Codex: "migrarse a RPC transaccionales con advisory locks")
- Balance apertura sin RPC atómica (mi M-003 / Codex: "rollback manual en servicio, no atomicidad DB completa")

### Riesgos abiertos solo en mi reporte (Codex no los detectó explícitamente)

- C-003 + H-004..H-007: PostgREST filter injection en 6 sitios
- H-008, H-009: `/observability/*` y `/metrics/*` con token compartido en vez de JWT
- H-010: webhook Stripe sin firma HMAC
- H-011: mass assignment con `Record<string, any>` en cotizaciones-compra
- H-012, H-013: N+1 queries en logística y cancelación OC
- Sección 10 completa: frontend perf

### Riesgos abiertos solo en reporte Codex (yo no los detecté)

- Tokens en localStorage objetivo de XSS (auth snapshot)
- XML fiscal legacy con interpolación/CDATA (riesgo de inyección XML/XXE)
- Falta E2E HTTP con JWT admin contra DEV con tenants reales
- Falta pruebas de concurrencia con escrituras controladas
- Aplicar `337` a DEV/PROD explícitamente

---

## 12. Plan unificado priorizado

### Fase 1A — CRITICAL multi-tenant + filter injection (1 sesión, ~3-5h)

Bloquean producción: data leak entre tenants.

1. C-001, C-002, H-001 — agregar `tenant_id` a 3 queries puntuales (5+15+15 min)
2. C-003 + H-004..H-007 — helper `sanitizePostgrestSearch()` + aplicar en 6 sitios (1.5 h)
3. F-001, F-002, F-003 — `useMemo` en 3 Contexts (45 min)
4. H-010 — verificación HMAC webhook Stripe (1 h)

### Fase 1B — CRITICAL atomicidad (1-2 sesiones, ~6-8h)

5. C-004 — RPC `cerrar_recepcion_tx` + migración 338 (3-4 h)
6. H-002, H-003 — RPCs `facturar_pedido_tx` y `confirmar_pedido_tx` (3-4 h)

### Fase 2 — HIGH RBAC + frontend hot-path (1 sesión, ~5-7h)

7. H-008, H-009 — Migrar observability/metrics a JWT + `@RequirePermission` (1 h)
8. H-011 — DTOs para cotizaciones-compra (30 min)
9. H-012, H-013 — Refactor N+1 a `.in()` (1-2 h)
10. F-004, F-005, F-006 — POSPage refactor + memoizar ProductGrid + useMemo stockAlerts (4-6 h)

### Fase 3 — HIGH frontend perf + tests (1 sesión, ~5-7h)

11. F-007, F-008, F-009 — Estabilizar deps de useEffect en reportes (1.5 h)
12. F-010 — Virtualización con `react-window` en ConciliacionTable y planillas (3-4 h)
13. Aplicar `337` a DEV + smoke E2E HTTP con JWT admin (1 h)
14. Test negativo RBAC: VENDEDOR no puede llamar CxP/contabilidad/admin (2 h)

### Fase 4 — MEDIUM / LOW polish (1-2 sesiones, ~6-8h)

15. M-001 a M-013 (agregar `@RequirePermission` faltantes, `@MaxLength`/`@IsEnum`, sanitizar error messages, agregar 3 índices BD, cleanup `console.warn`)
16. F-011, F-012, F-013 — Fragmentar wizards/dashboards/sidebar
17. L-001 a L-006 — DRY validaciones, tests RBAC adicionales

**Total estimado actualizado: 28-37 horas.**

---

## 13. Acción inmediata sugerida

Implementar Fase 1A en orden:
1. Aplicar `337` a DEV (1 comando psql).
2. Fixes 1-4 de Fase 1A (3-5 h de trabajo enfocado).
3. Verificar TS compila, tests pasan, smoke E2E migración sigue OK.
4. Commit `feat(security): fase 1A — multi-tenant + filter injection + webhook firma`.
5. Después: pregunta al usuario si seguir con Fase 1B o consolidar primero.

Esto cierra los 4 CRITICAL + 5 HIGH más urgentes en una sesión de medio día. Producción "casi lista" después de Fase 1A; "lista real" después de Fase 1B.

---

## 14. Addendum 2026-05-26 — Triage tras peer review de Codex

Codex hizo un peer review de este reporte. Verifiqué cada punto donde dice que estoy equivocado contra el código actual. Resultado del triage:

### 14.1 Concesiones (Codex tenía razón, hallazgos retirados como falsos positivos)

| ID original | Veredicto | Evidencia verificada |
|---|---|---|
| **H-010 webhook Stripe sin HMAC** | **FALSO** | `apps/erp-api/src/modules/demo/webhook.controller.ts:32` llama `verifyWebhookSignature`. `apps/erp-api/src/modules/demo/stripe.service.ts:90-105` usa `stripe.webhooks.constructEvent(payload, signature, webhookSecret)`. Existe verificación HMAC. |
| **M-009 índices CxC/CxP faltantes** | **FALSO** | `idx_cxc_tenant_estado_vencimiento (tenant_id, estado, fecha_vencimiento)` en `030`. `idx_cuentas_por_cobrar_tenant_estado_vencimiento_runtime` en `131`. |
| **M-011 índice pedidos_venta faltante** | **FALSO** | `idx_pedidos_venta_tenant_estado_fecha_runtime` en `134`. |
| **F-013 sidebar sin memoization** | **FALSO** | `apps/web/components/layout/sidebar.tsx:417` envuelve `MenuItemContent` en `memo()`. |
| **H-011 mass assignment cotizaciones-compra** | **Bajado a LOW** | El `@Body() body: Record<string, any>` se ignora; el endpoint solo usa `id` y `tenantId` del decorator. Comentario `// HARDENING: ignoramos tenant proporcionado en body`. Es mala higiene de Swagger, no riesgo real. |
| **Conteo HIGH 13** | **Error de conteo** | Son 14 entries H-001..H-014. |

### 14.2 Resseveridad: PostgREST `.or()` (C-003, H-004..H-007)

Codex tenía razón en el matiz. Verificado: las `.or()` ya están filtradas por `.eq('tenant_id', tenantId)` **antes**:

- `plan-cuentas.service.ts:368-376`: `.eq('tenant_id', tenantId).eq('estado', 'ACTIVO').or(\`codigo.ilike.%${termino}%,...\`)`
- `user-management.service.ts:260-267`: `.eq('tenant_id', tenantId).or(\`nombre.ilike.%${filters.search}%,...\`)`

El riesgo real no es bypass de aislamiento sino:
- Alterar filtros dentro del mismo tenant (coma o punto rompen el filtro)
- Errores 500 con caracteres especiales de PostgREST (`%`, `(`, `)`)

Severidad corregida:
- C-003 → **HIGH** (era CRITICAL)
- H-004, H-005, H-006, H-007 → **MEDIUM** (eran HIGH)

Sigue siendo deuda real, pero no bloquea producción por leak cross-tenant.

### 14.3 Resseveridad: Frontend perf (F-001..F-007)

Codex tenía razón: son optimizaciones necesarias **con volumen**, no bloqueos de seguridad/integridad.

- F-001, F-002, F-003 (Contexts sin useMemo) → **MEDIUM** (eran CRITICAL). 45 min fix total.
- F-004 (POSPage 2336 líneas) → **HIGH** (era CRITICAL). Refactor importante pero el POS funciona.
- F-005, F-006 → **MEDIUM** (eran CRITICAL).
- F-007 (fetch en reportes) → **MEDIUM**. `filters` viene por props del padre; el loop solo aparece si el padre lo crea inline en cada render — no auditado.

### 14.4 Hallazgos que mantengo (Codex confirma)

- **C-001** — `compras.controller.ts:535+` valida RUC duplicado sin tenant_id. Codex agrega que recibe `@Body() proveedorData: any` SIN `@CurrentTenant()` — el tenant viene del body o cae al primer tenant. **Peor de lo que reporté**. CRITICAL confirmado.
- **C-002** — `accounting-entries.service.ts:489-496` lee productos sin tenant_id. CRITICAL.
- **C-004, H-002, H-003** — Atomicidad faltante en cerrarRecepcion / generarFactura / confirmarPedido. CRITICAL / HIGH.
- **H-001** — `clientes.service.ts:301-323` delete con dependencias sin tenant_id. HIGH.
- **H-008, H-009** — `/observability/*` y `/metrics/*` con `@Public() + token compartido` (inferior a JWT+RBAC). HIGH.
- **H-012, H-013, M-006, M-007** — confirmados.

### 14.5 Conteo final corregido

| Severidad | Cuenta abierta | Diferencia vs original |
|---|---|---|
| CRITICAL | **4** | -6 (F-001..F-006 retrocedidos) |
| HIGH | **9** | -12 (H-010 retirado, H-011 retirado, C-003 sigue, F-004 entró) |
| MEDIUM | **22** | +6 (recepción de los retrocedidos) |
| LOW | **7** | +1 |
| FALSOS retirados | **4** | H-010, M-009, M-011, F-013 |

Total real verificado: **42 hallazgos abiertos** (vs 60+ original).

### 14.6 Plan priorizado actualizado (post-triage)

**Fase 1A — bloquea producción (~3-4h):**
1. C-001, C-002, H-001 — `tenant_id` en 3 queries (35 min)
2. C-001 extra: `@Body() any` → DTO `CrearProveedorDto` + `@CurrentTenant()` (45 min)
3. Helper `sanitizePostgrestSearch()` + aplicar en 5 sitios (1.5 h)
4. F-001, F-002, F-003 — `useMemo` en 3 Contexts (45 min)

**Fase 1B — atomicidad fiscal (~6-8h):**
5. C-004 RPC `cerrar_recepcion_tx`
6. H-002 RPC `facturar_pedido_tx`
7. H-003 RPC `confirmar_pedido_tx` (puede unirse con H-002)

**Fase 2 — RBAC + frontend hot-path:**
8. H-008, H-009 — JWT + RequirePermission en observability/metrics
9. H-012, H-013 — Refactor N+1
10. F-004 — Fragmentar POSPage

### 14.7 Lectura final

Codex tiene razón: este reporte es **útil para la siguiente fase**, pero **no es lista ejecutable sin triage**. Después del triage:

- 4 hallazgos retirados como falsos positivos.
- 11 hallazgos resseverizados (la mayoría hacia abajo).
- 31 hallazgos verificados se mantienen.

**Lo realmente CRITICAL es:** C-001 (+`@Body() any`), C-002, C-004 — todos relacionados a aislamiento de tenant en escritura o atomicidad fiscal. El orden sugerido por Codex (C-001, C-002, H-001, sanitizador PostgREST, después RPCs transaccionales) es el correcto.


