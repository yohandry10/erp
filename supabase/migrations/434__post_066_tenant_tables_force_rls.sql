-- Fuerza RLS en tablas tenant-scoped creadas después del hardening general 066.
-- No modifica filas ni políticas existentes. Requiere un lock DDL breve por tabla.

BEGIN;

DO $$
DECLARE
  v_table text;
  v_policy_count integer;
  v_tables constant text[] := ARRAY[
    'ajustes_consolidacion',
    'categorias_producto',
    'conciliaciones_partidas',
    'conciliaciones_partidas_lineas',
    'contabilidad_asientos_numeracion',
    'diferidos',
    'diferidos_devengos',
    'distribucion_analitica',
    'grupos_consolidacion',
    'grupos_consolidacion_miembros',
    'mapeos_cuentas_consolidacion',
    'reportes_contables_configurables',
    'reportes_contables_lineas',
    'tipos_cambio_consolidacion'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'Falta la tabla tenant-scoped requerida: public.%', v_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = 'tenant_id'
    ) THEN
      RAISE EXCEPTION 'La tabla public.% no tiene tenant_id', v_table;
    END IF;

    SELECT count(*)::integer
      INTO v_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = v_table;

    IF v_policy_count = 0 THEN
      RAISE EXCEPTION 'La tabla public.% no tiene políticas RLS', v_table;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);
  END LOOP;
END;
$$;

COMMIT;
