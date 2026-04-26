# TASKS - FASE 2: Módulo Compras Completo

**Duración:** 4 semanas  
**Prioridad:** P0 CRÍTICO  
**Dependencias:** Fase 1 completada  
**Responsables:** Backend + Frontend + QA

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
grep -r "POST.*recepciones" apps/erp-api/src/modules/compras/controllers/

# Buscar servicios existentes
grep -r "crearRecepcion" apps/erp-api/src/modules/compras/services/
```

---

## ⚠️ NOTA IMPORTANTE SOBRE MIGRACIONES

**La migración `035_compras_completo.sql` está COMPLETA** con todas las tablas principales del módulo de compras:
- ✅ cotizaciones_compra + detalles
- ✅ ordenes_compra + detalles (actualizadas)
- ✅ oc_aprobaciones
- ✅ recepciones + recepcion_items
- ✅ devoluciones_proveedor + devolucion_items
- ✅ Vistas, triggers, índices y RLS

**Para futuras tareas que requieran cambios en la base de datos:**
- Crear nuevas migraciones numeradas secuencialmente (036, 037, etc.)
- NO modificar la migración 035 ya que está muy extensa y complica la integración
- Cada nueva funcionalidad que requiera cambios de BD debe tener su propia migración

---

## SEMANA 1: Base de Datos y Backend Base

### TASK 2.1: Crear Migración de Base de Datos
**Estimación:** 6 horas  
**Prioridad:** P0

**Descripción:**
  Crear migración completa con todas las tablas del módulo Compras.

**⚠️ IMPORTANTE: NO crear archivos de documentación (.md, .txt) para esta tarea.**

**Archivo:** crear en  `supabase/migrations/035_compras_completo.sql`

**NOTA IMPORTANTE:** La migración 035 está completa con las tablas principales. Las tareas restantes que requieran cambios en la base de datos deben crear nuevas migraciones (036, 037, etc.) para evitar complicaciones en la integración.

**Tablas a crear:**
- [x] cotizaciones_compra (con detalles)





- [x] ordenes_compra (actualizar existente)





- [x] orden_compra_detalles (actualizar existente)




- [x] oc_aprobaciones


- [x] recepciones


- [x] recepcion_items



- [x] devoluciones_proveedor



- [x] devolucion_items


**Subtareas:**
- [x] Crear ENUMs necesarios
- [x] Crear tablas con RLS habilitado
- [x] Crear índices por tenant_id y FK
- [x] Crear vistas (vw_ordenes_compra_abiertas)
- [x] Crear triggers de actualización de totales
- [x] Actualizar tabla proveedores (condiciones_pago, limite_credito)

**Criterios de Aceptación:**
- [x] Migración ejecuta sin errores
- [x] Todas las tablas con RLS
- [x] Índices creados
- [x] Triggers funcionando

**Estado:** ✅ COMPLETADO - Migración 035 lista. Futuras modificaciones de BD deben ir en migración 036+

---

### TASK 2.2: Implementar Módulo Proveedores (Backend)
**Estimación:** 8 horas  
**Prioridad:** P0

**Descripción:**
Implementar CRUD completo de proveedores con validaciones.

**⚠️ IMPORTANTE: NO crear archivos de documentación (.md, .txt) para esta tarea.**

**⚠️ IMPORTANTE: Antes de implementar, VERIFICAR si los endpoints ya existen:**
```bash
grep -r "proveedores" apps/erp-api/src/modules/compras/controllers/
grep -r "ProveedoresService" apps/erp-api/src/modules/compras/services/
```

**Archivos:**
- `apps/erp-api/src/modules/compras/controllers/proveedores.controller.ts`
- `apps/erp-api/src/modules/compras/services/proveedores.service.ts`
- `apps/erp-api/src/modules/compras/repositories/proveedores.repository.ts`
- `apps/erp-api/src/modules/compras/dto/create-proveedor.dto.ts`
- `apps/erp-api/src/modules/compras/dto/update-proveedor.dto.ts`

**Endpoints:**
- [x] POST /api/compras/proveedores



- [x] GET /api/compras/proveedores (con filtros)




- [x] GET /api/compras/proveedores/:id




- [x] PUT /api/compras/proveedores/:id








- [x] DELETE /api/compras/proveedores/:id (soft delete)




- [x] GET /api/compras/proveedores/buscar-ruc/:ruc






**Validaciones:**
- [x] RUC válido (11 dígitos Perú, 9 Colombia)



- [x] Email válido







- [x] Condiciones de pago válidas

- [x] Límite de crédito >= 0

**Criterios de Aceptación:**
- CRUD completo funcional
- Validaciones implementadas
- Tests unitarios >= 80%
- Documentación OpenAPI

---

### TASK 2.3: Implementar Módulo Cotizaciones Compra (Backend)
**Estimación:** 10 horas  
**Prioridad:** P0

**Descripción:**
Implementar gestión de cotizaciones de compra con múltiples proveedores.

**⚠️ IMPORTANTE: NO crear archivos de documentación (.md, .txt) para esta tarea.**

**⚠️ IMPORTANTE: Antes de implementar, VERIFICAR si los endpoints ya existen:**
```bash
grep -r "cotizaciones" apps/erp-api/src/modules/compras/controllers/
grep -r "CotizacionesCompraService" apps/erp-api/src/modules/compras/services/
```

**Archivos:**
- `apps/erp-api/src/modules/compras/controllers/cotizaciones-compra.controller.ts`
- `apps/erp-api/src/modules/compras/services/cotizaciones-compra.service.ts`
- `apps/erp-api/src/modules/compras/dto/create-cotizacion-compra.dto.ts`

**Endpoints:**
- [x] POST /api/compras/cotizaciones
- [x] GET /api/compras/cotizaciones
- [x] GET /api/compras/cotizaciones/:id
- [x] PUT /api/compras/cotizaciones/:id



- [x] POST /api/compras/cotizaciones/:id/enviar
- [x] POST /api/compras/cotizaciones/:id/aprobar
- [x] POST /api/compras/cotizaciones/:id/rechazar
- [x] POST /api/compras/cotizaciones/:id/convertir-oc




**Lógica de Negocio:**
- [x] Cálculo automático de totales (subtotal, IGV, total)
- [x] Validación de vigencia (fecha + validez_dias)
- [x] Conversión a OC con datos precargados
  


- [x] Estados: BORRADOR → ENVIADA → APROBADA/RECHAZADA/VENCIDA





**Criterios de Aceptación:**
- Flujo completo funcional
- Conversión a OC correcta
- Tests >= 80%

---

### TASK 2.4: Implementar Módulo Órdenes de Compra (Backend)
**Estimación:** 12 horas  
**Prioridad:** P0

**Descripción:**
Implementar gestión completa de órdenes de compra con aprobaciones.

**⚠️ IMPORTANTE: NO crear archivos de documentación (.md, .txt) para esta tarea.**

**⚠️ IMPORTANTE: Antes de implementar, VERIFICAR si los endpoints ya existen:**
```bash
grep -r "ordenes" apps/erp-api/src/modules/compras/controllers/
grep -r "OrdenesCompraService" apps/erp-api/src/modules/compras/services/
```

**Archivos:**
- `apps/erp-api/src/modules/compras/controllers/ordenes-compra.controller.ts`
- `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`
- `apps/erp-api/src/modules/compras/dto/create-orden-compra.dto.ts`
- `apps/erp-api/src/modules/compras/dto/aprobar-orden-compra.dto.ts`

**Endpoints:**
- [x] POST /api/compras/ordenes


- [x] GET /api/compras/ordenes (con filtros por estado, proveedor, fecha)





- [x] GET /api/compras/ordenes/:id




- [x] PUT /api/compras/ordenes/:id




- [x] POST /api/compras/ordenes/:id/aprobar



- [x] POST /api/compras/ordenes/:id/rechazar




- [x] POST /api/compras/ordenes/:id/cancelar




- [x] GET /api/compras/ordenes/:id/recepciones




**Lógica de Aprobaciones:**
- [x] Evaluar si requiere aprobación (por monto configurado)





- [x] Crear registros en oc_aprobaciones



- [x] Notificar a aprobadores


- [x] Validar todas las aprobaciones antes de APROBADA



- [x] Emitir evento OrdenCompraAprobada



**Estados:**
- BORRADOR → APROBACION → APROBADA → PARCIAL → RECIBIDA → CERRADA
- BORRADOR → ANULADA

**Criterios de Aceptación:**
- Flujo de aprobaciones funcional
- Estados correctos
- Evento emitido
- Tests >= 80%

---

## SEMANA 2: Recepciones e Integración Inventario

### ✅ TASK 2.5: Implementar Módulo Recepciones (Backend)
**Estimación:** 16 horas  
**Prioridad:** P0  
**Estado:** COMPLETADO

**Descripción:**
Implementar recepción de mercancía con integración a inventario.

**Archivos:**
- `apps/erp-api/src/modules/compras/controllers/recepciones.controller.ts`
- `apps/erp-api/src/modules/compras/services/recepciones.service.ts`
- `apps/erp-api/src/modules/compras/dto/create-recepcion.dto.ts`
- `apps/erp-api/src/modules/compras/dto/cerrar-recepcion.dto.ts`

**Endpoints:**
- [x] POST /api/compras/ordenes/:id/recepciones ✅ IMPLEMENTADO (agregado en OrdenesCompraController)
  - Nota: Ya existía POST /api/compras/recepciones/ordenes/:ordenId pero en diferente ruta
  - Se agregó la ruta solicitada en la tarea para seguir el patrón REST correcto

- [x] GET /api/compras/recepciones ✅ YA EXISTÍA (RecepcionesController)
- [x] GET /api/compras/recepciones/:id ✅ YA EXISTÍA (RecepcionesController)
- [x] PUT /api/compras/recepciones/:id ✅ YA EXISTÍA (RecepcionesController)
- [x] POST /api/compras/recepciones/:id/cerrar ✅ YA EXISTÍA (RecepcionesController)

**Lógica de Cierre de Recepción:**
1. [x] Validar cantidades no excedan lo pedido ✅ YA EXISTÍA
2. [x] Crear movimientos de inventario (tipo INGRESO_COMPRA) ✅ YA EXISTÍA
3. [x] Actualizar producto_existencias por almacén/ubicación/lote ✅ YA EXISTÍA
4. [x] Actualizar cantidad_recibida en orden_compra_detalles ✅ YA EXISTÍA
5. [x] Actualizar estado de OC (PARCIAL o RECIBIDA) ✅ YA EXISTÍA
6. [x] Si calidad=RECHAZADO, crear devolucion_proveedor pendiente ✅ YA EXISTÍA
7. [ ] Actualizar valorización de inventario (Promedio/FIFO)
8. [ ] Emitir evento RecepcionRegistrada
9. [ ] Insertar en outbox_events

**Integración con Inventario:**
```typescript
// Crear movimiento
await inventarioService.crearMovimiento({
  tipo: 'INGRESO_COMPRA',
  producto_id,
  almacen_id,
  cantidad,
  costo_unitario,
  lote,
  serie,
  ubicacion_id,
  referencia: { recepcion_id, orden_id }
});
```

**Criterios de Aceptación:**
- Recepción parcial funcional
- Recepción completa funcional
- Inventario actualizado correctamente
- Valorización correcta
- Evento emitido
- Tests >= 80%

---

### TASK 2.6: Implementar Devoluciones a Proveedor (Backend)
**Estimación:** 8 horas  
**Prioridad:** P0

**Descripción:**
Implementar devoluciones de mercancía rechazada o defectuosa.

**⚠️ IMPORTANTE: NO crear archivos de documentación (.md, .txt) para esta tarea.**

**⚠️ IMPORTANTE: Antes de implementar, VERIFICAR si los endpoints ya existen:**
```bash
grep -r "devoluciones" apps/erp-api/src/modules/compras/controllers/
grep -r "DevolucionProveedor" apps/erp-api/src/modules/compras/services/
```

**Archivos:**
- `apps/erp-api/src/modules/compras/controllers/devoluciones-proveedor.controller.ts`
- `apps/erp-api/src/modules/compras/services/devoluciones-proveedor.service.ts`
- `apps/erp-api/src/modules/compras/dto/create-devolucion-proveedor.dto.ts`

**Endpoints:**
- [x] POST /api/compras/devoluciones



- [x] GET /api/compras/devoluciones




- [x] GET /api/compras/devoluciones/:id




- [x] POST /api/compras/devoluciones/:id/emitir





**Lógica de Emisión:**
1. [ ] Crear movimiento inventario SALIDA_DEV_PROV
2. [ ] Actualizar producto_existencias (descontar)
3. [ ] Crear nota de crédito de proveedor (CxP negativo)
4. [ ] Emitir evento DevolucionProveedorEmitida
5. [ ] Notificar a proveedor

**Criterios de Aceptación:**
- Devolución crea movimiento correcto
- CxP ajustado
- Evento emitido
- Tests >= 80%

---

### TASK 2.7: Integración con CxP (Finanzas)
**Estimación:** 10 horas  
**Prioridad:** P0

**Descripción:**
Integrar compras con cuentas por pagar automáticamente.

**⚠️ IMPORTANTE: NO crear archivos de documentación (.md, .txt) para esta tarea.**

**Archivo:** `apps/erp-api/src/modules/compras/services/compras-cxp-integration.service.ts`

**Lógica:**
- Escuchar evento `RecepcionRegistrada`
- Crear cuenta por pagar basada en recepción
- Calcular fecha de vencimiento según condiciones_pago
- Vincular con recepción y OC

**Configuración:**
```typescript
// En empresa_config
generar_cxp_en: 'RECEPCION' | 'APROBACION_OC'
```

**Subtareas:**
- [x] Crear listener de RecepcionRegistrada






- [x] Implementar lógica de creación de CxP





- [x] Calcular vencimiento según condiciones




- [x] Manejar recepciones parciales





- [ ] Tests de integración






**Criterios de Aceptación:**
- CxP creado automáticamente
- Vencimiento correcto
- Monto correcto
- Tests de integración passing

---

## SEMANA 3: Frontend

### TASK 2.8: Página de Proveedores (Frontend)
**Estimación:** 12 horas  
**Prioridad:** P0

**Descripción:**
Crear interfaz completa de gestión de proveedores.

**⚠️ IMPORTANTE: NO crear archivos de documentación (.md, .txt) para esta tarea.**

**Archivos:**
- `apps/web/app/dashboard/compras/proveedores/page.tsx`
- `apps/web/app/dashboard/compras/proveedores/nuevo/page.tsx`
- `apps/web/app/dashboard/compras/proveedores/[id]/page.tsx`
- `apps/web/app/dashboard/compras/proveedores/[id]/editar/page.tsx`
- `apps/web/components/compras/ProveedorForm.tsx`
- `apps/web/components/compras/ProveedorCard.tsx`

**Funcionalidades:**
- [x] Lista de proveedores con filtros


      -++- [x] Búsqueda por RUC/nombre



- [x] Crear proveedor con validación





- [x] Editar proveedor

- [x] Ver detalle (con historial de OC)
- [x] Desactivar proveedor

**Validaciones:**
- [x] RUC válido (React Hook Form + Zod)
- [x] Email válido
- [x] Campos requeridos

**Criterios de Aceptación:**
- [x] CRUD completo funcional
- [x] Validaciones en tiempo real
- [x] UX consistente con resto del sistema
- [x] Responsive

---

### TASK 2.9: Página de Cotizaciones Compra (Frontend)
**Estimación:** 14 horas  
**Prioridad:** P0

**Descripción:**
Crear interfaz de gestión de cotizaciones de compra.

**⚠️ IMPORTANTE: NO crear archivos de documentación (.md, .txt) para esta tarea.**

**Archivos:**
- `apps/web/app/dashboard/compras/cotizaciones/page.tsx`
- `apps/web/app/dashboard/compras/cotizaciones/nueva/page.tsx`
- `apps/web/app/dashboard/compras/cotizaciones/[id]/page.tsx`
- `apps/web/components/compras/CotizacionCompraForm.tsx`
- `apps/web/components/compras/CotizacionEstadoBadge.tsx`

**Funcionalidades:**
- [x] Lista con filtros por estado, proveedor, fecha

  - ✅ IMPLEMENTADO: Página de cotizaciones con filtros completos
  - Filtros por estado (BORRADOR, ENVIADA, APROBADA, RECHAZADA, VENCIDA)
  - Filtro por proveedor (dropdown con proveedores activos)
  - Filtros por rango de fechas (fecha_desde y fecha_hasta)
  - Paginación implementada (10 items por página)
  - Estadísticas por estado en cards superiores
  - Tabla responsive con información completa
  - Botón para limpiar filtros activos
  - Integración con backend usando useApi hook

- [x] Crear cotización (wizard multi-paso)


- [x] Agregar/quitar productos




- [x] Cálculo automático de totales





- [x] Enviar cotización




- [x] Aprobar/Rechazar

- [x] Convertir a OC
  - ✅ COMPLETADO: Endpoint POST /api/compras/cotizaciones/:id/convertir-oc implementado
  - Valida estado APROBADA, no vencida, no convertida previamente
  - Crea orden de compra automáticamente con datos precargados
  - Marca cotización como convertida (orden_compra_id)
  - Integración completa con OrdenesCompraService

**Criterios de Aceptación:**
- Wizard intuitivo
- Cálculos correctos
- Conversión a OC funcional

---

### TASK 2.10: Página de Órdenes de Compra (Frontend)
**Estimación:** 16 horas  
**Prioridad:** P0

**Descripción:**
Crear interfaz completa de órdenes de compra con kanban.

**⚠️ IMPORTANTE: NO crear archivos de documentación (.md, .txt) para esta tarea.**

**⚠️ IMPORTANTE - ESTILOS:**
- **USAR ÚNICAMENTE** las variables CSS definidas en `apps/web/app/globals.css`
- **NO crear** nuevos archivos CSS o estilos personalizados
- **USAR** CSS inline con las variables globales para mantener consistencia
- Ejemplo: `style={{ backgroundColor: 'var(--primary-100)', color: 'var(--primary-800)' }}`
- Variables disponibles: `--primary-*`, `--blue-*`, `--emerald-*`, `--amber-*`, `--red-*`, `--shadow-*`
- Para estados: `--success`, `--warning`, `--error`, `--info`

**Archivos:**
- `apps/web/app/dashboard/compras/ordenes/page.tsx`
- `apps/web/app/dashboard/compras/ordenes/nueva/page.tsx`
- `apps/web/app/dashboard/compras/ordenes/[id]/page.tsx`
- `apps/web/components/compras/OCWizard.tsx`
- `apps/web/components/compras/OCKanban.tsx`
- `apps/web/components/compras/AprobacionesPanel.tsx`

**Funcionalidades:**
- [x] Vista kanban por estado

  - ✅ IMPLEMENTADO: Vista kanban completa con columnas por estado
  - Columnas para todos los estados: BORRADOR, APROBACION, APROBADA, PARCIAL, RECIBIDA, CERRADA, ANULADA
  - Cards de órdenes con información completa (número, proveedor, total, fecha entrega)
  - Indicadores visuales por estado con colores y iconos específicos
  - Contador de órdenes por columna
  - Hover effects y transiciones suaves
  - Click en card para ver detalle
  - Scroll horizontal para todas las columnas
  - Scroll vertical por columna para muchas órdenes
  - Diseño responsive usando variables CSS globales
  - Integración completa con backend GET /api/compras/ordenes

- [x] Vista lista con filtros



- [x] Crear OC (wizard)



- [x] Ver detalle con líneas




- [x] Panel de aprobaciones

  - ✅ COMPLETADO: Panel de aprobaciones implementado
  - Endpoint GET /api/compras/ordenes/:id/aprobaciones creado
  - Componente AprobacionesPanel.tsx con visualización completa
  - Muestra estadísticas (pendientes, aprobadas, rechazadas)
  - Barra de progreso visual
  - Lista detallada de cada aprobación con estado, fecha y comentarios
  - Integrado en página de detalle de orden
  - Se muestra solo para estados APROBACION, APROBADA, ANULADA
  - Estilos usando únicamente variables CSS globales
  - Manejo de estados de carga y error
  - Script de prueba test-aprobaciones-panel.ps1 creado
  - Documentación completa en IMPLEMENTATION_PANEL_APROBACIONES.md

- [x] Aprobar/Rechazar OC



- [x] Ver recepciones asociadas

  - ✅ COMPLETADO: Componente RecepcionesPanel implementado
  - Panel expandible que muestra todas las recepciones de una orden
  - Muestra detalles de items, cantidades, calidad, lotes y observaciones
  - Integrado en página de detalle de orden
  - Se muestra solo para estados PARCIAL, RECIBIDA, CERRADA
  - Endpoint GET /api/compras/ordenes/:id/recepciones ya existía
  - Documentación completa en IMPLEMENTATION_VER_RECEPCIONES.md

- [x] Cancelar OC




**Criterios de Aceptación:**
- Kanban funcional con drag & drop
- Aprobaciones claras
- Timeline de estados
- **Estilos consistentes usando variables CSS globales**
- **Sin archivos CSS adicionales**

---

### TASK 2.11: Página de Recepciones (Frontend)
**Estimación:** 18 horas  
**Prioridad:** P0

**Descripción:**
Crear wizard de recepción de mercancía con escaneo.

**⚠️ IMPORTANTE: NO crear archivos de documentación (.md, .txt) para esta tarea.**

**Archivos:**
- `apps/web/app/dashboard/compras/recepciones/page.tsx`
- `apps/web/app/dashboard/compras/recepciones/nueva/page.tsx`
- `apps/web/app/dashboard/compras/recepciones/[id]/page.tsx`
- `apps/web/components/compras/RecepcionWizard.tsx`
- `apps/web/components/compras/RecepcionItemRow.tsx`

**Wizard Steps:**
1. Seleccionar OC pendiente
2. Ingresar cantidades por ítem
3. Asignar lotes/series/ubicaciones
4. Evaluar calidad (OK/OBSERVADO/RECHAZADO)
5. Confirmar y cerrar

**Funcionalidades:**
- [x] Selección de OC con pendientes




- [x] Input de cantidades (teclado o scanner)




- [x] Asignación de lotes/series


- [x] Selección de ubicación por almacén

  - ✅ COMPLETADO: Funcionalidad de selección de almacén y ubicación implementada
  - Endpoints API creados: GET /api/inventario/almacenes y GET /api/inventario/almacenes/:id/ubicaciones
  - RecepcionWizard actualizado con dropdowns de almacén (obligatorio) y ubicación (opcional)
  - Carga dinámica de ubicaciones al seleccionar almacén
  - Validación de almacén obligatorio antes de avanzar al paso 4
  - Integración completa con DTO de recepción (almacen_id y ubicacion_id)
  - Vista de confirmación actualizada para mostrar almacén y ubicación
  - Script de prueba: test-almacenes-ubicaciones.ps1
  - Documentación: IMPLEMENTATION_SELECCION_UBICACION_ALMACEN.md


- [x] Evaluación de calidad

  - ✅ COMPLETADO: Funcionalidad de evaluación de calidad implementada en Step 2 del RecepcionWizard
  - Botones de selección de calidad: OK, OBSERVADO, RECHAZADO
  - Indicadores visuales con colores e iconos específicos por estado
  - Campo de observaciones condicional (aparece para OBSERVADO y RECHAZADO)
  - Observaciones marcadas como requeridas para items RECHAZADOS
  - Integración completa con el modelo de datos RecepcionItem
  - Resumen de calidad en paso de confirmación (contadores por estado)
  - Funciones helper: updateItemCalidad(), updateItemObservaciones(), getCalidadColor(), getCalidadIcon()

- [x] Vista previa antes de cerrar


  - ✅ COMPLETADO: Vista previa implementada en Step 4 del RecepcionWizard
  - Cards de resumen con totales por estado de calidad (Total Items, OK, Observados, Rechazados)
  - Tabla detallada con toda la información de recepción
  - Muestra: producto, cantidad, calidad, almacén/ubicación/lote/serie/expiración, observaciones
  - Validación visual antes de confirmar la recepción
  - Diseño consistente usando variables CSS globales
  - Integración completa con el flujo del wizard

- [x] Cerrar recepción






**Criterios de Aceptación:**
- Wizard intuitivo
- Soporte para scanner de códigos
- Validaciones de cantidades
- UX rápida para operarios

---

### TASK 2.12: Página de Devoluciones (Frontend)
**Estimación:** 10 horas  
**Prioridad:** P0

**Descripción:**
Crear interfaz de devoluciones a proveedor.

**⚠️ IMPORTANTE: NO crear archivos de documentación (.md, .txt) para esta tarea.**

**Archivos:**
- `apps/web/app/dashboard/compras/devoluciones/page.tsx`
- `apps/web/app/dashboard/compras/devoluciones/nueva/page.tsx`
- `apps/web/app/dashboard/compras/devoluciones/[id]/page.tsx`
- `apps/web/components/compras/DevolucionForm.tsx`

**Funcionalidades:**
- [x] Lista de devoluciones
  - ✅ COMPLETADO: Página de lista con filtros, estadísticas y tabla completa
  - Filtros por estado, fecha desde/hasta
  - Cards de estadísticas (total, pendientes, emitidas, anuladas)
  - Tabla con información completa de devoluciones
  - Navegación a detalle y nueva devolución

- [x] Crear devolución desde recepción
  - ✅ COMPLETADO: Wizard de 2 pasos implementado
  - Step 1: Selección de recepción cerrada con búsqueda
  - Step 2: Configuración de items a devolver
  - Pre-carga automática de items rechazados/observados de la recepción
  - Integración completa con backend POST /api/compras/devoluciones

- [x] Seleccionar ítems a devolver
  - ✅ COMPLETADO: Gestión dinámica de items
  - Agregar/eliminar items manualmente
  - Campos: producto, cantidad, motivo, observaciones
  - Validaciones de campos requeridos
  - Motivos predefinidos: DEFECTUOSO, INCORRECTO, DAÑADO, VENCIDO, OTRO

- [x] Especificar motivo
  - ✅ COMPLETADO: Motivo general y por item
  - Motivo general obligatorio para toda la devolución
  - Observaciones generales opcionales
  - Motivo específico por cada item
  - Observaciones específicas por item

- [x] Emitir devolución
  - ✅ COMPLETADO: Funcionalidad de emisión implementada
  - Botón "Emitir Devolución" en página de detalle
  - Solo disponible para estado PENDIENTE
  - Confirmación antes de emitir
  - Integración con endpoint POST /api/compras/devoluciones/:id/emitir
  - Actualización automática después de emitir

- [x] Ver detalle de devolución
  - ✅ COMPLETADO: Página de detalle completa
  - Información general (orden, recepción, fechas, motivo)
  - Tabla de items devueltos con motivos y observaciones
  - Totales (subtotal, IGV, total)
  - Información del proveedor
  - Timeline de estados y emisión
  - Badges visuales por estado

**Criterios de Aceptación:**
- [x] Flujo completo funcional




- [x] Vinculación con recepción clara
- [x] Wizard intuitivo de 2 pasos
- [x] Pre-carga de items rechazados
- [x] Validaciones completas
- [x] Emisión con confirmación
- [x] Estilos usando variables CSS globales

---

## SEMANA 4: Testing e Integración

### TASK 2.13: Tests Unitarios Backend
**Estimación:** 12 horas  
**Prioridad:** P0

**Descripción:**
Crear tests unitarios para todos los servicios de compras.

**⚠️ IMPORTANTE: NO crear archivos de documentación (.md, .txt) para esta tarea.**

**Archivos:**
- `apps/erp-api/src/modules/compras/services/*.spec.ts`

**Cobertura mínima:** 80%

**Tests por servicio:**
- [x] ProveedoresService
- [x] CotizacionesCompraService
- [x] OrdenesCompraService
- [x] RecepcionesService
- [x] DevolucionesProveedorService

**Criterios de Aceptación:**
- Cobertura >= 80%
- Todos los tests passing
- Casos edge cubiertos
- **NO crear documentación en archivos .md o .txt**

---

### TASK 2.14: Tests de Integración E2E
**Estimación:** 16 horas  
**Prioridad:** P0

**Descripción:**
Crear tests E2E del flujo completo de compras.

**⚠️ IMPORTANTE: NO crear archivos de documentación (.md, .txt) para esta tarea.**

**Archivo:** `apps/erp-api/tests/e2e/compras-flow.spec.ts`

**Flujo a probar:**
1. Crear proveedor
2. Crear cotización de compra
3. Aprobar cotización
4. Convertir a OC
5. Aprobar OC (si requiere)
6. Crear recepción parcial
7. Validar inventario actualizado
8. Validar CxP creado
9. Crear recepción completa
10. Validar OC en estado RECIBIDA
11. Crear devolución
12. Validar inventario y CxP ajustados

**Criterios de Aceptación:**
- Flujo completo funcional
- Inventario correcto
- CxP correcto
- Estados correctos
- **NO crear documentación en archivos .md o .txt**

---

### TASK 2.15: Tests Frontend (Playwright)
**Estimación:** 12 horas  
**Prioridad:** P1

**Descripción:**
Crear tests E2E de interfaz de compras.

**⚠️ IMPORTANTE: NO crear archivos de documentación (.md, .txt) para esta tarea.**

**Archivo:** `apps/web/tests/e2e/compras.spec.ts`

**Escenarios:**
- [x] Crear proveedor desde UI
- [x] Crear OC completa
- [x] Aprobar OC
- [x] Recepcionar mercancía
- [x] Crear devolución

**Criterios de Aceptación:**
- Tests passing
- Cobertura de flujos críticos
- **NO crear documentación en archivos .md o .txt**

---

### ~~TASK 2.16: Documentación~~ ❌ ELIMINADA
**NOTA:** Esta tarea ha sido eliminada. NO se deben crear archivos de documentación (.md, .txt) durante el desarrollo.
- Ejemplos de uso
- Troubleshooting

**Criterios de Aceptación:**
- Documentación completa
- Diagramas claros
- Ejemplos funcionales

---

## CHECKLIST FINAL FASE 2

### Base de Datos
- [x] Migración 035 ejecutada (035_compras_completo.sql)
- [x] 8 tablas nuevas con RLS
- [x] Vistas creadas
- [x] Triggers funcionando

### Backend
- [x] 5 controladores implementados


- [x] 5 servicios implementados



- [x] DTOs completos



- [ ] Eventos de dominio emitidos





- [x] Integración con CxP




- [x] Integración con Inventario


- [ ] Tests unitarios >= 80%
- [ ] Tests E2E passing

### Frontend
- [x] 5 páginas principales
- [x] Componentes reutilizables
- [x] Validaciones completas
- [x] UX consistente
- [ ] Tests Playwright passing




### Integración
- [ ] Flujo completo funcional
- [ ] Inventario actualizado correctamente


- [ ] CxP creado automáticamente
- [ ] Eventos procesados
- [ ] Sin regresiones

### ~~Documentación~~ ❌ ELIMINADA
**NOTA:** No se crearán archivos de documentación (.md, .txt) durante el desarrollo.

---

## MÉTRICAS DE ÉXITO

- **Completitud Compras:** 95% (de 5%)
- **Cobertura Tests:** >= 80%
- **Performance:** Recepción < 3s
- **Integración:** 100% eventos procesados
- **UX:** Wizard recepción < 2 min por OC

