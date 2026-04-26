# FASE 1: Seguridad Multi-Tenant - RLS en Todas las Tablas

**Prioridad:** P0 CRÍTICO  
**Duración:** 2 semanas  
**Dependencias:** Ninguna  
**Bloqueante para:** Producción

---

## 🎯 OBJETIVO

Habilitar Row Level Security (RLS) en las **45 tablas identificadas sin protección** para eliminar el riesgo crítico de fuga de datos cross-tenant.

---

## 📊 TABLAS A CORREGIR

### Módulo Finanzas (9 tablas) - CRÍTICO ❌
1. `cuentas_por_pagar`
2. `cuentas_bancarias`
3. `conciliaciones_bancarias`
4. `cobranzas`
5. `gestiones_cobranza`
6. `egresos`
7. `gastos`
8. `pagos_empleados`
9. `pagos_facturas`

### Módulo Contabilidad (7 tablas) - CRÍTICO ❌
10. `periodos_contables`
11. `saldos_iniciales_cuentas`
12. `centros_costo`
13. `asignacion_costos`
14. `libro_retenciones`
15. `libros_electronicos_sunat`
16. `inventarios_permanentes`

### Módulo RRHH (16 tablas) - ALTO ⚠️
17. `planillas`
18. `departamentos`
19. `horarios_trabajo`
20. `vacantes`
21. `candidatos`
22. `beneficios`
23. `capacitaciones`
24. `evaluaciones`
25. `solicitudes`
26. `liquidaciones`
27. `conceptos_planilla`
28. `empleado_beneficios`
29. `empleado_capacitaciones`
30. `empleado_horarios`
31. `empleado_planilla_conceptos`
32. `expediente_documentos`

### Módulo Activos Fijos (2 tablas) - ALTO ⚠️
33. `activos_fijos`
34. `depreciaciones`

### Otros Módulos (11 tablas) - MEDIO ⚠️
35. `cajas`
36. `registro_consignaciones`
37. `movimientos_consignacion`
38. `calendario_empresa`
39. `configuracion_retenciones`
40. `detalle_retenciones_categoria`
41. `usuario_configuracion`
42. `event_processing_log`
43. `usuarios_sistemas`
44. `usuarios_sistemasRLS` (duplicado?)
45. Revisar otras tablas de configuración

---

## 📝 IMPLEMENTACIÓN

### Archivo de Migración

**Ubicación:** `supabase/migrations/025_fix_rls_all_tables.sql`

**Contenido:** Ver spec principal para SQL completo

### Estrategia

1. **Agregar tenant_id** si no existe
2. **Crear índice** por tenant_id
3. **Habilitar RLS** en la tabla
4. **Crear política** `tenant_isolation` estándar
5. **Validar** con tests

### Plantilla RLS Estándar

```sql
-- Para cada tabla:
ALTER TABLE [tabla] ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS [tabla]_tenant_isolation ON [tabla];

CREATE POLICY [tabla]_tenant_isolation ON [tabla]
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());
```

---

## 🧪 TESTING

### Tests Automatizados

**Archivo:** `apps/erp-api/tests/security/rls-validation.spec.ts`

```typescript
describe('RLS Security Validation', () => {
  const TABLES = [/* lista de 45 tablas */];
  
  TABLES.forEach(table => {
    it(`should block cross-tenant access on ${table}`, async () => {
      // Intentar acceder a datos de otro tenant
      // Debe retornar 0 filas
    });
    
    it(`should allow same-tenant access on ${table}`, async () => {
      // Acceder a datos del mismo tenant
      // Debe permitir acceso
    });
  });
});
```

### Tests Manuales

1. **Login como Tenant A**
2. **Intentar acceder** a datos de Tenant B vía API
3. **Verificar** que retorna 0 resultados o error 403
4. **Repetir** para cada módulo crítico

---

## ✅ CRITERIOS DE ACEPTACIÓN

- [ ] Todas las 45 tablas tienen RLS habilitado
- [ ] Todas las tablas tienen política `tenant_isolation`
- [ ] Todas las tablas tienen índice por `tenant_id`
- [ ] Tests de seguridad pasan al 100%
- [ ] Documentación de políticas RLS actualizada
- [ ] Auditoría de intentos de acceso cross-tenant configurada
- [ ] Sin errores en aplicación existente

---

## 📅 PLAN DE EJECUCIÓN

### Semana 1: Implementación
- **Día 1-2:** Crear migración SQL completa
- **Día 3:** Ejecutar en ambiente de desarrollo
- **Día 4:** Validar que aplicación funciona correctamente
- **Día 5:** Crear tests automatizados

### Semana 2: Validación y Deploy
- **Día 1-2:** Ejecutar tests exhaustivos
- **Día 3:** Pruebas de penetración manuales
- **Día 4:** Deploy a staging
- **Día 5:** Deploy a producción con monitoreo

---

## ⚠️ RIESGOS Y MITIGACIONES

### Riesgo 1: Datos existentes sin tenant_id
**Mitigación:** Función helper asigna tenant_id basado en contexto o relaciones

### Riesgo 2: Queries existentes fallan
**Mitigación:** Validar todas las queries antes de deploy

### Riesgo 3: Performance degradado
**Mitigación:** Índices por tenant_id en todas las tablas

---

## 📊 MÉTRICAS DE ÉXITO

- **Cobertura RLS:** 100% (de 55% actual)
- **Tests de seguridad:** 100% passing
- **Intentos de acceso cross-tenant:** 0 exitosos
- **Performance:** Sin degradación > 5%
- **Errores en producción:** 0 relacionados a RLS

---

## 🔗 REFERENCIAS

- [Análisis de Tablas sin RLS](../../TABLAS_SIN_RLS_CRITICAS.md)
- [Documentación Multi-Tenant](../../docs/multi-tenant-headers.md)
- [Spec Principal](./erp-completo-integracion.md)

