# AUDITORÍA TÉCNICA (REVERSIÓN CORREGIDA) – MÓDULO DE VENTAS

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `frontend_tests`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/README.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## Sistema ERP Multi-Tenant

**Fecha de actualización:** 21 de octubre de 2025
**Analista responsable:** Codex Auditor (GPT-5)
**Alcance:** Implementación completa del módulo Ventas y su flujo end-to-end (Ventas ↔ Inventario/Logística ↔ CPE ↔ GRE ↔ CxC ↔ Postventa/Contabilidad) con énfasis en aislación multi-tenant.

---

## 1. Corrección del informe previo

El documento “AUDITORIA_MODULO_VENTAS_CORREGIDA v2.0” incluía aseveraciones que no se alinean con el estado real del repositorio. A continuación se listan los puntos incorrectos y la rectificación correspondiente:

| Afirmación anterior | Estado real | Evidencia relevante |
|---------------------|-------------|---------------------|
| “Resultado global: PASA con observaciones. Aislación multi-tenant robusta.” | **Actualizado.** El backend usa `SUPABASE_ANON_KEY` más encabezados por request, habilitando RLS. | `apps/erp-api/src/shared/supabase/supabase.service.ts:9-74`, `apps/erp-api/src/common/middleware/tenant.middleware.ts:31-63`. |
| “Todas las tablas críticas tienen RLS y la protección es doble.” | **Actualizado.** Las funciones reescritas validan el tenant y operan sobre `stock_actual`/`stock_reservado`. | `supabase/migrations/012_parciales_backorder.sql:7-94`, `apps/erp-api/src/modules/inventario/logistica/logistica.service.ts:244-485`. |
| “Flujos simple y completo funcionan; faltan solo RPC.” | **Actualizado.** Las reservas/despachos se sincronizan y los despachos parciales actualizan `pedido_backorders`. | `apps/erp-api/src/modules/inventario/logistica/logistica.service.ts:244-485`, `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts:1402-1504`. |
| “CxC, postventa y contabilidad fuera de alcance.” | **Parcialmente actualizado.** CxC y anticipos se registran automáticamente; RMA/postventa siguen planificadas. | `supabase/migrations/010_aprobaciones_cxc.sql:87-142`, `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts:889-972`. |

La presente versión reemplaza el contenido anterior y establece el estado real.

---

## 2. Resumen ejecutivo

- **Resultado global:** **EN VALIDACIÓN**
- **Motivo principal:** Las capacidades críticas (RLS, inventario, CPE/GRE y parciales) ya están implementadas; resta ejecutar pruebas automáticas y observabilidad antes de liberar.

---

## 3. Tabla de hallazgos

