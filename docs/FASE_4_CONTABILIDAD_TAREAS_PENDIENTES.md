# FASE 4: CONTABILIDAD - TAREAS PENDIENTES (Desde Task 4.3)

**Fecha de creación:** 27 de octubre de 2025  
**Estado:** En progreso  
**Duración total estimada:** ~4 semanas  
**Prioridad:** P0 CRÍTICO

---

## 📋 RESUMEN EJECUTIVO

Este documento contiene TODAS las tareas pendientes de la Fase 4 (Contabilidad Integrada) desde la tarea 4.3 en adelante. La fase implementa:

- ✅ Generación automática de asientos contables desde eventos de negocio
- ✅ Gestión de períodos contables con cierre y validaciones
- ✅ Estados financieros (Balance de Comprobación, Estado de Resultados, Balance General)
- ✅ Centros de costo y asignación de gastos
- ✅ Integración completa con módulos de Ventas, Compras, CxC, CxP, Inventario, RRHH

---

## ⚠️ REGLAS CRÍTICAS PARA TODAS LAS TAREAS

### 1. NO CREAR DOCUMENTACIÓN
- ❌ NO crear archivos .md de documentación
- ❌ NO crear archivos .txt de documentación
- ❌ NO crear archivos README.md
- ❌ NO crear archivos IMPLEMENTATION_*.md
- ❌ NO crear archivos TASK_COMPLETED_*.md
- ✅ SOLO crear código funcional (.ts, .tsx, .sql, etc.)

### 2. VERIFICAR ANTES DE IMPLEMENTAR
**ANTES de crear cualquier tabla, endpoint o funcionalidad:**
1. Verificar si ya existe en el código
2. Buscar en controladores, servicios y migraciones
3. Documentar lo encontrado
4. Evitar duplicación

### 3. REVISAR TABLAS EXISTENTES
**ANTES de crear migraciones SQL:**
1. Revisar carpeta `supabase/migrations` completa
2. Preguntar si la tabla ya existe en la BD
3. SOLO crear script si confirmas que NO existe

---

## 📊 SEMANA 1: BASE DE DATOS Y REGLAS CONTABLES

### ✅ TASK 4.1: Crear Migración Contabilidad [COMPLETADA PARCIALMENTE]
**Estimación:** 4 horas | **Prioridad:** P0

**Estado actual:**
- ✅ Tablas `asientos_contables` y `detalle_asientos` actualizadas
- ✅ Tabla `plantillas_asientos` creada
- ⏳ Pendiente: tabla `presupuestos`
- ⏳ Pendiente: vistas materializadas
- ⏳ Pendiente: funciones de refresco

**Pendiente por hacer:**
- [ ] Crear tabla `presupuestos` (por centro_costo + cuenta + período)
- [ ] Crear vista materializada `mv_balance_comprobacion`
- [ ] Crear vista materializada `mv_estado_resultados`
- [ ] Crear vista materializada `mv_balance_general`
- [ ] Crear función `refrescar_estados_financieros(p_tenant_id, p_anio, p_mes)`

---

### ✅ TASK 4.2: Definir Plan de Cuentas Estándar [COMPLETADA]
**Estimación:** 6 horas | **Prioridad:** P0

**Estado:** ✅ COMPLETADA
- Plan de cuentas PCGE Perú sembrado
- Cuentas principales de nivel 2 y 3 creadas

---

### 🔴 TASK 4.3: Implementar Generador de Asientos
**Estimación:** 16 horas | **Prioridad:** P0 CRÍTICO

**Archivo:** `apps/erp-api/src/modules/contabilidad/services/asientos-generator.service.ts`

**Descripción:**
Servicio central que genera asientos contables automáticos desde eventos de negocio.

**Métodos a implementar:**
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

**Reglas contables a implementar:**

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

**Lógica común a implementar:**
- [ ] Validar período contable abierto
- [ ] Verificar idempotencia (source_event_id)
- [ ] Obtener cuentas del plan de cuentas
- [ ] Crear registro en `asientos_contables`
- [ ] Crear registros en `detalle_asientos` (debe y haber)
- [ ] Validar balance (suma debe = suma haber)
- [ ] Asignar centro_costo si aplica
- [ ] Marcar evento como procesado en outbox

**Criterios de aceptación:**
- ✅ 7 tipos de asientos implementados
- ✅ Validación de balance automática
- ✅ Idempotencia garantizada (no duplicar asientos)
- ✅ Tests unitarios >= 80% cobertura

---

### 🔴 TASK 4.4: Implementar Listeners de Eventos
**Estimación:** 12 horas | **Prioridad:** P0 CRÍTICO

