-- ============================================================
-- Migration 102: Aumentar longitud de conceptos/referencias
-- Contexto: Los eventos contables vuelven a fallar con error
-- "value too long for type character varying(50)" aun estando
-- truncados desde la API. Para eliminar el cuello en BD, los
-- campos se migran definitivamente a TEXT.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'asientos_contables'
      AND column_name = 'concepto'
      AND data_type IN ('character varying', 'character')
  ) THEN
    ALTER TABLE public.asientos_contables
      ALTER COLUMN concepto TYPE TEXT;
    RAISE NOTICE '✅ Columna asientos_contables.concepto migrada a TEXT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'asientos_contables'
      AND column_name = 'referencia'
      AND data_type IN ('character varying', 'character')
  ) THEN
    ALTER TABLE public.asientos_contables
      ALTER COLUMN referencia TYPE TEXT;
    RAISE NOTICE '✅ Columna asientos_contables.referencia migrada a TEXT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'detalle_asientos'
      AND column_name = 'concepto'
      AND data_type IN ('character varying', 'character')
  ) THEN
    ALTER TABLE public.detalle_asientos
      ALTER COLUMN concepto TYPE TEXT;
    RAISE NOTICE '✅ Columna detalle_asientos.concepto migrada a TEXT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'detalle_asientos'
      AND column_name = 'referencia'
      AND data_type IN ('character varying', 'character')
  ) THEN
    ALTER TABLE public.detalle_asientos
      ALTER COLUMN referencia TYPE TEXT;
    RAISE NOTICE '✅ Columna detalle_asientos.referencia migrada a TEXT';
  END IF;
END $$;

COMMENT ON COLUMN public.asientos_contables.concepto IS
  'Glosa principal del asiento sin límite de longitud para evitar errores de truncado.';
COMMENT ON COLUMN public.asientos_contables.referencia IS
  'Referencia externa (documento, venta, stock) almacenada como TEXT para soportar IDs largos.';
COMMENT ON COLUMN public.detalle_asientos.concepto IS
  'Descripción del detalle contable sin límite de caracteres.';
COMMENT ON COLUMN public.detalle_asientos.referencia IS
  'Referencia opcional para el detalle contable.';
