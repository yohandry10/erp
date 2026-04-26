# Especificaciones del Sistema ERP Multi-Tenant

## Índice de Especificaciones

### 📋 Especificación Principal
- **[erp-completo-integracion.md](./erp-completo-integracion.md)** - Spec maestra con arquitectura de eventos y fases

### 🔒 Fase 1: Seguridad (P0 - Semanas 1-2)
- **[fase-1-seguridad-rls.md](./fase-1-seguridad-rls.md)** - Corrección RLS en 45 tablas

### 🛒 Fase 2: Módulo Compras (P0 - Semanas 3-6)
- **[fase-2-compras.md](./fase-2-compras.md)** - Implementación completa de compras

### 💰 Fase 3: Finanzas Completo (P0 - Semanas 7-10)
- **[fase-3-finanzas.md](./fase-3-finanzas.md)** - CxP, Tesorería, Conciliación

### 📊 Fase 4: Contabilidad Integrada (P0 - Semanas 11-14)
- **[fase-4-contabilidad.md](./fase-4-contabilidad.md)** - Asientos automáticos, periodos, estados financieros

### 📦 Fase 5: Inventario Avanzado (P1 - Semanas 15-18)
- **[fase-5-inventario.md](./fase-5-inventario.md)** - Multialmacén, valorización, lotes/series

### 🔄 Fase 6: Integraciones CPE/GRE (P1 - Semanas 19-20)
- **[fase-6-cpe-gre.md](./fase-6-cpe-gre.md)** - Notas, anulaciones, reenvíos

### 🏢 Fase 7: Módulos Complementarios (P2 - Semanas 21-24)
- **[fase-7-complementarios.md](./fase-7-complementarios.md)** - RMA, Activos Fijos, RRHH ajustes

### 🧪 Testing y Validación
- **[testing-strategy.md](./testing-strategy.md)** - Estrategia de testing E2E

---

## 📋 Tasks Detalladas por Fase

### Fase 1: Seguridad (2 semanas)
**[📄 Ver Tasks Completas](./tasks/fase-1-seguridad-tasks.md)**

- TASK 1.1: Crear Migración SQL Base (4h)
- TASK 1.2: Habilitar RLS en Módulo Finanzas - 9 tablas (3h)
- TASK 1.3: Habilitar RLS en Módulo Contabilidad - 7 tablas (2h)
- TASK 1.4: Habilitar RLS en Módulo RRHH - 16 tablas (4h)
- TASK 1.5: Habilitar RLS en Activos Fijos y Otros - 13 tablas (3h)
- TASK 1.6: Ejecutar Migración en Desarrollo (2h)
- TASK 2.1: Crear Tests de Seguridad Automatizados (6h)
- TASK 2.2: Tests de Integración por Módulo (4h)
- TASK 2.3: Pruebas de Penetración Manuales (4h)
- TASK 2.4: Configurar Auditoría de Accesos (3h)
- TASK 2.5: Documentación de Políticas RLS (2h)
- TASK 2.6: Deploy a Staging (3h)
- TASK 2.7: Deploy a Producción (4h)

**Total:** 44 horas (2 semanas)

### Fase 2: Compras (4 semanas)
**[📄 Ver Tasks Completas](./tasks/fase-2-compras-tasks.md)**

**Semana 1: Base de Datos y Backend Base**
- TASK 2.1: Crear Migración de Base de Datos (6h)
- TASK 2.2: Implementar Módulo Proveedores (8h)
- TASK 2.3: Implementar Módulo Cotizaciones Compra (10h)
- TASK 2.4: Implementar Módulo Órdenes de Compra (12h)

**Semana 2: Recepciones e Integración**
- TASK 2.5: Implementar Módulo Recepciones (16h)
- TASK 2.6: Implementar Devoluciones a Proveedor (8h)
- TASK 2.7: Integración con CxP (10h)

**Semana 3: Frontend**
- TASK 2.8: Página de Proveedores (12h)
- TASK 2.9: Página de Cotizaciones Compra (14h)
- TASK 2.10: Página de Órdenes de Compra (16h)
- TASK 2.11: Página de Recepciones (18h)
- TASK 2.12: Página de Devoluciones (10h)

**Semana 4: Testing**
- TASK 2.13: Tests Unitarios Backend (12h)
- TASK 2.14: Tests de Integración E2E (16h)
- TASK 2.15: Tests Frontend Playwright (12h)
- TASK 2.16: Documentación (6h)

**Total:** 166 horas (4 semanas)

### Fase 3: Finanzas (4 semanas)
**[📄 Ver Tasks Completas](./tasks/fase-3-finanzas-tasks.md)**

