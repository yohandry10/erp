# Implementación: Crear Movimientos Bancarios desde Pagos/Cobros

## Resumen

Se implementó la funcionalidad para crear automáticamente movimientos bancarios cuando se registran pagos a proveedores (CxP) o cobros de clientes (CxC).

## Cambios Realizados

### 1. Base de Datos

**Migración 038**: `supabase/migrations/038_add_cxc_cliente_movimientos_bancarios.sql`

Se agregaron dos columnas a la tabla `movimientos_bancarios`:
- `cliente_id` (UUID): Referencia al cliente relacionado (para cobros)
- `cxc_id` (UUID): Referencia a la cuenta por cobrar relacionada

Se crearon índices para optimizar las consultas:
- `idx_movimientos_bancarios_cliente`
- `idx_movimientos_bancarios_cxc`

### 2. Backend - Servicio CxC

**Archivo**: `apps/erp-api/src/modules/finanzas/cxc/cxc.service.ts`

Se modificó el método `registrarPago()` para:

1. **Validar cuenta bancaria** (si se proporciona):
   - Verificar que existe y está activa
   - Validar que la moneda coincida con la CxC

2. **Crear movimiento bancario automáticamente**:
   - Tipo: `ABONO` (ingreso de dinero)
   - Monto: igual al cobro registrado
   - Descripción: incluye nombre del cliente y número de documento
   - Referencias: `cliente_id` y `cxc_id`

3. **Actualizar saldo de cuenta bancaria**:
   - Suma el monto del cobro al saldo actual
   - Manejo de errores con rollback automático

### 3. DTO Actualizado

**Archivo**: `apps/erp-api/src/modules/finanzas/cxc/dto/registrar-pago.dto.ts`

Se agregó el campo opcional:
```typescript
@IsOptional()
@IsUUID()
cuenta_bancaria_id?: string;
```

## Flujo de Negocio

### Cobros de Clientes (CxC)

```
1. Usuario registra cobro de CxC
   ↓
2. Sistema valida cuenta bancaria (si se proporciona)
   ↓
3. Sistema registra el pago en cxc_pagos
   ↓
4. Sistema crea movimiento bancario (ABONO)
   ↓
5. Sistema actualiza saldo de cuenta bancaria (+monto)
   ↓
6. Sistema actualiza estado de CxC
```

### Pagos a Proveedores (CxP)

```
1. Usuario registra pago de CxP
   ↓
2. Sistema valida cuenta bancaria y saldo suficiente
   ↓
3. Sistema actualiza CxP (reduce saldo)
   ↓
4. Sistema crea movimiento bancario (CARGO)
   ↓
5. Sistema actualiza saldo de cuenta bancaria (-monto)
   ↓
6. Sistema emite evento PagoProveedorRegistrado
```

**Nota**: Los pagos a proveedores YA tenían esta funcionalidad implementada en `TesoreriaService.registrarPago()`.

## Tipos de Movimientos

- **ABONO**: Ingreso de dinero (cobros de clientes)
- **CARGO**: Egreso de dinero (pagos a proveedores)

## Validaciones Implementadas

### Para Cobros (CxC):
- ✅ Monto mayor a cero
- ✅ Monto no excede saldo pendiente
- ✅ Cuenta bancaria existe y está activa
- ✅ Moneda de cuenta bancaria coincide con CxC
- ✅ Rollback automático si falla alguna operación

### Para Pagos (CxP):
- ✅ Monto mayor a cero
- ✅ Monto no excede saldo pendiente
- ✅ Cuenta bancaria existe y está activa
- ✅ Saldo suficiente en cuenta (si no permite sobregiro)
- ✅ Moneda de cuenta bancaria coincide con CxP
- ✅ Rollback automático si falla alguna operación

## Manejo de Errores

Si ocurre un error durante el proceso:

1. **Error al crear movimiento bancario**:
   - Se revierte el registro del pago/cobro
   - Se lanza excepción con mensaje descriptivo

2. **Error al actualizar saldo bancario**:
   - Se revierte el movimiento bancario
   - Se revierte el registro del pago/cobro
   - Se lanza excepción con mensaje descriptivo

## Testing

### Script de Prueba

**Archivo**: `test-crear-movimiento-desde-cobro.ps1`

El script prueba el flujo completo:
1. Obtiene una CxC pendiente
2. Obtiene una cuenta bancaria activa
3. Registra un cobro con cuenta bancaria
4. Verifica que se creó el movimiento bancario
5. Verifica que se actualizó el saldo bancario

### Ejecutar Test

```powershell
.\test-crear-movimiento-desde-cobro.ps1
```

## Aplicar Migración

### Opción 1: Script TypeScript
```powershell
npx tsx scripts/apply-migration-038.ts
```

### Opción 2: Script PowerShell
```powershell
.\apply-migration-038.ps1
```

## Impacto en Otros Módulos

### Conciliación Bancaria
Los movimientos creados automáticamente:
- Tienen `conciliado = false` por defecto
- Pueden ser conciliados manualmente o automáticamente
- Incluyen referencias para facilitar el match

### Reportes
Los movimientos incluyen:
- `cliente_id` / `proveedor_id`: para reportes por cliente/proveedor
- `cxc_id` / `cxp_id`: para trazabilidad completa
- `metodo_pago`: para análisis de métodos de pago

### Contabilidad
Los movimientos bancarios pueden ser consumidos por el módulo de contabilidad para:
- Generar asientos contables automáticos
- Mantener sincronización entre finanzas y contabilidad

## Consideraciones

1. **Cuenta bancaria opcional**: Si no se proporciona `cuenta_bancaria_id`, el pago/cobro se registra pero NO se crea movimiento bancario.

2. **Moneda**: La moneda de la cuenta bancaria DEBE coincidir con la moneda de la CxP/CxC.

3. **Conciliación**: Los movimientos creados automáticamente deben ser conciliados posteriormente con el extracto bancario.

4. **Auditoría**: Todos los movimientos incluyen `created_by` para trazabilidad.

## Estado de la Tarea

✅ **COMPLETADA**

- [x] Migración de base de datos creada
- [x] Columnas `cliente_id` y `cxc_id` agregadas
- [x] Índices creados
- [x] Servicio CxC actualizado
- [x] DTO actualizado
- [x] Validaciones implementadas
- [x] Manejo de errores con rollback
- [x] Script de prueba creado
- [x] Documentación completa

## Próximos Pasos

1. Aplicar la migración 038 en el ambiente de desarrollo
2. Ejecutar el script de prueba
3. Validar que los movimientos se crean correctamente
4. Marcar la tarea como completada en el documento de tareas
