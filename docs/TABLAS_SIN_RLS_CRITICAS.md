# TABLAS SIN RLS - ANÁLISIS CRÍTICO

**Fecha:** 23 de octubre de 2025  
**Prioridad:** CRÍTICA - Debe resolverse antes de producción

---

## RESUMEN EJECUTIVO

De las 140+ tablas en la base de datos, **45 tablas NO tienen Row Level Security (RLS) habilitado**, lo que representa un **riesgo de seguridad CRÍTICO** en un sistema multi-tenant.

**Impacto:** Cualquier usuario que logre bypassear el middleware podría acceder a datos de otros tenants.

---

## TABLAS SIN RLS POR MÓDULO

### MÓDULO FINANZAS (CRÍTICO) ❌

| Tabla | Descripción | Riesgo | Acción Requerida |
|-------|-------------|--------|------------------|
| `cuentas_por_pagar` | Deudas a proveedores | CRÍTICO | Habilitar RLS + política tenant_isolation |
| `cuentas_bancarias` | Cuentas bancarias empresa | CRÍTICO | Habilitar RLS + política tenant_isolation |
| `conciliaciones_bancarias` | Conciliaciones | ALTO | Habilitar RLS + política tenant_isolation |
| `cobranzas` | Gestión de cobranzas | ALTO | Habilitar RLS + política tenant_isolation |
| `gestiones_cobranza` | Historial gestiones | ALTO | Habilitar RLS + política tenant_isolation |
| `egresos` | Egresos y pagos | CRÍTICO | Habilitar RLS + política tenant_isolation |
| `gastos` | Registro de gastos | ALTO | Habilitar RLS + política tenant_isolation |
| `pagos_empleados` | Pagos a empleados | CRÍTICO | Habilitar RLS + política tenant_isolation |
| `pagos_facturas` | Pagos de clientes | ALTO | Habilitar RLS + política tenant_isolation |

**Total: 9 tablas críticas**

---

### MÓDULO CONTABILIDAD (CRÍTICO) ❌

| Tabla | Descripción | Riesgo | Acción Requerida |
|-------|-------------|--------|------------------|
| `periodos_contables` | Periodos fiscales | ALTO | Habilitar RLS + política tenant_isolation |
| `saldos_iniciales_cuentas` | Saldos iniciales | ALTO | Habilitar RLS + política tenant_isolation |
| `centros_costo` | Centros de costo | MEDIO | Habilitar RLS + política tenant_isolation |
| `asignacion_costos` | Asignación de costos | MEDIO | Habilitar RLS + política tenant_isolation |
| `libro_retenciones` | Libro de retenciones | ALTO | Habilitar RLS + política tenant_isolation |
| `libros_electronicos_sunat` | Libros electrónicos | ALTO | Habilitar RLS + política tenant_isolation |
| `inventarios_permanentes` | Inventario permanente | MEDIO | Habilitar RLS + política tenant_isolation |

**Total: 7 tablas críticas**

---

### MÓDULO RRHH (ALTO) ⚠️

| Tabla | Descripción | Riesgo | Acción Requerida |
|-------|-------------|--------|------------------|
| `planillas` | Periodos de planilla | ALTO | Habilitar RLS + política tenant_isolation |
| `departamentos` | Departamentos empresa | MEDIO | Habilitar RLS + política tenant_isolation |
| `horarios_trabajo` | Horarios configurables | MEDIO | Habilitar RLS + política tenant_isolation |
| `vacantes` | Vacantes de empleo | BAJO | Habilitar RLS + política tenant_isolation |
| `candidatos` | Candidatos a vacantes | BAJO | Habilitar RLS + política tenant_isolation |
| `beneficios` | Catálogo de beneficios | MEDIO | Habilitar RLS + política tenant_isolation |
| `capacitaciones` | Catálogo capacitaciones | BAJO | Habilitar RLS + política tenant_isolation |
| `evaluaciones` | Evaluaciones desempeño | MEDIO | Habilitar RLS + política tenant_isolation |
| `solicitudes` | Solicitudes vacaciones | MEDIO | Habilitar RLS + política tenant_isolation |
| `liquidaciones` | Liquidaciones | ALTO | Habilitar RLS + política tenant_isolation |
| `conceptos_planilla` | Conceptos de planilla | MEDIO | Habilitar RLS + política tenant_isolation |
| `empleado_beneficios` | Beneficios por empleado | MEDIO | Habilitar RLS + política tenant_isolation |
| `empleado_capacitaciones` | Capacitaciones tomadas | BAJO | Habilitar RLS + política tenant_isolation |
| `empleado_horarios` | Horarios asignados | MEDIO | Habilitar RLS + política tenant_isolation |
| `empleado_planilla_conceptos` | Conceptos aplicados | MEDIO | Habilitar RLS + política tenant_isolation |
| `expediente_documentos` | Expediente digital | MEDIO | Habilitar RLS + política tenant_isolation |

**Total: 16 tablas**

---

### MÓDULO ACTIVOS FIJOS (ALTO) ❌

| Tabla | Descripción | Riesgo | Acción Requerida |
|-------|-------------|--------|------------------|
| `activos_fijos` | Activos de la empresa | ALTO | Habilitar RLS + política tenant_isolation |
| `depreciaciones` | Depreciaciones | ALTO | Habilitar RLS + política tenant_isolation |

**Total: 2 tablas**

---

### MÓDULO INVENTARIO (MEDIO) ⚠️

