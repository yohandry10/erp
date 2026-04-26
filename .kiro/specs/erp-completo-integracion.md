# SPEC: Sistema ERP Multi-Tenant - Integración Completa y Corrección de Gaps

**Versión:** 1.0.0  
**Fecha:** 23 de octubre de 2025  
**Prioridad:** P0 (CRÍTICO)  
**Estimación:** 24 semanas (6 meses)  
**Dependencias:** Análisis exhaustivo completado  
**Estado:** 📋 DRAFT - Pendiente de aprobación

---

## 🎯 RESUMEN EJECUTIVO

### Situación Actual
- **Completitud del ERP:** 48%
- **Puntuación Global:** 6.5/10
- **Vulnerabilidad Crítica:** 45 tablas sin RLS (riesgo de fuga cross-tenant)
- **Módulos Bloqueantes:** Compras (5%), Contabilidad (30%), Finanzas (40%)

### Objetivo
Transformar el sistema de un **ERP funcional para ventas** a un **ERP completo e integrado** mediante:
1. ✅ Corrección de seguridad multi-tenant (RLS en todas las tablas)
2. ✅ Implementación completa de Compras con integración
3. ✅ Finanzas completo (CxP + Tesorería + Conciliación)
4. ✅ Contabilidad integrada con asientos automáticos
5. ✅ Inventario multialmacén con valorización
6. ✅ Arquitectura de eventos de dominio
7. ✅ Testing exhaustivo E2E

### Resultado Esperado
- **Completitud:** 95%+
- **Puntuación:** 9/10
- **Seguridad:** 100% de tablas con RLS
- **Integración:** Todos los módulos conectados vía eventos
- **Listo para producción:** Empresa comercial completa

---

## CONTEXTO Y MOTIVACIÓN

### Estado Actual (Análisis Completado)

Según el análisis exhaustivo realizado:

- **Completitud General del ERP:** 48%
- **Puntuación Global:** 6.5/10
- **Módulos Funcionales:** Ventas (95%), Inventario (90%), CPE/GRE (95%), RRHH (80%)
- **Módulos Críticos Faltantes:** Compras (5%), Contabilidad (30%), Finanzas (40%)
- **Vulnerabilidad Crítica:** 45 tablas sin RLS habilitado

### Gaps Críticos Identificados

1. **Seguridad Multi-Tenant:** 45 tablas sin RLS (riesgo CRÍTICO)
2. **Módulo Compras:** No implementado (bloquea operación completa)
3. **Contabilidad:** Desconectada de todos los módulos operativos
4. **Finanzas:** Solo CxC implementado, falta CxP y tesorería
5. **Interconexión:** Contabilidad no recibe asientos automáticos

### Objetivo de Esta Spec

Transformar el sistema de un **ERP funcional para ventas (48%)** a un **ERP completo e integrado (95%+)** mediante:

1. Corrección de seguridad multi-tenant (RLS en todas las tablas)
2. Implementación completa del módulo de Compras
3. Implementación de Finanzas completo (CxP + Tesorería + Conciliación)
4. Integración contable automática de todos los módulos
5. Completar inventario multialmacén con valorización
6. Implementar eventos de dominio y orquestación E2E
7. Testing exhaustivo de integración

---

## ARQUITECTURA DE EVENTOS DE DOMINIO

### Principios Rectores

1. **Fuente única de verdad:** Cada módulo gobierna su dominio
2. **Eventos + Outbox:** Toda interconexión vía eventos confiables
3. **Idempotencia:** Consumidores ignoran eventos duplicados
4. **RLS extremo a extremo:** Todo respeta tenant_id
5. **Trazabilidad:** correlation_id en toda la cadena

### Tabla de Eventos de Dominio

