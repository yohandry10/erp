# ERRORES Y RIESGOS CRÍTICOS IDENTIFICADOS EN AUDITORÍA ERP

**Fecha:** 2025-01-XX  
**Prioridad:** 🔴 CRÍTICO | 🟠 ALTO | 🟡 MEDIO | 🟢 BAJO

---

## 🔴 RIESGOS CRÍTICOS (BLOQUEADORES PARA PRODUCCIÓN)

### 1. EVENT BUS IN-MEMORY SIN PERSISTENCIA

**Ubicación:** `apps/erp-api/src/shared/events/event-bus.service.ts`

**Problema:**
- El event bus es in-memory. Si el servicio se reinicia, eventos perdidos no se procesan.
- No hay persistencia de eventos. Si listener falla, evento se pierde.

**Impacto:**
- Asientos contables pueden no generarse si el listener falla.
- Cuentas por cobrar pueden no crearse si el listener de CxC falla.
- Eventos de auditoría pueden perderse.

**Solución requerida:**
- Implementar outbox pattern para persistir eventos antes de procesarlos.
- Implementar reintentos automáticos para eventos fallidos.
- Considerar usar un message broker (RabbitMQ, Redis Streams, etc.).

**Módulos afectados:**
- Contabilidad (asientos automáticos)
- CxC (creación automática desde facturas)
- CxP (creación automática desde recepciones)
- RRHH (asientos de nómina)

---

### 2. FALTA DE OUTBOX PATTERN PARA EVENTOS CONTABLES

**Ubicación:** `apps/erp-api/src/shared/integration/accounting-entries.service.ts`

**Problema:**
- `AccountingEntriesService.procesarAsientoVenta()` no tiene outbox pattern.
- Si el listener falla, no hay reintento ni garantía de entrega.

**Impacto:**
- Asientos contables pueden no generarse si hay error en el listener.
- No hay trazabilidad de eventos perdidos.
- Contabilidad puede quedar desincronizada.

**Solución requerida:**
- Implementar tabla `outbox_events` para persistir eventos antes de procesarlos.
- Implementar worker que procese eventos pendientes de la tabla outbox.
- Implementar reintentos con backoff exponencial.

**Archivos afectados:**
- `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts` (líneas 880-922): Emisión de evento `VentaProcessedEvent`
- `apps/erp-api/src/shared/integration/accounting-entries.service.ts` (líneas 97-102): Listener de evento `onVentaProcessed`

---

### 3. EVENTOS CONTABLES NO SE DISPARAN CONSISTENTEMENTE

**Ubicación:** Múltiples módulos

**Problema:**
- Evento `VentaProcessedEvent` solo se emite cuando se genera factura, pero no en todos los flujos de venta.
- Evento `CompraProcessedEvent` no se emite consistentemente cuando se cierra recepción.

**Impacto:**
- Asientos contables pueden no generarse en algunos flujos.
- Contabilidad puede quedar incompleta.

**Solución requerida:**
- Asegurar que TODOS los flujos de venta emitan evento `VentaProcessedEvent`.
- Asegurar que cierre de recepción emita evento `CompraProcessedEvent`.
- Agregar validación de que el asiento se haya creado correctamente antes de continuar.

**Flujos afectados:**
- Ventas sin facturación inmediata
- Recepciones de compras

---

### 4. CACHE DE PERMISOS NO SE INVALIDA AL MODIFICAR PERMISOS DE ROL

**Ubicación:** `apps/erp-api/src/modules/permissions/role.service.ts`

**Problema:**
- Cuando se modifican permisos de un rol, el cache de permisos de usuarios con ese rol no se invalida.
- Usuarios con ese rol pueden seguir usando permisos antiguos hasta que expire cache (5 min).

**Impacto:**
- Cambios de permisos no se reflejan inmediatamente.
- Riesgo de seguridad: usuarios pueden mantener permisos revocados temporalmente.

**Solución requerida:**
- Invalidar cache de permisos de usuarios cuando se modifican permisos de un rol:
  ```typescript
  // En RoleService.assignPermissionToRole() y revokePermissionFromRole()
  const usuariosConRol = await this.getUsuariosConRol(roleId);
  usuariosConRol.forEach(userId => {
    this.permissionService.invalidateUserPermissions(userId);
  });
  ```

---

## 🟠 RIESGOS ALTOS (REQUIEREN ATENCIÓN INMEDIATA)

### 5. FALTA VALIDACIÓN DE MONEDA ENTRE CUENTA BANCARIA Y CxP/CxC