| Tabla | Descripción | Riesgo | Acción Requerida |
|-------|-------------|--------|------------------|
| `cajas` | Gestión de cajas | MEDIO | Habilitar RLS + política tenant_isolation |
| `registro_consignaciones` | Bienes en consignación | MEDIO | Habilitar RLS + política tenant_isolation |
| `movimientos_consignacion` | Movimientos consignación | MEDIO | Habilitar RLS + política tenant_isolation |

**Total: 3 tablas**

---

### MÓDULO CONFIGURACIÓN (MEDIO) ⚠️

| Tabla | Descripción | Riesgo | Acción Requerida |
|-------|-------------|--------|------------------|
| `calendario_empresa` | Feriados y eventos | BAJO | Habilitar RLS + política tenant_isolation |
| `configuracion_retenciones` | Config retenciones | MEDIO | Habilitar RLS + política tenant_isolation |
| `detalle_retenciones_categoria` | Detalle retenciones | MEDIO | Habilitar RLS + política tenant_isolation |
| `usuario_configuracion` | Config por usuario | MEDIO | Habilitar RLS + política tenant_isolation |

**Total: 4 tablas**

---

### MÓDULO OTROS (BAJO-MEDIO) ⚠️

| Tabla | Descripción | Riesgo | Acción Requerida |
|-------|-------------|--------|------------------|
| `event_processing_log` | Log procesamiento eventos | BAJO | Habilitar RLS + política tenant_isolation |
| `usuarios_sistemas` | Usuarios (duplicado?) | MEDIO | Revisar si es necesaria + RLS |

**Total: 2 tablas**

---

## SCRIPT DE CORRECCIÓN SUGERIDO

```sql
-- =====================================================
-- SCRIPT PARA HABILITAR RLS EN TODAS LAS TABLAS
-- =====================================================

BEGIN;

-- FINANZAS
ALTER TABLE cuentas_por_pagar ENABLE ROW LEVEL SECURITY;
CREATE POLICY cuentas_por_pagar_tenant_isolation ON cuentas_por_pagar
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

ALTER TABLE cuentas_bancarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY cuentas_bancarias_tenant_isolation ON cuentas_bancarias
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

ALTER TABLE conciliaciones_bancarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY conciliaciones_bancarias_tenant_isolation ON conciliaciones_bancarias
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

ALTER TABLE cobranzas ENABLE ROW LEVEL SECURITY;
CREATE POLICY cobranzas_tenant_isolation ON cobranzas
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

ALTER TABLE gestiones_cobranza ENABLE ROW LEVEL SECURITY;
CREATE POLICY gestiones_cobranza_tenant_isolation ON gestiones_cobranza
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

ALTER TABLE egresos ENABLE ROW LEVEL SECURITY;
CREATE POLICY egresos_tenant_isolation ON egresos
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
CREATE POLICY gastos_tenant_isolation ON gastos
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

ALTER TABLE pagos_empleados ENABLE ROW LEVEL SECURITY;
CREATE POLICY pagos_empleados_tenant_isolation ON pagos_empleados
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

ALTER TABLE pagos_facturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pagos_facturas_tenant_isolation ON pagos_facturas
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- CONTABILIDAD
ALTER TABLE periodos_contables ENABLE ROW LEVEL SECURITY;
CREATE POLICY periodos_contables_tenant_isolation ON periodos_contables
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

ALTER TABLE saldos_iniciales_cuentas ENABLE ROW LEVEL SECURITY;
CREATE POLICY saldos_iniciales_cuentas_tenant_isolation ON saldos_iniciales_cuentas
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

ALTER TABLE centros_costo ENABLE ROW LEVEL SECURITY;
CREATE POLICY centros_costo_tenant_isolation ON centros_costo
  FOR ALL USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- Continuar con todas las demás tablas...

COMMIT;
```

---

## PRIORIZACIÓN DE CORRECCIÓN

### Fase 1 - CRÍTICO (Semana 1)
- ✅ Todas las tablas de FINANZAS (9 tablas)
- ✅ Tablas de ACTIVOS FIJOS (2 tablas)
- ✅ `planillas` y `liquidaciones` de RRHH

**Total: 13 tablas**

### Fase 2 - ALTO (Semana 2)
- ✅ Todas las tablas de CONTABILIDAD (7 tablas)
- ✅ Tablas críticas de RRHH (6 tablas)

**Total: 13 tablas**

### Fase 3 - MEDIO (Semana 3)
- ✅ Resto de tablas de RRHH (10 tablas)
- ✅ Tablas de INVENTARIO (3 tablas)
- ✅ Tablas de CONFIGURACIÓN (4 tablas)

**Total: 17 tablas**

### Fase 4 - BAJO (Semana 4)
- ✅ Tablas restantes (2 tablas)
- ✅ Pruebas de seguridad completas
- ✅ Auditoría final

---

## RECOMENDACIONES ADICIONALES

1. **Crear migración única:** Consolidar todas las correcciones en una sola migración `018_enable_rls_all_tables.sql`

2. **Pruebas automatizadas:** Crear tests que validen RLS en todas las tablas:
   ```typescript
   describe('RLS Security Tests', () => {
     it('should block cross-tenant access on all tables', async () => {
       // Test para cada tabla
     });
   });
   ```

3. **Monitoreo:** Implementar alertas para detectar intentos de acceso cross-tenant

4. **Documentación:** Actualizar documentación de seguridad con políticas RLS

---

**CONCLUSIÓN:** La habilitación de RLS en estas 45 tablas es **CRÍTICA** y debe completarse antes de cualquier despliegue en producción. El riesgo de fuga de datos entre tenants es **INACEPTABLE** en el estado actual.

