-- ============================================================================
-- 386__contabilidad_activos_fijos.sql
-- activos_fijos era un cascaron con cuatro columnas de negocio (descripcion,
-- fecha_adquisicion, valor_adquisicion, centro_costo_id) y ningun servicio la
-- leia. Faltaba todo lo que convierte un gasto en un activo: vida util, valor
-- residual, metodo, cuentas contables y estado.
--
-- La cadena de depreciacion ya existia a medias: el scheduler reenvia filas de
-- `depreciaciones` al outbox y el generador de asientos las convierte en
-- Dr 68 / Cr 39. Lo que faltaba era la cabeza: nadie creaba esas filas. Esta
-- migracion aporta el modelo de datos para que exista quien las cree.
--
-- Objetos foco:
--   public.activos_fijos (vida util, cuentas, situacion, depreciacion acumulada)
--   public.depreciaciones (monto, valor neto, unicidad por activo y periodo)
--   app.sembrar_permisos_contabilidad_activos(uuid)
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

-- ----------------------------------------------------------------------------
-- 1. El activo.
--    `estado` ya lo usa el skeleton como ACTIVO/INACTIVO del registro, asi que
--    el ciclo de vida contable del bien vive en `situacion` para no pisarlo.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.activos_fijos
  ADD COLUMN IF NOT EXISTS valor_residual numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vida_util_meses integer,
  ADD COLUMN IF NOT EXISTS metodo_depreciacion text NOT NULL DEFAULT 'LINEAL',
  ADD COLUMN IF NOT EXISTS fecha_inicio_depreciacion date,
  ADD COLUMN IF NOT EXISTS depreciacion_acumulada numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS situacion text NOT NULL DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS fecha_baja date,
  ADD COLUMN IF NOT EXISTS motivo_baja text,
  ADD COLUMN IF NOT EXISTS valor_venta numeric(14,2),
  ADD COLUMN IF NOT EXISTS asiento_baja_id uuid,
  ADD COLUMN IF NOT EXISTS created_by text;

COMMENT ON COLUMN public.activos_fijos.situacion IS
  'Ciclo de vida contable del bien: ACTIVO, DEPRECIADO, BAJA, VENDIDO.';
COMMENT ON COLUMN public.activos_fijos.depreciacion_acumulada IS
  'Suma de las depreciaciones registradas. Denormalizado a proposito: el saldo del activo se consulta constantemente.';

SELECT app.add_fk_if_possible(
  'activos_fijos',
  'asiento_baja_id',
  'asientos_contables',
  'id',
  'activos_fijos_asiento_baja_id_fkey_386'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_activos_fijos_situacion_386'
  ) THEN
    ALTER TABLE public.activos_fijos
      ADD CONSTRAINT ck_activos_fijos_situacion_386
      CHECK (upper(situacion) IN ('ACTIVO','DEPRECIADO','BAJA','VENDIDO'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_activos_fijos_valores_386'
  ) THEN
    ALTER TABLE public.activos_fijos
      ADD CONSTRAINT ck_activos_fijos_valores_386
      CHECK (
        valor_residual >= 0
        AND depreciacion_acumulada >= 0
        AND (vida_util_meses IS NULL OR vida_util_meses > 0)
        -- El valor residual no puede superar al de adquisicion: la base
        -- depreciable seria negativa y el activo se apreciaria solo.
        AND (valor_adquisicion IS NULL OR valor_residual <= valor_adquisicion)
      )
      NOT VALID;
  END IF;
END;
$$;

-- Consulta dominante: los activos que todavia deprecian en un tenant.
CREATE INDEX IF NOT EXISTS idx_activos_fijos_depreciables_386
ON public.activos_fijos (tenant_id, situacion)
WHERE upper(situacion) = 'ACTIVO';

-- ----------------------------------------------------------------------------
-- 2. La cuota de depreciacion.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.depreciaciones
  ADD COLUMN IF NOT EXISTS monto_depreciacion numeric(14,2),
  ADD COLUMN IF NOT EXISTS depreciacion_acumulada numeric(14,2),
  ADD COLUMN IF NOT EXISTS valor_neto numeric(14,2),
  ADD COLUMN IF NOT EXISTS centro_costo_id uuid,
  ADD COLUMN IF NOT EXISTS created_by text;

SELECT app.add_fk_if_possible(
  'depreciaciones',
  'activo_id',
  'activos_fijos',
  'id',
  'depreciaciones_activo_id_fkey_386'
);

-- Un activo deprecia una sola vez por periodo. Es la barrera contra que una
-- segunda ejecucion del cierre duplique la cuota del mes.
CREATE UNIQUE INDEX IF NOT EXISTS ux_depreciaciones_activo_periodo_386
ON public.depreciaciones (tenant_id, activo_id, periodo)
WHERE activo_id IS NOT NULL AND periodo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_depreciaciones_tenant_periodo_386
ON public.depreciaciones (tenant_id, periodo);

-- ----------------------------------------------------------------------------
-- 3. Permisos RBAC.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sembrar_permisos_contabilidad_activos(p_tenant_id uuid)
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
    ('contabilidad.activos.read'),
    ('contabilidad.activos.crear'),
    ('contabilidad.activos.actualizar'),
    ('contabilidad.activos.depreciar'),
    ('contabilidad.activos.baja')
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
        AND lower(p.codigo) LIKE 'contabilidad.activos.%'
      )
      OR (
        upper(r.nombre) IN ('FINANZAS', 'GERENCIA', 'AUDITOR')
        AND lower(p.codigo) = 'contabilidad.activos.read'
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

GRANT EXECUTE ON FUNCTION app.sembrar_permisos_contabilidad_activos(uuid) TO service_role;

DO $$
DECLARE
  v_tenant record;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP
    PERFORM app.sembrar_permisos_contabilidad_activos(v_tenant.id);
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
    + COALESCE(app.sembrar_permisos_contabilidad_activos(p_tenant_id), 0);

  permisos_seeded := COALESCE(v_base.permisos_seeded, 0) + v_extra;
  roles_seeded := COALESCE(v_base.roles_seeded, 0);
  role_permissions_seeded := COALESCE(v_base.role_permissions_seeded, 0);

  RETURN NEXT;
END;
$wrap$;

GRANT EXECUTE ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) TO service_role;

COMMIT;
