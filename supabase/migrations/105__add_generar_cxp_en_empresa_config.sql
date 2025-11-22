-- ============================================================
-- Migration 105: Agregar columna generar_cxp_en a empresa_config
-- Opciones permitidas: 'RECEPCION' (default) | 'APROBACION_OC'
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'empresa_config'
      AND column_name = 'generar_cxp_en'
  ) THEN
    ALTER TABLE public.empresa_config
      ADD COLUMN generar_cxp_en VARCHAR(20) DEFAULT 'RECEPCION';
    RAISE NOTICE '✅ Columna generar_cxp_en agregada a empresa_config';
  END IF;

  -- Normalizar valores existentes y aplicar default
  UPDATE public.empresa_config
  SET generar_cxp_en = COALESCE(UPPER(generar_cxp_en), 'RECEPCION');

  -- Asegurar constraint de valores permitidos
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'empresa_config_generar_cxp_en_chk'
  ) THEN
    ALTER TABLE public.empresa_config
      ADD CONSTRAINT empresa_config_generar_cxp_en_chk
      CHECK (generar_cxp_en IN ('RECEPCION', 'APROBACION_OC'));
    RAISE NOTICE '✅ Constraint de valores permitidos creada';
  END IF;
END $$;

