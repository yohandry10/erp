# TASKS - FASE 3: Finanzas Completo (CxP + Tesorería + Conciliación)

**Duración:** 4 semanas  
**Prioridad:** P0 CRÍTICO  
**Dependencias:** Fase 1 y 2 completadas  
**Responsables:** Backend + Frontend + QA

---

## 📊 CONTEXTO: TABLAS EXISTENTES EN LA BASE DE DATOS

**ANTES de implementar cualquier tarea que requiera crear o actualizar tablas, DEBES:**

1. **Revisar las tablas existentes** en la lista completa de 180+ tablas del sistema
2. **Solicitar las columnas específicas** de las tablas que necesites usar con el comando:
   ```
   "Muéstrame las columnas de las tablas: [nombre_tabla1, nombre_tabla2, ...]"
   ```
3. **Verificar relaciones FK** existentes antes de crear nuevas
4. **NO duplicar tablas** que ya existen

**Tablas principales del módulo Finanzas:**
- `cuentas_por_pagar` - Control de cuentas por pagar a proveedores (21 columnas)
- `cuentas_por_cobrar` - Control de cuentas por cobrar a clientes (21 columnas)
- `cuentas_bancarias` - Cuentas bancarias de la empresa (11 columnas)
- `movimientos_bancarios` - Movimientos bancarios de ingresos y egresos (12 columnas)
- `conciliaciones_bancarias` - Conciliaciones bancarias (11 columnas)
- `cxc_pagos` - Pagos de cuentas por cobrar (16 columnas)
- `pagos_facturas` - Registro de pagos recibidos de clientes (9 columnas)
- `cobranzas` - Gestión de cobranzas a clientes (16 columnas)
- `gestiones_cobranza` - Historial de gestiones de cobranza (11 columnas)
- `egresos` - Control de egresos y pagos de la empresa (15 columnas)
- `gastos` - Registro de gastos operativos, administrativos y financieros (29 columnas)

**Tablas relacionadas de otros módulos:**
- `proveedores` - Catálogo de proveedores (16 columnas)
- `clientes` - Catálogo de clientes (26 columnas)
- `documentos` - Gestión documental y facturación electrónica (80 columnas)
- `ordenes_compra` - Órdenes de compra a proveedores (32 columnas)
- `recepciones` - Recepciones de mercancía (12 columnas)
- `ventas` - Ventas del sistema (25 columnas)
- `pedidos_venta` - Pedidos de venta (24 columnas)

**Tablas de eventos y auditoría:**
- `outbox_events` - Outbox pattern para eventos (13 columnas)
- `event_processing_log` - Log de procesamiento de eventos (8 columnas)
- `audit_log` - Log de auditoría (15 columnas)

**IMPORTANTE:** Si necesitas trabajar con alguna tabla, primero solicita ver sus columnas para ser preciso en tu implementación.

---

## 🚫 REGLA IMPORTANTE: NO CREAR DOCUMENTACIÓN

**Durante la implementación de TODAS las tareas de esta fase:**
- ❌ NO crear archivos .md de documentación
- ❌ NO crear archivos .txt de documentación
- ❌ NO crear archivos README.md
- ❌ NO crear archivos IMPLEMENTATION_*.md
- ❌ NO crear archivos TASK_COMPLETED_*.md
- ✅ SOLO crear código funcional (.ts, .tsx, .sql, etc.)

---

## ⚠️ REGLA CRÍTICA: VERIFICAR ANTES DE IMPLEMENTAR

**ANTES de implementar CUALQUIER endpoint, DEBES:**

1. **Verificar si ya existe** el endpoint o funcionalidad similar:
   - Buscar en todos los controladores del módulo
   - Revisar rutas alternativas que puedan hacer lo mismo
   - Verificar en servicios si la lógica ya está implementada

2. **Documentar lo encontrado:**
   - Si ya existe: Marcar como "✅ YA EXISTÍA" y especificar dónde
   - Si existe parcialmente: Documentar qué falta y qué hay
   - Si no existe: Proceder con la implementación

3. **Evitar duplicación:**
   - NO crear endpoints duplicados con rutas diferentes
   - NO reimplementar lógica que ya existe en servicios
   - SI hay rutas alternativas, evaluar si se debe mantener o migrar