| Evento | Productor | Consumidores | Payload Mínimo | Idempotencia |
|--------|-----------|--------------|----------------|--------------|
| `VentaFacturada` | CPE | Finanzas (CxC), Contabilidad, GRE, SIRE | tenant_id, cpe_id, pedido_id, cliente_id, total, base, igv, moneda, fecha | cpe_id |
| `CobroRegistrado` | Finanzas/CxC | Contabilidad, Tesorería, CxC | tenant_id, cobro_id, cxc_id, monto, metodo, banco_cuenta_id, fecha | cobro_id |
| `OrdenCompraAprobada` | Compras | Finanzas (CxP opcional), Inventario, Contabilidad | tenant_id, oc_id, proveedor_id, total, moneda, fecha_entrega | oc_id |
| `RecepcionRegistrada` | Compras | Inventario, Finanzas (CxP), Contabilidad, Calidad | tenant_id, recepcion_id, oc_id, items[], almacen_id, fecha | recepcion_id |
| `FacturaProveedorRegistrada` | Compras/Finanzas | CxP, Contabilidad, Tesorería | tenant_id, factura_id, proveedor_id, total, fecha_vencimiento | factura_id |
| `PagoProveedorRegistrado` | Tesorería | CxP, Contabilidad, Bancos | tenant_id, pago_id, cxp_id, monto, banco_cuenta_id, fecha | pago_id |
| `AjusteInventarioAplicado` | Inventario | Contabilidad, Analytics | tenant_id, ajuste_id, producto_id, cantidad, tipo, costo, almacen_id | ajuste_id |
| `NotaCreditoEmitida` | CPE | CxC, Contabilidad, Inventario (RMA) | tenant_id, nc_id, cpe_original_id, monto, motivo | nc_id |
| `NotaDebitoEmitida` | CPE | CxC, Contabilidad | tenant_id, nd_id, cpe_original_id, monto, motivo | nd_id |
| `GreGenerada` | GRE | Ventas/Logística, CPE, Auditoría | tenant_id, gre_id, cpe_id, pedido_id, numero | gre_id |
| `SireArchivoGenerado` | SIRE | Contabilidad, Compliance | tenant_id, sire_id, periodo, tipo, archivo_url | sire_id + periodo |
| `PlanillaLiquidada` | RRHH | Contabilidad, Finanzas | tenant_id, planilla_id, periodo, total_sueldos, total_aportes | planilla_id |
| `DepreciacionGenerada` | Activos Fijos | Contabilidad, Analytics | tenant_id, depreciacion_id, activo_id, periodo, monto | activo_id + periodo |
| `TransferenciaInventarioCompletada` | Inventario | Contabilidad, Analytics | tenant_id, transferencia_id, almacen_origen, almacen_destino, items[] | transferencia_id |
| `RmaAprobada` | Ventas/RMA | Inventario, CPE (NC), Contabilidad | tenant_id, rma_id, venta_id, items[], motivo | rma_id |

### Estructura de Evento (Outbox)

```typescript
interface OutboxEvent {
  id: string; // uuid
  tenant_id: string;
  correlation_id: string; // para tracing
  aggregate_type: string; // 'venta', 'compra', 'inventario', etc.
  aggregate_id: string; // ID del agregado
  event_type: string; // 'VentaFacturada', 'CobroRegistrado', etc.
  payload: Record<string, any>;
  occurred_at: Date;
  processed_at: Date | null;
  retry_count: number;
  error_message: string | null;
}
```

---

## FASE 1: SEGURIDAD MULTI-TENANT (P0 - Semana 1-2)

### Objetivo

Habilitar RLS en las 45 tablas identificadas sin protección.

### Tablas a Corregir

#### Módulo Finanzas (9 tablas - CRÍTICO)
- cuentas_por_pagar
- cuentas_bancarias
- conciliaciones_bancarias
- cobranzas
- gestiones_cobranza
- egresos
- gastos
- pagos_empleados
- pagos_facturas

#### Módulo Contabilidad (7 tablas - CRÍTICO)
- periodos_contables
- saldos_iniciales_cuentas
- centros_costo
- asignacion_costos
- libro_retenciones
- libros_electronicos_sunat
- inventarios_permanentes

#### Módulo RRHH (16 tablas - ALTO)
- planillas
- departamentos
- horarios_trabajo
- vacantes
- candidatos
- beneficios
- capacitaciones
- evaluaciones
- solicitudes
- liquidaciones
- conceptos_planilla
- empleado_beneficios
- empleado_capacitaciones
- empleado_horarios
- empleado_planilla_conceptos
- expediente_documentos

