# TASKS - FASE 1: Seguridad Multi-Tenant (RLS)

**Duración:** 2 semanas  
**Prioridad:** P0 CRÍTICO  
**Responsable:** Backend + DevOps

---

## ⚠️ NOTA IMPORTANTE SOBRE MIGRACIONES

**Migración 025 - RLS Principal (COMPLETA):**
- Archivo: `supabase/migrations/025_fix_rls_all_tables.sql`
- Tamaño: 2021 líneas
- Contenido: RLS para 45 tablas (Finanzas, Contabilidad, RRHH, Activos Fijos, Otros)
- Estado: ✅ COMPLETA - NO MODIFICAR MÁS

**Próximas Migraciones:**
- **033+**: Auditoría, correcciones, mejoras
- **Regla**: NO agregar más código a la migración 025
- **Razón**: Archivo muy grande (2000+ líneas), difícil de mantener

---

## SEMANA 1: Implementación

### TASK 1.1: Crear Migración SQL Base
**Estimación:** 4 horas  
**Prioridad:** P0

**Descripción:**
Crear archivo de migración `supabase/migrations/025_fix_rls_all_tables.sql` con funciones helper y plantillas RLS.

**Subtareas:**
- [x] Crear función `add_tenant_id_if_missing(table_name text)`





- [x] Crear función `enable_rls_tenant_isolation(table_name text)`





- [x] Documentar uso de funciones helper




- [ ] Validar sintaxis SQL





**Archivos:**
- `supabase/migrations/025_fix_rls_all_tables.sql`

**Criterios de Aceptación:**
- Funciones helper creadas y probadas
- Sintaxis SQL válida
- Documentación inline completa

---

### TASK 1.2: Habilitar RLS en Módulo Finanzas (9 tablas)
**Estimación:** 3 horas  
**Prioridad:** P0

**Descripción:**                                                  
Aplicar RLS a las 9 tablas críticas del módulo Finanzas.

**Tablas:**
1. cuentas_por_pagar
2. cuentas_bancarias
3. conciliaciones_bancarias
4. cobranzas
5. gestiones_cobranza
6. egresos
7. gastos
8. pagos_empleados
9. pagos_facturas

**Subtareas:**
- [x] Agregar tenant_id a cada tabla (si falta)










- [x] Crear índices por tenant_id




- [ ] Habilitar RLS en cada tabla




- [ ] Crear política tenant_isolation
- [ ] Validar datos existentes

**SQL por tabla:**
```sql
SELECT add_tenant_id_if_missing('cuentas_por_pagar');
SELECT enable_rls_tenant_isolation('cuentas_por_pagar');
-- Repetir para las 9 tablas
```

**Criterios de Aceptación:**
- 9 tablas con RLS habilitado
- Índices creados
- Políticas activas
- Sin errores en queries existentes

---

### TASK 1.3: Habilitar RLS en Módulo Contabilidad (7 tablas)
**Estimación:** 2 horas  
**Prioridad:** P0

**Descripción:**
Aplicar RLS a las 7 tablas del módulo Contabilidad.

**Tablas:**
1. periodos_contables
2. saldos_iniciales_cuentas
3. centros_costo
4. asignacion_costos
5. libro_retenciones
6. libros_electronicos_sunat
7. inventarios_permanentes

**S-btareas:**

- [x] Aplicar plantilla RLS a cada tabla


- [x] Validar relaciones FK


- [x] Verificar datos existentes


**Criterios de Aceptación:**
- 7 tablas con RLS habilitado
- Sin romper funcionalidad contable existente

---

### TASK 1.4: Habilitar RLS en Módulo RRHH (16 tablas)
**Estimación:** 4 horas  
**Prioridad:** P0

**Descripción:**
Aplicar RLS a las 16 tablas del módulo RRHH.

**Tablas:**
1. planillas
2. departamentos
3. horarios_trabajo
4. vacantes
5. candidatos
6. beneficios
7. capacitaciones
8. evaluaciones
9. solicitudes
10. liquidaciones
11. conceptos_planilla
12. empleado_beneficios
13. empleado_capacitaciones
14. empleado_horarios
15. empleado_planilla_conceptos
16. expediente_documentos

**Subtareas:**
- [x] Aplicar RLS a tablas maestras (departamentos, horarios, beneficios)




- [x] Aplicar RLS a tablas transaccionales (planillas, liquidaciones)





- [x] Aplicar RLS a tablas de relación (empleado_*)






- [x] Validar flujo de planillas