**Ejemplo de verificación:**
```bash
# Buscar endpoints existentes
grep -r "POST.*cxp" apps/erp-api/src/modules/finanzas/controllers/

# Buscar servicios existentes
grep -r "crearCuentaPorPagar" apps/erp-api/src/modules/finanzas/services/
```

---

## SEMANA 1: CxP Completo

### TASK 3.1: Crear Migración Finanzas ✅ COMPLETADA
**Estimación:** 4 horas  
**Prioridad:** P0

**Archivo:** `supabase/migrations/020_finanzas_completo.sql`

**Tablas creadas/actualizadas:**
- [x] cuentas_por_pagar (actualizada con nuevas columnas)
- [x] cuentas_bancarias (actualizada)
- [x] movimientos_bancarios (actualizada)
- [x] conciliaciones_bancarias (creada)
- [x] Índices y RLS configurados

**Criterios de Aceptación:**
- ✅ Todas las tablas con RLS
- ✅ Índices creados
- ✅ Relaciones FK correctas

---

### TASK 3.2: Implementar Servicio CxP (Backend)
**Estimación:** 12 horas  
**Prioridad:** P0

**Archivos:**
- `apps/erp-api/src/modules/finanzas/cxp/cxp.controller.ts`
- `apps/erp-api/src/modules/finanzas/cxp/cxp.service.ts`
- `apps/erp-api/src/modules/finanzas/cxp/dto/*.dto.ts`

**Endpoints:**
- [x] POST /api/finanzas/cxp (crear manual)





- [x] GET /api/finanzas/cxp (con filtros: estado, vencimiento, proveedor)




- [x] GET /api/finanzas/cxp/:id




- [x] PUT /api/finanzas/cxp/:id




- [x] POST /api/finanzas/cxp/:id/aplicar-pago





- [x] POST /api/finanzas/cxp/:id/anular




- [x] GET /api/finanzas/cxp/aging (reporte aging)





- [x] GET /api/finanzas/cxp/vencimientos (próximos vencimientos)




**Lógica de Negocio:**
- [x] Crear CxP desde RecepcionRegistrada (listener)
- [x] Calcular fecha vencimiento según condiciones_pago
- [x] Aplicar pago (actualizar saldo)




- [x] Si saldo = 0 → estado PAGADA




- [x] Si saldo < total → estado PARCIAL


- [x] Emitir evento PagoProveedorRegistrado






**Criterios de Aceptación:**
- CRUD completo
- Listener de eventos funcional
- Aging correcto
- Tests >= 80%

**🚫 NO CREAR:**
- ❌ Archivos .md de documentación
- ❌ Archivos .txt de resumen
- ❌ Archivos README
- ✅ SOLO código funcional

---

### TASK 3.3: Implementar Servicio Tesorería (Backend) ✅ COMPLETADA
**Estimación:** 14 horas  
**Prioridad:** P0

**Archivos:**
- `apps/erp-api/src/modules/finanzas/tesoreria/tesoreria.controller.ts`
- `apps/erp-api/src/modules/finanzas/tesoreria/tesoreria.service.ts`

**Endpoints:**
- [x] POST /api/finanzas/tesoreria/pagos (registrar pago)





- [x] GET /api/finanzas/tesoreria/pagos



- [x] GET /api/finanzas/tesoreria/programacion (pagos programados)



- [x] POST /api/finanzas/tesoreria/lote (pago masivo)





- [x] GET /api/finanzas/tesoreria/flujo-caja (proyección)




**Lógica de Pago Proveedor:**
1. [x] Validar saldo CxP
2. [x] Validar saldo cuenta bancaria
3. [x] Crear movimiento_bancario (tipo CARGO)
4. [x] Actualizar saldo cuenta_bancaria
5. [x] Actualizar saldo CxP
6. [x] Crear pago_proveedor (registrado como movimiento_bancario)
7. [x] Emitir evento PagoProveedorRegistrado
8. [x] Insertar en outbox_events

**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones SQL: 
  1. Revisar carpeta `supabase/migrations` completa
  2. Si la tabla NO existe ahí, preguntar: "¿La tabla X ya existe en la BD?"
  3. SOLO crear script si confirmas que NO existe
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores
- ⚠️ NO duplicar tablas, columnas o endpoints existentes

**Pago Masivo:**
- [x] Seleccionar múltiples CxP





- [x] Validar saldo total



- [x] Procesar en transacción



