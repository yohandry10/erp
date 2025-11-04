# Migraciones de Conciliaciones Bancarias

## Problema Identificado

La tabla `conciliaciones_bancarias` existía en la base de datos pero **no tenía una migración que la creara**. Esto causaba que:

1. Las migraciones no pudieran ejecutarse desde cero en un ambiente nuevo
2. La migración 039 asumía que la tabla ya existía
3. Las migraciones 031, 032 y 033 también la referenciaban

## Solución Implementada

Se creó la migración **038b_create_conciliaciones_bancarias.sql** que:

### Crea la tabla base con las siguientes columnas:

- `id` (UUID, PK)
- `tenant_id` (UUID, NOT NULL)
- `cuenta_bancaria_id` (UUID, FK a cuentas_bancarias)
- `periodo` (VARCHAR(7), formato YYYY-MM)
- `estado` (estado_conciliacion ENUM: ABIERTA, EN_PROCESO, CERRADA)
- `saldo_libro` (NUMERIC(12,2))
- `saldo_banco` (NUMERIC(12,2))
- `diferencia` (NUMERIC(12,2))
- `observaciones` (TEXT)
- `created_at` (TIMESTAMP WITH TIME ZONE)
- `updated_at` (TIMESTAMP WITH TIME ZONE)

### Características:

- ✅ Constraint UNIQUE en (tenant_id, cuenta_bancaria_id, periodo)
- ✅ Índices para optimización de queries
- ✅ RLS (Row Level Security) habilitado con política de tenant isolation
- ✅ Trigger para actualizar `updated_at` automáticamente
- ✅ Comentarios en todas las columnas

## Orden de Ejecución de Migraciones

```
020_finanzas_completo.sql          → Crea cuentas_bancarias y movimientos_bancarios
...
031_create_indices_finanzas.sql    → Crea índices (incluye conciliaciones_bancarias)
032_enable_rls_finanzas.sql        → Habilita RLS (incluye conciliaciones_bancarias)
033_audit_rls_violations.sql       → Auditoría RLS (incluye conciliaciones_bancarias)
...
038_add_cxc_cliente_movimientos_bancarios.sql
038b_create_conciliaciones_bancarias.sql  ← NUEVA MIGRACIÓN
039_conciliaciones_bancarias.sql   → Agrega columnas adicionales (fecha_desde, fecha_hasta, etc.)
040_add_extracto_columns_movimientos.sql
...
```

## Columnas Agregadas por Migración 039

La migración 039 agrega las siguientes columnas adicionales:

- `fecha_desde` (DATE)
- `fecha_hasta` (DATE)
- `created_by` (UUID)
- `cerrado_at` (TIMESTAMP WITH TIME ZONE)
- `cerrado_by` (UUID)

## Uso en el Código

La tabla es utilizada por el módulo de **Conciliación Bancaria**:

- `apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.service.ts`
- `apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.controller.ts`

### Funcionalidades:

1. Listar conciliaciones bancarias
2. Crear nuevas conciliaciones por período
3. Importar extractos bancarios (CSV)
4. Match automático de movimientos
5. Match manual de movimientos
6. Obtener resumen de conciliación
7. Obtener estadísticas de conciliación
8. Cerrar conciliaciones
9. Obtener conciliaciones pendientes

## Tablas Relacionadas

- `cuentas_bancarias` - Cuentas bancarias de la empresa
- `movimientos_bancarios` - Movimientos bancarios (sistema + extractos)

## Notas Importantes

- ⚠️ La migración 038b debe ejecutarse ANTES de la 039
- ✅ Todas las migraciones usan `IF NOT EXISTS` para ser idempotentes
- ✅ Compatible con ejecución en bases de datos existentes
- ✅ Compatible con ejecución desde cero en ambientes nuevos
