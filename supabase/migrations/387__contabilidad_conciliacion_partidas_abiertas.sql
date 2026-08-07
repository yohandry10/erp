-- ============================================================================
-- 387__contabilidad_conciliacion_partidas_abiertas.sql
-- El sistema tenia conciliacion BANCARIA (finanzas/conciliacion, por CSV contra
-- movimientos_bancarios) pero no conciliacion CONTABLE: casar entre si los
-- apuntes de la cuenta de un tercero para saber que factura sigue pendiente y
-- que cobro la cancelo. Es una capacidad distinta y estaba ausente por completo.
--
-- El modelo es el de partidas abiertas: cada linea de asiento sobre una cuenta
-- conciliable arrastra cuanto de su importe ya fue aplicado, y los grupos de
-- conciliacion registran contra que se aplico. Admite conciliacion parcial,
-- que es el caso normal: un cobro a cuenta no cancela la factura entera.
--
-- Objetos foco:
--   public.plan_cuentas.conciliable
--   public.detalle_asientos.monto_conciliado
--   public.conciliaciones_partidas
--   public.conciliaciones_partidas_lineas
--   app.sembrar_permisos_contabilidad_conciliacion(uuid)
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

-- ----------------------------------------------------------------------------
-- 1. Que cuentas se concilian.
--    No todas: conciliar una cuenta de gasto no significa nada. Las cuentas de
--    terceros del PCGE (12, 42, 16, 46) son las que llevan partidas abiertas.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.plan_cuentas
  ADD COLUMN IF NOT EXISTS conciliable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.plan_cuentas.conciliable IS
  'La cuenta lleva partidas abiertas que se casan entre si (cuentas de terceros).';

UPDATE public.plan_cuentas
SET conciliable = true
WHERE conciliable = false
  AND (
    codigo LIKE '12%'
    OR codigo LIKE '42%'
    OR codigo LIKE '16%'
    OR codigo LIKE '46%'
  );

CREATE INDEX IF NOT EXISTS idx_plan_cuentas_conciliables_387
ON public.plan_cuentas (tenant_id)
WHERE conciliable = true;

-- ----------------------------------------------------------------------------
-- 2. Cuanto de cada apunte ya esta aplicado.
--    Denormalizado a proposito: la consulta dominante es "que queda abierto en
--    esta cuenta", y reconstruirlo sumando el detalle de conciliaciones en cada
--    lectura seria caro y frecuente.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.detalle_asientos
  ADD COLUMN IF NOT EXISTS monto_conciliado numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.detalle_asientos.monto_conciliado IS
  'Importe del apunte ya casado contra otros. La partida esta cerrada cuando iguala a abs(debe - haber).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_detalle_asientos_conciliado_387'
  ) THEN
    ALTER TABLE public.detalle_asientos
      ADD CONSTRAINT ck_detalle_asientos_conciliado_387
      -- No se puede aplicar mas de lo que el apunte vale: seria dinero
      -- conciliado dos veces.
      CHECK (
        monto_conciliado >= 0
        AND monto_conciliado <= abs(COALESCE(debe, 0) - COALESCE(haber, 0)) + 0.005
      )
      NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_detalle_asientos_abiertos_387
ON public.detalle_asientos (tenant_id, cuenta_id)
WHERE monto_conciliado < abs(COALESCE(debe, 0) - COALESCE(haber, 0));

-- ----------------------------------------------------------------------------
-- 3. Grupos de conciliacion.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conciliaciones_partidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cuenta_id uuid,
  estado text NOT NULL DEFAULT 'PARCIAL',
  monto_conciliado numeric(14,2) NOT NULL DEFAULT 0,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  observaciones text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.conciliaciones_partidas.estado IS
  'TOTAL cuando el grupo se cancela entre si por completo; PARCIAL cuando queda saldo abierto.';

CREATE TABLE IF NOT EXISTS public.conciliaciones_partidas_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conciliacion_id uuid NOT NULL REFERENCES public.conciliaciones_partidas(id) ON DELETE CASCADE,
  detalle_asiento_id uuid NOT NULL,
  monto_aplicado numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

