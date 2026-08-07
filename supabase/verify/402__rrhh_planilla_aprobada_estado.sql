DO $$
DECLARE
  v_estado_constraint text;
  v_consistency_constraint text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '402'
      AND name = '_rrhh_planilla_aprobada_estado'
  ) THEN
    RAISE EXCEPTION '402: migración no registrada';
  END IF;

  IF app.normalize_planilla_estado('aprobada', 'pendiente') <> 'aprobada' THEN
    RAISE EXCEPTION '402: la normalización degrada APROBADA';
  END IF;

  SELECT pg_get_constraintdef(oid)
  INTO v_estado_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.planillas'::regclass
    AND conname = 'ck_planillas_estado_runtime_200';

  IF v_estado_constraint IS NULL OR position('aprobada' in lower(v_estado_constraint)) = 0 THEN
    RAISE EXCEPTION '402: el dominio de estado no admite APROBADA';
  END IF;

  SELECT pg_get_constraintdef(oid)
  INTO v_consistency_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.planillas'::regclass
    AND conname = 'ck_planillas_estado_pago_consistency_runtime_200';

  IF v_consistency_constraint IS NULL OR position('aprobada' in lower(v_consistency_constraint)) = 0 THEN
    RAISE EXCEPTION '402: la consistencia estado/pago no admite APROBADA';
  END IF;
END;
$$;

SELECT
  app.normalize_planilla_estado('aprobada', 'pendiente') AS estado_aprobado,
  count(*) FILTER (WHERE lower(estado::text) = 'aprobada') AS planillas_aprobadas
FROM public.planillas;