**Archivo:** `apps/erp-api/src/modules/contabilidad/listeners/contabilidad-events.listener.ts`

**Descripción:**
Listeners que escuchan eventos de negocio y disparan la generación de asientos contables.

**Implementación:**
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

**Procesamiento a implementar:**
- [ ] Leer eventos de `outbox_events` (processed_at IS NULL)
- [ ] Procesar en orden cronológico (occurred_at ASC)
- [ ] Generar asiento correspondiente según tipo de evento
- [ ] Marcar evento como procesado (processed_at = NOW())
- [ ] Manejar errores con reintentos (max 3 intentos)
- [ ] Logging de errores en `event_processing_log`

**Criterios de aceptación:**
- ✅ Todos los 7 tipos de eventos escuchados
- ✅ Procesamiento idempotente (no reprocesar eventos)
- ✅ Manejo de errores robusto con reintentos
- ✅ Tests unitarios >= 80% cobertura

---

## 📊 SEMANA 2: PERIODOS Y ESTADOS FINANCIEROS

### 🔴 TASK 4.5: Implementar Gestión de Periodos
**Estimación:** 8 horas | **Prioridad:** P0

**Archivo:** `apps/erp-api/src/modules/contabilidad/services/periodos.service.ts`

**Endpoints a crear:**
- [ ] `POST /api/contabilidad/periodos` - Crear período contable
- [ ] `GET /api/contabilidad/periodos` - Listar períodos
- [ ] `GET /api/contabilidad/periodos/:id` - Obtener período
- [ ] `POST /api/contabilidad/periodos/:id/cerrar` - Cerrar período
- [ ] `POST /api/contabilidad/periodos/:id/reabrir` - Reabrir período (solo superadmin)
- [ ] `POST /api/contabilidad/periodos/:id/bloquear` - Bloquear período

**Lógica de cierre de período:**
1. [ ] Validar que todos los asientos cuadran (debe = haber)
2. [ ] Validar que no hay eventos pendientes de procesar
3. [ ] Cambiar estado a CERRADO
4. [ ] Bloquear creación de nuevos asientos en ese período
5. [ ] Generar asientos de cierre (si es fin de año fiscal)
6. [ ] Refrescar vistas materializadas

**Validaciones:**
- [ ] No cerrar si hay asientos descuadrados
- [ ] No cerrar si hay eventos pendientes en outbox
- [ ] No permitir crear asientos en períodos cerrados
- [ ] Solo superadmin puede reabrir períodos

**Criterios de aceptación:**
- ✅ Cierre de período funcional
- ✅ Validaciones correctas implementadas
- ✅ Reapertura controlada (solo superadmin)
- ✅ Tests unitarios >= 80% cobertura

---

### 🔴 TASK 4.6: Implementar Estados Financieros
**Estimación:** 16 horas | **Prioridad:** P0 CRÍTICO

**Archivo:** `apps/erp-api/src/modules/contabilidad/services/estados-financieros.service.ts`

**Endpoints a crear:**
- [ ] `GET /api/contabilidad/estados/balance-comprobacion?anio&mes`
- [ ] `GET /api/contabilidad/estados/estado-resultados?anio&mes`
- [ ] `GET /api/contabilidad/estados/balance-general?anio&mes`
- [ ] `POST /api/contabilidad/estados/refrescar` - Refrescar vistas materializadas

**1. Balance de Comprobación:**
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

**2. Estado de Resultados (P&L):**
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

