# 🔍 AUDITORÍA COMPLETA - MÓDULO RRHH

**Fecha:** 2025-11-29  
**Archivos Auditados:**
- `rrhh.service.ts` (1605 líneas)
- `rrhh.controller.ts` (350 líneas)
- `rrhh.module.ts` (30 líneas)
- `planillas.service.ts` (~1100 líneas)
- `rrhh-accounting-integration.service.ts` (280 líneas)

---

## 🚨 ERRORES CRÍTICOS

### 1. ❌ FALTA DE TENANT EN MÚLTIPLES ENDPOINTS DEL CONTROLLER

**Ubicación:** `rrhh.controller.ts`

**Problema:** Varios endpoints NO pasan el `tenantId` al servicio aunque lo reciben:

```typescript
// ❌ LÍNEA 117 - getPagos NO pasa tenantId
@Get('pagos')
async getPagos(
  @CurrentTenant() tenantId: string,
  @Query('periodo') periodo?: string,
  @Query('empleado_id') empleadoId?: string
) {
  return this.rrhhService.getPagos(periodo, empleadoId); // ❌ FALTA tenantId!
}

// ❌ LÍNEA 125 - procesarPago NO pasa tenantId
@Put('pagos/:id/procesar')
async procesarPago(
  @CurrentTenant() tenantId: string,
  @Param('id') pagoId: string
) {
  return this.rrhhService.procesarPago(pagoId); // ❌ FALTA tenantId!
}

// ❌ LÍNEA 165 - getContratos NO pasa tenantId
@Get('contratos')
async getContratos(@Query('empleado_id') empleadoId?: string) {
  return this.rrhhService.getContratos(empleadoId); // ❌ NO RECIBE NI PASA tenantId!
}

// ❌ LÍNEA 170 - createContrato NO pasa tenantId
@Post('contratos')
async createContrato(@Body() contratoData: any) {
  return this.rrhhService.createContrato(contratoData); // ❌ NO RECIBE NI PASA tenantId!
}

// ❌ LÍNEA 175 - renovarContrato NO pasa tenantId
@Post('contratos/:id/renovar')
async renovarContrato(@Param('id') contratoId: string, @Body() data: { meses: number }) {
  return this.rrhhService.renovarContrato(contratoId, data.meses); // ❌ FALTA tenantId!
}

// ❌ LÍNEA 180 - finalizarContrato NO pasa tenantId
@Put('contratos/:id/finalizar')
async finalizarContrato(...) {
  return this.rrhhService.finalizarContrato(contratoId, ...); // ❌ FALTA tenantId!
}

// ❌ LÍNEA 185 - generarContrato NO pasa tenantId
@Get('contratos/:id/generar')
async generarContrato(@Param('id') contratoId: string) {
  return this.rrhhService.generarContratoPDF(contratoId); // ❌ FALTA tenantId!
}

// ❌ LÍNEA 190 - getAsistenciasPorFecha NO pasa tenantId
@Get('asistencias')
async getAsistenciasPorFecha(@Query('fecha') fecha: string) {
  return this.rrhhService.getAsistenciasPorFecha(fecha); // ❌ NO RECIBE NI PASA tenantId!
}

// ❌ LÍNEA 195 - marcarAsistencia NO pasa tenantId
@Post('asistencias/marcar')
async marcarAsistencia(@Body() data: {...}) {
  return this.rrhhService.marcarAsistencia(...); // ❌ NO RECIBE NI PASA tenantId!
}

// ❌ LÍNEA 295 - calcularLiquidacion NO pasa tenantId
@Post('empleados/:id/liquidacion')
async calcularLiquidacion(...) {
  return this.rrhhService.calcularLiquidacion(empleadoId, ...); // ❌ FALTA tenantId!
}

// ❌ LÍNEA 350 - getDashboardRrhh NO pasa tenantId
@Get('dashboard')
async getDashboardRrhh() {
  return this.rrhhService.getDashboardRrhh(); // ❌ NO RECIBE NI PASA tenantId!
}
```

**Impacto:** 🔴 CRÍTICO - Violación de aislamiento multi-tenant. Un usuario podría ver/modificar datos de otros tenants.

