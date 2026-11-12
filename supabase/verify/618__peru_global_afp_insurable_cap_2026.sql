\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
  r record;
  v_actual numeric;
BEGIN
  -- Los doce períodos globales de 2026 tienen tope, y el sembrado por la 618
  -- coincide con lo publicado por la SBS. Un valor distinto registrado antes
  -- se respeta: la migración no lo pisa y aquí sólo se exige que exista.
  FOR r IN SELECT * FROM (VALUES
    ('2026-01', 12209.11::numeric), ('2026-02', 12209.11::numeric), ('2026-03', 12209.11::numeric),
    ('2026-04', 12598.91::numeric), ('2026-05', 12598.91::numeric), ('2026-06', 12598.91::numeric),
    ('2026-07', 12672.65::numeric), ('2026-08', 12672.65::numeric), ('2026-09', 12672.65::numeric),
    ('2026-10', 12732.70::numeric), ('2026-11', 12732.70::numeric), ('2026-12', 12732.70::numeric)
  ) AS oficial(periodo, tope)
  LOOP
    SELECT n.afp_remuneracion_max_asegurable INTO v_actual
      FROM public.normativa_peru_periodos n
     WHERE n.tenant_id IS NULL AND n.activo AND n.periodo = r.periodo;
    IF NOT FOUND OR v_actual IS NULL THEN
      RAISE EXCEPTION 'VERIFY_618_GLOBAL_CAP_MISSING: %', r.periodo;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.normativa_peru_periodos n
       WHERE n.tenant_id IS NULL AND n.activo AND n.periodo = r.periodo
         AND n.fuente->'afp_remuneracion_max_asegurable'->>'source_migration' = '618__peru_global_afp_insurable_cap_2026'
         AND (n.afp_remuneracion_max_asegurable IS DISTINCT FROM r.tope
           OR (n.fuente->'afp_remuneracion_max_asegurable'->>'valor')::numeric IS DISTINCT FROM r.tope
           OR n.fuente->'afp_remuneracion_max_asegurable'->>'url' NOT LIKE 'https://www.sbs.gob.pe/%')
    ) THEN
      RAISE EXCEPTION 'VERIFY_618_GLOBAL_CAP_VALUE_OR_SOURCE: %', r.periodo;
    END IF;
  END LOOP;

  -- La 618 es sólo global: ninguna fila de empresa cita esta migración.
  IF EXISTS (
    SELECT 1 FROM public.normativa_peru_periodos n
     WHERE n.tenant_id IS NOT NULL
       AND n.fuente->'afp_remuneracion_max_asegurable'->>'source_migration' = '618__peru_global_afp_insurable_cap_2026'
  ) THEN
    RAISE EXCEPTION 'VERIFY_618_TENANT_ROW_TOUCHED';
  END IF;

  -- Conserva las fuentes anteriores, el aislamiento y un único activo por período.
  IF EXISTS (
    SELECT 1 FROM public.normativa_peru_periodos n
     WHERE n.tenant_id IS NULL AND n.activo AND n.periodo LIKE '2026-%'
       AND n.fuente->>'source_migration' = '332__accounting_production_compliance_closure'
       AND NOT (n.fuente ? 'sbs_afp' AND n.fuente ? 'uit')
  ) THEN
    RAISE EXCEPTION 'VERIFY_618_PREVIOUS_SOURCES_LOST';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = 'public.normativa_peru_periodos'::regclass
       AND relrowsecurity AND relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'VERIFY_618_RLS_NOT_FORCED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.normativa_peru_periodos n
     WHERE n.tenant_id IS NULL AND n.activo AND n.periodo LIKE '2026-%'
     GROUP BY n.periodo HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'VERIFY_618_DUPLICATE_ACTIVE_GLOBAL_PERIOD';
  END IF;
END;
$verify$;
SELECT 'PASS618: tope AFP global 2026 con fuente SBS; normativa de empresas, fuentes previas y RLS intactos';
ROLLBACK;