**3. Balance General:**
```typescript
interface BalanceGeneral {
  activos: {
    corrientes: {
      efectivo: number;
      cuentas_por_cobrar: number;
      inventarios: number;
      total_corrientes: number;
    };
    no_corrientes: {
      activos_fijos: number;
      depreciacion_acumulada: number;
      total_no_corrientes: number;
    };
    total_activos: number;
  };
  pasivos: {
    corrientes: {
      cuentas_por_pagar: number;
      tributos_por_pagar: number;
      total_corrientes: number;
    };
    no_corrientes: {
      deudas_largo_plazo: number;
      total_no_corrientes: number;
    };
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

**Lógica a implementar:**
- [ ] Consultar vistas materializadas correspondientes
- [ ] Filtrar por tenant_id, anio, mes
- [ ] Calcular totales y subtotales
- [ ] Formatear según estándar contable peruano
- [ ] Implementar cache de 1 hora
- [ ] Validar ecuación contable: Activos = Pasivos + Patrimonio

**Criterios de aceptación:**
- ✅ 3 estados financieros implementados correctamente
- ✅ Cálculos validados por contador profesional
- ✅ Performance < 2 segundos por consulta
- ✅ Tests unitarios >= 80% cobertura

---

### ✅ TASK 4.7: Implementar Centros de Costo [COMPLETADA]
**Estimación:** 6 horas | **Prioridad:** P1

**Archivo:** `apps/erp-api/src/modules/contabilidad/services/centros-costo.service.ts`

**Estado:** ✅ COMPLETADA

**Endpoints implementados:**
- ✅ `POST /api/contabilidad/centros-costo` - Crear centro de costo
- ✅ `GET /api/contabilidad/centros-costo` - Listar centros
- ✅ `GET /api/contabilidad/centros-costo/:id` - Obtener centro
- ✅ `PUT /api/contabilidad/centros-costo/:id` - Actualizar centro
- ✅ `GET /api/contabilidad/centros-costo/:id/asientos` - Asientos por centro
- ✅ `GET /api/contabilidad/centros-costo/:id/reporte` - Reporte de gastos

**Funcionalidades implementadas:**
- ✅ CRUD completo de centros de costo
- ✅ Asignar centro de costo a asientos contables
- ✅ Reportes de gastos por centro de costo
- ✅ Comparación presupuesto vs real por centro

---

### 🔴 TASK 4.7.1: Implementar Presupuestos por Centro de Costo
**Estimación:** 8 horas | **Prioridad:** P1

**Archivo:** `apps/erp-api/src/modules/contabilidad/services/presupuestos.service.ts`

**Descripción:**
Implementar sistema de presupuestos por centro de costo, cuenta contable y período, con seguimiento de ejecución y alertas de sobregiro.

**Endpoints a crear:**
- [ ] `POST /api/contabilidad/presupuestos` - Crear presupuesto
- [ ] `GET /api/contabilidad/presupuestos` - Listar con filtros
- [ ] `GET /api/contabilidad/presupuestos/:id` - Detalle de presupuesto
- [ ] `PUT /api/contabilidad/presupuestos/:id` - Actualizar presupuesto
- [ ] `DELETE /api/contabilidad/presupuestos/:id` - Eliminar presupuesto
- [ ] `GET /api/contabilidad/presupuestos/centro/:centroId/periodo/:periodoId` - Por centro y período
- [ ] `GET /api/contabilidad/presupuestos/comparacion/:periodoId` - Presupuesto vs real

**Estructura de datos:**
```typescript
interface Presupuesto {
  id: string;
  tenant_id: string;
  centro_costo_id: string;
  cuenta_id: string;
  periodo_id: string;
  monto_presupuestado: number;
  monto_ejecutado: number; // calculado automáticamente
  porcentaje_ejecutado: number; // calculado automáticamente
  estado: 'ACTIVO' | 'CERRADO';
  notas?: string;
  created_at: Date;
  updated_at: Date;
}
```

**Funcionalidades a implementar:**
- [ ] CRUD completo de presupuestos
- [ ] Asignar presupuesto por centro de costo + cuenta + período
- [ ] Validar que no exista duplicado (centro + cuenta + período único)
- [ ] Calcular ejecución presupuestal automáticamente
- [ ] Alertas de sobregiro presupuestal (>90% y >100%)
- [ ] Reporte comparativo presupuesto vs real
- [ ] Exportar a Excel con formato

**Lógica de cálculo de ejecución:**
```typescript
// Sumar todos los asientos del centro de costo + cuenta en el período
const montosEjecutados = await this.db
  .select({ total: sum(detalle_asientos.monto) })
  .from(detalle_asientos)
  .innerJoin(asientos_contables, eq(detalle_asientos.asiento_id, asientos_contables.id))
  .where(
    and(
      eq(asientos_contables.centro_costo_id, presupuesto.centro_costo_id),
      eq(detalle_asientos.cuenta_id, presupuesto.cuenta_id),
      eq(asientos_contables.periodo_id, presupuesto.periodo_id)
    )
  );

// Calcular porcentaje
const porcentajeEjecutado = (montosEjecutados.total / presupuesto.monto_presupuestado) * 100;