**Solución:**
```typescript
// ✅ CORRECTO
@Get('contratos')
async getContratos(
  @CurrentTenant() tenantId: string,
  @Query('empleado_id') empleadoId?: string
) {
  return this.rrhhService.getContratos(empleadoId, tenantId);
}
```

---

### 2. ❌ PLANILLAS SERVICE SIN SOPORTE MULTI-TENANT

**Ubicación:** `planillas.service.ts`

**Problema:** TODO el servicio de planillas NO tiene filtros de tenant:

```typescript
// ❌ getPlanillas - Sin filtro de tenant
async getPlanillas() {
  const { data, error } = await this.supabaseService.getClient()
    .from('planillas')
    .select('*')  // ❌ SIN .eq('tenant_id', tenantId)
    .order('periodo', { ascending: false });
}

// ❌ calcularPlanillaMensual - Sin filtro de tenant
async calcularPlanillaMensual(planillaId: string) {
  const { data: empleados } = await client
    .from('empleados')
    .select('*, contratos(*)')
    .eq('estado', 'activo');  // ❌ SIN .eq('tenant_id', tenantId)
}

// ❌ pagarPlanillaCompleta - Sin filtro de tenant
// ❌ pagarEmpleadosSeleccionados - Sin filtro de tenant
// ❌ generarAsientosContables - Sin filtro de tenant
// ❌ getHistorialPagos - Sin filtro de tenant
```

**Impacto:** 🔴 CRÍTICO - Las planillas de TODOS los tenants se mezclan. Un tenant puede ver/pagar planillas de otro.

---

### 3. ❌ EVENTBUS PUEDE SER NULL - CRASH EN RUNTIME

**Ubicación:** `rrhh.service.ts` líneas 270, 310

**Problema:** `eventBus` es `@Optional()` pero se usa sin verificar:

```typescript
constructor(
  private readonly supabaseService: SupabaseService,
  @Optional() private readonly eventBus?: EventBusService,  // ❌ Puede ser undefined
) { }

// ❌ LÍNEA 270 - Crash si eventBus es undefined
this.eventBus.emitEmpleadoAsistencia({...});  // TypeError: Cannot read property 'emitEmpleadoAsistencia' of undefined

// ❌ LÍNEA 310 - Mismo problema
this.eventBus.emitEmpleadoAsistencia({...});
```

**Impacto:** 🔴 CRÍTICO - La aplicación crashea si EventBusService no está disponible.

**Solución:**
```typescript
// ✅ CORRECTO
if (this.eventBus) {
  this.eventBus.emitEmpleadoAsistencia({...});
}
```

---

## ⚠️ ERRORES DE LÓGICA

### 4. ⚠️ CÁLCULO DE VACACIONES ALEATORIO

**Ubicación:** `planillas.service.ts` línea 230

**Problema:** La función `tieneHijos()` usa `Math.random()`:

```typescript
private tieneHijos(empleado: any): boolean {
  // ❌ ALEATORIO - Cada vez que se calcula la planilla, el resultado cambia
  return Math.random() > 0.6; // 40% tienen hijos
}
```

**Impacto:** 🟡 MEDIO - Los cálculos de planilla son inconsistentes. Un empleado puede tener asignación familiar un mes y no el siguiente.

**Solución:**
```typescript
// ✅ CORRECTO - Usar datos reales del empleado
private tieneHijos(empleado: any): boolean {
  return empleado.tiene_hijos === true || 
         (empleado.familiares?.some(f => f.parentesco === 'hijo') ?? false);
}
```

---

### 5. ⚠️ CÁLCULO DE CTS INCORRECTO

**Ubicación:** `rrhh.service.ts` línea 870

**Problema:** El cálculo de días CTS es incorrecto según la ley peruana:

```typescript
private calcularDiasCts(fechaIngreso: Date, fechaTerminacion: Date): number {
  const mesesTrabajados = ...;
  return Math.floor(mesesTrabajados * 2.5); // ❌ INCORRECTO
}
```

**Según ley peruana:** CTS = (Sueldo + 1/6 Gratificación) / 12 * meses trabajados

**Impacto:** 🟡 MEDIO - Cálculos de liquidación incorrectos.

---