- [x] Idempotencia por lote






**Criterios de Aceptación:**
- Pagos individuales funcionales
- Pagos masivos funcionales
- Eventos emitidos
- Tests >= 80%

**🚫 NO CREAR:**
- ❌ Archivos .md de documentación
- ❌ Archivos .txt de resumen
- ❌ Archivos README
- ✅ SOLO código funcional

---

## SEMANA 2: Bancos y Conciliación

### TASK 3.4: Implementar Servicio Bancos (Backend)
**Estimación:** 10 horas  
**Prioridad:** P0

**Archivos:**
- `apps/erp-api/src/modules/finanzas/bancos/bancos.controller.ts`
- `apps/erp-api/src/modules/finanzas/bancos/bancos.service.ts`

**Endpoints:**
- [x] POST /api/finanzas/bancos/cuentas
-

- [x] GET /api/finanzas/bancos/cuentas



- [x] GET /api/finanzas/bancos/cuentas/:id



- [x] PUT /api/finanzas/bancos/cuentas/:id





- [x] GET /api/finanzas/bancos/cuentas/:id/movimientos


- [x] POST /api/finanzas/bancos/movimientos (manual)




- [x] GET /api/finanzas/bancos/saldos (consolidado)




**Lógica:**
- [x] Crear movimientos desde pagos/cobros





- [x] Actualizar saldo cuenta bancaria




- [x] Validar no negativos (configurable)



- [x] Marcar movimientos como conciliables




**Criterios de Aceptación:**
- CRUD cuentas funcional
- Movimientos correctos
- Saldos cuadran
- Tests >= 80%

**🚫 NO CREAR:**
- ❌ Archivos .md de documentación
- ❌ Archivos .txt de resumen
- ❌ Archivos README
- ✅ SOLO código funcional

---

### TASK 3.5: Implementar Servicio Conciliación (Backend) ✅ COMPLETADA
**Estimación:** 16 horas  
**Prioridad:** P0

**Archivos:**
- `apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.controller.ts`
- `apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.service.ts`
- `apps/erp-api/src/modules/finanzas/conciliacion/csv-parser.service.ts`

**Endpoints:**
- [x] POST /api/finanzas/conciliacion (crear período)





- [x] GET /api/finanzas/conciliacion




- [x] GET /api/finanzas/conciliacion/:id




- [x] POST /api/finanzas/conciliacion/:id/importar-csv


- [x] POST /api/finanzas/conciliacion/:id/match-automatico



- [x] POST /api/finanzas/conciliacion/:id/marcar-item




- [x] POST /api/finanzas/conciliacion/:id/cerrar




- [x] GET /api/finanzas/conciliacion/:id/diferencias





**Lógica de Importación CSV:**
- [x] Parsear CSV por banco (plantillas configurables)
- [x] Normalizar a formato estándar




-

- [x] Crear movimientos_bancarios temporales



- [x] Intentar match automático





**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones: verificar si la tabla ya existe en scripts existentes
- ⚠️ Si no está en scripts: buscar en la BD con query directo
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores

**Match Automático:**
- [x] Por monto exacto + fecha ± tolerancia




- [x] Por referencia/número de operación





- [x] Marcar como CONCILIADO si match






**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones SQL: 
  1. Revisar carpeta `supabase/migrations` completa
  2. Si la tabla NO existe ahí, preguntar: "¿La tabla X ya existe en la BD?"
  3. SOLO crear script si confirmas que NO existe
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores
- ⚠️ NO duplicar tablas, columnas o endpoints existentes

**Match Manual:**
- [x] UI para seleccionar movimiento sistema + extracto




- [x] Marcar ambos como CONCILIADO

-

- [x] Registrar diferencia si existe







**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones SQL: 
  1. Revisar carpeta `supabase/migrations` completa
  2. Si la tabla NO existe ahí, preguntar: "¿La tabla X ya existe en la BD?"
  3. SOLO crear script si confirmas que NO existe
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores
- ⚠️ NO duplicar tablas, columnas o endpoints existentes

**Cierre de Conciliación:**
- [x] Validar todos los ítems procesados



- [x] Marcar movimientos como conciliado=true
- [x] Generar reporte de diferencias
- [x] Bloquear modificaciones