// Alertas
if (porcentajeEjecutado > 100) {
  // Alerta crítica: sobregiro
} else if (porcentajeEjecutado > 90) {
  // Alerta advertencia: cerca del límite
}
```

**Validaciones:**
- [ ] No permitir duplicados (centro + cuenta + período)
- [ ] Monto presupuestado debe ser > 0
- [ ] Solo permitir editar presupuestos en períodos abiertos
- [ ] No permitir eliminar si ya tiene ejecución

**Reporte comparativo:**
```typescript
interface ReportePresupuestoVsReal {
  centro_costo: string;
  cuenta: string;
  monto_presupuestado: number;
  monto_ejecutado: number;
  diferencia: number;
  porcentaje_ejecutado: number;
  estado: 'OK' | 'ADVERTENCIA' | 'SOBREGIRO';
}
```

**Criterios de aceptación:**
- ✅ CRUD funcional con validaciones
- ✅ Cálculo de ejecución correcto y automático
- ✅ Alertas de sobregiro implementadas
- ✅ Reporte comparativo claro y útil
- ✅ Exportación a Excel funcional
- ✅ Tests unitarios >= 80% cobertura

---

## 📱 SEMANA 3: FRONTEND CONTABILIDAD

### 🔴 TASK 4.8: Página de Asientos Contables (Frontend)
**Estimación:** 14 horas | **Prioridad:** P0

**Archivos a crear:**
- `apps/web/app/dashboard/contabilidad/asientos/page.tsx`
- `apps/web/app/dashboard/contabilidad/asientos/[id]/page.tsx`
- `apps/web/app/dashboard/contabilidad/asientos/nuevo/page.tsx`
- `apps/web/components/contabilidad/AsientoViewer.tsx`
- `apps/web/components/contabilidad/AsientoForm.tsx`

**Funcionalidades a implementar:**
- [ ] Lista de asientos con filtros (fecha, origen, cuenta, monto)
- [ ] Ver detalle completo de asiento (debe/haber)
- [ ] Crear asiento manual con validación
- [ ] Validación en tiempo real de balance (debe = haber)
- [ ] Indicador visual de origen (automático vs manual)
- [ ] Búsqueda por número de asiento
- [ ] Paginación y ordenamiento
- [ ] Exportar a Excel/PDF

**Criterios de aceptación:**
- ✅ Lista funcional con filtros
- ✅ Detalle claro y legible
- ✅ Creación manual con validación de balance
- ✅ UX consistente con el resto del sistema

---

### 🔴 TASK 4.9: Página de Periodos Contables (Frontend)
**Estimación:** 10 horas | **Prioridad:** P0

**Archivos a crear:**
- `apps/web/app/dashboard/contabilidad/periodos/page.tsx`
- `apps/web/components/contabilidad/PeriodoCierreWizard.tsx`

**Funcionalidades a implementar:**
- [ ] Lista de períodos (año/mes, estado)
- [ ] Crear nuevo período contable
- [ ] Wizard de cierre con validaciones paso a paso
- [ ] Indicador de asientos pendientes de procesar
- [ ] Confirmación de cierre con advertencias
- [ ] Reapertura de período (solo superadmin)
- [ ] Indicadores visuales de estado (abierto/cerrado/bloqueado)

**Wizard de Cierre (pasos):**
1. Validar que todos los asientos cuadran
2. Validar que todos los eventos están procesados
3. Confirmar cierre del período
4. Procesar cierre

**Criterios de aceptación:**
- ✅ Wizard intuitivo y claro
- ✅ Validaciones visibles para el usuario
- ✅ Cierre funcional sin errores

---

### 🔴 TASK 4.10: Página de Estados Financieros (Frontend)
**Estimación:** 18 horas | **Prioridad:** P0 CRÍTICO

**Archivos a crear:**
- `apps/web/app/dashboard/contabilidad/estados/page.tsx`
- `apps/web/components/contabilidad/EstadosFinancierosTabs.tsx`
- `apps/web/components/contabilidad/BalanceComprobacion.tsx`
- `apps/web/components/contabilidad/EstadoResultados.tsx`
- `apps/web/components/contabilidad/BalanceGeneral.tsx`

**Funcionalidades a implementar:**
- [ ] Tabs: Balance Comprobación, Estado de Resultados, Balance General
- [ ] Selector de período (año/mes)
- [ ] Visualización tabular con formato contable
- [ ] Gráficos interactivos:
  - Ingresos vs Gastos (Estado de Resultados)
  - Activos vs Pasivos (Balance General)
  - Evolución mensual
- [ ] Exportar a Excel con formato contable
- [ ] Exportar a PDF con logo y formato profesional
- [ ] Comparación con período anterior (mes/año anterior)
- [ ] Drill-down a detalle de cuentas

**Criterios de aceptación:**
- ✅ 3 estados financieros visualizados correctamente
- ✅ Exportación funcional (Excel y PDF)
- ✅ Gráficos claros e informativos
- ✅ Performance < 3 segundos de carga

---

### 🔴 TASK 4.11: Página de Centros de Costo (Frontend)
**Estimación:** 10 horas | **Prioridad:** P1

**Archivos a crear:**
- `apps/web/app/dashboard/contabilidad/centros-costo/page.tsx`
- `apps/web/app/dashboard/contabilidad/centros-costo/[id]/page.tsx`
- `apps/web/components/contabilidad/CentroCostoCard.tsx`
- `apps/web/components/contabilidad/CentroCostoForm.tsx`

**Funcionalidades a implementar:**
- [ ] Lista de centros de costo con tarjetas
- [ ] Crear/editar centro de costo
- [ ] Ver asientos asignados por centro
- [ ] Reporte de gastos por centro de costo
- [ ] Comparación presupuesto vs real
- [ ] Gráfico de distribución de gastos

**Criterios de aceptación:**
- ✅ CRUD funcional
- ✅ Reportes básicos implementados
- ✅ Visualización clara y útil

---

### 🔴 TASK 4.11.1: Página de Presupuestos (Frontend)
**Estimación:** 12 horas | **Prioridad:** P1

**Archivos a crear:**
- `apps/web/app/dashboard/contabilidad/presupuestos/page.tsx`
- `apps/web/app/dashboard/contabilidad/presupuestos/nuevo/page.tsx`
- `apps/web/app/dashboard/contabilidad/presupuestos/[id]/page.tsx`
- `apps/web/components/contabilidad/PresupuestoForm.tsx`
- `apps/web/components/contabilidad/PresupuestoCard.tsx`
- `apps/web/components/contabilidad/PresupuestoVsRealChart.tsx`

**Funcionalidades a implementar:**
- [ ] Lista de presupuestos con filtros (centro, cuenta, período)
- [ ] Crear/editar presupuesto con validaciones
- [ ] Selector de centro de costo
- [ ] Selector de cuenta contable
- [ ] Selector de período
- [ ] Indicador visual de ejecución presupuestal:
  - Verde: < 80%
  - Amarillo: 80-100%
  - Rojo: > 100% (sobregiro)
- [ ] Barra de progreso de ejecución
- [ ] Alertas de sobregiro
- [ ] Reporte comparativo presupuesto vs real
- [ ] Gráfico de ejecución por centro de costo
- [ ] Exportar a Excel

**Componente PresupuestoCard:**
```typescript
interface PresupuestoCardProps {
  presupuesto: {
    centro_costo: string;
    cuenta: string;
    monto_presupuestado: number;
    monto_ejecutado: number;
    porcentaje_ejecutado: number;
  };
}

