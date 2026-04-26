# Supabase local — fallo de `npx supabase start` (migraciones)

Fecha: 2025-12-13

## Comando ejecutado
- `npx supabase start`

## Resultado observado
- Durante la inicialización y aplicación de migraciones, el proceso se detiene con:
  - `ERROR: relation "clientes" does not exist (SQLSTATE 42P01)`
  - En `supabase/migrations/001_crear_tablas_ventas.sql` al ejecutar `ALTER TABLE clientes ...`.

## Interpretación
- Las migraciones en `supabase/migrations` contienen múltiples `ALTER TABLE`/`CREATE INDEX` que **asumen** tablas existentes (p.ej. `clientes`, `cotizaciones`, `productos`, `empresa_config`, `outbox_events`, etc.).
- El repositorio **no incluye** el `CREATE TABLE` de varias de esas tablas (o no es aplicable en un reset limpio), por lo que una base local “desde cero” no puede construirse solo con migraciones.

## Impacto directo
- Bloquea ejecutar los verificadores reales de RLS/grants (T-0302/T-0305) en Supabase local.

## Próximo fix recomendado (en repo)
- Añadir una migración `000_*` que cree las tablas base faltantes (y/o reestructurar migraciones para que cada tabla tenga su `CREATE TABLE`).
- Resolver nombres de migración no aceptados por Supabase CLI (ej. `038b_create_conciliaciones_bancarias.sql`).