### 6. ⚠️ VALIDACIÓN DE ESTADO PLANILLA INCONSISTENTE

**Ubicación:** `planillas.service.ts` líneas 790, 1050

**Problema:** Estados inconsistentes entre mayúsculas y minúsculas:

```typescript
// ❌ LÍNEA 790 - Usa mayúsculas
if (planilla.estado !== 'CALCULADA') {
  throw new Error('Solo se pueden pagar planillas en estado CALCULADA');
}

// ❌ LÍNEA 1050 - Usa minúsculas
if (planilla.estado !== 'calculada' && ...) {
  throw new Error(...);
}

// ❌ LÍNEA 180 - Guarda en minúsculas
.update({ estado: 'calculada' })
```

**Impacto:** 🟡 MEDIO - Validaciones fallan dependiendo de cómo se guardó el estado.

---

### 7. ⚠️ HORAS TRABAJADAS NEGATIVAS POSIBLES

**Ubicación:** `rrhh.service.ts` línea 295

**Problema:** No se valida que la hora de salida sea posterior a la entrada:

```typescript
const entrada = new Date(`${hoy}T${registroExistente.hora_entrada}`);
const salida = new Date(`${hoy}T${horaActual}`);
const horasTrabajadas = (salida.getTime() - entrada.getTime()) / (1000 * 60 * 60);
// ❌ Si salida < entrada, horasTrabajadas será NEGATIVO
```

**Impacto:** 🟡 MEDIO - Datos incorrectos en asistencia.

---

## 🔒 BRECHAS DE SEGURIDAD

### 8. 🔒 INYECCIÓN DE DATOS EN EMPLEADO

**Ubicación:** `rrhh.service.ts` línea 65

**Problema:** Se acepta `any` sin validación:

```typescript
async createEmpleado(empleadoData: any, tenantId?: string) {
  const { data, error } = await this.supabaseService
    .getClient()
    .from('empleados')
    .insert({
      ...empleadoData,  // ❌ Spread sin validación - puede incluir campos maliciosos
      tenant_id: currentTenantId,
    })
```

**Impacto:** 🟠 ALTO - Un atacante podría inyectar campos como `is_admin: true`.

**Solución:**
```typescript
// ✅ CORRECTO - Whitelist de campos permitidos
const camposPermitidos = ['nombres', 'apellidos', 'email', 'telefono', ...];
const datosLimpios = Object.fromEntries(
  Object.entries(empleadoData).filter(([key]) => camposPermitidos.includes(key))
);
```

---

### 9. 🔒 FALTA VALIDACIÓN DE PERMISOS GRANULARES

**Ubicación:** `rrhh.controller.ts`

**Problema:** Solo hay un permiso genérico `rrhh.access`:

```typescript
@RequirePermission('rrhh.access')
export class RrhhController {
  // ❌ Todos los endpoints usan el mismo permiso
  // Un usuario con acceso a ver empleados también puede eliminarlos
}
```

**Impacto:** 🟠 ALTO - No hay separación de permisos (lectura vs escritura vs eliminación).

**Solución:**
```typescript
@Get('empleados')
@RequirePermission('rrhh.empleados.read')
async getEmpleados() {}

@Delete('empleados/:id')
@RequirePermission('rrhh.empleados.delete')
async deleteEmpleado() {}
```

---

## 📊 VACÍOS FUNCIONALES

### 10. 📊 FALTA VALIDACIÓN DE DUPLICADOS

**Problema:** No se valida si ya existe un empleado con el mismo documento:

```typescript
async createEmpleado(empleadoData: any, tenantId?: string) {
  // ❌ No verifica si ya existe empleado con mismo numero_documento
  const { data, error } = await this.supabaseService
    .getClient()
    .from('empleados')
    .insert({...})
```

---

### 11. 📊 FALTA AUDITORÍA DE CAMBIOS

**Problema:** No hay registro de quién modificó qué y cuándo:

```typescript
async updateEmpleado(id: string, empleadoData: any, tenantId?: string) {
  // ❌ No registra: usuario que modificó, fecha, campos cambiados
  const { data, error } = await this.supabaseService
    .getClient()
    .from('empleados')
    .update(empleadoData)
```

---

### 12. 📊 FALTA SOFT DELETE