**Ubicación:** 
- `apps/erp-api/src/modules/finanzas/cxc/cxc.service.ts`
- `apps/erp-api/src/modules/finanzas/tesoreria/tesoreria.service.ts`

**Problema:**
- No hay validación de moneda entre cuenta bancaria y CxP/CxC antes de crear movimiento bancario.
- Puede crear movimientos bancarios con moneda incorrecta.

**Impacto:**
- Saldos bancarios pueden quedar incorrectos.
- Conciliación bancaria puede fallar.

**Solución requerida:**
- Validar que moneda de cuenta bancaria coincida con moneda de CxP/CxC antes de crear movimiento.
- Lanzar error si monedas no coinciden.

---

### 6. EVENTO VENTAPROCESSED SE EMITE SOLO EN ALGUNOS FLUJOS

**Ubicación:** `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts`

**Problema:**
- Evento `VentaProcessedEvent` solo se emite cuando se genera factura, pero no en todos los flujos de venta.
- Ventas sin facturación inmediata no generan asientos contables.

**Impacto:**
- Contabilidad incompleta para ventas sin facturación inmediata.

**Solución requerida:**
- Emitir evento `VentaProcessedEvent` en TODOS los flujos de venta, no solo cuando se genera factura.
- Considerar emitir evento cuando se confirma pedido si no se requiere facturación.

---

### 7. ANULACIÓN DE CPE NO REVIERTE AUTOMÁTICAMENTE ASIENTOS CONTABLES

**Ubicación:** `apps/erp-api/src/modules/cpe/cpe.service.ts`

**Problema:**
- `CpeService.anularComprobante()` genera nota de crédito pero no revierte automáticamente asientos contables.

**Impacto:**
- Contabilidad puede quedar desincronizada después de anular CPE.

**Solución requerida:**
- Emitir evento `CpeAnuladoEvent` que escuche contabilidad para revertir asientos.
- O llamar directamente a servicio de contabilidad para revertir asientos.

---

### 8. NO HAY VALIDACIÓN DE QUE ASIENTO CONTABLE SE HAYA CREADO CORRECTAMENTE

**Ubicación:** Múltiples módulos que emiten eventos contables

**Problema:**
- No hay validación de que el asiento se haya creado correctamente antes de continuar.
- Si falla creación de asiento, la operación continúa sin saberlo.

**Impacto:**
- Contabilidad puede quedar desincronizada sin que se detecte.

**Solución requerida:**
- Implementar validación síncrona de creación de asientos para operaciones críticas.
- O implementar outbox pattern con confirmación de procesamiento.

---

## 🟡 RIESGOS MEDIOS (REQUIEREN ATENCIÓN PRONTA)

### 9. SI FALLA COMUNICACIÓN CON SUNAT, NO HAY REINTENTO AUTOMÁTICO

**Ubicación:**
- `apps/erp-api/src/modules/ose/ose.service.ts`
- `apps/erp-api/src/modules/cpe/cpe.service.ts`
- `apps/erp-api/src/modules/gre/gre.service.ts`

**Problema:**
- Si SUNAT no responde, no hay reintento automático.
- No hay cola de reintentos para comprobantes rechazados.

**Impacto:**
- Comprobantes pueden quedar en estado pendiente indefinidamente.
- Requiere intervención manual para reintentar.

**Solución requerida:**
- Implementar cola de reintentos con backoff exponencial.
- Implementar alertas cuando hay comprobantes pendientes por mucho tiempo.

---

### 10. NO HAY FRONTEND PARA VISUALIZAR LOGS DE AUDITORÍA

**Ubicación:** `apps/web/components/`

**Problema:**
- No hay pantalla de auditoría en el frontend para visualizar logs.
- Los logs solo se pueden consultar vía API.

**Impacto:**
- Dificulta auditoría y debugging.
- Usuarios no pueden ver historial de cambios fácilmente.

**Solución requerida:**
- Crear componente `AuditLogsViewer.tsx` en `apps/web/components/admin/`.
- Implementar tabla con filtros (tabla, operación, usuario, fecha, etc.).
- **NOTA IMPORTANTE:** Usar CSS inline, NO Tailwind ni shadcn. Revisar `apps/web/app/globals.css` para clases CSS disponibles (`.dashboard-container`, `.activity-card`, `.refresh-btn`, etc.).

---

### 11. NO HAY VALIDACIÓN DE QUE TENANT TENGA AL MENOS UN ADMIN ANTES DE DESACTIVAR

**Ubicación:** `apps/erp-api/src/modules/tenants/tenant-management.service.ts`

**Problema:**
- Si se desactiva un tenant sin admins, no se puede reactivar fácilmente.

**Impacto:**
- Tenant puede quedar sin acceso administrativo.