SELECT app.add_fk_if_possible(
  'conciliaciones_partidas',
  'cuenta_id',
  'plan_cuentas',
  'id',
  'conciliaciones_partidas_cuenta_id_fkey_387'
);

SELECT app.add_fk_if_possible(
  'conciliaciones_partidas_lineas',
  'detalle_asiento_id',
  'detalle_asientos',
  'id',
  'conciliaciones_partidas_lineas_detalle_id_fkey_387'
);

-- Un apunte no puede figurar dos veces en el mismo grupo: se aplicaria dos
-- veces el mismo importe sin que ningun total lo delatase.
CREATE UNIQUE INDEX IF NOT EXISTS ux_conciliacion_lineas_grupo_detalle_387
ON public.conciliaciones_partidas_lineas (conciliacion_id, detalle_asiento_id);

CREATE INDEX IF NOT EXISTS idx_conciliacion_lineas_detalle_387
ON public.conciliaciones_partidas_lineas (tenant_id, detalle_asiento_id);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_partidas_cuenta_387
ON public.conciliaciones_partidas (tenant_id, cuenta_id, fecha DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_conciliaciones_partidas_estado_387'
  ) THEN
    ALTER TABLE public.conciliaciones_partidas
      ADD CONSTRAINT ck_conciliaciones_partidas_estado_387
      CHECK (upper(estado) IN ('PARCIAL','TOTAL'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_conciliacion_lineas_monto_387'
  ) THEN
    ALTER TABLE public.conciliaciones_partidas_lineas
      ADD CONSTRAINT ck_conciliacion_lineas_monto_387
      CHECK (monto_aplicado > 0);
  END IF;
END;
$$;

-- Consistencia de tenant entre el grupo y sus lineas.
CREATE OR REPLACE FUNCTION app.enforce_conciliacion_lineas_tenant_387()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_grupo uuid;
BEGIN
  SELECT c.tenant_id INTO v_tenant_grupo
  FROM public.conciliaciones_partidas c
  WHERE c.id = NEW.conciliacion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      MESSAGE = format('Conciliacion no existe: %s', NEW.conciliacion_id),
      ERRCODE = '23503';
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant_grupo);

  IF NEW.tenant_id IS DISTINCT FROM v_tenant_grupo THEN
    RAISE EXCEPTION USING
      MESSAGE = 'tenant_id no coincide con la conciliacion en conciliaciones_partidas_lineas',
      ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_conciliacion_lineas_tenant_387 ON public.conciliaciones_partidas_lineas;
CREATE TRIGGER trg_enforce_conciliacion_lineas_tenant_387
BEFORE INSERT OR UPDATE OF tenant_id, conciliacion_id
ON public.conciliaciones_partidas_lineas
FOR EACH ROW
EXECUTE FUNCTION app.enforce_conciliacion_lineas_tenant_387();

-- ----------------------------------------------------------------------------
-- 4. RLS.
-- ----------------------------------------------------------------------------
ALTER TABLE public.conciliaciones_partidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conciliaciones_partidas_lineas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conciliaciones_partidas_tenant_isolation ON public.conciliaciones_partidas;
DROP POLICY IF EXISTS conciliaciones_partidas_insert ON public.conciliaciones_partidas;
DROP POLICY IF EXISTS conciliaciones_partidas_update ON public.conciliaciones_partidas;
DROP POLICY IF EXISTS conciliaciones_partidas_delete ON public.conciliaciones_partidas;

CREATE POLICY conciliaciones_partidas_tenant_isolation ON public.conciliaciones_partidas
FOR SELECT
USING (
  app.is_superadmin()
  OR (app.current_tenant_id() IS NOT NULL AND tenant_id = app.current_tenant_id())
);