**Semana 1: CxP Completo**
- TASK 3.1: Crear Migración Finanzas (4h)
- TASK 3.2: Implementar Servicio CxP (12h)
- TASK 3.3: Implementar Servicio Tesorería (14h)

**Semana 2: Bancos y Conciliación**
- TASK 3.4: Implementar Servicio Bancos (10h)
- TASK 3.5: Implementar Servicio Conciliación (16h)

**Semana 3: Frontend**
- TASK 3.6: Página CxP (14h)
- TASK 3.7: Página Tesorería (16h)
- TASK 3.8: Página Bancos (12h)
- TASK 3.9: Página Conciliación (20h)

**Semana 4: Testing**
- TASK 3.10: Tests Unitarios Backend (12h)
- TASK 3.11: Tests E2E Finanzas (16h)
- TASK 3.12: Tests Frontend Playwright (12h)
- TASK 3.13: Integración con Contabilidad (8h)
- TASK 3.14: Reportes Finanzas (10h)
- TASK 3.15: Documentación (6h)

**Total:** 162 horas (4 semanas)

### Fase 4: Contabilidad (4 semanas)
**[📄 Ver Tasks Completas](./tasks/fase-4-contabilidad-tasks.md)**

**Semana 1: Base y Reglas Contables**
- TASK 4.1: Crear Migración Contabilidad (4h)
- TASK 4.2: Definir Plan de Cuentas Estándar (6h)
- TASK 4.3: Implementar Generador de Asientos (16h)
- TASK 4.4: Implementar Listeners de Eventos (12h)

**Semana 2: Periodos y Estados**
- TASK 4.5: Implementar Gestión de Periodos (8h)
- TASK 4.6: Implementar Estados Financieros (16h)
- TASK 4.7: Implementar Centros de Costo (6h)

**Semana 3: Frontend**
- TASK 4.8: Página de Asientos Contables (14h)
- TASK 4.9: Página de Periodos Contables (10h)
- TASK 4.10: Página de Estados Financieros (18h)
- TASK 4.11: Página de Centros de Costo (10h)

**Semana 4: Testing y Validación**
- TASK 4.12: Tests Unitarios Backend (14h)
- TASK 4.13: Tests E2E Integración Completa (20h)
- TASK 4.14: Validación con Contador (8h)
- TASK 4.15: Documentación Contable (8h)
- TASK 4.16: Monitoreo de Eventos (6h)

**Total:** 176 horas (4 semanas)

---

## 📊 Resumen de Esfuerzo

| Fase | Duración | Horas | Prioridad |
|------|----------|-------|-----------|
| Fase 1: Seguridad | 2 semanas | 44h | P0 CRÍTICO |
| Fase 2: Compras | 4 semanas | 166h | P0 CRÍTICO |
| Fase 3: Finanzas | 4 semanas | 162h | P0 CRÍTICO |
| Fase 4: Contabilidad | 4 semanas | 176h | P0 CRÍTICO |
| **TOTAL P0** | **14 semanas** | **548h** | **CRÍTICO** |

**Recursos necesarios:**
- 1 Backend Developer Senior (full-time)
- 1 Frontend Developer (full-time)
- 1 QA Engineer (50%)
- 1 DevOps (25%)
- 1 Contador (consultoría)

---

## Estado Actual del Sistema

Según análisis exhaustivo completado el 23/10/2025:

### Métricas Globales
- **Completitud:** 48%
- **Puntuación:** 6.5/10
- **Tablas sin RLS:** 45 (CRÍTICO)
- **Módulos funcionales:** 5/12

### Por Módulo

| Módulo | Completitud | Estado | Prioridad |
|--------|-------------|--------|-----------|
| Ventas | 95% | ✅ Funcional | Mantenimiento |
| Inventario | 90% | ✅ Funcional | P1 (Multialmacén) |
| CPE/GRE/SIRE | 95% | ✅ Funcional | P1 (Notas) |
| RRHH | 80% | ✅ Funcional | P2 (Ajustes) |
| POS | 85% | ✅ Funcional | P1 (CPE) |
| **Compras** | **5%** | ❌ No implementado | **P0** |
| **Finanzas** | **40%** | ⚠️ Solo CxC | **P0** |
| **Contabilidad** | **30%** | ⚠️ Desconectada | **P0** |
| Activos Fijos | 5% | ❌ No implementado | P2 |
| Producción | 0% | ❌ No existe | P3 |
| Proyectos | 0% | ❌ No existe | P3 |
| CRM | 40% | ⚠️ Básico | P3 |

### Gaps Críticos (P0)

1. **Seguridad Multi-Tenant**
   - 45 tablas sin RLS
   - Riesgo: Fuga de datos cross-tenant
   - Impacto: CRÍTICO

