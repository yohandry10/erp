-- ============================================================================
-- 388__contabilidad_distribucion_analitica_y_diferidos.sql
-- Dos brechas que comparten migracion por afinidad, no por dependencia.
--
-- 1. Distribucion analitica. detalle_asientos tenia un unico centro_costo_id:
--    una linea, un centro. Repartir un alquiler entre tres sucursales obligaba
--    a partir el asiento a mano. Aqui una linea admite N imputaciones por
--    porcentaje, y los centros de costo se agrupan en ejes para que un mismo
--    apunte pueda repartirse por centro Y por proyecto a la vez.
--
-- 2. Ingresos y gastos diferidos. No existia nada. Un seguro anual pagado por
--    adelantado se llevaba entero a gasto del mes o se devengaba a mano.
--
-- Objetos foco:
--   public.centros_costo.eje
--   public.distribucion_analitica
--   public.diferidos / public.diferidos_devengos
--   app.sembrar_permisos_contabilidad_analitica(uuid)
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

-- ----------------------------------------------------------------------------
-- 1. Ejes analiticos.
--    En lugar de una entidad nueva de "planes analiticos", los centros de costo
--    existentes se etiquetan con el eje al que pertenecen. Un reparto valido
--    suma 100% dentro de cada eje, y ejes distintos son independientes entre si.
--    Eso da multi-eje sin duplicar el catalogo ni migrar los centros actuales.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.centros_costo
  ADD COLUMN IF NOT EXISTS eje text NOT NULL DEFAULT 'CENTRO_COSTO';

COMMENT ON COLUMN public.centros_costo.eje IS
  'Eje analitico al que pertenece: CENTRO_COSTO, PROYECTO, SUCURSAL, etc. El reparto suma 100% por eje.';

CREATE INDEX IF NOT EXISTS idx_centros_costo_eje_388
ON public.centros_costo (tenant_id, eje);

