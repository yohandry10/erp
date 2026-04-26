# TASKS - FASE 4: Contabilidad Integrada (Asientos Automáticos + Estados Financieros)

**Duración:** 4 semanas  
**Prioridad:** P0 CRÍTICO  
**Dependencias:** Fases 1, 2 y 3 completadas  
**Responsables:** Backend + Frontend + Contador + QA

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

**Tablas principales del módulo Contabilidad:**
- `asientos_contables` - Cabecera de asientos contables (11 columnas)
- `detalle_asientos` - Detalle de movimientos contables (8 columnas)
- `plan_cuentas` - Plan de cuentas contables según PCGE Perú (14 columnas)
- `periodos_contables` - Períodos contables por tenant (7 columnas)
- `centros_costo` - Centros de costo por tenant (9 columnas)
- `asignacion_costos` - Asignación de costos por tenant (9 columnas)
- `saldos_iniciales_cuentas` - Saldos iniciales de cuentas (7 columnas)
- `libro_retenciones` - Libro de retenciones (15 columnas)
- `configuracion_retenciones` - Configuración de retenciones (9 columnas)
- `detalle_retenciones_categoria` - Detalle de retenciones por categoría (10 columnas)

**Tablas de integración fiscal:**
- `configuracion_fiscal` - Configuración fiscal específica por país (24 columnas)
- `tipos_documentos_fiscales` - Tipos de documentos fiscales por país (10 columnas)
- `tipos_impuestos` - Tipos de impuestos y tasas aplicables (10 columnas)
- `libros_electronicos_sunat` - Libros electrónicos SUNAT (10 columnas)
- `sire_files` - Archivos SIRE (11 columnas)
- `validaciones_sunat` - Validaciones de certificados y documentos SUNAT (9 columnas)

**Tablas de RRHH relacionadas:**
- `asientos_contables_rrhh` - Asientos contables generados por planillas (9 columnas)
- `planillas` - Planillas de pago (20 columnas)
- `empleado_planilla` - Detalle de planilla por empleado (19 columnas)
- `historial_pagos_planilla` - Historial de pagos realizados (11 columnas)

**Tablas de activos fijos:**
- `activos_fijos` - Activos fijos por tenant (14 columnas)
- `depreciaciones` - Depreciaciones de activos fijos (8 columnas)

**Vistas existentes:**
- `vista_balance_comprobacion` - Vista de balance de comprobación (10 columnas)
- `v_costos_fijos_mensuales` - Vista de costos fijos mensuales (4 columnas)
- `v_gastos_resumen` - Vista de resumen de gastos (8 columnas)

**Tablas de eventos y auditoría:**
- `outbox_events` - Outbox pattern para eventos (13 columnas)
- `event_processing_log` - Log de procesamiento de eventos (8 columnas)
- `audit_log` - Log de auditoría (15 columnas)
- `auditoria` - Auditoría general (11 columnas)

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
grep -r "POST.*asientos" apps/erp-api/src/modules/contabilidad/controllers/

# Buscar servicios existentes
grep -r "generarAsiento" apps/erp-api/src/modules/contabilidad/services/
```

---

## SEMANA 1: Base de Datos y Reglas Contables

### TASK 4.1: Crear Migración Contabilidad
**Estimación:** 4 horas  
**Prioridad:** P0

**Archivo:** `supabase/migrations/021_contabilidad_integracion.sql`

**Tablas a actualizar:**
- [x] asientos_contables (agregar source_event_id para idempotencia)



- [x] detalle_asientos (agregar centro_costo_id)



- [x] periodos_contables (ya tiene RLS de Fase 1)



- [ ] centros_costo (ya tiene RLS de Fase 1)




**Tablas nuevas:**
- [ ] presupuestos (por centro_costo + cuenta + período)




- [x] plantillas_asientos (para asientos recurrentes)





**Vistas Materializadas:**
```sql
CREATE MATERIALIZED VIEW mv_balance_comprobacion AS
SELECT ...;