// Mostrar:
// - Nombre del centro y cuenta
// - Monto presupuestado vs ejecutado
// - Barra de progreso con colores
// - Badge de estado (OK/ADVERTENCIA/SOBREGIRO)
```

**Validaciones en formulario:**
- [ ] Centro de costo requerido
- [ ] Cuenta contable requerida
- [ ] Período requerido
- [ ] Monto presupuestado > 0
- [ ] No permitir duplicados (centro + cuenta + período)

**Criterios de aceptación:**
- ✅ CRUD funcional con validaciones
- ✅ Indicadores visuales claros
- ✅ Alertas de sobregiro visibles
- ✅ Reporte comparativo útil
- ✅ Exportación funcional

---

## 🧪 SEMANA 4: TESTING E INTEGRACIÓN FINAL

### 🔴 TASK 4.12: Tests Unitarios Backend
**Estimación:** 14 horas | **Prioridad:** P0

**Archivos a crear:**
- `apps/erp-api/src/modules/contabilidad/**/*.spec.ts`

**Servicios a probar:**
- [ ] `AsientosGeneratorService` (7 tipos de asientos)
  - Test: Asiento de venta cuadra correctamente
  - Test: Asiento de compra cuadra correctamente
  - Test: Asiento de cobro cuadra correctamente
  - Test: Asiento de pago cuadra correctamente
  - Test: Asiento de ajuste inventario cuadra
  - Test: Asiento de planilla cuadra
  - Test: Asiento de depreciación cuadra
  - Test: Idempotencia (no duplicar asientos)
  
- [ ] `ContabilidadEventsListener`
  - Test: Procesa eventos en orden
  - Test: Marca eventos como procesados
  - Test: Maneja errores con reintentos
  
- [ ] `PeriodosService`
  - Test: Cierre de período valida asientos
  - Test: No permite asientos en período cerrado
  - Test: Reapertura solo para superadmin
  
- [ ] `EstadosFinancierosService`
  - Test: Balance de comprobación correcto
  - Test: Estado de resultados correcto
  - Test: Balance general cuadra (Activos = Pasivos + Patrimonio)
  
- [ ] `CentrosCostoService`
  - Test: CRUD funcional
  - Test: Asignación a asientos

**Cobertura objetivo:** >= 80%

**Criterios de aceptación:**
- ✅ Todos los servicios con tests
- ✅ Cobertura >= 80%
- ✅ Tests passing en CI/CD

---

### 🔴 TASK 4.13: Tests E2E Integración Completa
**Estimación:** 20 horas | **Prioridad:** P0 CRÍTICO

**Archivo:** `apps/erp-api/tests/e2e/integracion-completa.spec.ts`

**Escenario 1: Venta completa (End-to-End)**
```typescript
describe('Flujo completo de venta', () => {
  it('debe generar asientos contables correctos', async () => {
    // 1. Crear pedido
    const pedido = await crearPedido();
    
    // 2. Confirmar pedido (reserva inventario)
    await confirmarPedido(pedido.id);
    
    // 3. Despachar pedido
    await despacharPedido(pedido.id);
    
    // 4. Generar factura (CPE)
    const factura = await generarFactura(pedido.id);
    
    // 5. VALIDAR: Asiento de venta generado automáticamente
    const asientoVenta = await obtenerAsientoPorEvento(factura.event_id);
    expect(asientoVenta).toBeDefined();
    expect(asientoVenta.debe_total).toBe(asientoVenta.haber_total);
    
    // 6. Registrar cobro
    const cobro = await registrarCobro(factura.id);
    
    // 7. VALIDAR: Asiento de cobro generado automáticamente
    const asientoCobro = await obtenerAsientoPorEvento(cobro.event_id);
    expect(asientoCobro).toBeDefined();
    
    // 8. VALIDAR: Balance de comprobación correcto
    const balance = await obtenerBalanceComprobacion();
    expect(balance.cuadra).toBe(true);
  });
});
```

**Escenario 2: Compra completa (End-to-End)**
```typescript
describe('Flujo completo de compra', () => {
  it('debe generar asientos contables correctos', async () => {
    // 1. Crear OC
    const oc = await crearOrdenCompra();
    
    // 2. Aprobar OC
    await aprobarOrdenCompra(oc.id);
    
    // 3. Recepcionar mercancía
    const recepcion = await recepcionarMercancia(oc.id);
    
    // 4. VALIDAR: Asiento de compra generado automáticamente
    const asientoCompra = await obtenerAsientoPorEvento(recepcion.event_id);
    expect(asientoCompra).toBeDefined();
    expect(asientoCompra.debe_total).toBe(asientoCompra.haber_total);
    
    // 5. VALIDAR: CxP creado correctamente
    const cxp = await obtenerCxPPorRecepcion(recepcion.id);
    expect(cxp).toBeDefined();
    expect(cxp.monto_pendiente).toBe(recepcion.total);
    
    // 6. Registrar pago a proveedor
    const pago = await registrarPagoProveedor(cxp.id);
    
    // 7. VALIDAR: Asiento de pago generado automáticamente
    const asientoPago = await obtenerAsientoPorEvento(pago.event_id);
    expect(asientoPago).toBeDefined();
    
    // 8. VALIDAR: Balance de comprobación correcto
    const balance = await obtenerBalanceComprobacion();
    expect(balance.cuadra).toBe(true);
  });
});
```

**Escenario 3: Cierre de período**
```typescript
describe('Cierre de período contable', () => {
  it('debe cerrar período correctamente', async () => {
    // 1. Procesar ventas y compras del mes
    await procesarVentasDelMes();
    await procesarComprasDelMes();
    
    // 2. VALIDAR: Todos los asientos generados
    const asientosPendientes = await obtenerAsientosPendientes();
    expect(asientosPendientes.length).toBe(0);
    
    // 3. Cerrar período
    const periodo = await cerrarPeriodo(2025, 10);
    expect(periodo.estado).toBe('CERRADO');
    
    // 4. VALIDAR: No se pueden crear asientos en período cerrado
    await expect(crearAsientoManual(periodo.id)).rejects.toThrow();
    
    // 5. Generar estados financieros
    const estadoResultados = await obtenerEstadoResultados(2025, 10);
    const balanceGeneral = await obtenerBalanceGeneral(2025, 10);
    
    // 6. VALIDAR: Cálculos correctos
    expect(estadoResultados.utilidad_neta).toBeDefined();
    expect(balanceGeneral.activos).toBe(
      balanceGeneral.pasivos + balanceGeneral.patrimonio
    );
  });
});
```

**Criterios de aceptación:**
- ✅ 3 escenarios completos passing
- ✅ Asientos contables correctos en cada paso
- ✅ Estados financieros correctos
- ✅ Sin eventos pendientes al final
- ✅ Balance siempre cuadrado

---

### 🔴 TASK 4.14: Validación con Contador
**Estimación:** 8 horas | **Prioridad:** P0

**Descripción:**
Validar con contador profesional que los asientos y estados financieros son correctos según normativa contable peruana.

**Actividades:**
- [ ] Presentar asientos generados al contador
- [ ] Validar clasificación de cuentas según PCGE
- [ ] Validar cálculos de estados financieros
- [ ] Revisar tratamiento de IGV (crédito fiscal y débito fiscal)
- [ ] Validar asientos de cierre de ejercicio
- [ ] Ajustar según feedback del contador
- [ ] Documentar reglas contables validadas

**Puntos críticos a validar:**
1. Asiento de venta con IGV
2. Asiento de compra con crédito fiscal
3. Costo de ventas (método PEPS)
4. Depreciación de activos fijos
5. Provisión de planilla
6. Balance general cuadrado
7. Estado de resultados correcto

**Criterios de aceptación:**
- ✅ Aprobación formal del contador
- ✅ Todos los ajustes implementados
- ✅ Documentación de reglas actualizada

---

### 🔴 TASK 4.15: Documentación Contable
**Estimación:** 8 horas | **Prioridad:** P0

**Archivos a crear:**
- `docs/modules/contabilidad/README.md`
- `docs/modules/contabilidad/reglas-contables.md`
- `docs/modules/contabilidad/plan-cuentas.md`
- `docs/modules/contabilidad/cierre-periodo.md`

**Contenido a documentar:**

**1. README.md**
- Descripción general del módulo
- Arquitectura de eventos
- Flujo de generación de asientos
- Integración con otros módulos

**2. reglas-contables.md**
- Reglas contables por tipo de transacción
- Ejemplos de asientos con montos
- Tratamiento de IGV
- Casos especiales

**3. plan-cuentas.md**
- Plan de cuentas PCGE completo
- Clasificación de cuentas
- Cuentas más usadas
- Mapeo con transacciones

**4. cierre-periodo.md**
- Proceso paso a paso de cierre
- Validaciones previas
- Asientos de cierre
- Generación de estados financieros
- Troubleshooting común

**Criterios de aceptación:**
- ✅ Documentación completa y clara
- ✅ Ejemplos prácticos incluidos
- ✅ Guía de troubleshooting útil

---

### 🔴 TASK 4.16: Monitoreo de Eventos
**Estimación:** 6 horas | **Prioridad:** P1

**Descripción:**
Crear dashboard de monitoreo de eventos contables para detectar problemas.

**Archivo:** `apps/web/app/dashboard/contabilidad/monitoreo/page.tsx`

**Métricas a mostrar:**
- [ ] Eventos pendientes de procesar (tiempo real)
- [ ] Eventos procesados hoy
- [ ] Eventos con error (últimas 24h)
- [ ] Tiempo promedio de procesamiento
- [ ] Asientos generados por tipo (gráfico)
- [ ] Alertas de eventos atascados (> 5 min sin procesar)

**Funcionalidades:**
- [ ] Tabla de eventos pendientes con detalle
- [ ] Botón de reprocesar evento manualmente
- [ ] Filtros por tipo de evento
- [ ] Refresh automático cada 30 segundos
- [ ] Notificaciones de eventos con error

**Criterios de aceptación:**
- ✅ Dashboard informativo y útil
- ✅ Alertas de eventos atascados
- ✅ Botón de reprocesar funcional

---

## ✅ CHECKLIST FINAL FASE 4

### Base de Datos
- [ ] Migración 021 ejecutada sin errores
- [ ] Tabla `presupuestos` creada
- [ ] Vistas materializadas creadas (balance, estado resultados, balance general)
- [ ] Funciones de refresco implementadas
- [ ] Plan de cuentas PCGE sembrado

### Backend - Servicios
- [ ] `AsientosGeneratorService` - 7 tipos de asientos implementados
- [ ] `ContabilidadEventsListener` - Listeners funcionales
- [ ] `PeriodosService` - Gestión de períodos completa
- [ ] `EstadosFinancierosService` - 3 estados financieros
- [x] `CentrosCostoService` - CRUD y reportes ✅
- [ ] `PresupuestosService` - Presupuestos por centro de costo
- [ ] Tests unitarios >= 80% cobertura

### Backend - Endpoints
- [ ] POST /api/contabilidad/asientos (crear manual)
- [ ] GET /api/contabilidad/asientos (listar)
- [ ] GET /api/contabilidad/asientos/:id (detalle)
- [ ] POST /api/contabilidad/periodos (crear)
- [ ] POST /api/contabilidad/periodos/:id/cerrar
- [ ] GET /api/contabilidad/estados/balance-comprobacion
- [ ] GET /api/contabilidad/estados/estado-resultados
- [ ] GET /api/contabilidad/estados/balance-general
- [ ] POST /api/contabilidad/centros-costo (CRUD)

### Frontend - Páginas
- [ ] Página de asientos contables
- [ ] Página de períodos contables
- [ ] Página de estados financieros (3 tabs)
- [ ] Página de centros de costo
- [ ] Página de presupuestos por centro de costo
- [ ] Dashboard de monitoreo de eventos

### Integración Automática
- [ ] Asientos de ventas automáticos (VentaFacturada)
- [ ] Asientos de compras automáticos (RecepcionRegistrada)
- [ ] Asientos de cobros automáticos (CobroRegistrado)
- [ ] Asientos de pagos automáticos (PagoProveedorRegistrado)
- [ ] Asientos de ajustes inventario automáticos
- [ ] Asientos de planilla automáticos (PlanillaLiquidada)
- [ ] Asientos de depreciación automáticos
- [ ] Todos los eventos procesados sin errores

### Validación
- [ ] Contador aprueba asientos generados
- [ ] Estados financieros correctos según normativa
- [ ] Balance siempre cuadrado (debe = haber)
- [ ] Tests E2E passing (3 escenarios)
- [ ] Sin eventos pendientes en outbox

### Documentación
- [ ] Reglas contables documentadas
- [ ] Plan de cuentas documentado
- [ ] Proceso de cierre documentado
- [ ] Guía de troubleshooting

---

## 📊 MÉTRICAS DE ÉXITO

**Objetivos cuantitativos:**
- ✅ Completitud Contabilidad: 95% (de 30% actual)
- ✅ Asientos automáticos: 100% de eventos procesados
- ✅ Balance cuadrado: 100% de asientos
- ✅ Estados financieros: Correctos según contador
- ✅ Eventos procesados: < 1 minuto desde emisión
- ✅ Cobertura tests: >= 80%
- ✅ Performance estados financieros: < 2 segundos

**Objetivos cualitativos:**
- ✅ Aprobación del contador profesional
- ✅ Cumplimiento normativa contable peruana (PCGE)
- ✅ Integración transparente con otros módulos
- ✅ UX intuitiva para usuarios contables

---

## 🚀 ORDEN DE IMPLEMENTACIÓN RECOMENDADO

### Semana 1 (Base)
1. TASK 4.1 - Completar migración (vistas materializadas)
2. TASK 4.3 - Implementar generador de asientos
3. TASK 4.4 - Implementar listeners de eventos

### Semana 2 (Estados Financieros)
4. TASK 4.5 - Gestión de períodos
5. TASK 4.6 - Estados financieros
6. ✅ TASK 4.7 - Centros de costo [COMPLETADA]
7. TASK 4.7.1 - Presupuestos por centro de costo

### Semana 3 (Frontend)
8. TASK 4.8 - Página de asientos
9. TASK 4.9 - Página de períodos
10. TASK 4.10 - Página de estados financieros
11. TASK 4.11 - Página de centros de costo
12. TASK 4.11.1 - Página de presupuestos

### Semana 4 (Testing y Validación)
13. TASK 4.12 - Tests unitarios backend
14. TASK 4.13 - Tests E2E integración completa
15. TASK 4.14 - Validación con contador
16. TASK 4.15 - Documentación contable
17. TASK 4.16 - Monitoreo de eventos

---

## 📝 NOTAS IMPORTANTES

### Dependencias Críticas
- La TASK 4.3 (Generador de Asientos) es bloqueante para todo lo demás
- La TASK 4.4 (Listeners) depende de 4.3
- Las tareas de frontend (4.8-4.11) dependen de backend (4.3-4.7)
- La validación con contador (4.14) debe hacerse antes de producción

### Riesgos Identificados
1. **Reglas contables incorrectas**: Mitigado con validación de contador
2. **Performance de vistas materializadas**: Mitigado con índices y cache
3. **Eventos no procesados**: Mitigado con monitoreo y alertas
4. **Balance descuadrado**: Mitigado con validaciones automáticas

### Puntos de Validación
- Después de TASK 4.3: Validar que asientos cuadran
- Después de TASK 4.6: Validar estados financieros con datos reales
- Después de TASK 4.13: Validar integración completa E2E
- Antes de producción: Aprobación formal del contador

---

## 🎯 CRITERIO DE COMPLETITUD

La Fase 4 se considera COMPLETA cuando:
1. ✅ Todos los 16 tasks están marcados como completados
2. ✅ Todos los tests (unitarios y E2E) están passing
3. ✅ El contador ha aprobado formalmente los asientos
4. ✅ Los estados financieros son correctos
5. ✅ No hay eventos pendientes en outbox
6. ✅ El balance siempre cuadra (debe = haber)
7. ✅ La documentación está completa

---

**Última actualización:** 27 de octubre de 2025  
**Próxima revisión:** Al completar cada semana