-- ----------------------------------------------------------------------------
-- 2. Distribucion analitica de una linea de asiento.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.distribucion_analitica (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  detalle_asiento_id uuid NOT NULL,
  centro_costo_id uuid NOT NULL,
  eje text NOT NULL DEFAULT 'CENTRO_COSTO',
  porcentaje numeric(9,4) NOT NULL,
  monto numeric(14,2) NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

SELECT app.add_fk_if_possible(
  'distribucion_analitica',
  'detalle_asiento_id',
  'detalle_asientos',
  'id',
  'distribucion_analitica_detalle_id_fkey_388'
);

SELECT app.add_fk_if_possible(
  'distribucion_analitica',
  'centro_costo_id',
  'centros_costo',
  'id',
  'distribucion_analitica_centro_id_fkey_388'
);

-- Un centro no puede figurar dos veces en la misma linea y eje: sumaria dos
-- veces el mismo porcentaje sin que ningun total lo delate.
CREATE UNIQUE INDEX IF NOT EXISTS ux_distribucion_analitica_linea_eje_centro_388
ON public.distribucion_analitica (detalle_asiento_id, eje, centro_costo_id);

CREATE INDEX IF NOT EXISTS idx_distribucion_analitica_centro_388
ON public.distribucion_analitica (tenant_id, centro_costo_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_distribucion_analitica_porcentaje_388'
  ) THEN
    ALTER TABLE public.distribucion_analitica
      ADD CONSTRAINT ck_distribucion_analitica_porcentaje_388
      CHECK (porcentaje > 0 AND porcentaje <= 100);
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Diferidos.
--    monto_devengado esta denormalizado por la misma razon que la depreciacion
--    acumulada del activo: el pendiente se consulta constantemente.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.diferidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  codigo text,
  nombre text NOT NULL,
  descripcion text,
  tipo text NOT NULL,
  cuenta_diferido_id uuid,
  cuenta_resultado_id uuid,
  monto_total numeric(14,2) NOT NULL,
  monto_devengado numeric(14,2) NOT NULL DEFAULT 0,
  periodos integer NOT NULL,
  fecha_inicio date NOT NULL,
  centro_costo_id uuid,
  estado text NOT NULL DEFAULT 'VIGENTE',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.diferidos.tipo IS
  'GASTO devenga contra una cuenta de gasto; INGRESO contra una de ingreso.';
COMMENT ON COLUMN public.diferidos.cuenta_diferido_id IS
  'Cuenta de balance donde espera el importe pendiente de devengar.';
COMMENT ON COLUMN public.diferidos.cuenta_resultado_id IS
  'Cuenta de resultados a la que se lleva cada cuota devengada.';

CREATE TABLE IF NOT EXISTS public.diferidos_devengos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  diferido_id uuid NOT NULL REFERENCES public.diferidos(id) ON DELETE CASCADE,
  periodo text NOT NULL,
  fecha date NOT NULL,
  monto numeric(14,2) NOT NULL,
  monto_acumulado numeric(14,2) NOT NULL,
  asiento_id uuid,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

SELECT app.add_fk_if_possible(
  'diferidos',
  'cuenta_diferido_id',
  'plan_cuentas',
  'id',
  'diferidos_cuenta_diferido_id_fkey_388'
);

SELECT app.add_fk_if_possible(
  'diferidos',
  'cuenta_resultado_id',
  'plan_cuentas',
  'id',
  'diferidos_cuenta_resultado_id_fkey_388'
);

SELECT app.add_fk_if_possible(
  'diferidos_devengos',
  'asiento_id',
  'asientos_contables',
  'id',
  'diferidos_devengos_asiento_id_fkey_388'
);

-- Un diferido devenga una sola vez por periodo.
CREATE UNIQUE INDEX IF NOT EXISTS ux_diferidos_devengos_periodo_388
ON public.diferidos_devengos (tenant_id, diferido_id, periodo);

CREATE INDEX IF NOT EXISTS idx_diferidos_vigentes_388
ON public.diferidos (tenant_id, estado)
WHERE upper(estado) = 'VIGENTE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_diferidos_tipo_388'
  ) THEN
    ALTER TABLE public.diferidos
      ADD CONSTRAINT ck_diferidos_tipo_388
      CHECK (upper(tipo) IN ('GASTO','INGRESO'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_diferidos_estado_388'
  ) THEN
    ALTER TABLE public.diferidos
      ADD CONSTRAINT ck_diferidos_estado_388
      CHECK (upper(estado) IN ('VIGENTE','DEVENGADO','CANCELADO'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_diferidos_montos_388'
  ) THEN
    ALTER TABLE public.diferidos
      ADD CONSTRAINT ck_diferidos_montos_388
      -- Devengar mas de lo diferido convertiria el saldo pendiente en negativo.
      CHECK (
        monto_total > 0
        AND periodos > 0
        AND monto_devengado >= 0
        AND monto_devengado <= monto_total + 0.005
      );
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. RLS.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['distribucion_analitica', 'diferidos', 'diferidos_devengos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tabla);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tabla || '_tenant_isolation', v_tabla);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tabla || '_insert', v_tabla);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tabla || '_update', v_tabla);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tabla || '_delete', v_tabla);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (
         app.is_superadmin()
         OR (app.current_tenant_id() IS NOT NULL AND tenant_id = app.current_tenant_id())
       )',
      v_tabla || '_tenant_isolation', v_tabla
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (
         app.is_superadmin()
         OR (app.current_tenant_id() IS NOT NULL AND tenant_id = app.current_tenant_id())
       )',
      v_tabla || '_insert', v_tabla
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (
         app.is_superadmin()
         OR (app.current_tenant_id() IS NOT NULL AND tenant_id = app.current_tenant_id())
       ) WITH CHECK (
         app.is_superadmin()
         OR (app.current_tenant_id() IS NOT NULL AND tenant_id = app.current_tenant_id())
       )',
      v_tabla || '_update', v_tabla
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (
         app.is_superadmin()
         OR (app.current_tenant_id() IS NOT NULL AND tenant_id = app.current_tenant_id())
       )',
      v_tabla || '_delete', v_tabla
    );
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Permisos RBAC.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sembrar_permisos_contabilidad_analitica(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $fn$
DECLARE
  v_seeded integer := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH permission_defs(raw) AS (
    VALUES
    ('contabilidad.distribucion.read'),
    ('contabilidad.distribucion.asignar'),
    ('contabilidad.diferidos.read'),
    ('contabilidad.diferidos.crear'),
    ('contabilidad.diferidos.devengar'),
    ('contabilidad.diferidos.cancelar')
  ),
  parsed_permissions AS (
    SELECT
      lower(raw) AS codigo,
      parts[1] AS modulo,
      parts[2] AS recurso,
      parts[3] AS accion,
      'Permiso ' || raw AS descripcion
    FROM (
      SELECT raw, string_to_array(raw, '.') AS parts
      FROM permission_defs
    ) parsed
  )
  INSERT INTO public.permisos (
    tenant_id, modulo, recurso, accion, codigo, descripcion, activo
  )
  SELECT p_tenant_id, p.modulo, p.recurso, p.accion, p.codigo, p.descripcion, true
  FROM parsed_permissions p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permisos existing
    WHERE existing.tenant_id = p_tenant_id
      AND lower(existing.codigo) = p.codigo
  );
  GET DIAGNOSTICS v_seeded = ROW_COUNT;

  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true
  FROM public.roles r
  JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id
    AND COALESCE(r.activo, true) = true
    AND COALESCE(p.activo, true) = true
    AND (
      (
        upper(r.nombre) IN ('ADMIN', 'CONTADOR')
        AND (
          lower(p.codigo) LIKE 'contabilidad.distribucion.%'
          OR lower(p.codigo) LIKE 'contabilidad.diferidos.%'
        )
      )
      OR (
        upper(r.nombre) IN ('FINANZAS', 'GERENCIA', 'AUDITOR')
        AND lower(p.codigo) IN (
          'contabilidad.distribucion.read',
          'contabilidad.diferidos.read'
        )
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.rol_permisos existing
      WHERE existing.role_id = r.id
        AND existing.permiso_id = p.id
    );

  RETURN v_seeded;
END;
$fn$;

GRANT EXECUTE ON FUNCTION app.sembrar_permisos_contabilidad_analitica(uuid) TO service_role;

DO $$
DECLARE
  v_tenant record;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP
    PERFORM app.sembrar_permisos_contabilidad_analitica(v_tenant.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app.seed_operational_rbac_for_tenant(
  p_tenant_id uuid,
  p_source_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  permisos_seeded integer,
  roles_seeded integer,
  role_permissions_seeded integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $wrap$
DECLARE
  v_base record;
  v_extra integer := 0;
BEGIN
  SELECT * INTO v_base
  FROM app.seed_operational_rbac_for_tenant_base_383(p_tenant_id, p_source_tenant_id);

  v_extra := COALESCE(app.sembrar_permisos_asientos_ciclo_vida(p_tenant_id), 0)
    + COALESCE(app.sembrar_permisos_contabilidad_multimoneda(p_tenant_id), 0)
    + COALESCE(app.sembrar_permisos_contabilidad_plantillas(p_tenant_id), 0)
    + COALESCE(app.sembrar_permisos_contabilidad_activos(p_tenant_id), 0)
    + COALESCE(app.sembrar_permisos_contabilidad_conciliacion(p_tenant_id), 0)
    + COALESCE(app.sembrar_permisos_contabilidad_analitica(p_tenant_id), 0);

  permisos_seeded := COALESCE(v_base.permisos_seeded, 0) + v_extra;
  roles_seeded := COALESCE(v_base.roles_seeded, 0);
  role_permissions_seeded := COALESCE(v_base.role_permissions_seeded, 0);

  RETURN NEXT;
END;
$wrap$;

GRANT EXECUTE ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) TO service_role;

COMMIT;