CREATE MATERIALIZED VIEW mv_estado_resultados AS
SELECT ...;

CREATE MATERIALIZED VIEW mv_balance_general AS
SELECT ...;
```

**Funciones:**
```sql
CREATE FUNCTION refrescar_estados_financieros(p_tenant_id uuid, p_anio int, p_mes int)
RETURNS void;
```

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
- Migración ejecuta sin errores
- Vistas materializadas creadas
- Funciones funcionando

---

### TASK 4.2: Definir Plan de Cuentas Estándar
**Estimación:** 6 horas  
**Prioridad:** P0

**Descripción:**
Crear seed con plan de cuentas mínimo según PCGE Perú.

**Archivo:** `supabase/seeds/plan_cuentas_pcge.sql`

**Cuentas principales:**
- 10 - Efectivo y Equivalentes
  - 101 - Caja
  - 104 - Cuentas Corrientes
- 12 - Cuentas por Cobrar Comerciales
  - 121 - Facturas por Cobrar
- 20 - Mercaderías
  - 201 - Mercaderías Manufacturadas
- 40 - Tributos por Pagar
  - 401 - Gobierno Central (IGV)
- 42 - Cuentas por Pagar Comerciales
  - 421 - Facturas por Pagar
- 60 - Compras
- 68 - Valuación y Deterioro de Activos
- 70 - Ventas
- 94 - Gastos Administrativos
- 95 - Gastos de Ventas

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
- Plan de cuentas completo
- Clasificación correcta (activo, pasivo, patrimonio, ingresos, gastos)
- Cuentas de nivel 2 y 3 mínimas

---

### TASK 4.3: Implementar Generador de Asientos
**Estimación:** 16 horas  
**Prioridad:** P0

**Archivo:** `apps/erp-api/src/modules/contabilidad/services/asientos-generator.service.ts`

**Clase principal:**
```typescript
@Injectable()
export class AsientosGeneratorService {
  async generarAsientoVenta(evento: VentaFacturada): Promise<AsientoContable>;
  async generarAsientoCompra(evento: RecepcionRegistrada): Promise<AsientoContable>;
  async generarAsientoCobro(evento: CobroRegistrado): Promise<AsientoContable>;
  async generarAsientoPago(evento: PagoProveedorRegistrado): Promise<AsientoContable>;
  async generarAsientoAjusteInventario(evento: AjusteInventarioAplicado): Promise<AsientoContable>;
  async generarAsientoPlanilla(evento: PlanillaLiquidada): Promise<AsientoContable>;
  async generarAsientoDepreciacion(evento: DepreciacionGenerada): Promise<AsientoContable>;
}
```

**Reglas Contables:**

**1. Venta (Factura CPE):**
```
Dr 12 Clientes           [total]
  Cr 70 Ventas           [base]
  Cr 40 IGV por Pagar    [igv]

Dr 69 Costo de Ventas    [costo]
  Cr 20 Mercaderías      [costo]
```

**2. Cobro CxC:**
```
Dr 10 Bancos/Caja        [monto]
  Cr 12 Clientes         [monto]
```

**3. Compra (Recepción):**
```
Dr 20 Mercaderías        [costo]
Dr 40 IGV Crédito Fiscal [igv]
  Cr 42 Proveedores      [total]
```

**4. Pago CxP:**
```
Dr 42 Proveedores        [monto]
  Cr 10 Bancos           [monto]
```

**5. Ajuste Inventario:**
```
// Si positivo (sobrante):
Dr 20 Mercaderías        [valor]
  Cr 76 Ingresos Diversos [valor]

// Si negativo (faltante):
Dr 68 Valuación Activos  [valor]
  Cr 20 Mercaderías      [valor]
```

**6. Planilla:**
```
Dr 62 Gastos Personal    [sueldos + aportes]
  Cr 40 Tributos         [aportes + retenciones]
  Cr 41 Remuneraciones   [neto a pagar]