#### Módulo Activos Fijos (2 tablas - ALTO)
- activos_fijos
- depreciaciones

#### Otros (11 tablas - MEDIO)
- cajas
- registro_consignaciones
- movimientos_consignacion
- calendario_empresa
- configuracion_retenciones
- detalle_retenciones_categoria
- usuario_configuracion
- event_processing_log
- usuarios_sistemas

### Implementación

**Archivo:** `supabase/migrations/025_fix_rls_all_tables.sql`



```sql
-- Migration 025: Habilitar RLS en todas las tablas faltantes
-- Prioridad: P0 CRÍTICO
-- Fecha: 2025-10-23

BEGIN;

-- =====================================================
-- FUNCIÓN HELPER PARA AGREGAR TENANT_ID SI NO EXISTE
-- =====================================================
CREATE OR REPLACE FUNCTION add_tenant_id_if_missing(table_name text)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = 'tenant_id'
  ) THEN
    EXECUTE format('ALTER TABLE %I ADD COLUMN tenant_id UUID NOT NULL DEFAULT app.current_tenant_id()', table_name);
    EXECUTE format('CREATE INDEX idx_%I_tenant_id ON %I(tenant_id)', table_name, table_name);
    RAISE NOTICE 'Columna tenant_id agregada a %', table_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PLANTILLA RLS ESTÁNDAR
-- =====================================================
CREATE OR REPLACE FUNCTION enable_rls_tenant_isolation(table_name text)
RETURNS void AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
  EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON %I', table_name, table_name);
  EXECUTE format('
    CREATE POLICY %I_tenant_isolation ON %I
      FOR ALL
      USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
      WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  ', table_name, table_name);
  RAISE NOTICE 'RLS habilitado en %', table_name;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- MÓDULO FINANZAS (9 tablas)
-- =====================================================
SELECT add_tenant_id_if_missing('cuentas_por_pagar');
SELECT enable_rls_tenant_isolation('cuentas_por_pagar');

SELECT add_tenant_id_if_missing('cuentas_bancarias');
SELECT enable_rls_tenant_isolation('cuentas_bancarias');

SELECT add_tenant_id_if_missing('conciliaciones_bancarias');
SELECT enable_rls_tenant_isolation('conciliaciones_bancarias');

SELECT add_tenant_id_if_missing('cobranzas');
SELECT enable_rls_tenant_isolation('cobranzas');

SELECT add_tenant_id_if_missing('gestiones_cobranza');
SELECT enable_rls_tenant_isolation('gestiones_cobranza');

SELECT add_tenant_id_if_missing('egresos');
SELECT enable_rls_tenant_isolation('egresos');

SELECT add_tenant_id_if_missing('gastos');
SELECT enable_rls_tenant_isolation('gastos');

SELECT add_tenant_id_if_missing('pagos_empleados');
SELECT enable_rls_tenant_isolation('pagos_empleados');

SELECT add_tenant_id_if_missing('pagos_facturas');
SELECT enable_rls_tenant_isolation('pagos_facturas');

-- =====================================================
-- MÓDULO CONTABILIDAD (7 tablas)
-- =====================================================
SELECT add_tenant_id_if_missing('periodos_contables');
SELECT enable_rls_tenant_isolation('periodos_contables');

SELECT add_tenant_id_if_missing('saldos_iniciales_cuentas');
SELECT enable_rls_tenant_isolation('saldos_iniciales_cuentas');

SELECT add_tenant_id_if_missing('centros_costo');
SELECT enable_rls_tenant_isolation('centros_costo');

SELECT add_tenant_id_if_missing('asignacion_costos');
SELECT enable_rls_tenant_isolation('asignacion_costos');

SELECT add_tenant_id_if_missing('libro_retenciones');
SELECT enable_rls_tenant_isolation('libro_retenciones');

SELECT add_tenant_id_if_missing('libros_electronicos_sunat');
SELECT enable_rls_tenant_isolation('libros_electronicos_sunat');

SELECT add_tenant_id_if_missing('inventarios_permanentes');
SELECT enable_rls_tenant_isolation('inventarios_permanentes');

-- =====================================================
-- MÓDULO RRHH (16 tablas)
-- =====================================================
SELECT add_tenant_id_if_missing('planillas');
SELECT enable_rls_tenant_isolation('planillas');

SELECT add_tenant_id_if_missing('departamentos');
SELECT enable_rls_tenant_isolation('departamentos');

SELECT add_tenant_id_if_missing('horarios_trabajo');
SELECT enable_rls_tenant_isolation('horarios_trabajo');

SELECT add_tenant_id_if_missing('vacantes');
SELECT enable_rls_tenant_isolation('vacantes');

SELECT add_tenant_id_if_missing('candidatos');
SELECT enable_rls_tenant_isolation('candidatos');

SELECT add_tenant_id_if_missing('beneficios');
SELECT enable_rls_tenant_isolation('beneficios');

SELECT add_tenant_id_if_missing('capacitaciones');
SELECT enable_rls_tenant_isolation('capacitaciones');

SELECT add_tenant_id_if_missing('evaluaciones');
SELECT enable_rls_tenant_isolation('evaluaciones');

SELECT add_tenant_id_if_missing('solicitudes');
SELECT enable_rls_tenant_isolation('solicitudes');

SELECT add_tenant_id_if_missing('liquidaciones');
SELECT enable_rls_tenant_isolation('liquidaciones');

SELECT add_tenant_id_if_missing('conceptos_planilla');
SELECT enable_rls_tenant_isolation('conceptos_planilla');

SELECT add_tenant_id_if_missing('empleado_beneficios');
SELECT enable_rls_tenant_isolation('empleado_beneficios');

SELECT add_tenant_id_if_missing('empleado_capacitaciones');
SELECT enable_rls_tenant_isolation('empleado_capacitaciones');

SELECT add_tenant_id_if_missing('empleado_horarios');
SELECT enable_rls_tenant_isolation('empleado_horarios');

SELECT add_tenant_id_if_missing('empleado_planilla_conceptos');
SELECT enable_rls_tenant_isolation('empleado_planilla_conceptos');

SELECT add_tenant_id_if_missing('expediente_documentos');
SELECT enable_rls_tenant_isolation('expediente_documentos');

-- =====================================================
-- MÓDULO ACTIVOS FIJOS (2 tablas)
-- =====================================================
SELECT add_tenant_id_if_missing('activos_fijos');
SELECT enable_rls_tenant_isolation('activos_fijos');

SELECT add_tenant_id_if_missing('depreciaciones');
SELECT enable_rls_tenant_isolation('depreciaciones');

-- =====================================================
-- OTROS MÓDULOS (11 tablas)
-- =====================================================
SELECT add_tenant_id_if_missing('cajas');
SELECT enable_rls_tenant_isolation('cajas');

SELECT add_tenant_id_if_missing('registro_consignaciones');
SELECT enable_rls_tenant_isolation('registro_consignaciones');

SELECT add_tenant_id_if_missing('movimientos_consignacion');
SELECT enable_rls_tenant_isolation('movimientos_consignacion');

SELECT add_tenant_id_if_missing('calendario_empresa');
SELECT enable_rls_tenant_isolation('calendario_empresa');

SELECT add_tenant_id_if_missing('configuracion_retenciones');
SELECT enable_rls_tenant_isolation('configuracion_retenciones');

SELECT add_tenant_id_if_missing('detalle_retenciones_categoria');
SELECT enable_rls_tenant_isolation('detalle_retenciones_categoria');

SELECT add_tenant_id_if_missing('usuario_configuracion');
SELECT enable_rls_tenant_isolation('usuario_configuracion');

SELECT add_tenant_id_if_missing('event_processing_log');
SELECT enable_rls_tenant_isolation('event_processing_log');

SELECT add_tenant_id_if_missing('usuarios_sistemas');
SELECT enable_rls_tenant_isolation('usuarios_sistemas');

-- =====================================================
-- LIMPIAR FUNCIONES HELPER
-- =====================================================
DROP FUNCTION IF EXISTS add_tenant_id_if_missing(text);
DROP FUNCTION IF EXISTS enable_rls_tenant_isolation(text);

COMMIT;
```