CREATE POLICY conciliaciones_partidas_insert ON public.conciliaciones_partidas
FOR INSERT
WITH CHECK (
  app.is_superadmin()
  OR (app.current_tenant_id() IS NOT NULL AND tenant_id = app.current_tenant_id())
);

CREATE POLICY conciliaciones_partidas_update ON public.conciliaciones_partidas
FOR UPDATE
USING (
  app.is_superadmin()
  OR (app.current_tenant_id() IS NOT NULL AND tenant_id = app.current_tenant_id())
)
WITH CHECK (
  app.is_superadmin()
  OR (app.current_tenant_id() IS NOT NULL AND tenant_id = app.current_tenant_id())
);

CREATE POLICY conciliaciones_partidas_delete ON public.conciliaciones_partidas
FOR DELETE
USING (
  app.is_superadmin()
  OR (app.current_tenant_id() IS NOT NULL AND tenant_id = app.current_tenant_id())
);

DROP POLICY IF EXISTS conciliacion_lineas_tenant_isolation ON public.conciliaciones_partidas_lineas;
DROP POLICY IF EXISTS conciliacion_lineas_insert ON public.conciliaciones_partidas_lineas;
DROP POLICY IF EXISTS conciliacion_lineas_update ON public.conciliaciones_partidas_lineas;
DROP POLICY IF EXISTS conciliacion_lineas_delete ON public.conciliaciones_partidas_lineas;

CREATE POLICY conciliacion_lineas_tenant_isolation ON public.conciliaciones_partidas_lineas
FOR SELECT
USING (
  app.is_superadmin()
  OR (app.current_tenant_id() IS NOT NULL AND tenant_id = app.current_tenant_id())
);

CREATE POLICY conciliacion_lineas_insert ON public.conciliaciones_partidas_lineas
FOR INSERT
WITH CHECK (
  app.is_superadmin()
  OR (app.current_tenant_id() IS NOT NULL AND tenant_id = app.current_tenant_id())
);

CREATE POLICY conciliacion_lineas_update ON public.conciliaciones_partidas_lineas
FOR UPDATE
USING (
  app.is_superadmin()
  OR (app.current_tenant_id() IS NOT NULL AND tenant_id = app.current_tenant_id())
)
WITH CHECK (
  app.is_superadmin()
  OR (app.current_tenant_id() IS NOT NULL AND tenant_id = app.current_tenant_id())
);

CREATE POLICY conciliacion_lineas_delete ON public.conciliaciones_partidas_lineas
FOR DELETE
USING (
  app.is_superadmin()
  OR (app.current_tenant_id() IS NOT NULL AND tenant_id = app.current_tenant_id())
);

-- ----------------------------------------------------------------------------
-- 5. Permisos RBAC.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sembrar_permisos_contabilidad_conciliacion(p_tenant_id uuid)
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
    ('contabilidad.partidas.read'),
    ('contabilidad.partidas.conciliar'),
    ('contabilidad.partidas.desconciliar')
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
        upper(r.nombre) IN ('ADMIN', 'CONTADOR', 'FINANZAS')
        AND lower(p.codigo) LIKE 'contabilidad.partidas.%'
      )
      OR (
        upper(r.nombre) IN ('GERENCIA', 'AUDITOR')
        AND lower(p.codigo) = 'contabilidad.partidas.read'
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

GRANT EXECUTE ON FUNCTION app.sembrar_permisos_contabilidad_conciliacion(uuid) TO service_role;

DO $$
DECLARE
  v_tenant record;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP
    PERFORM app.sembrar_permisos_contabilidad_conciliacion(v_tenant.id);
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
    + COALESCE(app.sembrar_permisos_contabilidad_conciliacion(p_tenant_id), 0);

  permisos_seeded := COALESCE(v_base.permisos_seeded, 0) + v_extra;
  roles_seeded := COALESCE(v_base.roles_seeded, 0);
  role_permissions_seeded := COALESCE(v_base.role_permissions_seeded, 0);

  RETURN NEXT;
END;
$wrap$;

GRANT EXECUTE ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) TO service_role;

COMMIT;