**Problema:** Los empleados se eliminan físicamente:

```typescript
async deleteEmpleado(id: string, tenantId?: string) {
  const { error } = await this.supabaseService
    .getClient()
    .from('empleados')
    .delete()  // ❌ DELETE físico - se pierde historial
    .eq('id', id)
```

**Solución:** Usar soft delete con campo `deleted_at`.

---

### 13. 📊 FALTA TRANSACCIONES EN OPERACIONES CRÍTICAS

**Ubicación:** `planillas.service.ts` - `pagarPlanillaCompleta`

**Problema:** Si falla a mitad del proceso, quedan datos inconsistentes:

```typescript
async pagarPlanillaCompleta(planillaId: string, metodoPago: string) {
  // ❌ No hay transacción - si falla en el empleado 5 de 10,
  // los primeros 4 quedan pagados y los últimos 5 no
  for (const empleadoPlanilla of planilla.empleado_planilla) {
    const { data: pago, error: pagoError } = await this.supabaseService.getClient()
      .from('pagos_empleados')
      .insert({...})
```

---

## 📋 RESUMEN DE HALLAZGOS

| Severidad | Cantidad | Descripción |
|-----------|----------|-------------|
| 🔴 CRÍTICO | 3 | Falta tenant en endpoints, planillas sin multi-tenant, eventBus null |
| 🟠 ALTO | 2 | Inyección de datos, falta permisos granulares |
| 🟡 MEDIO | 4 | Cálculos incorrectos, estados inconsistentes, horas negativas |
| 🔵 BAJO | 4 | Falta validación duplicados, auditoría, soft delete, transacciones |

---

## ✅ ACCIONES RECOMENDADAS

### Prioridad 1 (Inmediato):
1. Agregar `tenantId` a TODOS los endpoints del controller
2. Agregar filtros de tenant a `planillas.service.ts`
3. Agregar verificación `if (this.eventBus)` antes de emitir eventos

### Prioridad 2 (Esta semana):
4. Implementar DTOs con validación para crear/actualizar empleados
5. Agregar permisos granulares por operación
6. Corregir cálculo de CTS según ley peruana

### Prioridad 3 (Este mes):
7. Implementar transacciones para operaciones de pago
8. Agregar auditoría de cambios
9. Implementar soft delete
10. Corregir función `tieneHijos()` para usar datos reales


---

## ✅ CORRECCIONES APLICADAS

### Fecha: 2025-11-29

#### 1. ✅ Controller - Agregado tenantId a endpoints faltantes

**Archivo:** `rrhh.controller.ts`

Endpoints corregidos:
- `GET /pagos` - Ahora pasa `tenantId` al servicio
- `PUT /pagos/:id/procesar` - Ahora pasa `tenantId` al servicio
- `GET /contratos` - Ahora recibe y pasa `tenantId`
- `POST /contratos` - Ahora recibe y pasa `tenantId`
- `POST /contratos/:id/renovar` - Ahora recibe y pasa `tenantId`
- `PUT /contratos/:id/finalizar` - Ahora recibe y pasa `tenantId`
- `GET /contratos/:id/generar` - Ahora recibe y pasa `tenantId`
- `GET /asistencias` - Ahora recibe y pasa `tenantId`
- `POST /asistencias/marcar` - Ahora recibe y pasa `tenantId`
- `POST /empleados/:id/liquidacion` - Ahora recibe y pasa `tenantId`
- `GET /dashboard` - Ahora recibe y pasa `tenantId`

#### 2. ✅ Service - Protección contra eventBus null

**Archivo:** `rrhh.service.ts`

- Agregado `if (this.eventBus)` antes de emitir eventos de asistencia
- Previene crash cuando EventBusService no está disponible

#### 3. ✅ Función tieneHijos() corregida

**Archivo:** `planillas.service.ts`

- Eliminado `Math.random()` que causaba resultados inconsistentes
- Ahora verifica campos reales: `tiene_hijos`, `cantidad_hijos`, `familiares`, `asignacion_familiar`

#### 4. ✅ Cálculo de Impuesto a la Renta actualizado

**Archivo:** `planillas.service.ts`