### Tests de Validación RLS

**Archivo:** `apps/erp-api/tests/security/rls-validation.spec.ts`

```typescript
import { Test } from '@nestjs/testing';
import { SupabaseService } from '../../src/shared/supabase/supabase.service';

describe('RLS Security Validation', () => {
  let supabase: SupabaseService;
  const TENANT_A = '550e8400-e29b-41d4-a716-446655440000';
  const TENANT_B = '660e8400-e29b-41d4-a716-446655440001';

  const TABLES_TO_TEST = [
    // Finanzas
    'cuentas_por_pagar', 'cuentas_bancarias', 'conciliaciones_bancarias',
    'cobranzas', 'gestiones_cobranza', 'egresos', 'gastos',
    'pagos_empleados', 'pagos_facturas',
    // Contabilidad
    'periodos_contables', 'saldos_iniciales_cuentas', 'centros_costo',
    'asignacion_costos', 'libro_retenciones', 'libros_electronicos_sunat',
    'inventarios_permanentes',
    // RRHH
    'planillas', 'departamentos', 'horarios_trabajo', 'vacantes',
    'candidatos', 'beneficios', 'capacitaciones', 'evaluaciones',
    'solicitudes', 'liquidaciones', 'conceptos_planilla',
    // Activos
    'activos_fijos', 'depreciaciones',
    // Otros
    'cajas', 'registro_consignaciones', 'calendario_empresa'
  ];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [SupabaseService],
    }).compile();
    supabase = module.get(SupabaseService);
  });

  describe('Cross-Tenant Isolation', () => {
    TABLES_TO_TEST.forEach(table => {
      it(`should block cross-tenant access on ${table}`, async () => {
        // Intentar acceder a datos de TENANT_B con contexto de TENANT_A
        const client = supabase.getClient();
        
        // Simular headers de TENANT_A
        const { data, error } = await client
          .from(table)
          .select('*')
          .eq('tenant_id', TENANT_B);

        // Debe retornar 0 filas (RLS bloquea)
        expect(data).toEqual([]);
        expect(error).toBeNull();
      });

      it(`should allow same-tenant access on ${table}`, async () => {
        const client = supabase.getClient();
        
        const { data, error } = await client
          .from(table)
          .select('*')
          .eq('tenant_id', TENANT_A);

        // Debe permitir acceso
        expect(error).toBeNull();
      });
    });
  });

  describe('RLS Policy Existence', () => {
    it('should have RLS enabled on all critical tables', async () => {
      const { data: tables } = await supabase.getClient()
        .rpc('check_rls_enabled', { table_names: TABLES_TO_TEST });

      const missingRLS = tables.filter(t => !t.rls_enabled);
      expect(missingRLS).toEqual([]);
    });
  });
});
```