**Criterios de Aceptación:**
- 16 tablas con RLS habilitado
- Flujo de planillas funcional
- Sin errores en RRHH

---

### TASK 1.5: Habilitar RLS en Activos Fijos y Otros (13 tablas)
**Estimación:** 3 horas  
**Prioridad:** P0

**Descripción:**
Aplicar RLS a las tablas restantes.

**Tablas:**
- activos_fijos
- depreciaciones
- cajas
- registro_consignaciones
- movimientos_consignacion
- calendario_empresa
- configuracion_retenciones
- detalle_retenciones_categoria
- usuario_configuracion
- event_processing_log
- usuarios_sistemas

**Subtareas:**
- [x] Aplicar RLS a cada tabla



- [x] Validar configuraciones globales vs por tenant

**Criterios de Aceptación:**
- Todas las tablas restantes con RLS
- Total: 45 tablas protegidas

---

### TASK 1.6: Ejecutar Migración en Desarrollo
**Estimación:** 2 horas  
**Prioridad:** P0

**Descripción:**
Ejecutar migración completa en ambiente de desarrollo y validar.

**NOTA:** La migración 025 ya tiene 2021 líneas. Las siguientes correcciones y mejoras deben ir en nuevos archivos de migración (033 en adelante).

**Subtareas:**
- [ ] Backup de base de datos desarrollo



- [ ] Ejecutar migración 025
- [ ] Validar que no hay errores
- [ ] Probar queries existentes
- [ ] Validar aplicación web funciona
- [ ] Validar API funciona

**Comando:**
```bash
cd supabase
supabase db push
```

**Criterios de Aceptación:**
- Migración ejecutada sin errores
- Aplicación funcional
- Sin regresiones

---

## SEMANA 2: Testing y Deploy

### TASK 2.1: Crear Tests de Seguridad Automatizados
**Estimación:** 6 horas  
**Prioridad:** P0

**Descripción:**
Crear suite de tests que valide RLS en todas las tablas.

**Archivo:** `apps/erp-api/tests/security/rls-validation.spec.ts`

**Subtareas:**
- [ ] Crear test base para cross-tenant access
- [ ] Crear test para same-tenant access
- [ ] Crear test para superadmin access
- [ ] Aplicar a las 45 tablas
- [ ] Crear test de existencia de políticas RLS
- [ ] Crear test de índices por tenant_id

**Tests por tabla:**
```typescript
describe('RLS on [tabla]', () => {
  it('should block cross-tenant access');
  it('should allow same-tenant access');
  it('should allow superadmin access');
});
```

**Criterios de Aceptación:**
- 45 tablas con tests
- 100% de tests passing
- Cobertura de casos edge

---

### TASK 2.2: Tests de Integración por Módulo
**Estimación:** 4 horas  
**Prioridad:** P0

**Descripción:**
Validar que cada módulo funciona correctamente con RLS habilitado.

**Módulos a probar:**
- [x] Finanzas: Crear CxC, registrar pago
- [x] Contabilidad: Crear asiento, consultar balance
- [x] RRHH: Crear planilla, liquidar
- [x] Ventas: Crear pedido, facturar (regresión) - Crear en `apps/erp-api/tests/integration/ventas-rls.test.ts`





- [x] Inventario: Movimientos (regresión) - Crear en `apps/erp-api/tests/integration/inventario-rls.test.ts`






**Criterios de Aceptación:**
- Todos los flujos funcionales
- Sin errores de permisos
- Performance aceptable

---

### TASK 2.3: Pruebas de Penetración Manuales
**Estimación:** 4 horas  
**Prioridad:** P0

**Descripción:**
Intentar acceder a datos de otros tenants de forma manual.

**Escenarios:**
1. **Login como Tenant A**
   - Intentar GET /finanzas/cxp con tenant_id de Tenant B
   - Intentar POST a tabla de Tenant B
   - Intentar UPDATE de registro de Tenant B

2. **Manipulación de Headers**
   - Enviar X-Tenant-Id diferente al del token
   - Omitir X-Tenant-Id
   - Enviar tenant_id inválido

3. **SQL Injection**
   - Intentar bypass de RLS con queries maliciosas

**Criterios de Aceptación:**
- 0 accesos exitosos cross-tenant
- Todos los intentos bloqueados
- Logs de auditoría registran intentos

---

### TASK 2.4: Configurar Auditoría de Accesos
**Estimación:** 3 horas  
**Prioridad:** P0

**Descripción:**
Configurar logging de intentos de acceso cross-tenant.

