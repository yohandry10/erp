-- ============================================================================
-- 336__client_data_migration_external_id_and_audit.sql
-- Soporte para migración de data desde ERPs externos.
--
-- Aporta:
--   1. Columna `external_id` + índice único parcial por (tenant_id, external_id)
--      en maestros y documentos que se reciben en lotes desde el ERP origen.
--      El índice es parcial (WHERE external_id IS NOT NULL) para no chocar con
--      filas históricas creadas antes de esta migración.
--   2. Tablas `migration_runs` y `migration_run_rows` para auditar lotes,
--      conservar errores por fila y permitir reanudación/idempotencia.
--   3. Función `validar_migracion_apertura(tenant_id, fecha_corte)` que valida
--      cuadre de balance de apertura, CxC/CxP migradas y runs estancadas.
--   4. Permisos `migration.*` registrados en `public.permisos` para todos los
--      tenants activos y asignados al rol ADMIN.
--
-- Compatible con 000..335. Idempotente. No re-escribe filas existentes.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. external_id en maestros y documentos
-- ----------------------------------------------------------------------------

ALTER TABLE public.clientes              ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.proveedores           ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.productos             ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.cuentas_por_cobrar    ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.cuentas_por_pagar     ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.asientos_contables    ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.cuentas_bancarias     ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.plan_cuentas          ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_tenant_external_id
  ON public.clientes (tenant_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_proveedores_tenant_external_id
  ON public.proveedores (tenant_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_productos_tenant_external_id
  ON public.productos (tenant_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cxc_tenant_external_id
  ON public.cuentas_por_cobrar (tenant_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cxp_tenant_external_id
  ON public.cuentas_por_pagar (tenant_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_asientos_tenant_external_id
  ON public.asientos_contables (tenant_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cuentas_bancarias_tenant_external_id
  ON public.cuentas_bancarias (tenant_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_plan_cuentas_tenant_external_id
  ON public.plan_cuentas (tenant_id, external_id)
  WHERE external_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Tablas de auditoría de migración
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.migration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_type text NOT NULL CHECK (run_type IN (
    'clientes',
    'proveedores',
    'productos',
    'plan_cuentas',
    'cuentas_bancarias',
    'cxc_abiertas',
    'cxp_abiertas',
    'balance_apertura',
    'stock_inicial',
    'comprobantes_historico'
  )),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'partial')),
  total_rows integer NOT NULL DEFAULT 0,
  ok_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  fecha_corte date,
  source_filename text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  started_by uuid,
  errors_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_migration_runs_tenant_type
  ON public.migration_runs (tenant_id, run_type, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_migration_runs_status
  ON public.migration_runs (status);

CREATE TABLE IF NOT EXISTS public.migration_run_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.migration_runs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  external_id text,
  status text NOT NULL CHECK (status IN ('ok', 'error', 'skipped')),
  target_table text,
  target_id uuid,
  error_message text,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_migration_run_rows_run_id
  ON public.migration_run_rows (run_id);

CREATE INDEX IF NOT EXISTS idx_migration_run_rows_status
  ON public.migration_run_rows (run_id, status);

CREATE INDEX IF NOT EXISTS idx_migration_run_rows_external_id
  ON public.migration_run_rows (tenant_id, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE public.migration_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_run_rows  ENABLE ROW LEVEL SECURITY;

-- Política RLS: cualquier rol autenticado del mismo tenant puede leer.
-- La escritura va por el backend con service_role (bypasses RLS).
DROP POLICY IF EXISTS rls_migration_runs_tenant_read ON public.migration_runs;
CREATE POLICY rls_migration_runs_tenant_read ON public.migration_runs
  FOR SELECT
  USING (tenant_id::text = COALESCE(current_setting('app.tenant_id', true), ''));

DROP POLICY IF EXISTS rls_migration_run_rows_tenant_read ON public.migration_run_rows;
CREATE POLICY rls_migration_run_rows_tenant_read ON public.migration_run_rows
  FOR SELECT
  USING (tenant_id::text = COALESCE(current_setting('app.tenant_id', true), ''));

-- ----------------------------------------------------------------------------
-- 3. Validador de cuadre de migración de apertura
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validar_migracion_apertura(
  p_tenant_id uuid,
  p_fecha_corte date DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  expected numeric,
  actual numeric,
  diff numeric,
  status text,
  detalle text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_fecha date;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id es obligatorio';
  END IF;

  -- Si no se pasa fecha_corte, usar la del último balance_apertura completado
  v_fecha := COALESCE(
    p_fecha_corte,
    (SELECT mr.fecha_corte
       FROM public.migration_runs mr
      WHERE mr.tenant_id = p_tenant_id
        AND mr.run_type = 'balance_apertura'
        AND mr.status = 'completed'
        AND mr.fecha_corte IS NOT NULL
      ORDER BY mr.finished_at DESC NULLS LAST
      LIMIT 1)
  );

  -- CHK_001: Asiento(s) de apertura cuadrado(s) (debe = haber)
  RETURN QUERY
  WITH apertura AS (
    SELECT
      COALESCE(SUM(da.debe), 0)::numeric AS total_debe,
      COALESCE(SUM(da.haber), 0)::numeric AS total_haber
    FROM public.asientos_contables a
    LEFT JOIN public.detalle_asientos da ON da.asiento_id = a.id
    WHERE a.tenant_id = p_tenant_id
      AND COALESCE(a.tipo_asiento, '') = 'APERTURA'
      AND (v_fecha IS NULL OR DATE(a.fecha) = v_fecha)
  )
  SELECT
    'CHK_001_balance_apertura_cuadrado'::text,
    a.total_debe,
    a.total_haber,
    (a.total_debe - a.total_haber),
    CASE
      WHEN a.total_debe = 0 AND a.total_haber = 0 THEN 'SKIP'
      WHEN ABS(a.total_debe - a.total_haber) < 0.01 THEN 'OK'
      ELSE 'FAIL'
    END::text,
    ('Asiento APERTURA en ' || COALESCE(v_fecha::text, 'cualquier fecha') || ': debe vs haber')::text
  FROM apertura a;

  -- CHK_002: CxC abiertas migradas vs total declarado en el último run
  RETURN QUERY
  WITH cxc_total AS (
    SELECT COALESCE(SUM(COALESCE(saldo_pendiente, saldo, monto_pendiente, 0)), 0)::numeric AS suma_cxc
    FROM public.cuentas_por_cobrar
    WHERE tenant_id = p_tenant_id
      AND COALESCE(metadata->>'origen', '') = 'migracion_apertura'
  ),
  expected AS (
    SELECT COALESCE((mr.metadata->>'total_declarado')::numeric, 0) AS expected_cxc
    FROM public.migration_runs mr
    WHERE mr.tenant_id = p_tenant_id
      AND mr.run_type = 'cxc_abiertas'
      AND mr.status = 'completed'
    ORDER BY mr.finished_at DESC NULLS LAST
    LIMIT 1
  )
  SELECT
    'CHK_002_cxc_abiertas_total_declarado'::text,
    COALESCE((SELECT expected_cxc FROM expected), 0),
    cxc_total.suma_cxc,
    (cxc_total.suma_cxc - COALESCE((SELECT expected_cxc FROM expected), 0)),
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM expected) THEN 'SKIP'
      WHEN COALESCE((SELECT expected_cxc FROM expected), 0) = 0 THEN 'SKIP'
      WHEN ABS(cxc_total.suma_cxc - COALESCE((SELECT expected_cxc FROM expected), 0)) < 0.01 THEN 'OK'
      ELSE 'FAIL'
    END::text,
    'Suma de CxC abiertas (origen=migracion_apertura) vs total declarado en run completado'::text
  FROM cxc_total;

  -- CHK_003: CxP abiertas migradas vs total declarado
  RETURN QUERY
  WITH cxp_total AS (
    SELECT COALESCE(SUM(COALESCE(saldo_pendiente, saldo, 0)), 0)::numeric AS suma_cxp
    FROM public.cuentas_por_pagar
    WHERE tenant_id = p_tenant_id
      AND COALESCE(metadata->>'origen', '') = 'migracion_apertura'
  ),
  expected AS (
    SELECT COALESCE((mr.metadata->>'total_declarado')::numeric, 0) AS expected_cxp
    FROM public.migration_runs mr
    WHERE mr.tenant_id = p_tenant_id
      AND mr.run_type = 'cxp_abiertas'
      AND mr.status = 'completed'
    ORDER BY mr.finished_at DESC NULLS LAST
    LIMIT 1
  )
  SELECT
    'CHK_003_cxp_abiertas_total_declarado'::text,
    COALESCE((SELECT expected_cxp FROM expected), 0),
    cxp_total.suma_cxp,
    (cxp_total.suma_cxp - COALESCE((SELECT expected_cxp FROM expected), 0)),
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM expected) THEN 'SKIP'
      WHEN COALESCE((SELECT expected_cxp FROM expected), 0) = 0 THEN 'SKIP'
      WHEN ABS(cxp_total.suma_cxp - COALESCE((SELECT expected_cxp FROM expected), 0)) < 0.01 THEN 'OK'
      ELSE 'FAIL'
    END::text,
    'Suma de CxP abiertas (origen=migracion_apertura) vs total declarado en run completado'::text
  FROM cxp_total;

  -- CHK_004: No deben quedar runs estancadas (>24h en in_progress)
  RETURN QUERY
  WITH stuck AS (
    SELECT COUNT(*)::numeric AS cnt
    FROM public.migration_runs mr
    WHERE mr.tenant_id = p_tenant_id
      AND mr.status = 'in_progress'
      AND mr.started_at < NOW() - INTERVAL '24 hours'
  )
  SELECT
    'CHK_004_no_runs_estancadas_24h'::text,
    0::numeric,
    stuck.cnt,
    stuck.cnt,
    CASE WHEN stuck.cnt = 0 THEN 'OK' ELSE 'FAIL' END::text,
    'No deben existir migration_runs estancadas (>24h en in_progress)'::text
  FROM stuck;

  -- CHK_005: Cada CxC migrada con saldo>0 referencia un cliente del mismo tenant
  RETURN QUERY
  WITH orfanas AS (
    SELECT COUNT(*)::numeric AS cnt
    FROM public.cuentas_por_cobrar cxc
    WHERE cxc.tenant_id = p_tenant_id
      AND COALESCE(cxc.metadata->>'origen', '') = 'migracion_apertura'
      AND NOT EXISTS (
        SELECT 1 FROM public.clientes c
        WHERE c.id = cxc.cliente_id AND c.tenant_id = cxc.tenant_id
      )
  )
  SELECT
    'CHK_005_cxc_cliente_existe'::text,
    0::numeric,
    orfanas.cnt,
    orfanas.cnt,
    CASE WHEN orfanas.cnt = 0 THEN 'OK' ELSE 'FAIL' END::text,
    'Toda CxC migrada debe referenciar un cliente del mismo tenant'::text
  FROM orfanas;

  -- CHK_006: Cada CxP migrada referencia un proveedor del mismo tenant
  RETURN QUERY
  WITH orfanas AS (
    SELECT COUNT(*)::numeric AS cnt
    FROM public.cuentas_por_pagar cxp
    WHERE cxp.tenant_id = p_tenant_id
      AND COALESCE(cxp.metadata->>'origen', '') = 'migracion_apertura'
      AND NOT EXISTS (
        SELECT 1 FROM public.proveedores p
        WHERE p.id = cxp.proveedor_id AND p.tenant_id = cxp.tenant_id
      )
  )
  SELECT
    'CHK_006_cxp_proveedor_existe'::text,
    0::numeric,
    orfanas.cnt,
    orfanas.cnt,
    CASE WHEN orfanas.cnt = 0 THEN 'OK' ELSE 'FAIL' END::text,
    'Toda CxP migrada debe referenciar un proveedor del mismo tenant'::text
  FROM orfanas;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_migracion_apertura(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_migracion_apertura(uuid, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.validar_migracion_apertura(uuid, date) IS
  'Valida cuadre de migración inicial: balance debe=haber, CxC/CxP migradas vs total declarado, runs no estancadas, FKs cliente/proveedor existen.';

-- ----------------------------------------------------------------------------
-- 3.5. Relajar check `ck_cuentas_por_cobrar_ids_required` para CxC migradas.
--
-- El check histórico exige (tenant_id, cliente_id, documento_id) NOT NULL.
-- Las CxC abiertas migradas desde un ERP externo no tienen un `documento_id`
-- local — el documento original vive en el sistema origen. Reemplazamos el
-- check por uno que permite `documento_id IS NULL` solo cuando la fila viene
-- marcada con `metadata->>'origen' = 'migracion_apertura'`.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cuentas_por_cobrar
  DROP CONSTRAINT IF EXISTS ck_cuentas_por_cobrar_ids_required;

ALTER TABLE public.cuentas_por_cobrar
  ADD CONSTRAINT ck_cuentas_por_cobrar_ids_required CHECK (
    tenant_id IS NOT NULL
    AND cliente_id IS NOT NULL
    AND (
      documento_id IS NOT NULL
      OR COALESCE(metadata->>'origen', '') = 'migracion_apertura'
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Permisos migration.* para tenants activos y rol ADMIN
-- ----------------------------------------------------------------------------

WITH permission_defs(raw) AS (
  VALUES
    ('migration.templates.read'),
    ('migration.preview'),
    ('migration.clientes.import'),
    ('migration.proveedores.import'),
    ('migration.productos.import'),
    ('migration.plan_cuentas.import'),
    ('migration.cuentas_bancarias.import'),
    ('migration.cxc.import'),
    ('migration.cxp.import'),
    ('migration.balance_apertura.import'),
    ('migration.stock_inicial.import'),
    ('migration.comprobantes.import'),
    ('migration.runs.read'),
    ('migration.validar.read')
),
parsed_permissions AS (
  SELECT
    lower(raw) AS codigo,
    parts[1] AS modulo,
    CASE WHEN n = 2 THEN '__global__' ELSE array_to_string(parts[2:(n - 1)], '.') END AS recurso,
    parts[n] AS accion,
    'Permiso ' || raw AS descripcion
  FROM (
    SELECT raw, string_to_array(raw, '.') AS parts, array_length(string_to_array(raw, '.'), 1) AS n
    FROM permission_defs
  ) parsed
),
active_tenants AS (
  SELECT id FROM public.tenants WHERE COALESCE(activo, true) = true
)
INSERT INTO public.permisos (
  tenant_id, modulo, recurso, accion, codigo, descripcion, activo
)
SELECT t.id, p.modulo, p.recurso, p.accion, p.codigo, p.descripcion, true
FROM active_tenants t
CROSS JOIN parsed_permissions p
WHERE NOT EXISTS (
  SELECT 1 FROM public.permisos existing
  WHERE existing.tenant_id = t.id AND lower(existing.codigo) = p.codigo
);

INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permisos p ON p.tenant_id = r.tenant_id
WHERE lower(r.nombre) = 'admin'
  AND p.codigo LIKE 'migration.%'
  AND COALESCE(p.activo, true) = true
  AND NOT EXISTS (
    SELECT 1 FROM public.rol_permisos existing
    WHERE existing.role_id = r.id AND existing.permiso_id = p.id
  );

COMMIT;