```

**7. Depreciación:**
```
Dr 68 Depreciación       [monto]
  Cr 39 Deprec. Acumulada [monto]
```

**Lógica común:**
- [ ] Validar período contable abierto



- [x] Verificar idempotencia (source_event_id)





- [x] Obtener cuentas del plan



- [x] Crear asiento_contable





- [x] Crear detalle_asientos (debe y haber)




- [x] Validar balance (suma debe = suma haber)





- [x] Asignar centro_costo si aplica






- [x] Marcar como procesado en outbox


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
- 7 tipos de asientos implementados
- Validación de balance
- Idempotencia garantizada
- Tests >= 80%

---

### TASK 4.4: Implementar Listeners de Eventos
**Estimación:** 12 horas  
**Prioridad:** P0

**Archivo:** `apps/erp-api/src/modules/contabilidad/listeners/contabilidad-events.listener.ts`

**Listeners:**
```typescript
@Injectable()
export class ContabilidadEventsListener implements OnModuleInit {
  onModuleInit() {
    this.eventBus.on('VentaFacturada', this.handleVentaFacturada.bind(this));
    this.eventBus.on('CobroRegistrado', this.handleCobroRegistrado.bind(this));
    this.eventBus.on('RecepcionRegistrada', this.handleRecepcionRegistrada.bind(this));
    this.eventBus.on('PagoProveedorRegistrado', this.handlePagoProveedor.bind(this));
    this.eventBus.on('AjusteInventarioAplicado', this.handleAjusteInventario.bind(this));
    this.eventBus.on('PlanillaLiquidada', this.handlePlanillaLiquidada.bind(this));
    this.eventBus.on('DepreciacionGenerada', this.handleDepreciacion.bind(this));
  }

  private async handleVentaFacturada(event: OutboxEvent) {
    const asiento = await this.asientosGenerator.generarAsientoVenta(event.payload);
    await this.markEventProcessed(event.id);
  }
  