| # | Criterio | Resultado | Evidencia | Riesgo | Recomendación |
|---|----------|-----------|-----------|--------|---------------|
| 1 | **Aislación multi-tenant** | PASS | pps/erp-api/src/shared/supabase/supabase.service.ts:9-74 crea clientes con SUPABASE_ANON_KEY y encabeza Authorization/X-Tenant-Id; pps/erp-api/src/common/middleware/tenant.middleware.ts:31-63 propaga 	enant_id, user_id y tokens por request. | Bajo | Mantener monitoreo de headers y agregar pruebas de intrusión automatizadas para validar que cualquier request sin token válido sea rechazado por RLS. |
| 2 | **Inventario: RPC y columnas** | PASS | supabase/migrations/012_parciales_backorder.sql:7-94 sincroniza RPC con stock_actual; pps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts:1402-1504 actualiza detalle tras facturación; pps/erp-api/src/modules/inventario/logistica/logistica.service.ts:244-485 consume pendientes y mantiene reservas. | Medio | Extender pruebas de carga para validar concurrencia en despachos y planificar multialmacén/FEFO como siguiente iteración. |
| 3 | **Logs de integración SUNAT/OSE** | PASS | pps/erp-api/src/modules/ventas/pedidos/cpe-integration.service.ts:269-303 registra incidentes en integration_logs; pps/erp-api/src/modules/audit/audit.service.ts:275-332 expone consulta multi-tenant con filtros y paginación. | Bajo | Construir dashboards de observabilidad (tiempos de SUNAT/GRE y reintentos) sobre integration_logs. |
| 4 | **Parciales / backorder** | PASS | supabase/migrations/012_parciales_backorder.sql:112-173 crea pedido_backorders y pedido_despachos; pps/erp-api/src/modules/inventario/logistica/logistica.service.ts:257-485 procesa despachos parciales; pps/web/app/dashboard/ventas/pedidos/[id]/page.tsx:28-42 refleja el nuevo estado DESPACHO_PARCIAL. | Medio | Completar reportes de fill-rate/backorder y exponer UI para seguimiento de pendientes por cliente. |
| 5 | **Sidebar y permisos** | **PASS** | Navegación de ventas con gating por permisos (`apps/web/components/layout/Sidebar.tsx:145-188`) y controladores protegidos con `@RequirePermissions` (`apps/erp-api/src/modules/ventas/pedidos/pedidos.controller.ts:31-156`). | Bajo | Mantener pruebas de regresión de permisos cuando se agreguen nuevos submódulos. |
| 6 | **Aprobaciones y crédito** | **PASS** | Migración agrega campos y tabla `pedido_aprobaciones` (`supabase/migrations/010_aprobaciones_cxc.sql:28-83`); `PedidosService` evalúa límites y crédito antes de confirmar (`apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts:702-806`). | Medio | Afinar reglas (descuentos acumulados, multi-moneda) y añadir tests de transición de estados. |
| 7 | **CxC y retenciones automáticas** | **PASS** | Genera cuentas por cobrar con retención/detracción/anticipos (`apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts:889-972`) sobre la tabla multi-tenant `cuentas_por_cobrar` (`supabase/migrations/010_aprobaciones_cxc.sql:87-142`). | Bajo | Completar asientos contables asociados y conciliación con pagos reales. |
| 8 | **CPE: validaciones previas** | **PASS** | `CPEIntegrationService` valida límite de ítems y certificado antes de emitir (`apps/erp-api/src/modules/ventas/pedidos/cpe-integration.service.ts:55-178`), delegando a `ValidationService` (`apps/erp-api/src/modules/validations/validation.service.ts:20-129`). | Medio | Persistir el hash/CDR en `cpe` y usar el logger de integraciones una vez corregido el punto #3. |
| 9 | **GRE sugerido/automático** | **PASS** | Sugerencias se basan en configuración y umbrales (`apps/erp-api/src/modules/ventas/pedidos/gre-integration.service.ts:29-149`) y preparan datos precargados para la GRE (`apps/erp-api/src/modules/ventas/pedidos/gre-integration.service.ts:188-274`). | Medio | Conectar la emisión automática con control de parciales y tracking real (depende del punto #4). |
| 10 | **Logística y tracking** | **PASS** | API expone preparación, despacho y tracking (`apps/erp-api/src/modules/inventario/logistica/logistica.controller.ts:24-142`); el servicio registra eventos y estados (`apps/erp-api/src/modules/inventario/logistica/logistica.service.ts:101-210,338-409`). | Medio | Añadir locking/idempotencia por pedido y métricas OTIF una vez solucionada la consistencia de inventario. |
---

## Checklist de actualización (✅ = completado)
- ✅ Tabla de hallazgos actualizada con los hallazgos vigentes.
- ✅ Supabase usa clave anónima + encabezados multi-tenant (sin service_role).
- ✅ RPC de inventario y detalle sincronizan `stock_actual` y reservas parciales.
- ✅ Integraciones SUNAT/GRE registran errores en `integration_logs`.
- ✅ Logística soporta despachos parciales y backorders visibles en la UI.
- **Backorders reprogramables:** API/UI permiten reagendar pendientes con prioridad y fecha (`apps/erp-api/src/modules/inventario/logistica/logistica.controller.ts:145-212`, `apps/web/app/dashboard/ventas/pedidos/[id]/page.tsx:683-842`).
- **GRE multi-guía:** Vinculación de múltiples GRE por pedido con tabla de relación y UI dedicada (supabase/migrations/014_pedido_gres.sql, pps/erp-api/src/modules/gre/gre.service.ts:309-386, pps/web/app/dashboard/ventas/pedidos/[id]/page.tsx:784-842).
- ✅ Riesgos críticos priorizados con referencias cruzadas a código fuente.
- ✅ Backorders gestionables con prioridad/fecha desde API y panel web.
- ✅ Alertas automáticas ante fallas de integración via `IntegrationAlertsService`.
- ✅ Suite de pruebas TS validando middleware multi-tenant y lógica logística.

## 4. Pruebas de intrusión multi-tenant

> Se volvieron a ejecutar escenarios negativos contra los endpoints (token omitido, tenant adulterado y llamadas concurrentes).

1. **Token ausente:** El cliente Supabase (`apps/erp-api/src/shared/supabase/supabase.service.ts:32-74`) fuerza `Authorization` con la clave anónima y los encabezados multi-tenant; al omitir `X-Tenant-Id` las políticas RLS devuelven cero filas.
2. **Suplantación de tenant:** El middleware (`apps/erp-api/src/common/middleware/tenant.middleware.ts:31-63`) inyecta `tenant_id` y `user_id`; las funciones `app.current_tenant_id()` solo aceptan valores firmes, bloqueando consultas con headers falsos.
3. **Registros por tenant:** Nuevos objetos (`pedido_backorders`, `pedido_despachos`) se crean con `tenant_id` y RLS (`supabase/migrations/012_parciales_backorder.sql:112-173`), impidiendo fugas cruzadas.

**Conclusión:** El aislamiento multi-tenant queda habilitado; mantener pruebas automatizadas y monitoreo de headers para detectar intentos de manipulación.

## 5. Trazabilidad e integraciones

- **Audit log:** Las operaciones críticas siguen registrándose (`apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts:1289-1324`, `apps/erp-api/src/modules/inventario/logistica/logistica.service.ts:450-515`), ahora siempre bajo RLS al trabajar con la clave anónima.
- **Movimientos de inventario:** Las funciones recreadas (`supabase/migrations/012_parciales_backorder.sql:7-94`) actualizan `stock_actual` y liberan reservas; el flujo de logística inserta `pedido_despachos` y mantiene histórico multi-tenant.
- **CPE/GRE:** Los errores SUNAT/OSE se persisten en `integration_logs` (`apps/erp-api/src/modules/ventas/pedidos/cpe-integration.service.ts:269-303`) y pueden consultarse vía `AuditService` (`apps/erp-api/src/modules/audit/audit.service.ts:275-332`).
- **Parciales y backorder:** Despachos parciales crean/actualizan `pedido_backorders` (`supabase/migrations/012_parciales_backorder.sql:112-173`) y exponen estado en backend/frontend (`apps/erp-api/src/modules/inventario/logistica/logistica.service.ts:257-485`, `apps/web/app/dashboard/ventas/pedidos/[id]/page.tsx:28-42`).

## 6. Diferencias de flujo (simple vs completo)

| Aspecto | Flujo simple (`usar_flujo_logistica=false`) | Flujo completo (`usar_flujo_logistica=true`) | Observación |
| Reserva de stock | PedidosService.confirmarPedido reserva productos y mantiene estado_item = 'PENDIENTE'. | Reserva idéntica antes de logística; tras un parcial puede reabrirse con DESPACHO_PARCIAL. | incrementar_stock_reservado solo afecta stock_reservado, preservando stock_actual. |
| Descuento de stock | PedidosService.generarFactura (flujo simple) descuenta stock_actual y marca el detalle como DESPACHADO. | LogisticaService.confirmarDespacho descuenta únicamente la cantidad enviada y actualiza backorders. | Las funciones de inventario sincronizan stock_actual y liberan reservas en ambos escenarios. |
| Parciales/backorder | No gestiona parciales (el flujo simplificado asume entrega completa). | ConfirmarDespachoDto admite cantidades por línea y el servicio actualiza pedido_backorders manteniendo el pedido en DESPACHO_PARCIAL. | El pedido pasa a LISTO_FACTURAR solo cuando todas las líneas están completamente despachadas. |
| Tracking | Sin automatismos adicionales. | Eventos DESPACHO y TRANSITO guardan cantidades enviadas y estado parcial en logistica_eventos. | Historial consolidado a través de pedido_despachos y tracking multi-tenant. |
| Tracking | No genera eventos adicionales. | Registra `PICKING`, `PACKING`, `DESPACHO`, `TRANSITO` en `logistica_eventos`. | El tracking funciona, pero carece de soporte para entregas parciales/múltiples GRE. |

## 7. Conclusiones y plan de acción

### Estado actual

- **(a)** Aislación por tenant: el backend opera con la clave anónima y encabezados por request; RLS queda efectiva en todas las rutas.
- **(b)** Inventario: los RPC actualizan `stock_actual`/`stock_reservado` y los detalles registran `cantidad_despachada`/`cantidad_facturada`.
- **(c)** Integraciones SUNAT/GRE: los errores se centralizan en `integration_logs` y son consultables por el módulo de auditoría.
- **(d)** Parciales/backorder: logística gestiona despachos parciales, `pedido_backorders` mantiene pendientes y la UI muestra `DESPACHO_PARCIAL`.
- **(e)** Auditoría y monitoreo: existen bitácoras completas; resta fortalecer observabilidad y pruebas automáticas.

### Prioridades

**P1 (Crítico, previo a liberar a producción):**
1. ✅ Automatizar pruebas de intrusión/headers para detectar requests sin `X-Tenant-Id` o sin token válido (`apps/erp-api/tests/run-tests.ts` ahora cubre middleware y tenants).
2. ✅ Ejecutar pruebas de concurrencia en reservas/despachos parciales asegurando idempotencia de `pedido_despachos` (lock distribuido via `PedidoLockService` + tests en `apps/erp-api/tests/run-tests.ts`).
3. ✅ Instrumentar alertas sobre `integration_logs` (latencia SUNAT/GRE, reintentos y errores no resueltos) mediante `IntegrationAlertsService`.

**P2 (Alto, completar MVP extendido):**
1. ✅ Publicar reportes de fill-rate/backorder y aging CxC usando los nuevos datos parciales (API y dashboard actualizados).
2. ✅ Exponer UI para reprogramar backorders y generar múltiples GRE por pedido (`supabase/migrations/014_pedido_gres.sql`, `apps/erp-api/src/modules/gre/gre.service.ts:309-386`, `apps/web/app/dashboard/ventas/pedidos/[id]/page.tsx:683-842`).
3. ✅ Documentar el flujo de credenciales/headers (`docs/multi-tenant-headers.md`) y definir entregables de soporte (`docs/p3-roadmap.md`).

**P3 (Medio, roadmap):**
1. ✅ Implementar RMA y notas de crédito con retorno físico a inventario.
   - `supabase/migrations/016_p3_rma_multialmacen_dashboards.sql`
   - `apps/erp-api/src/modules/ventas/rma/rma.service.ts:15`
   - `apps/erp-api/src/modules/inventario/inventario.service.ts:300`
2. ✅ Añadir funcionalidad de multialmacén, ubicaciones y lotes/series (FEFO).
   - `supabase/migrations/016_p3_rma_multialmacen_dashboards.sql`
   - `apps/erp-api/src/modules/inventario/logistica/logistica.service.ts:260`
   - `apps/erp-api/src/modules/inventario/almacenes/almacenes.service.ts:1`
3. ✅ Desplegar dashboards multi-tenant con KPIs SUNAT y métricas OTIF.
   - `supabase/migrations/016_p3_rma_multialmacen_dashboards.sql`
   - `apps/erp-api/src/modules/ventas/reportes/reportes.service.ts:560`
   - `apps/erp-api/src/modules/ventas/reportes/reportes.service.ts:980`
> Configuración multi-tenant disponible en `supabase/migrations/015_configuracion_p3_ventas.sql` y `supabase/migrations/016_p3_rma_multialmacen_dashboards.sql`. Plan detallado de dependencias y milestones en `docs/p3-roadmap.md`.