### Criterios de Aceptación

- [ ] Todas las 45 tablas tienen RLS habilitado
- [ ] Todas las tablas tienen política `tenant_isolation`
- [ ] Tests de seguridad pasan al 100%
- [ ] Auditoría de intentos de acceso cross-tenant
- [ ] Documentación de políticas RLS actualizada

---

## FASE 2: MÓDULO COMPRAS COMPLETO (P0 - Semana 3-6)

### Objetivo

Implementar módulo de compras end-to-end con integración a Inventario, CxP y Contabilidad.

### Base de Datos

**Archivo:** `supabase/migrations/019_compras_completo.sql`



```sql
-- Migration 019: Módulo de Compras Completo
-- Fecha: 2025-10-23
-- Descripción: Implementación completa de compras con integración a inventario, CxP y contabilidad

BEGIN;

-- =====================================================
-- ENUMS
-- =====================================================
CREATE TYPE condiciones_pago_enum AS ENUM ('CONTADO', '15D', '30D', '45D', '60D', '90D');
CREATE TYPE estado_cotizacion_compra_enum AS ENUM ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'VENCIDA');
CREATE TYPE estado_orden_compra_enum AS ENUM ('BORRADOR', 'APROBACION', 'APROBADA', 'PARCIAL', 'RECIBIDA', 'ANULADA');
CREATE TYPE estado_recepcion_enum AS ENUM ('EN_PROCESO', 'CERRADA', 'ANULADA');
CREATE TYPE calidad_recepcion_enum AS ENUM ('OK', 'OBSERVADO', 'RECHAZADO');
CREATE TYPE estado_devolucion_proveedor_enum AS ENUM ('BORRADOR', 'EMITIDA', 'PROCESADA', 'ANULADA');

-- =====================================================
-- TABLA: proveedores (actualizar si existe)
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proveedores' AND column_name = 'condiciones_pago') THEN
    ALTER TABLE proveedores ADD COLUMN condiciones_pago condiciones_pago_enum DEFAULT 'CONTADO';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proveedores' AND column_name = 'contacto') THEN
    ALTER TABLE proveedores ADD COLUMN contacto VARCHAR(200);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proveedores' AND column_name = 'limite_credito') THEN
    ALTER TABLE proveedores ADD COLUMN limite_credito NUMERIC(14,2) DEFAULT 0;
  END IF;
END $$;

-- =====================================================
-- TABLA: cotizaciones_compra
-- =====================================================
CREATE TABLE IF NOT EXISTS cotizaciones_compra (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  numero VARCHAR(20) NOT NULL,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  validez_dias INTEGER DEFAULT 30,
  moneda VARCHAR(3) DEFAULT 'PEN',
  estado estado_cotizacion_compra_enum DEFAULT 'BORRADOR',
  subtotal NUMERIC(14,2) DEFAULT 0,
  igv NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  notas TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, numero)
);

CREATE INDEX idx_cotizaciones_compra_tenant ON cotizaciones_compra(tenant_id);
CREATE INDEX idx_cotizaciones_compra_proveedor ON cotizaciones_compra(proveedor_id);
CREATE INDEX idx_cotizaciones_compra_estado ON cotizaciones_compra(estado);

ALTER TABLE cotizaciones_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY cotizaciones_compra_tenant_isolation ON cotizaciones_compra
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- =====================================================
-- TABLA: cotizacion_compra_detalles
-- =====================================================
CREATE TABLE IF NOT EXISTS cotizacion_compra_detalles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  cotizacion_id UUID NOT NULL REFERENCES cotizaciones_compra(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id),
  descripcion TEXT,
  cantidad NUMERIC(14,2) NOT NULL,
  precio_unitario NUMERIC(14,2) NOT NULL,
  descuento NUMERIC(14,2) DEFAULT 0,
  igv NUMERIC(14,2) DEFAULT 0,
  total_linea NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cotizacion_compra_detalles_tenant ON cotizacion_compra_detalles(tenant_id);
CREATE INDEX idx_cotizacion_compra_detalles_cotizacion ON cotizacion_compra_detalles(cotizacion_id);

ALTER TABLE cotizacion_compra_detalles ENABLE ROW LEVEL SECURITY;
CREATE POLICY cotizacion_compra_detalles_tenant_isolation ON cotizacion_compra_detalles
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- =====================================================
-- TABLA: ordenes_compra (actualizar si existe)
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_compra' AND column_name = 'numero') THEN
    ALTER TABLE ordenes_compra ADD COLUMN numero VARCHAR(20);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_compra' AND column_name = 'fecha_entrega_prevista') THEN
    ALTER TABLE ordenes_compra ADD COLUMN fecha_entrega_prevista DATE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_compra' AND column_name = 'centro_costo_id') THEN
    ALTER TABLE ordenes_compra ADD COLUMN centro_costo_id UUID REFERENCES centros_costo(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_compra' AND column_name = 'aprobado_por') THEN
    ALTER TABLE ordenes_compra ADD COLUMN aprobado_por UUID;
    ALTER TABLE ordenes_compra ADD COLUMN aprobado_at TIMESTAMPTZ;
  END IF;
END $$;

-- =====================================================
-- TABLA: orden_compra_detalles (actualizar si existe)
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orden_compra_detalles' AND column_name = 'cantidad_recibida') THEN
    ALTER TABLE orden_compra_detalles ADD COLUMN cantidad_recibida NUMERIC(14,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orden_compra_detalles' AND column_name = 'cantidad_pendiente') THEN
    ALTER TABLE orden_compra_detalles ADD COLUMN cantidad_pendiente NUMERIC(14,2) GENERATED ALWAYS AS (cantidad - cantidad_recibida) STORED;
  END IF;
END $$;

-- =====================================================
-- TABLA: oc_aprobaciones (similar a pedido_aprobaciones)
-- =====================================================
CREATE TABLE IF NOT EXISTS oc_aprobaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  orden_id UUID NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  nivel INTEGER NOT NULL,
  aprobador_id UUID NOT NULL,
  estado VARCHAR(20) DEFAULT 'PENDIENTE', -- PENDIENTE, APROBADA, RECHAZADA
  motivo TEXT,
  fecha_decision TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oc_aprobaciones_tenant ON oc_aprobaciones(tenant_id);
CREATE INDEX idx_oc_aprobaciones_orden ON oc_aprobaciones(orden_id);
CREATE INDEX idx_oc_aprobaciones_aprobador ON oc_aprobaciones(aprobador_id, estado);

ALTER TABLE oc_aprobaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY oc_aprobaciones_tenant_isolation ON oc_aprobaciones
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- =====================================================
-- TABLA: recepciones
-- =====================================================
CREATE TABLE IF NOT EXISTS recepciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  numero VARCHAR(20) NOT NULL,
  orden_id UUID NOT NULL REFERENCES ordenes_compra(id),
  almacen_id UUID NOT NULL REFERENCES almacenes(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  estado estado_recepcion_enum DEFAULT 'EN_PROCESO',
  guia_remision VARCHAR(50),
  transportista VARCHAR(200),
  observaciones TEXT,
  recibido_por UUID,
  cerrado_por UUID,
  cerrado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, numero)
);

CREATE INDEX idx_recepciones_tenant ON recepciones(tenant_id);
CREATE INDEX idx_recepciones_orden ON recepciones(orden_id);
CREATE INDEX idx_recepciones_almacen ON recepciones(almacen_id);
CREATE INDEX idx_recepciones_estado ON recepciones(estado);

ALTER TABLE recepciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY recepciones_tenant_isolation ON recepciones
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- =====================================================
-- TABLA: recepcion_items
-- =====================================================
CREATE TABLE IF NOT EXISTS recepcion_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  recepcion_id UUID NOT NULL REFERENCES recepciones(id) ON DELETE CASCADE,
  orden_detalle_id UUID NOT NULL REFERENCES orden_compra_detalles(id),
  producto_id UUID NOT NULL REFERENCES productos(id),
  cantidad_recibida NUMERIC(14,2) NOT NULL,
  lote VARCHAR(80),
  serie VARCHAR(80),
  fecha_vencimiento DATE,
  ubicacion_id UUID REFERENCES almacen_ubicaciones(id),
  calidad calidad_recepcion_enum DEFAULT 'OK',
  precio_unitario NUMERIC(14,2) NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recepcion_items_tenant ON recepcion_items(tenant_id);
CREATE INDEX idx_recepcion_items_recepcion ON recepcion_items(recepcion_id);
CREATE INDEX idx_recepcion_items_producto ON recepcion_items(producto_id);
CREATE INDEX idx_recepcion_items_calidad ON recepcion_items(calidad);

ALTER TABLE recepcion_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY recepcion_items_tenant_isolation ON recepcion_items
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- =====================================================
-- TABLA: devoluciones_proveedor
-- =====================================================
CREATE TABLE IF NOT EXISTS devoluciones_proveedor (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  numero VARCHAR(20) NOT NULL,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id),
  recepcion_id UUID REFERENCES recepciones(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  motivo TEXT NOT NULL,
  estado estado_devolucion_proveedor_enum DEFAULT 'BORRADOR',
  subtotal NUMERIC(14,2) DEFAULT 0,
  igv NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, numero)
);

CREATE INDEX idx_devoluciones_proveedor_tenant ON devoluciones_proveedor(tenant_id);
CREATE INDEX idx_devoluciones_proveedor_proveedor ON devoluciones_proveedor(proveedor_id);
CREATE INDEX idx_devoluciones_proveedor_estado ON devoluciones_proveedor(estado);

ALTER TABLE devoluciones_proveedor ENABLE ROW LEVEL SECURITY;
CREATE POLICY devoluciones_proveedor_tenant_isolation ON devoluciones_proveedor
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- =====================================================
-- TABLA: devolucion_items
-- =====================================================
CREATE TABLE IF NOT EXISTS devolucion_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  devolucion_id UUID NOT NULL REFERENCES devoluciones_proveedor(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id),
  cantidad NUMERIC(14,2) NOT NULL,
  precio_unitario NUMERIC(14,2) NOT NULL,
  motivo TEXT,
  lote VARCHAR(80),
  serie VARCHAR(80),
  total_linea NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devolucion_items_tenant ON devolucion_items(tenant_id);
CREATE INDEX idx_devolucion_items_devolucion ON devolucion_items(devolucion_id);

ALTER TABLE devolucion_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY devolucion_items_tenant_isolation ON devolucion_items
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- =====================================================
-- VISTAS
-- =====================================================
CREATE OR REPLACE VIEW vw_ordenes_compra_abiertas AS
SELECT 
  oc.*,
  p.razon_social as proveedor_nombre,
  p.ruc as proveedor_ruc,
  COUNT(DISTINCT r.id) as total_recepciones,
  SUM(ocd.cantidad) as cantidad_total,
  SUM(ocd.cantidad_recibida) as cantidad_recibida_total,
  SUM(ocd.cantidad_pendiente) as cantidad_pendiente_total
FROM ordenes_compra oc
JOIN proveedores p ON p.id = oc.proveedor_id
LEFT JOIN orden_compra_detalles ocd ON ocd.orden_id = oc.id
LEFT JOIN recepciones r ON r.orden_id = oc.id AND r.estado = 'CERRADA'
WHERE oc.estado IN ('APROBADA', 'PARCIAL')
GROUP BY oc.id, p.razon_social, p.ruc;

-- =====================================================
-- TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION actualizar_totales_cotizacion_compra()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE cotizaciones_compra
  SET 
    subtotal = (SELECT COALESCE(SUM(total_linea - igv), 0) FROM cotizacion_compra_detalles WHERE cotizacion_id = NEW.cotizacion_id),
    igv = (SELECT COALESCE(SUM(igv), 0) FROM cotizacion_compra_detalles WHERE cotizacion_id = NEW.cotizacion_id),
    total = (SELECT COALESCE(SUM(total_linea), 0) FROM cotizacion_compra_detalles WHERE cotizacion_id = NEW.cotizacion_id),
    updated_at = NOW()
  WHERE id = NEW.cotizacion_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_actualizar_totales_cotizacion_compra
AFTER INSERT OR UPDATE OR DELETE ON cotizacion_compra_detalles
FOR EACH ROW EXECUTE FUNCTION actualizar_totales_cotizacion_compra();

COMMIT;
```