**Solución requerida:**
- Validar que el tenant tenga al menos un admin antes de desactivar.
- Lanzar error si intenta desactivar sin admins.

---

### 12. SI FALLA GENERACIÓN DE CPE EN POS, VENTA PUEDE QUEDAR SIN FACTURAR

**Ubicación:** `apps/erp-api/src/modules/pos/pos.service.ts`

**Problema:**
- Si falla generación de CPE durante venta POS, venta puede quedar sin facturar.

**Impacto:**
- Ventas POS pueden quedar sin facturación.

**Solución requerida:**
- Implementar cola de reintentos para facturación POS.
- O permitir facturación posterior de ventas POS.

---

### 13. NO HAY VALIDACIÓN DE PERMISOS EN NIVEL DE COMPONENTE PARA ALGUNAS ACCIONES CRÍTICAS

**Ubicación:** `apps/web/components/`

**Problema:**
- No hay validación de permisos en nivel de componente para algunas acciones críticas.
- Solo se valida en backend, pero frontend puede mostrar botones que no debería.

**Impacto:**
- UX confusa: usuarios ven botones que no pueden usar.

**Solución requerida:**
- Usar `PermissionGate` en todos los componentes con acciones críticas.
- Verificar permisos antes de mostrar botones de acción.
- **NOTA IMPORTANTE:** Usar CSS inline, NO Tailwind ni shadcn. Revisar `apps/web/app/globals.css` para clases CSS disponibles. Mantener estilos consistentes con el resto de la aplicación.

---

### 14. NO HAY VALIDACIÓN DE QUE STOCK SE HAYA ACTUALIZADO CORRECTAMENTE ANTES DE CONTINUAR

**Ubicación:** `apps/erp-api/src/modules/compras/services/recepciones.service.ts`

**Problema:**
- No hay validación de que el stock se haya actualizado correctamente antes de continuar.

**Impacto:**
- Stock puede quedar incorrecto sin que se detecte.

**Solución requerida:**
- Validar que movimientos de inventario se hayan registrado correctamente.
- Implementar transacciones atómicas para recepciones + inventario.

---

## 🟢 RIESGOS BAJOS (MEJORAS RECOMENDADAS)

### 15. NO HAY ROTACIÓN AUTOMÁTICA DE LOGS

**Ubicación:** `supabase/migrations/` (tabla `audit_log`)

**Problema:**
- La tabla `audit_log` puede crecer indefinidamente.
- No hay rotación automática de logs antiguos.

**Impacto:**
- Base de datos puede crecer mucho.
- Consultas de auditoría pueden ser lentas.

**Solución requerida:**
- Implementar job que mueva logs > 1 año a tabla de archivo.
- O implementar particionamiento de tabla por fecha.

---

### 16. NO HAY ALERTAS AUTOMÁTICAS CUANDO STOCK BAJA DE UMBRAL MÍNIMO

**Ubicación:** `apps/erp-api/src/modules/inventario/inventario.service.ts`

**Problema:**
- No hay alertas automáticas cuando stock baja de umbral mínimo.

**Impacto:**
- No se detecta stock bajo automáticamente.

**Solución requerida:**
- Implementar job que verifique stock vs umbral mínimo y genere alertas.
- Integrar con módulo de notificaciones.

---

### 17. NO HAY VALIDACIÓN DE QUE RETENCIONES SE APLIQUEN CORRECTAMENTE ANTES DE CREAR CxC/CxP

**Ubicación:** 
- `apps/erp-api/src/modules/finanzas/cxc/cxc.service.ts`
- `apps/erp-api/src/modules/finanzas/cxp/cxp.service.ts`

**Problema:**
- No hay validación de que retenciones se apliquen correctamente antes de crear CxC/CxP.

**Impacto:**
- CxC/CxP pueden tener retenciones incorrectas.

**Solución requerida:**
- Validar cálculo de retenciones antes de crear CxC/CxP.
- Agregar tests unitarios de cálculo de retenciones.

---

### 18. NO HAY CACHE DE MÉTRICAS, PUEDE SER LENTO CON GRANDES VOLÚMENES

**Ubicación:** `apps/erp-api/src/modules/dashboard/`

**Problema:**
- No hay cache de métricas, puede ser lento con grandes volúmenes.

**Impacto:**
- Dashboards pueden ser lentos.

**Solución requerida:**
- Implementar cache de métricas con TTL de 5-15 minutos.
- Usar vistas materializadas para métricas complejas.

---

### 19. SI FALLA SERVICIO DE EMAIL, NOTIFICACIONES SE PIERDEN