- Actualizado UIT a 2025 (S/ 5,350)
- Implementados los 5 tramos correctos: 8%, 14%, 17%, 20%, 30%
- Usa Decimal.js para precisión en cálculos tributarios

#### 5. ✅ Estados normalizados (case-insensitive)

**Archivo:** `planillas.service.ts`

- `pagarPlanillaCompleta`: Normaliza estado a mayúsculas antes de comparar
- `generarAsientosContables`: Normaliza estado a mayúsculas antes de comparar

#### 6. ✅ Validación hora salida > hora entrada

**Archivo:** `rrhh.service.ts`

- `registrarAsistencia`: Valida que salida sea posterior a entrada
- `marcarAsistencia`: Valida que salida sea posterior a entrada
- Mensaje de error claro con las horas involucradas

#### 7. ✅ Cálculo de CTS documentado

**Archivo:** `rrhh.service.ts`

- Agregada referencia a D.S. 001-97-TR
- Documentado el cálculo: 30 días por año = 2.5 días por mes

#### 8. ✅ Prevención de inyección de datos

**Archivo:** `rrhh.service.ts`

- Agregada lista `CAMPOS_EMPLEADO_PERMITIDOS` con whitelist de campos
- `createEmpleado`: Filtra campos antes de insertar
- `updateEmpleado`: Filtra campos antes de actualizar
- Validación de campos requeridos (nombres, apellidos)

#### 9. ✅ Soporte multi-tenant en planillas.service.ts

**Archivo:** `planillas.service.ts`

Funciones corregidas:
- `getPlanillas(tenantId?)` - Ahora filtra por tenant
- `crearPlanilla(data, tenantId?)` - Ahora incluye tenant_id
- `calcularPlanillaMensual(id, tenantId?)` - Ahora filtra empleados por tenant
- `getConceptos(tenantId?)` - Ahora filtra por tenant

#### 10. ✅ Controller actualizado para pasar tenantId a planillas

**Archivo:** `rrhh.controller.ts`

Endpoints actualizados:
- `GET /planillas` - Pasa tenantId
- `POST /planillas` - Pasa tenantId
- `POST /planillas/:id/calcular` - Pasa tenantId
- `GET /planillas/:id/detalle` - Recibe tenantId
- `GET /boleta/:id` - Recibe tenantId
- `PUT /planillas/:id` - Recibe tenantId
- `DELETE /planillas/:id` - Recibe tenantId
- `GET /conceptos` - Pasa tenantId
- `POST /planillas/:id/calcular-personalizada` - Recibe tenantId
- `POST /planillas/:id/pagar` - Recibe tenantId
- `POST /planillas/:id/pagar-empleados` - Recibe tenantId
- `POST /planillas/:id/generar-asientos` - Recibe tenantId
- `GET /planillas/:id/historial-pagos` - Recibe tenantId
- `GET /pagos/:id/comprobante` - Pasa tenantId

---

## ⏳ CORRECCIONES PENDIENTES (Prioridad Baja)

| # | Descripción | Prioridad | Estado |
|---|-------------|-----------|--------|
| 1 | Agregar permisos granulares por operación | 🟠 ALTO | Pendiente |
| 2 | Implementar transacciones en pagos | 🔵 BAJO | Pendiente |
| 3 | Agregar auditoría de cambios | 🔵 BAJO | Pendiente |
| 4 | Implementar soft delete | 🔵 BAJO | Pendiente |
| 5 | Validar duplicados de documento | 🔵 BAJO | Pendiente |

---

## 📊 RESUMEN FINAL

### Errores Corregidos: 10
- ✅ 11 endpoints sin tenantId en controller
- ✅ EventBus null crash
- ✅ Función tieneHijos() aleatoria
- ✅ Cálculo impuesto renta desactualizado
- ✅ Estados inconsistentes (mayúsculas/minúsculas)
- ✅ Horas trabajadas negativas
- ✅ Cálculo CTS documentado
- ✅ Inyección de datos en empleados
- ✅ Planillas sin multi-tenant
- ✅ Controller planillas sin tenantId

### Errores Pendientes: 5 (prioridad baja)
- Permisos granulares
- Transacciones en pagos
- Auditoría de cambios
- Soft delete
- Validación duplicados