**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones SQL: 
  1. Revisar carpeta `supabase/migrations` completa
  2. Si la tabla NO existe ahí, preguntar: "¿La tabla X ya existe en la BD?"
  3. SOLO crear script si confirmas que NO existe
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores
- ⚠️ NO duplicar tablas, columnas o endpoints existentes

**Criterios de Aceptación:**
- Importación CSV funcional
- Match automático >= 80%
- Match manual funcional
- Cierre correcto
- Tests >= 80%

**🚫 NO CREAR:**
- ❌ Archivos .md de documentación
- ❌ Archivos .txt de resumen
- ❌ Archivos README
- ✅ SOLO código funcional

---

## SEMANA 3: Frontend Finanzas

### TASK 3.6: Página CxP (Frontend)
**Estimación:** 14 horas  
**Prioridad:** P0

**Archivos:**
- `apps/web/app/dashboard/finanzas/cxp/page.tsx`
- `apps/web/app/dashboard/finanzas/cxp/[id]/page.tsx`
- `apps/web/components/finanzas/CxpCard.tsx`
- `apps/web/components/finanzas/PagoProveedorModal.tsx`
- `apps/web/components/finanzas/AgingCxpChart.tsx`

**Funcionalidades:**
- [x] Lista con filtros (estado, vencimiento, proveedor)


- [x] Vista de aging (0-30, 31-60, 61-90, >90 días)





- [x] Detalle de CxP



- [x] Aplicar pago individual





- [x] Ver historial de pagos


- [x] Alertas de vencimientos próximos




**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones: verificar si la tabla ya existe en scripts existentes
- ⚠️ Si no está en scripts: buscar en la BD con query directo
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores

**Criterios de Aceptación:**
- Filtros funcionales
- Aging visual claro
- Pago rápido desde lista

**🚫 NO CREAR:**
- ❌ Archivos .md de documentación
- ❌ Archivos .txt de resumen
- ❌ Archivos README
- ✅ SOLO código funcional

---

### TASK 3.7: Página Tesorería (Frontend)
**Estimación:** 16 horas  
**Prioridad:** P0

**Archivos:**
- `apps/web/app/dashboard/finanzas/tesoreria/page.tsx`
- `apps/web/app/dashboard/finanzas/tesoreria/programacion/page.tsx`
- `apps/web/app/dashboard/finanzas/tesoreria/lote/page.tsx`
- `apps/web/components/finanzas/ProgramacionPagosTable.tsx`
- `apps/web/components/finanzas/PagoLoteWizard.tsx`
- `apps/web/components/finanzas/FlujoCajaChart.tsx`

**Funcionalidades:**
- [x] Dashboard de tesorería (saldos, próximos pagos)



- [x] Programación de pagos por vencimiento



- [x] Pago masivo (wizard)



- [x] Flujo de caja proyectado











- [x] Selección de cuenta bancaria

- [x] Confirmación de lote

**Wizard Pago Masivo:**
1. Seleccionar CxP a pagar
2. Seleccionar cuenta bancaria
3. Validar saldo suficiente
4. Confirmar y procesar

**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones: verificar si la tabla ya existe en scripts existentes
- ⚠️ Si no está en scripts: buscar en la BD con query directo
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores

**Criterios de Aceptación:**
- Dashboard informativo
- Pago masivo funcional
- Flujo de caja visual

**🚫 NO CREAR:**
- ❌ Archivos .md de documentación
- ❌ Archivos .txt de resumen
- ❌ Archivos README
- ✅ SOLO código funcional

---

### TASK 3.8: Página Bancos (Frontend)
**Estimación:** 12 horas  
**Prioridad:** P0

**Archivos:**
- `apps/web/app/dashboard/finanzas/bancos/page.tsx`
- `apps/web/app/dashboard/finanzas/bancos/[id]/page.tsx`
- `apps/web/components/finanzas/CuentaBancariaCard.tsx`
- `apps/web/components/finanzas/MovimientosBancariosTable.tsx`

**Funcionalidades:**
- [x] Lista de cuentas bancarias


- [x] Crear/editar cuenta



- [x] Ver movimientos por cuenta


- [x] Filtros por fecha, tipo
- [x] Saldo actual y disponible
- [x] Exportar movimientos



**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones: verificar si la tabla ya existe en scripts existentes
- ⚠️ Si no está en scripts: buscar en la BD con query directo
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores

**Criterios de Aceptación:**
- CRUD cuentas funcional
- Movimientos claros
- Saldos correctos

**🚫 NO CREAR:**
- ❌ Archivos .md de documentación
- ❌ Archivos .txt de resumen
- ❌ Archivos README
- ✅ SOLO código funcional

---

### TASK 3.9: Página Conciliación (Frontend) ✅ COMPLETADA
**Estimación:** 20 horas  
**Prioridad:** P0

**Archivos:**
- `apps/web/app/dashboard/finanzas/conciliacion/page.tsx`
- `apps/web/app/dashboard/finanzas/conciliacion/[id]/page.tsx`
- `apps/web/components/finanzas/ImportarExtractoCSV.tsx`
- `apps/web/components/finanzas/ConciliacionTable.tsx`
- `apps/web/components/finanzas/MatchManualModal.tsx`
- `apps/web/components/finanzas/ConciliacionWizard.tsx` ✅
- `apps/web/components/finanzas/ConciliacionGuide.tsx` ✅

**Wizard Conciliación:**
1. ✅ Crear período (cuenta, desde, hasta)
2. ✅ Importar extracto CSV
3. ✅ Ver pre-match automático
4. ✅ Ajustar matches manuales
5. ✅ Revisar diferencias
6. ✅ Cerrar conciliación

**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones: verificar si la tabla ya existe en scripts existentes
- ⚠️ Si no está en scripts: buscar en la BD con query directo
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores

**Funcionalidades:**
- [x] Upload CSV con preview
- [x] Tabla dual (sistema vs extracto)
- [x] Highlight de matches automáticos
- [x] Drag & drop para match manual
- [x] Registro de diferencias
- [x] Confirmación de cierre
- [x] Wizard de 5 pasos con navegación
- [x] Toggle entre vista Wizard y vista Detallada
- [x] Guía visual del proceso
- [x] Estadísticas en tiempo real
- [x] Ejecución de match automático desde wizard
- [x] Progreso visual por paso

**Criterios de Aceptación:**
- ✅ Importación CSV intuitiva
- ✅ Matches visuales claros
- ✅ Proceso completo funcional
- ✅ Wizard guiado paso a paso
- ✅ CSS inline (sin archivos externos)

**🚫 NO CREAR:**
- ❌ Archivos .md de documentación
- ❌ Archivos .txt de resumen
- ❌ Archivos README
- ✅ SOLO código funcional

---

## SEMANA 4: Testing e Integración

### TASK 3.10: Tests Unitarios Backend
**Estimación:** 12 horas  
**Prioridad:** P0

**Archivos:**
- `apps/erp-api/src/modules/finanzas/**/*.spec.ts`

**Servicios a probar:**
- [x] CxpService

- [x] TesoreriaService
















- [ ] TesoreriaService




- [x] BancosService





- [x] ConciliacionService


- [x] CsvParserService





**Cobertura:** >= 80%

**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones: verificar si la tabla ya existe en scripts existentes
- ⚠️ Si no está en scripts: buscar en la BD con query directo
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores

**🚫 NO CREAR:**
- ❌ Archivos .md de documentación
- ❌ Archivos .txt de resumen
- ❌ Archivos README
- ✅ SOLO código funcional

---

### TASK 3.11: Tests E2E Finanzas
**Estimación:** 16 horas  
**Prioridad:** P0

**Archivo:** `apps/erp-api/tests/e2e/finanzas-flow.spec.ts`

**Flujo a probar:**
1. Crear CxP desde recepción (automático)
2. Validar CxP creado correctamente
3. Registrar pago proveedor
4. Validar movimiento bancario
5. Validar CxP actualizado
6. Importar extracto CSV
7. Ejecutar match automático
8. Hacer match manual
9. Cerrar conciliación
10. Validar movimientos conciliados

**Criterios de Aceptación:**
- Flujo completo funcional
- CxP correcto
- Conciliación correcta
- Eventos procesados

**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones: verificar si la tabla ya existe en scripts existentes
- ⚠️ Si no está en scripts: buscar en la BD con query directo
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores

**🚫 NO CREAR:**
- ❌ Archivos .md de documentación
- ❌ Archivos .txt de resumen
- ❌ Archivos README
- ✅ SOLO código funcional

---

### TASK 3.12: Tests Frontend (Playwright)
**Estimación:** 12 horas  
**Prioridad:** P1