**Ubicación:** `apps/erp-api/src/modules/notifications/notifications.service.ts`

**Problema:**
- Si falla servicio de email, notificaciones se pierden (no hay cola de reintentos).

**Impacto:**
- Notificaciones importantes pueden no enviarse.

**Solución requerida:**
- Implementar cola de reintentos para notificaciones.
- O integrar con outbox pattern.

---

### 20. NO HAY ÍNDICES EXPLÍCITOS EN ALGUNAS COLUMNAS FRECUENTEMENTE CONSULTADAS

**Ubicación:** `supabase/migrations/`

**Problema:**
- No hay índices explícitos en algunas columnas frecuentemente consultadas (tenant_id, created_at).

**Impacto:**
- Consultas pueden ser lentas con grandes volúmenes.

**Solución requerida:**
- Agregar índices en `tenant_id` para todas las tablas principales.
- Agregar índices compuestos en `(tenant_id, created_at)` para queries comunes.

---

### 21. NO HAY PARTICIONAMIENTO DE TABLAS GRANDES

**Ubicación:** `supabase/migrations/` (tablas `audit_log`, `integration_logs`)

**Problema:**
- No hay particionamiento de tablas grandes (audit_log, integration_logs).

**Impacto:**
- Tablas pueden crecer mucho y ser lentas.

**Solución requerida:**
- Implementar particionamiento por fecha para `audit_log` e `integration_logs`.
- O implementar archivo automático de logs antiguos.

---

### 22. NO HAY TESTS UNITARIOS PARA MUCHOS MÓDULOS

**Ubicación:** Varios módulos

**Problema:**
- No hay tests unitarios para muchos módulos críticos.

**Módulos sin tests:**
- `TenantManagementService`
- `PermissionService` (parcial)
- `AuditService`
- `CxcService` (parcial)
- `CxpService` (parcial)
- `RecepcionesService`
- `AccountingEntriesService`

**Impacto:**
- Dificulta refactorización segura.
- No se detectan regresiones fácilmente.

**Solución requerida:**
- Agregar tests unitarios para módulos críticos.
- Agregar tests E2E para flujos críticos.

---

### 23. NO HAY MANEJO DE ERRORES CONSISTENTE EN TODOS LOS COMPONENTES

**Ubicación:** `apps/web/components/`

**Problema:**
- No hay manejo de errores consistente en todos los componentes.

**Impacto:**
- Errores pueden no mostrarse al usuario.
- UX inconsistente.

**Solución requerida:**
- Implementar error boundary global.
- Estandarizar manejo de errores en componentes.
- **NOTA IMPORTANTE:** Usar CSS inline, NO Tailwind ni shadcn. Revisar `apps/web/app/globals.css` para clases CSS disponibles. Usar estilos consistentes con el resto de la aplicación.

---

### 24. NO HAY LÍMITE DE TENANTS POR SUPER-ADMIN

**Ubicación:** `apps/erp-api/src/modules/tenants/tenant-management.service.ts`

**Problema:**
- No hay límite de tenants por super-admin.

**Impacto:**
- Puede generar costos inesperados si aplica modelo de licencia.

**Solución requerida:**
- Considerar límites de licencia si aplica.
- O documentar claramente política de límites.

---

## 📊 RESUMEN POR PRIORIDAD

**🔴 CRÍTICOS:** 4  
**🟠 ALTOS:** 4  
**🟡 MEDIOS:** 6  
**🟢 BAJOS:** 10  

**TOTAL:** 24 problemas identificados

---

## 🎯 RECOMENDACIONES PRIORITARIAS

### ANTES DE PRODUCCIÓN (BLOQUEADORES):

1. ✅ Implementar outbox pattern para eventos contables
2. ✅ Implementar persistencia de eventos en event bus
3. ✅ Asegurar que todos los flujos emiten eventos contables consistentemente
4. ✅ Invalidar cache de permisos cuando se modifican permisos de rol

### PRIMERA SEMANA (CRÍTICOS):

5. ✅ Validar moneda entre cuenta bancaria y CxP/CxC
6. ✅ Validar que asientos contables se creen correctamente
7. ✅ Implementar reintentos para comunicación con SUNAT
8. ✅ Validar que tenant tenga al menos un admin antes de desactivar

### PRIMER MES (MEJORAS):

9. ✅ Crear frontend para visualizar logs de auditoría
10. ✅ Implementar rotación automática de logs
11. ✅ Agregar índices en columnas frecuentemente consultadas
12. ✅ Implementar tests unitarios para módulos críticos

---

**Última actualización:** 2025-01-XX  
**Próxima revisión:** Después de implementar correcciones críticas