### Backend - Estructura de Módulos

**Directorio:** `apps/erp-api/src/modules/compras/`

```
compras/
├── compras.module.ts
├── controllers/
│   ├── proveedores.controller.ts
│   ├── cotizaciones-compra.controller.ts
│   ├── ordenes-compra.controller.ts
│   ├── recepciones.controller.ts
│   └── devoluciones-proveedor.controller.ts
├── services/
│   ├── proveedores.service.ts
│   ├── cotizaciones-compra.service.ts
│   ├── ordenes-compra.service.ts
│   ├── recepciones.service.ts
│   └── devoluciones-proveedor.service.ts
├── repositories/
│   ├── proveedores.repository.ts
│   ├── ordenes-compra.repository.ts
│   └── recepciones.repository.ts
├── dto/
│   ├── create-proveedor.dto.ts
│   ├── create-cotizacion-compra.dto.ts
│   ├── create-orden-compra.dto.ts
│   ├── aprobar-orden-compra.dto.ts
│   ├── create-recepcion.dto.ts
│   ├── cerrar-recepcion.dto.ts
│   └── create-devolucion-proveedor.dto.ts
├── entities/
│   ├── proveedor.entity.ts
│   ├── orden-compra.entity.ts
│   └── recepcion.entity.ts
└── events/
    ├── orden-compra-aprobada.event.ts
    ├── recepcion-registrada.event.ts
    └── devolucion-proveedor-emitida.event.ts
```

### Implementación de Servicios Clave

**Archivo:** `apps/erp-api/src/modules/compras/services/recepciones.service.ts`