**Archivo:** `apps/web/tests/e2e/finanzas.spec.ts`

**Escenarios:**
- [x] Aplicar pago a CxP
- [x] Pago masivo de proveedores
- [x] Importar extracto y conciliar

**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones: verificar si la tabla ya existe en scripts existentes
- ⚠️ Si no está en scripts: buscar en la BD con query directo
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores

**🚫 NO CREAR:**
- ❌ Archivos .md de documentación
- ❌ Archivos .txt de resumen
- ❌ Archivos README
- ✅ SOLO código funcional

---

### TASK 3.13: Integración con Contabilidad
**Estimación:** 8 horas  
**Prioridad:** P0

**Descripción:**
Preparar eventos para que Contabilidad genere asientos.

**Eventos a emitir:**
- [x] PagoProveedorRegistrado



- [x] CobroRegistrado (ya existe)





- [x] MovimientoBancarioRegistrado




**Payload mínimo:**
```typescript
{
  tenant_id,
  pago_id,
  cxp_id,
  proveedor_id,
  monto,
  moneda,
  banco_cuenta_id,
  fecha,
  metodo
}
```

**Criterios de Aceptación:**
- Eventos en outbox
- Payload completo
- Idempotencia garantizada

**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones: verificar si la tabla ya existe en scripts existentes
- ⚠️ Si no está en scripts: buscar en la BD con query directo
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores

**🚫 NO CREAR:**
- ❌ Archivos .md de documentación
- ❌ Archivos .txt de resumen
- ❌ Archivos README
- ✅ SOLO código funcional

---

### TASK 3.14: Reportes Finanzas
**Estimación:** 10 horas  
**Prioridad:** P1

**Archivos:**
- `apps/erp-api/src/modules/finanzas/reports/finanzas-reports.service.ts`
- `apps/web/app/dashboard/finanzas/reportes/page.tsx`

**Reportes:**
- [x] Aging CxP (0-30, 31-60, 61-90, >90)




- [x] Aging CxC (ya existe, validar)



- [x] Flujo de caja proyectado (visual completo con vista semanal y diaria)


- [x] Movimientos bancarios por período (visual completo)

- [x] Conciliaciones pendientes (visual completo)




- [x] Proveedores con mayor deuda (visual completo)






**Criterios de Aceptación:**
- Reportes correctos
- Exportación a Excel
- Gráficos visuales

**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones: verificar si la tabla ya existe en scripts existentes
- ⚠️ Si no está en scripts: buscar en la BD con query directo
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores

**🚫 NO CREAR:**
- ❌ Archivos .md de documentación
- ❌ Archivos .txt de resumen
- ❌ Archivos README
- ✅ SOLO código funcional

---

### TASK 3.15: Documentación
**Estimación:** 6 horas  
**Prioridad:** P1

**Archivos:**
- `docs/modules/finanzas/README.md`
- `docs/modules/finanzas/cxp.md`
- `docs/modules/finanzas/tesoreria.md`
- `docs/modules/finanzas/conciliacion.md`

**Contenido:**
- Flujos de negocio
- Guía de conciliación
- Plantillas CSV por banco
- Troubleshooting

---

## CHECKLIST FINAL FASE 3

### Base de Datos
- [ ] Migración 020 ejecutada
- [ ] Tablas con RLS
- [ ] Índices creados

### Backend
- [x] CxP completo



- [x] Tesorería funcional




- [x] Bancos funcional


- [ ] Conciliación funcional











- [x] Eventos emitidos





- [ ] Eventos emitidos


- [ ] Tests >= 80%


### Frontend
- [x] 4 páginas principales



- [ ] Wizard conciliación



- [x] Reportes visuales



- [ ] UX consistente



### Integración
- [ ] CxP desde compras automático
- [ ] Pagos actualizan CxP y bancos
- [ ] Conciliación completa
- [ ] Eventos para contabilidad

### Documentación
- [ ] API documentada
- [ ] Flujos documentados
- [ ] Plantillas CSV

---

## MÉTRICAS DE ÉXITO

- **Completitud Finanzas:** 95% (de 40%)
- **CxP automático:** 100% desde recepciones
- **Match automático:** >= 80%
- **Cobertura tests:** >= 80%
- **Performance:** Conciliación < 5s