2. **Módulo Compras**
   - Sin implementación
   - Bloquea: Operación completa del ERP
   - Impacto: CRÍTICO

3. **Contabilidad Desconectada**
   - Sin asientos automáticos
   - Sin integración con módulos operativos
   - Impacto: CRÍTICO

4. **Finanzas Incompleto**
   - Falta CxP, tesorería, conciliación
   - Impacto: CRÍTICO

---

## Arquitectura de Eventos de Dominio

### Principios

1. **Fuente única de verdad** por módulo
2. **Eventos + Outbox** para interconexión confiable
3. **Idempotencia** en todos los consumidores
4. **RLS extremo a extremo**
5. **Trazabilidad** con correlation_id

### Eventos Principales

| Evento | Productor | Consumidores |
|--------|-----------|--------------|
| `VentaFacturada` | CPE | CxC, Contabilidad, GRE, SIRE |
| `CobroRegistrado` | CxC | Contabilidad, Tesorería |
| `OrdenCompraAprobada` | Compras | CxP, Inventario, Contabilidad |
| `RecepcionRegistrada` | Compras | Inventario, CxP, Contabilidad |
| `PagoProveedorRegistrado` | Tesorería | CxP, Contabilidad, Bancos |
| `AjusteInventarioAplicado` | Inventario | Contabilidad |
| `PlanillaLiquidada` | RRHH | Contabilidad, Finanzas |
| `DepreciacionGenerada` | Activos | Contabilidad |

---

## Roadmap de Implementación

### Fase 1: Seguridad (2 semanas) - P0 CRÍTICO
- Habilitar RLS en 45 tablas
- Tests de seguridad
- Auditoría de accesos

### Fase 2: Compras (4 semanas) - P0 CRÍTICO
- Proveedores, cotizaciones, OC
- Recepciones con inventario
- Devoluciones a proveedor
- Integración CxP

### Fase 3: Finanzas (4 semanas) - P0 CRÍTICO
- CxP completo
- Tesorería y pagos
- Conciliación bancaria
- Reportes aging

### Fase 4: Contabilidad (4 semanas) - P0 CRÍTICO
- Asientos automáticos (ventas, compras, pagos)
- Periodos contables
- Estados financieros
- Cierre de periodo

### Fase 5: Inventario Avanzado (4 semanas) - P1 ALTO
- Multialmacén con lógica
- Valorización (Promedio/FIFO)
- Lotes y series (FEFO)
- Kardex valorizado

### Fase 6: CPE/GRE Completo (2 semanas) - P1 ALTO
- Notas de crédito/débito
- Anulaciones y bajas
- Resumen diario
- Reenvíos automáticos

### Fase 7: Complementarios (4 semanas) - P2 MEDIO
- RMA completo
- Activos fijos con depreciación
- POS → CPE integración
- RRHH ajustes RLS

**Total estimado:** 24 semanas (6 meses)

---

## Criterios de Éxito

### Técnicos
- [ ] 100% de tablas con RLS
- [ ] Tests de seguridad al 100%
- [ ] Cobertura de tests >= 75%
- [ ] Todos los flujos E2E funcionando
- [ ] Sin eventos atascados en outbox
- [ ] Documentación API completa

### Funcionales
- [ ] Flujo compras completo operativo
- [ ] Asientos contables automáticos
- [ ] Estados financieros generados
- [ ] Conciliación bancaria funcional
- [ ] Kardex cuadra con contabilidad
- [ ] Aging CxC/CxP correcto

### Negocio
- [ ] ERP funciona para empresa comercial completa
- [ ] Contabilidad integrada con operaciones
- [ ] Control financiero completo
- [ ] Cumplimiento fiscal (SUNAT/DIAN)
- [ ] Trazabilidad end-to-end
- [ ] Multi-tenant seguro

---

## Próximos Pasos

1. **Revisar y aprobar** esta especificación
2. **Priorizar** fases según necesidad de negocio
3. **Asignar recursos** por fase
4. **Ejecutar Fase 1** (Seguridad RLS) - 2 semanas
5. **Ejecutar Fase 2** (Compras) - 4 semanas
6. **Continuar** según roadmap

---

## Referencias

- [Análisis Exhaustivo Completo](../../ANALISIS_EXHAUSTIVO_ERP_COMPLETO.md)
- [Análisis de Interconexión](../../ANALISIS_INTERCONEXION_MODULOS.md)
- [Tablas sin RLS](../../TABLAS_SIN_RLS_CRITICAS.md)
- [Auditoría Módulo Ventas](../../AUDITORIA_MODULO_VENTAS_CORREGIDA.md)

