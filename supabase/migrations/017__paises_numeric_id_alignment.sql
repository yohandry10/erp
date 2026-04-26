-- ============================================================================
-- 017__paises_numeric_id_alignment.sql
-- Alinea catalogo de paises y claves pais_id a formato numerico (runtime API).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Helper: promover columna pais_id (uuid) a bigint usando mapeo en public.paises
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.promote_pais_id_column(p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_pais_id_type text;
  v_join_col text;
  v_target_col text;
  v_has_old_alias boolean;
BEGIN
  SELECT c.data_type
  INTO v_pais_id_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = p_table
    AND c.column_name = 'pais_id';

  IF v_pais_id_type IS DISTINCT FROM 'uuid' THEN
    RETURN;
  END IF;

  -- Estrategia de mapeo:
  -- 1) durante conversión: paises.id (uuid) -> paises.id_new (bigint)
  -- 2) post conversión: paises.id_uuid (uuid) -> paises.id (bigint)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'paises'
      AND column_name = 'id_uuid'
  ) THEN
    v_join_col := 'id_uuid';
    v_target_col := 'id';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'paises'
      AND column_name = 'id_new'
  ) THEN
    v_join_col := 'id';
    v_target_col := 'id_new';
  ELSE
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS pais_id_new bigint', p_table);

  EXECUTE format(
    'UPDATE public.%1$I t
     SET pais_id_new = p.%2$I
     FROM public.paises p
     WHERE t.pais_id = p.%3$I
       AND t.pais_id_new IS NULL',
    p_table,
    v_target_col,
    v_join_col
  );

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = 'pais_id_uuid'
  )
  INTO v_has_old_alias;

  IF NOT v_has_old_alias THEN
    EXECUTE format('ALTER TABLE public.%I RENAME COLUMN pais_id TO pais_id_uuid', p_table);
  ELSE
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN pais_id', p_table);
  END IF;

  EXECUTE format('ALTER TABLE public.%I RENAME COLUMN pais_id_new TO pais_id', p_table);
END;
$$;

-- ----------------------------------------------------------------------------
-- Migrar public.paises.id de uuid -> bigint manteniendo id_uuid como trazabilidad
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_id_type text;
  v_tables text[] := ARRAY[
    'empresa_config',
    'usuario_configuracion',
    'configuracion_fiscal',
    'tipos_documentos_fiscales',
    'tipos_impuestos'
  ];
  v_table text;
BEGIN
  SELECT c.data_type
  INTO v_id_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'paises'
    AND c.column_name = 'id';

  IF v_id_type = 'uuid' THEN
    CREATE SEQUENCE IF NOT EXISTS public.paises_id_new_seq;

    ALTER TABLE public.paises
      ADD COLUMN IF NOT EXISTS id_new bigint;

    ALTER TABLE public.paises
      ALTER COLUMN id_new SET DEFAULT nextval('public.paises_id_new_seq');

    UPDATE public.paises
    SET id_new = nextval('public.paises_id_new_seq')
    WHERE id_new IS NULL;

    FOREACH v_table IN ARRAY v_tables
    LOOP
      PERFORM app.promote_pais_id_column(v_table);
    END LOOP;

    ALTER TABLE public.paises DROP CONSTRAINT IF EXISTS paises_pkey;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'paises'
        AND column_name = 'id_uuid'
    ) THEN
      ALTER TABLE public.paises RENAME COLUMN id TO id_uuid;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'paises'
        AND column_name = 'id_new'
    ) THEN
      ALTER TABLE public.paises RENAME COLUMN id_new TO id;
    END IF;

    ALTER TABLE public.paises
      ADD CONSTRAINT paises_pkey PRIMARY KEY (id);

    CREATE UNIQUE INDEX IF NOT EXISTS ux_paises_id_uuid
    ON public.paises (id_uuid);

    ALTER TABLE public.paises
      ALTER COLUMN id SET DEFAULT nextval('public.paises_id_new_seq');

    PERFORM setval(
      'public.paises_id_new_seq',
      GREATEST((SELECT COALESCE(MAX(id), 0) FROM public.paises), 1),
      true
    );
  END IF;
END;
$$;

-- Segunda pasada defensiva (si quedaron tablas con pais_id uuid por ejecuciones parciales)
DO $$
DECLARE
  v_tables text[] := ARRAY[
    'empresa_config',
    'usuario_configuracion',
    'configuracion_fiscal',
    'tipos_documentos_fiscales',
    'tipos_impuestos'
  ];
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    PERFORM app.promote_pais_id_column(v_table);
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- Catalogo base de paises (ids numericos estables usados por frontend/API)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.paises
  ADD COLUMN IF NOT EXISTS codigo_iso text,
  ADD COLUMN IF NOT EXISTS nombre_fiscal text,
  ADD COLUMN IF NOT EXISTS moneda_codigo text,
  ADD COLUMN IF NOT EXISTS moneda_simbolo text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

INSERT INTO public.paises (
  id,
  codigo_iso,
  nombre,
  nombre_fiscal,
  moneda_codigo,
  moneda_simbolo,
  activo,
  created_at,
  updated_at
)
VALUES
  (1, 'PE', 'Perú', 'SUNAT', 'PEN', 'S/', true, now(), now()),
  (2, 'CO', 'Colombia', 'DIAN', 'COP', '$', true, now(), now()),
  (3, 'CL', 'Chile', 'SII', 'CLP', '$', true, now(), now()),
  (4, 'MX', 'México', 'SAT', 'MXN', '$', true, now(), now())
ON CONFLICT (id) DO UPDATE
SET
  codigo_iso = EXCLUDED.codigo_iso,
  nombre = EXCLUDED.nombre,
  nombre_fiscal = EXCLUDED.nombre_fiscal,
  moneda_codigo = EXCLUDED.moneda_codigo,
  moneda_simbolo = EXCLUDED.moneda_simbolo,
  activo = EXCLUDED.activo,
  updated_at = now();

CREATE UNIQUE INDEX IF NOT EXISTS ux_paises_codigo_iso
ON public.paises (upper(codigo_iso));

SELECT app.add_index_if_possible('empresa_config', 'pais_id', 'idx_empresa_config_pais_id');
SELECT app.add_index_if_possible('usuario_configuracion', 'pais_id', 'idx_usuario_configuracion_pais_id');
SELECT app.add_index_if_possible('configuracion_fiscal', 'pais_id', 'idx_configuracion_fiscal_pais_id');
SELECT app.add_index_if_possible('tipos_documentos_fiscales', 'pais_id', 'idx_tipos_documentos_fiscales_pais_id');
SELECT app.add_index_if_possible('tipos_impuestos', 'pais_id', 'idx_tipos_impuestos_pais_id');

COMMIT;