**IMPORTANTE:** Crear en nuevo archivo de migración (033 o posterior), NO en 025.

**Subtareas:**
- [x] Crear trigger de auditoría para intentos bloqueados





- [x] Configurar alertas en logs




- [x] Crear dashboard de seguridad




- [ ] Documentar proceso de revisión

**Archivo:** `supabase/migrations/033_audit_rls_violations.sql`

**Criterios de Aceptación:**
- Intentos bloqueados registrados
- Alertas configuradas
- Dashboard visible

---

### TASK 2.5: Documentación de Políticas RLS
**Estimación:** 2 horas  
**Prioridad:** P1

**Descripción:**
Documentar todas las políticas RLS implementadas.

**Archivo:** `docs/security/rls-policies.md`

**Contenido:**
- Lista de 45 tablas con RLS
- Política aplicada a cada una
- Excepciones (si existen)
- Proceso de agregar RLS a nuevas tablas
- Troubleshooting común

**Criterios de Aceptación:**
- Documentación completa
- Ejemplos de uso
- Guía de troubleshooting

---

### TASK 2.6: Deploy a Staging
**Estimación:** 3 horas  
**Prioridad:** P0

**Descripción:**
Desplegar migración a ambiente de staging.

**NOTA:** Si se requieren correcciones después de este deploy, crear nuevas migraciones (034, 035, etc.) en lugar de modificar la 025.

**Subtareas:**
- [ ] Backup completo de staging
- [ ] Ejecutar migración 025
- [ ] Ejecutar migración 033 (auditoría) si está lista
- [ ] Ejecutar tests automatizados
- [ ] Validar aplicación web
- [ ] Validar API
- [ ] Monitorear logs por 24h

**Criterios de Aceptación:**
- Migración exitosa
- Tests passing
- Sin errores en logs
- Performance estable

---

### TASK 2.7: Deploy a Producción
**Estimación:** 4 horas  
**Prioridad:** P0

**Descripción:**
Desplegar migración a producción con monitoreo intensivo.

**IMPORTANTE:** 
- Migración 025 contiene RLS para 45 tablas (2021 líneas)
- Cualquier corrección post-deploy debe ir en migraciones 034+
- NO modificar 025 después de este deploy

**Plan de Deploy:**
1. **Pre-deploy (1h)**
   - Backup completo de producción
   - Notificar a usuarios de mantenimiento
   - Preparar rollback plan

2. **Deploy (1h)**
   - Ejecutar migración 025 (RLS principal)
   - Ejecutar migración 033 (auditoría) si está lista
   - Validar sin errores
   - Smoke tests

3. **Post-deploy (2h)**
   - Monitoreo intensivo de logs
   - Validar métricas de performance
   - Validar funcionalidad crítica
   - Confirmar con usuarios

**Rollback Plan:**
- Script de rollback preparado
- Backup listo para restaurar
- Tiempo máximo de rollback: 30 min

**Criterios de Aceptación:**
- Deploy exitoso
- 0 errores críticos
- Performance estable
- Usuarios confirmados

---

## CHECKLIST FINAL

### Pre-Deploy
- [ ] Migración 025 creada y validada
- [ ] Tests automatizados al 100%
- [ ] Pruebas de penetración completadas
- [ ] Documentación actualizada
- [ ] Backup de producción realizado
- [ ] Rollback plan preparado

### Post-Deploy
- [ ] 45 tablas con RLS habilitado
- [ ] Tests de seguridad passing
- [ ] Auditoría configurada
- [ ] Monitoreo activo
- [ ] Documentación publicada
- [ ] Equipo capacitado

### Métricas de Éxito
- [ ] Cobertura RLS: 100% (de 55%)
- [ ] Tests de seguridad: 100% passing
- [ ] Intentos cross-tenant bloqueados: 100%
- [ ] Performance: Sin degradación > 5%
- [ ] Errores en producción: 0

---

## RECURSOS NECESARIOS

- **Backend Developer:** 2 semanas full-time
- **QA Engineer:** 1 semana para testing
- **DevOps:** 2 días para deploy
- **Acceso:** Supabase admin, staging, producción

---

## RIESGOS Y CONTINGENCIAS

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Datos sin tenant_id | Media | Alto | Función helper asigna automáticamente |
| Queries fallan | Baja | Alto | Tests exhaustivos pre-deploy |
| Performance degradado | Baja | Medio | Índices por tenant_id |
| Rollback necesario | Baja | Alto | Plan de rollback preparado |