  // ... otros handlers
}
```

**Procesamiento:**
- [x] Leer eventos de outbox_events (processed_at IS NULL)





- [x] Procesar en orden (occurred_at ASC)





- [x] Generar asiento correspondiente





- [x] Marcar evento como procesado



-

- [x] Manejar errores con reintentos




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
- Todos los eventos escuchados
- Procesamiento idempotente
- Manejo de errores robusto
- Tests >= 80%

---

## SEMANA 2: Periodos y Estados Financieros

### TASK 4.5: Implementar Gestión de Periodos
**Estimación:** 8 horas  
**Prioridad:** P0

**Archivo:** `apps/erp-api/src/modules/contabilidad/services/periodos.service.ts`

**Endpoints:**
- [x] POST /api/contabilidad/periodos (crear período)




- [x] GET /api/contabilidad/periodos





- [x] GET /api/contabilidad/periodos/:id





- [x] POST /api/contabilidad/periodos/:id/cerrar





- [x] POST /api/contabilidad/periodos/:id/reabrir (solo superadmin)



- [x] POST /api/contabilidad/periodos/:id/bloquear




**Lógica de Cierre:**
1. [x] Validar todos los asientos cuadran
2. [x] Validar no hay eventos pendientes
3. [x] Cambiar estado a CERRADO
4. [x] Bloquear nuevos asientos en ese período
5. [x] Generar asientos de cierre (si es fin de año)
6. [x] Refrescar vistas materializadas

**Validaciones:**
- [x] No cerrar si hay asientos descuadrados




- [x] No cerrar si hay eventos pendientes




- [x] No permitir asientos en períodos cerrados





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
- Cierre funcional
- Validaciones correctas
- Reapertura controlada
- Tests >= 80%

---

### TASK 4.6: Implementar Estados Financieros
**Estimación:** 16 horas  
**Prioridad:** P0

**Archivo:** `apps/erp-api/src/modules/contabilidad/services/estados-financieros.service.ts`

**Endpoints:**
- [x] GET /api/contabilidad/estados/balance-comprobacion?anio&mes





- [x] GET /api/contabilidad/estados/estado-resultados?anio&mes





- [x] GET /api/contabilidad/estados/balance-general?anio&mes



- [x] POST /api/contabilidad/estados/refrescar (refrescar vistas)





**Balance de Comprobación:**
```typescript
interface BalanceComprobacion {
  cuenta: string;
  nombre: string;
  saldo_inicial: number;
  debe: number;
  haber: number;
  saldo_final: number;
}
```

**Estado de Resultados (P&L):**
```typescript
interface EstadoResultados {
  ingresos: {
    ventas: number;
    otros_ingresos: number;
    total_ingresos: number;
  };
  costos: {
    costo_ventas: number;
    utilidad_bruta: number;
  };
  gastos: {
    gastos_administrativos: number;
    gastos_ventas: number;
    gastos_financieros: number;
    total_gastos: number;
  };
  utilidad_neta: number;
}
```

**Balance General:**
```typescript
interface BalanceGeneral {
  activos: {
    corrientes: { ... };
    no_corrientes: { ... };
    total_activos: number;
  };
  pasivos: {
    corrientes: { ... };
    no_corrientes: { ... };
    total_pasivos: number;
  };
  patrimonio: {
    capital: number;
    resultados_acumulados: number;
    resultado_ejercicio: number;
    total_patrimonio: number;
  };
}
```

**Lógica:**
- [x] Consultar vistas materializadas







- [x] Filtrar por tenant_id, anio, mes


- [x] Calcular totales y subtotales




  
- [x] Formatear según estándar contable




- [x] Cache de 1 hora




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
- 3 estados financieros correctos
- Cálculos validados por contador
- Performance < 2s
- Tests >= 80%

---

### TASK 4.7: Implementar Centros de Costo ✅ COMPLETADA
**Estimación:** 6 horas  
**Prioridad:** P1

**Archivo:** `apps/erp-api/src/modules/contabilidad/services/centros-costo.service.ts`

**Endpoints:**
- [x] POST /api/contabilidad/centros-costo
- [x] GET /api/contabilidad/centros-costo
- [x] GET /api/contabilidad/centros-costo/:id
- [x] PUT /api/contabilidad/centros-costo/:id
- [x] GET /api/contabilidad/centros-costo/:id/asientos
- [x] GET /api/contabilidad/centros-costo/:id/reporte

**Funcionalidades:**
- [x] CRUD centros de costo
- [x] Asignar centro a asientos
- [x] Reportes por centro
- [x] Comparación presupuesto vs real


















**Criterios de Aceptación:**
- ✅ CRUD funcional
- ✅ Asignación a asientos
- ✅ Reportes básicos

---

### TASK 4.7.1: Implementar Presupuestos por Centro de Costo
**Estimación:** 8 horas  
**Prioridad:** P1

**Archivo:** `apps/erp-api/src/modules/contabilidad/services/presupuestos.service.ts`

**Endpoints:**
- [x] POST /api/contabilidad/presupuestos (crear presupuesto)




- [x] GET /api/contabilidad/presupuestos (listar con filtros)



- [x] GET /api/contabilidad/presupuestos/:id (detalle)



- [x] PUT /api/contabilidad/presupuestos/:id (actualizar)



- [x] DELETE /api/contabilidad/presupuestos/:id (eliminar)




- [x] GET /api/contabilidad/presupuestos/centro/:centroId/periodo/:periodoId (por centro y período)



- [x] GET /api/contabilidad/presupuestos/comparacion/:periodoId (presupuesto vs real)






**Funcionalidades:**
- [x] CRUD completo de presupuestos




- [x] Asignar presupuesto por centro de costo + cuenta + período



- [x] Validar que no exista duplicado (centro + cuenta + período)



- [x] Calcular ejecución presupuestal (% ejecutado)



-

- [x] Alertas de sobregiro presupuestal


- [x] Reporte comparativo presupuesto vs real






- [x] Exportar a Excel





**Estructura de datos:**
```typescript
interface Presupuesto {
  id: string;
  tenant_id: string;
  centro_costo_id: string;
  cuenta_id: string;
  periodo_id: string;
  monto_presupuestado: number;
  monto_ejecutado: number; // calculado
  porcentaje_ejecutado: number; // calculado
  estado: 'ACTIVO' | 'CERRADO';
  notas?: string;
  created_at: Date;
  updated_at: Date;
}
```

**Lógica de cálculo:**
- [x] Sumar todos los asientos del centro de costo + cuenta en el período





- [x] Calcular porcentaje: (monto_ejecutado / monto_presupuestado) * 100
- [x] Alertar si porcentaje > 90% (advertencia)
- [x] Alertar si porcentaje > 100% (sobregiro)

**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones SQL: verificar si tabla `presupuestos` ya existe
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores
- ⚠️ NO duplicar tablas, columnas o endpoints existentes

**Criterios de Aceptación:**
- CRUD funcional
- Cálculo de ejecución correcto
- Alertas de sobregiro
- Reporte comparativo
- Tests >= 80%

---

## SEMANA 3: Frontend Contabilidad

### TASK 4.8: Página de Asientos Contables (Frontend)
**Estimación:** 14 horas  
**Prioridad:** P0

**⚠️ VERIFICACIÓN OBLIGATORIA ANTES DE IMPLEMENTAR:**
1. **Buscar código existente** usando `grepSearch` y `fileSearch` para:
   - Páginas de asientos existentes
   - Componentes de visualización de asientos
   - Formularios de asientos
2. **Leer archivos relacionados** para entender la estructura actual
3. **Verificar si la funcionalidad ya existe** antes de implementar
4. **Solo entonces proceder** con la implementación si no hay duplicación

**Archivos:**
- `apps/web/app/dashboard/contabilidad/asientos/page.tsx`
- `apps/web/app/dashboard/contabilidad/asientos/[id]/page.tsx`
- `apps/web/app/dashboard/contabilidad/asientos/nuevo/page.tsx`
- `apps/web/components/contabilidad/AsientoViewer.tsx`
- `apps/web/components/contabilidad/AsientoForm.tsx`

- [x] Lista de asientos con filtros (fecha, origen, cuenta)
- [x] Ver detalle de asiento (debe/haber)
- [x] Crear asiento manual
- [x] Validación de balance (debe = haber)
- [x] Indicador de origen (automático vs manual)
- [x] Búsqueda por número de asiento






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
- Lista funcional
- Detalle claro
- Creación manual con validación
- UX consistente

---

### TASK 4.9: Página de Periodos Contables (Frontend)
**Estimación:** 10 horas  
**Prioridad:** P0

**⚠️ VERIFICACIÓN OBLIGATORIA ANTES DE IMPLEMENTAR:**
1. **Buscar código existente** usando `grepSearch` y `fileSearch` para:
   - Páginas de períodos contables existentes
   - Componentes de gestión de períodos
   - Wizards de cierre
2. **Leer archivos relacionados** para entender la estructura actual
3. **Verificar si la funcionalidad ya existe** antes de implementar
4. **Solo entonces proceder** con la implementación si no hay duplicación

**Archivos:**
- `apps/web/app/dashboard/contabilidad/periodos/page.tsx`
- `apps/web/components/contabilidad/PeriodoCierreWizard.tsx`

**Funcionalidades:**


- [x] Lista de períodos (año/mes, estado)







- [x] Crear período
- [x] Wizard de cierre con validaciones
- [x] Indicador de asientos pendientes
- [x] Confirmación de cierre
- [x] Reapertura (solo superadmin)




**Wizard de Cierre:**
1. ✅ Validar asientos cuadran
2. ✅ Validar eventos procesados
3. ✅ Confirmar cierre
4. ✅ Procesar

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
- Wizard intuitivo
- Validaciones claras
- Cierre funcional

---

### TASK 4.10: Página de Estados Financieros (Frontend)
**Estimación:** 18 horas  
**Prioridad:** P0

**⚠️ VERIFICACIÓN OBLIGATORIA ANTES DE IMPLEMENTAR:**
1. **Buscar código existente** usando `grepSearch` y `fileSearch` para:
   - Páginas de estados financieros existentes
   - Componentes de balance de comprobación
   - Componentes de estado de resultados
   - Componentes de balance general
2. **Leer archivos relacionados** para entender la estructura actual
3. **Verificar si la funcionalidad ya existe** antes de implementar
4. **Solo entonces proceder** con la implementación si no hay duplicación

**Archivos:**
- `apps/web/app/dashboard/contabilidad/estados/page.tsx`
- `apps/web/components/contabilidad/EstadosFinancierosTabs.tsx`
- `apps/web/components/contabilidad/BalanceComprobacion.tsx`
- `apps/web/components/contabilidad/EstadoResultados.tsx`
- `apps/web/components/contabilidad/BalanceGeneral.tsx`

**Funcionalidades:**
- [x] Tabs: Balance Comprobación, Estado Resultados, Balance General





- [x] Selector de período (año/mes)






- [x] Visualización tabular





- [x] Gráficos (ingresos vs gastos, activos vs pasivos)




- [x] Exportar a Excel
-

- [x] Exportar a PDF


- [x] Comparación con período anterior





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
- 3 estados visualizados correctamente
- Exportación funcional
- Gráficos claros
- Performance < 3s

---

### TASK 4.11: Página de Centros de Costo (Frontend)
**Estimación:** 10 horas  
**Prioridad:** P1

**⚠️ VERIFICACIÓN OBLIGATORIA ANTES DE IMPLEMENTAR:**
1. **Buscar código existente** usando `grepSearch` y `fileSearch` para:
   - Páginas de centros de costo existentes
   - Componentes de gestión de centros de costo
   - Reportes de centros de costo
2. **Leer archivos relacionados** para entender la estructura actual
3. **Verificar si la funcionalidad ya existe** antes de implementar
4. **Solo entonces proceder** con la implementación si no hay duplicación

**Archivos:**
- `apps/web/app/dashboard/contabilidad/centros-costo/page.tsx`
- `apps/web/app/dashboard/contabilidad/centros-costo/[id]/page.tsx`
- `apps/web/components/contabilidad/CentroCostoCard.tsx`

**Funcionalidades:**
- [x] Lista de centros de costo



- [x] Crear/editar centro



- [x] Ver asientos por centro



- [x] Reporte de gastos por centro



- [x] Comparación presupuesto vs real

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
- CRUD funcional
- Reportes básicos
- Visualización clara

---

### TASK 4.11.1: Página de Presupuestos (Frontend)
**Estimación:** 12 horas  
**Prioridad:** P1

**⚠️ VERIFICACIÓN OBLIGATORIA ANTES DE IMPLEMENTAR:**
1. **Buscar código existente** usando `grepSearch` y `fileSearch` para:
   - Páginas de presupuestos existentes
   - Componentes de formularios de presupuestos
   - Gráficos de presupuesto vs real
2. **Leer archivos relacionados** para entender la estructura actual
3. **Verificar si la funcionalidad ya existe** antes de implementar
4. **Solo entonces proceder** con la implementación si no hay duplicación

**Archivos:**
- `apps/web/app/dashboard/contabilidad/presupuestos/page.tsx`
- `apps/web/app/dashboard/contabilidad/presupuestos/nuevo/page.tsx`
- `apps/web/app/dashboard/contabilidad/presupuestos/[id]/page.tsx`
- `apps/web/components/contabilidad/PresupuestoForm.tsx`
- `apps/web/components/contabilidad/PresupuestoCard.tsx`
- `apps/web/components/contabilidad/PresupuestoVsRealChart.tsx`

**Funcionalidades:**

- [x] Lista de presupuestos con filtros




- [x] Crear/editar presupuesto




- [x] Indicador visual de ejecución (verde/amarillo/rojo)





- [x] Barra de progreso



-

- [x] Alertas de sobregiro



- [x] Reporte comparativo presupuesto vs real



- [x] Gráfico de ejecución por centro


- [x] Exportar a Excel

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
- CRUD funcional
- Indicadores visuales claros
- Alertas visibles
- Exportación funcional

---

## SEMANA 4: Testing e Integración Final

### TASK 4.12: Tests Unitarios Backend
**Estimación:** 14 horas  
**Prioridad:** P0

**⚠️ VERIFICACIÓN OBLIGATORIA ANTES DE IMPLEMENTAR:**
1. **Buscar código existente** usando `grepSearch` y `fileSearch` para:
   - Tests existentes de servicios de contabilidad
   - Tests de generación de asientos
   - Tests de eventos
2. **Leer archivos relacionados** para entender la estructura actual
3. **Verificar si la funcionalidad ya existe** antes de implementar
4. **Solo entonces proceder** con la implementación si no hay duplicación

**Archivos:**
- `apps/erp-api/src/modules/contabilidad/**/*.spec.ts`

**Servicios a probar:**
- [x] AsientosGeneratorService (7 tipos de asientos)




- [x] ContabilidadEventsListener



- [x] PeriodosService



-

- [x] EstadosFinancierosService



- [x] CentrosCostoService




**Cobertura:** >= 80%

**⚠️ INSTRUCCIONES CRÍTICAS PARA ESTA TAREA:**
- ❌ NO crear archivos .md, .txt, README de documentación
- ✅ SOLO crear código funcional (.ts, .tsx, .sql)
- ⚠️ ANTES de crear migraciones SQL: 
  1. Revisar carpeta `supabase/migrations` completa
  2. Si la tabla NO existe ahí, preguntar: "¿La tabla X ya existe en la BD?"
  3. SOLO crear script si confirmas que NO existe
- ⚠️ ANTES de crear endpoints: verificar si ya existen en controladores
- ⚠️ NO duplicar tablas, columnas o endpoints existentes

**Tests críticos:**
- [x] Asiento de venta cuadra





- [x] Asiento de compra cuadra



- [x] Idempotencia de eventos



- [x] Validación de período cerrado



-

- [x] Cálculo de estados financieros





---

### TASK 4.13: Tests E2E Integración Completa
**Estimación:** 20 horas  
**Prioridad:** P0

**⚠️ VERIFICACIÓN OBLIGATORIA ANTES DE IMPLEMENTAR:**
1. **Buscar código existente** usando `grepSearch` y `fileSearch` para:
   - Tests E2E existentes de integración
   - Tests de flujos completos
   - Tests de asientos automáticos
2. **Leer archivos relacionados** para entender la estructura actual
3. **Verificar si la funcionalidad ya existe** antes de implementar
4. **Solo entonces proceder** con la implementación si no hay duplicación

**Archivo:** `apps/erp-api/tests/e2e/integracion-completa.spec.ts`

**Flujo completo a probar:**

**Escenario 1: Venta completa**
1. Crear pedido
2. Confirmar pedido (reserva inventario)
3. Despachar pedido
4. Generar factura (CPE)
5. **Validar asiento de venta generado**
6. Registrar cobro
7. **Validar asiento de cobro generado**
8. **Validar balance de comprobación correcto**

**Escenario 2: Compra completa**
1. Crear OC
2. Aprobar OC
3. Recepcionar mercancía
4. **Validar asiento de compra generado**
5. **Validar CxP creado**
6. Registrar pago proveedor
7. **Validar asiento de pago generado**
8. **Validar balance de comprobación correcto**

**Escenario 3: Cierre de período**
1. Procesar ventas y compras
2. Validar todos los asientos generados
3. Cerrar período
4. Validar no se pueden crear asientos
5. Generar estados financieros
6. Validar cálculos correctos

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
- 3 escenarios completos passing
- Asientos correctos
- Estados financieros correctos
- Sin eventos pendientes

---

### TASK 4.14: Validación con Contador
**Estimación:** 8 horas  
**Prioridad:** P0

**Descripción:**
Validar con contador profesional que los asientos y estados financieros son correctos.

**A-tividades:**

- [x] Presentar asientos generados


- [x] Validar clasificación de cuentas



- [x] Validar cálculos de estados financieros







- [x] Ajustar según feedback



- [ ] Documentar reglas contables

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
- Aprobación de contador
- Ajustes implementados
- Documentación actualizada

---

### TASK 4.15: Documentación Contable
**Estimación:** 8 horas  
**Prioridad:** P0

**Archivos:**
- `docs/modules/contabilidad/README.md`
- `docs/modules/contabilidad/reglas-contables.md`
- `docs/modules/contabilidad/plan-cuentas.md`
- `docs/modules/contabilidad/cierre-periodo.md`

**Contenido:**
- Reglas contables por tipo de transacción
- Plan de cuentas estándar
- Proceso de cierre de período
- Generación de estados financieros
- Troubleshooting común

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
- Documentación completa
- Ejemplos de asientos
- Guía de cierre

---

### TASK 4.16: Monitoreo de Eventos
**Estimación:** 6 horas  
**Prioridad:** P1

**⚠️ VERIFICACIÓN OBLIGATORIA ANTES DE IMPLEMENTAR:**
1. **Buscar código existente** usando `grepSearch` y `fileSearch` para:
   - Páginas de monitoreo existentes
   - Dashboards de eventos
   - Componentes de métricas
2. **Leer archivos relacionados** para entender la estructura actual
3. **Verificar si la funcionalidad ya existe** antes de implementar
4. **Solo entonces proceder** con la implementación si no hay duplicación

**Descripción:**
Crear dashboard de monitoreo de eventos contables.

**Archivo:** `apps/web/app/dashboard/contabilidad/monitoreo/page.tsx`

**Métricas:**
- [x] Eventos pendientes de procesar



- [x] Eventos procesados hoy




- [x] Eventos con error




- [x] Tiempo promedio de procesamiento




- [x] Asientos generados por tipo




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
- Dashboard informativo
- Alertas de eventos atascados
- Botón de reprocesar

---

## CHECKLIST FINAL FASE 4

### Base de Datos
- [ ] Migración 021 ejecutada
- [ ] Vistas materializadas creadas
- [ ] Plan de cuentas sembrado

### Backend
- [x] 7 tipos de asientos implementados



- [x] Listeners de eventos funcionales



- [x] Gestión de períodos completa


- [x] Estados financieros correctos



- [ ] Tests >= 80%

### Frontend
- [x] Página de asientos




- [x] Página de períodos

- [x] Página de estados financieros


- [x] Página de centros de costo



- [x] Dashboard de monitoreo




### Integración
- [ ] Asientos de ventas automáticos



- [ ] Asientos de compras automáticos
- [ ] Asientos de pagos/cobros automáticos
- [ ] Asientos de planilla automáticos
- [ ] Todos los eventos procesados

### Validación
- [ ] Contador aprueba asientos
- [ ] Estados financieros correctos
- [ ] Tests E2E passing
- [ ] Sin eventos pendientes

### Documentación
- [ ] Reglas contables documentadas
- [ ] Plan de cuentas documentado
- [ ] Proceso de cierre documentado

---

## MÉTRICAS DE ÉXITO

- **Completitud Contabilidad:** 95% (de 30%)
- **Asientos automáticos:** 100% de eventos
- **Balance cuadrado:** 100% de asientos
- **Estados financieros:** Correctos según contador
- **Eventos procesados:** < 1 min desde emisión
- **Cobertura tests:** >= 80%

