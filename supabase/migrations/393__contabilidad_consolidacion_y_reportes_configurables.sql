-- ============================================================================
-- 393__contabilidad_consolidacion_y_reportes_configurables.sql
-- Fase 7: consolidacion multiempresa y reportes contables configurables.
--
-- Principios:
--   * una empresa invitada debe aceptar antes de compartir sus saldos;
--   * el consolidado es una capa de reporte: nunca modifica libros legales;
--   * toda moneda distinta exige una tasa explicita y tipificada;
--   * las formulas son datos estructurados, nunca SQL introducido por usuarios.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

CREATE TABLE IF NOT EXISTS public.grupos_consolidacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL,
  moneda_presentacion text NOT NULL DEFAULT 'PEN',
  activo boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_grupos_consolidacion_moneda_393 CHECK (moneda_presentacion ~ '^[A-Z]{3}$'),
  CONSTRAINT ux_grupos_consolidacion_codigo_393 UNIQUE (tenant_id, codigo)
);

CREATE TABLE IF NOT EXISTS public.grupos_consolidacion_miembros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.grupos_consolidacion(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'PENDIENTE',
  es_controladora boolean NOT NULL DEFAULT false,
  participacion numeric(7,4) NOT NULL DEFAULT 100,
  invitado_por text,
  aceptado_por text,
  aceptado_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_grupos_consolidacion_miembro_393 UNIQUE (grupo_id, tenant_id),
  CONSTRAINT ck_grupos_consolidacion_miembro_estado_393
    CHECK (estado IN ('PENDIENTE', 'ACTIVO', 'RECHAZADO')),
  CONSTRAINT ck_grupos_consolidacion_participacion_393
    CHECK (participacion > 0 AND participacion <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_grupo_controladora_393
ON public.grupos_consolidacion_miembros (grupo_id)
WHERE es_controladora = true;

CREATE TABLE IF NOT EXISTS public.tipos_cambio_consolidacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.grupos_consolidacion(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  miembro_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  tipo text NOT NULL,
  moneda_origen text NOT NULL,
  moneda_destino text NOT NULL,
  factor_conversion numeric(20,10) NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_tipos_cambio_consolidacion_393 UNIQUE (grupo_id, miembro_tenant_id, fecha, tipo),
  CONSTRAINT ck_tipos_cambio_consolidacion_tipo_393
    CHECK (tipo IN ('CIERRE', 'PROMEDIO', 'HISTORICA')),
  CONSTRAINT ck_tipos_cambio_consolidacion_monedas_393
    CHECK (moneda_origen ~ '^[A-Z]{3}$' AND moneda_destino ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_tipos_cambio_consolidacion_factor_393 CHECK (factor_conversion > 0)
);

CREATE TABLE IF NOT EXISTS public.ajustes_consolidacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.grupos_consolidacion(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  tipo text NOT NULL,
  cuenta_codigo text NOT NULL,
  descripcion text NOT NULL,
  debe numeric(18,2) NOT NULL DEFAULT 0,
  haber numeric(18,2) NOT NULL DEFAULT 0,
  referencia text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_ajustes_consolidacion_tipo_393
    CHECK (tipo IN ('ELIMINACION', 'RECLASIFICACION')),
  CONSTRAINT ck_ajustes_consolidacion_montos_393
    CHECK (debe >= 0 AND haber >= 0 AND ((debe > 0 AND haber = 0) OR (haber > 0 AND debe = 0)))
);

CREATE INDEX IF NOT EXISTS idx_ajustes_consolidacion_grupo_fecha_393
ON public.ajustes_consolidacion (grupo_id, fecha);

CREATE TABLE IF NOT EXISTS public.reportes_contables_configurables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_reportes_contables_configurables_codigo_393 UNIQUE (tenant_id, codigo)
);

CREATE TABLE IF NOT EXISTS public.reportes_contables_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reporte_id uuid NOT NULL REFERENCES public.reportes_contables_configurables(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL,
  orden integer NOT NULL,
  tipo text NOT NULL,
  patrones_cuenta text[] NOT NULL DEFAULT ARRAY[]::text[],
  naturaleza text NOT NULL DEFAULT 'SALDO',
  alcance_fecha text NOT NULL DEFAULT 'PERIODO',
  tipo_tasa text NOT NULL DEFAULT 'CIERRE',
  signo numeric(10,4) NOT NULL DEFAULT 1,
  formula jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_reportes_contables_lineas_codigo_393 UNIQUE (reporte_id, codigo),
  CONSTRAINT ux_reportes_contables_lineas_orden_393 UNIQUE (reporte_id, orden),
  CONSTRAINT ck_reportes_contables_lineas_tipo_393 CHECK (tipo IN ('CUENTAS', 'FORMULA')),
  CONSTRAINT ck_reportes_contables_lineas_naturaleza_393 CHECK (naturaleza IN ('SALDO', 'DEBE', 'HABER')),
  CONSTRAINT ck_reportes_contables_lineas_alcance_393 CHECK (alcance_fecha IN ('PERIODO', 'HASTA_FECHA')),
  CONSTRAINT ck_reportes_contables_lineas_tasa_393 CHECK (tipo_tasa IN ('CIERRE', 'PROMEDIO', 'HISTORICA')),
  CONSTRAINT ck_reportes_contables_lineas_config_393 CHECK (
    (tipo = 'CUENTAS' AND cardinality(patrones_cuenta) > 0 AND formula = '[]'::jsonb)
    OR
    (tipo = 'FORMULA' AND cardinality(patrones_cuenta) = 0 AND jsonb_typeof(formula) = 'array')
  )
);

-- Crea cabecera y membresia controladora como una unica unidad.
CREATE OR REPLACE FUNCTION public.crear_grupo_consolidacion_tx(
  p_tenant_id uuid,
  p_codigo text,
  p_nombre text,
  p_moneda_presentacion text,
  p_created_by text
)
RETURNS SETOF public.grupos_consolidacion
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_grupo public.grupos_consolidacion%ROWTYPE;
BEGIN
  INSERT INTO public.grupos_consolidacion (
    tenant_id, codigo, nombre, moneda_presentacion, created_by
  ) VALUES (
    p_tenant_id,
    upper(btrim(p_codigo)),
    btrim(p_nombre),
    upper(btrim(p_moneda_presentacion)),
    p_created_by
  ) RETURNING * INTO v_grupo;

  INSERT INTO public.grupos_consolidacion_miembros (
    grupo_id, tenant_id, estado, es_controladora, participacion,
    invitado_por, aceptado_por, aceptado_en
  ) VALUES (
    v_grupo.id, p_tenant_id, 'ACTIVO', true, 100,
    p_created_by, p_created_by, now()
  );

  RETURN NEXT v_grupo;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.invitar_miembro_consolidacion_tx(
  p_tenant_id uuid,
  p_grupo_id uuid,
  p_miembro_tenant_id uuid,
  p_participacion numeric,
  p_invitado_por text
)
RETURNS SETOF public.grupos_consolidacion_miembros
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.grupos_consolidacion g
    WHERE g.id = p_grupo_id AND g.tenant_id = p_tenant_id AND g.activo
  ) THEN
    RAISE EXCEPTION 'Grupo no existe o no pertenece a la empresa controladora' USING ERRCODE = '42501';
  END IF;

  IF p_miembro_tenant_id = p_tenant_id THEN
    RAISE EXCEPTION 'La empresa controladora ya pertenece al grupo' USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  INSERT INTO public.grupos_consolidacion_miembros (
    grupo_id, tenant_id, estado, participacion, invitado_por
  ) VALUES (
    p_grupo_id, p_miembro_tenant_id, 'PENDIENTE', p_participacion, p_invitado_por
  )
  ON CONFLICT (grupo_id, tenant_id) DO UPDATE SET
    estado = CASE
      WHEN grupos_consolidacion_miembros.estado = 'ACTIVO' THEN 'ACTIVO'
      ELSE 'PENDIENTE'
    END,
    participacion = EXCLUDED.participacion,
    invitado_por = EXCLUDED.invitado_por,
    updated_at = now()
  RETURNING *;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.responder_invitacion_consolidacion_tx(
  p_tenant_id uuid,
  p_grupo_id uuid,
  p_aceptar boolean,
  p_user_id text
)
RETURNS SETOF public.grupos_consolidacion_miembros
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  RETURN QUERY
  UPDATE public.grupos_consolidacion_miembros m SET
    estado = CASE WHEN p_aceptar THEN 'ACTIVO' ELSE 'RECHAZADO' END,
    aceptado_por = CASE WHEN p_aceptar THEN p_user_id ELSE NULL END,
    aceptado_en = CASE WHEN p_aceptar THEN now() ELSE NULL END,
    updated_at = now()
  WHERE m.grupo_id = p_grupo_id
    AND m.tenant_id = p_tenant_id
    AND m.estado = 'PENDIENTE'
  RETURNING *;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe una invitacion pendiente para esta empresa' USING ERRCODE = 'P0002';
  END IF;
END;
$fn$;

-- Reemplazo atomico de la definicion completa. Una cabecera nunca queda con
-- media formula por un error o una segunda peticion concurrente.
CREATE OR REPLACE FUNCTION public.guardar_reporte_configurable_tx(
  p_tenant_id uuid,
  p_reporte_id uuid,
  p_codigo text,
  p_nombre text,
  p_descripcion text,
  p_lineas jsonb,
  p_created_by text
)
RETURNS SETOF public.reportes_contables_configurables
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_reporte public.reportes_contables_configurables%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'El reporte necesita al menos una linea' USING ERRCODE = '23514';
  END IF;

  IF p_reporte_id IS NULL THEN
    INSERT INTO public.reportes_contables_configurables (
      tenant_id, codigo, nombre, descripcion, created_by
    ) VALUES (
      p_tenant_id, upper(btrim(p_codigo)), btrim(p_nombre), nullif(btrim(p_descripcion), ''), p_created_by
    ) RETURNING * INTO v_reporte;
  ELSE
    UPDATE public.reportes_contables_configurables r SET
      codigo = upper(btrim(p_codigo)),
      nombre = btrim(p_nombre),
      descripcion = nullif(btrim(p_descripcion), ''),
      updated_at = now()
    WHERE r.id = p_reporte_id AND r.tenant_id = p_tenant_id
    RETURNING * INTO v_reporte;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Reporte no existe o no pertenece a la empresa' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.reportes_contables_lineas l
    WHERE l.reporte_id = v_reporte.id AND l.tenant_id = p_tenant_id;
  END IF;

  INSERT INTO public.reportes_contables_lineas (
    tenant_id, reporte_id, codigo, nombre, orden, tipo, patrones_cuenta,
    naturaleza, alcance_fecha, tipo_tasa, signo, formula
  )
  SELECT
    p_tenant_id,
    v_reporte.id,
    upper(btrim(x.codigo)),
    btrim(x.nombre),
    x.orden,
    upper(x.tipo),
    COALESCE(x.patrones_cuenta, ARRAY[]::text[]),
    upper(COALESCE(x.naturaleza, 'SALDO')),
    upper(COALESCE(x.alcance_fecha, 'PERIODO')),
    upper(COALESCE(x.tipo_tasa, 'CIERRE')),
    COALESCE(x.signo, 1),
    COALESCE(x.formula, '[]'::jsonb)
  FROM jsonb_to_recordset(p_lineas) AS x(
    codigo text,
    nombre text,
    orden integer,
    tipo text,
    patrones_cuenta text[],
    naturaleza text,
    alcance_fecha text,
    tipo_tasa text,
    signo numeric,
    formula jsonb
  );

  RETURN NEXT v_reporte;
END;
$fn$;

REVOKE ALL ON FUNCTION public.crear_grupo_consolidacion_tx(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invitar_miembro_consolidacion_tx(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.responder_invitacion_consolidacion_tx(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardar_reporte_configurable_tx(uuid, uuid, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_grupo_consolidacion_tx(uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.invitar_miembro_consolidacion_tx(uuid, uuid, uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.responder_invitacion_consolidacion_tx(uuid, uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.guardar_reporte_configurable_tx(uuid, uuid, text, text, text, jsonb, text) TO service_role;

-- RLS: la controladora ve el grupo; cada invitada solo ve su membresia. Los
-- datos contables de una invitada siguen aislados y solo el backend, despues
-- de comprobar estado ACTIVO, arma el consolidado.
ALTER TABLE public.grupos_consolidacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos_consolidacion_miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_cambio_consolidacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajustes_consolidacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes_contables_configurables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes_contables_lineas ENABLE ROW LEVEL SECURITY;

-- Los helpers SECURITY DEFINER evitan la recursion grupo -> membresia -> grupo
-- dentro de las propias politicas. No exponen filas, solo un booleano.
CREATE OR REPLACE FUNCTION app.puede_leer_grupo_consolidacion_393(p_grupo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $fn$
  SELECT app.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.grupos_consolidacion g
      WHERE g.id = p_grupo_id AND g.tenant_id = app.current_tenant_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.grupos_consolidacion_miembros m
      WHERE m.grupo_id = p_grupo_id AND m.tenant_id = app.current_tenant_id()
    );
$fn$;

REVOKE ALL ON FUNCTION app.puede_leer_grupo_consolidacion_393(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.puede_leer_grupo_consolidacion_393(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS grupos_consolidacion_select_393 ON public.grupos_consolidacion;
CREATE POLICY grupos_consolidacion_select_393 ON public.grupos_consolidacion FOR SELECT USING (
  app.puede_leer_grupo_consolidacion_393(id)
);
DROP POLICY IF EXISTS grupos_consolidacion_write_393 ON public.grupos_consolidacion;
CREATE POLICY grupos_consolidacion_write_393 ON public.grupos_consolidacion FOR ALL
USING (app.is_superadmin() OR tenant_id = app.current_tenant_id())
WITH CHECK (app.is_superadmin() OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS grupos_consolidacion_miembros_select_393 ON public.grupos_consolidacion_miembros;
CREATE POLICY grupos_consolidacion_miembros_select_393 ON public.grupos_consolidacion_miembros FOR SELECT USING (
  app.puede_leer_grupo_consolidacion_393(grupo_id)
);

DO $$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY[
    'tipos_cambio_consolidacion',
    'ajustes_consolidacion',
    'reportes_contables_configurables',
    'reportes_contables_lineas'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tabla || '_tenant_393', v_tabla);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (
         app.is_superadmin() OR tenant_id = app.current_tenant_id()
       ) WITH CHECK (
         app.is_superadmin() OR tenant_id = app.current_tenant_id()
       )',
      v_tabla || '_tenant_393', v_tabla
    );
  END LOOP;
END;
$$;

COMMIT;
