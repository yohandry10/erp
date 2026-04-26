-- Migration: Ajustar unicidad de source_event_id por tenant en asientos_contables
-- Contexto: Garantiza idempotencia multitenant al generar asientos desde eventos endurecidos
-- Fecha: 2025-11-02

BEGIN;

-- Verificar que la tabla y columnas existen antes de crear el índice
DO $$
BEGIN
  -- Verificar si la tabla existe
  IF EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'asientos_contables'
  ) THEN
    -- Verificar si la columna tenant_id existe
    IF EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'asientos_contables' 
      AND column_name = 'tenant_id'
    ) THEN
      -- Verificar si la columna source_event_id existe
      IF EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'asientos_contables' 
        AND column_name = 'source_event_id'
      ) THEN
        -- Eliminamos el índice único previo que aplicaba a toda la tabla (sin scope de tenant).
        DROP INDEX IF EXISTS idx_asientos_contables_source_event_unique;

        -- Creamos índice único compuesto para asegurar que cada evento genere
        -- un solo asiento dentro de su tenant.
        CREATE UNIQUE INDEX IF NOT EXISTS idx_asientos_contables_tenant_source_event_unique
        ON asientos_contables(tenant_id, source_event_id)
        WHERE source_event_id IS NOT NULL;

        RAISE NOTICE 'Índice idx_asientos_contables_tenant_source_event_unique creado exitosamente';
      ELSE
        RAISE NOTICE 'Columna source_event_id no existe en asientos_contables. Saltando migración.';
      END IF;
    ELSE
      RAISE NOTICE 'Columna tenant_id no existe en asientos_contables. Saltando migración.';
    END IF;
  ELSE
    RAISE NOTICE 'Tabla asientos_contables no existe. Saltando migración.';
  END IF;
END $$;

COMMIT;
