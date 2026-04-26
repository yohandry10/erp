-- ===================================================================
-- Migration 103: Forzar columnas concepto/referencia como TEXT en
-- cualquier esquema (desarrollo reportó que aún seguían en VARCHAR(50))
-- ===================================================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT table_schema,
           table_name,
           column_name
    FROM information_schema.columns
    WHERE table_name IN ('asientos_contables', 'detalle_asientos')
      AND column_name IN ('concepto', 'referencia')
      AND data_type IN ('character varying', 'character')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I TYPE TEXT',
      rec.table_schema,
      rec.table_name,
      rec.column_name
    );

    RAISE NOTICE '✅ %I.%I.%I migrada a TEXT', rec.table_schema, rec.table_name, rec.column_name;
  END LOOP;
END $$;
