-- ============================================================================
-- 183__contabilidad_plantillas_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para:
-- plantillas_asientos, plantillas_asientos_detalle,
-- plantillas_asientos_historial, plantillas_asientos_ventas.
-- ============================================================================

BEGIN;

-- Backfill tenant/pais por relaciones.
UPDATE public.plantillas_asientos_detalle d
SET tenant_id = p.tenant_id
FROM public.plantillas_asientos p
WHERE d.plantilla_id = p.id
  AND p.tenant_id IS NOT NULL
  AND (
    d.tenant_id IS NULL
    OR d.tenant_id <> p.tenant_id
  );

UPDATE public.plantillas_asientos_historial h
SET tenant_id = p.tenant_id
FROM public.plantillas_asientos p
WHERE h.plantilla_id = p.id
  AND p.tenant_id IS NOT NULL
  AND (h.tenant_id IS NULL OR h.tenant_id <> p.tenant_id);

UPDATE public.plantillas_asientos_historial h
SET tenant_id = a.tenant_id
FROM public.asientos_contables a
WHERE h.asiento_id = a.id
  AND a.tenant_id IS NOT NULL
  AND h.tenant_id IS NULL;

UPDATE public.plantillas_asientos_ventas pv
SET pais_id = COALESCE(
  pv.pais_id,
  (SELECT p.id FROM public.paises p WHERE upper(p.codigo_iso) IN ('PE', 'PER') ORDER BY p.id LIMIT 1),
  1
)
WHERE pv.pais_id IS NULL;

-- FKs runtime para joins/embeds.
SELECT app.add_fk_if_possible(
  'plantillas_asientos_detalle',
  'plantilla_id',
  'plantillas_asientos',
  'id',
  'plantillas_asientos_detalle_plantilla_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'plantillas_asientos_historial',
  'plantilla_id',
  'plantillas_asientos',
  'id',
  'plantillas_asientos_historial_plantilla_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'plantillas_asientos_historial',
  'asiento_id',
  'asientos_contables',
  'id',
  'plantillas_asientos_historial_asiento_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'plantillas_asientos_historial',
  'usuario_id',
  'usuarios_sistema',
  'id',
  'plantillas_asientos_historial_usuario_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'plantillas_asientos_ventas',
  'pais_id',
  'paises',
  'id',
  'plantillas_asientos_ventas_pais_id_fkey_runtime'
);

-- Dedupe operativo.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(btrim(codigo))
      ORDER BY
        COALESCE(aplica_por_defecto, false) DESC,
        COALESCE(updated_at, created_at, now()) DESC,
        id::text DESC
    ) AS rn
  FROM public.plantillas_asientos
  WHERE codigo IS NOT NULL
    AND btrim(codigo) <> ''
    AND COALESCE(activo, true) = true
)
UPDATE public.plantillas_asientos p
SET
  activo = false,
  estado = 'INACTIVO',
  codigo = format('%s-DUP-%s', upper(btrim(p.codigo)), ranked.rn),
  updated_at = now()
FROM ranked
WHERE p.id = ranked.id
  AND ranked.rn > 1;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY plantilla_id, orden
      ORDER BY
        COALESCE(updated_at, created_at, now()) DESC,
        id::text DESC
    ) AS rn
  FROM public.plantillas_asientos_detalle
  WHERE plantilla_id IS NOT NULL
    AND COALESCE(activo, true) = true
)
UPDATE public.plantillas_asientos_detalle d
SET
  activo = false,
  estado = 'INACTIVO',
  updated_at = now()
FROM ranked
WHERE d.id = ranked.id
  AND ranked.rn > 1;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY pais_id, upper(btrim(tipo_documento))
      ORDER BY
        (tenant_id IS NULL) DESC,
        COALESCE(prioridad, 100) ASC,
        COALESCE(updated_at, created_at, now()) DESC,
        id::text DESC
    ) AS rn
  FROM public.plantillas_asientos_ventas
  WHERE pais_id IS NOT NULL
    AND tipo_documento IS NOT NULL
    AND btrim(tipo_documento) <> ''
    AND COALESCE(activo, true) = true
)
UPDATE public.plantillas_asientos_ventas pv
SET
  activo = false,
  estado = 'INACTIVO',
  updated_at = now()
FROM ranked
WHERE pv.id = ranked.id
  AND ranked.rn > 1;

-- Triggers de consistencia tenant/scope.
CREATE OR REPLACE FUNCTION app.enforce_plantillas_asientos_detalle_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.plantilla_id := app.to_uuid_or_null(COALESCE(NEW.plantilla_id::text, ''));

  IF NEW.plantilla_id IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'plantilla_id es obligatorio en plantillas_asientos_detalle',
      ERRCODE = '23514';
  END IF;

  SELECT tenant_id
  INTO v_tenant
  FROM public.plantillas_asientos
  WHERE id = NEW.plantilla_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      MESSAGE = format('plantilla no existe: %s', NEW.plantilla_id),
      ERRCODE = '23503';
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant);
  IF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN
    RAISE EXCEPTION USING
      MESSAGE = 'tenant_id no coincide con plantilla en plantillas_asientos_detalle',
      ERRCODE = '23514';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'tenant_id es obligatorio en plantillas_asientos_detalle',
      ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plantillas_asientos_detalle_tenant_consistency ON public.plantillas_asientos_detalle;
CREATE TRIGGER trg_enforce_plantillas_asientos_detalle_tenant_consistency
BEFORE INSERT OR UPDATE ON public.plantillas_asientos_detalle
FOR EACH ROW
EXECUTE FUNCTION app.enforce_plantillas_asientos_detalle_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_plantillas_asientos_historial_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_plantilla uuid;
  v_tenant_asiento uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.plantilla_id := app.to_uuid_or_null(COALESCE(NEW.plantilla_id::text, ''));
  NEW.asiento_id := app.to_uuid_or_null(COALESCE(NEW.asiento_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));

  IF NEW.plantilla_id IS NOT NULL THEN
    SELECT tenant_id
    INTO v_tenant_plantilla
    FROM public.plantillas_asientos
    WHERE id = NEW.plantilla_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        MESSAGE = format('plantilla no existe: %s', NEW.plantilla_id),
        ERRCODE = '23503';
    END IF;
  END IF;

  IF NEW.asiento_id IS NOT NULL THEN
    SELECT tenant_id
    INTO v_tenant_asiento
    FROM public.asientos_contables
    WHERE id = NEW.asiento_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        MESSAGE = format('asiento no existe: %s', NEW.asiento_id),
        ERRCODE = '23503';
    END IF;
  END IF;

  IF v_tenant_plantilla IS NOT NULL AND v_tenant_asiento IS NOT NULL AND v_tenant_plantilla <> v_tenant_asiento THEN
    RAISE EXCEPTION USING
      MESSAGE = 'tenant de plantilla y asiento no coincide en plantillas_asientos_historial',
      ERRCODE = '23514';
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant_plantilla, v_tenant_asiento);
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'tenant_id es obligatorio en plantillas_asientos_historial',
      ERRCODE = '23514';
  END IF;

  IF v_tenant_plantilla IS NOT NULL AND NEW.tenant_id <> v_tenant_plantilla THEN
    RAISE EXCEPTION USING
      MESSAGE = 'tenant_id no coincide con plantilla en plantillas_asientos_historial',
      ERRCODE = '23514';
  END IF;
  IF v_tenant_asiento IS NOT NULL AND NEW.tenant_id <> v_tenant_asiento THEN
    RAISE EXCEPTION USING
      MESSAGE = 'tenant_id no coincide con asiento en plantillas_asientos_historial',
      ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plantillas_asientos_historial_tenant_consistency ON public.plantillas_asientos_historial;
CREATE TRIGGER trg_enforce_plantillas_asientos_historial_tenant_consistency
BEFORE INSERT OR UPDATE ON public.plantillas_asientos_historial
FOR EACH ROW
EXECUTE FUNCTION app.enforce_plantillas_asientos_historial_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_plantillas_asientos_ventas_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.tipo_documento := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_documento, '')), ''), '01'));
  NEW.estado := app.normalize_plantilla_estado(NEW.estado, 'ACTIVO');
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'ACTIVO');

  IF COALESCE(NEW.activo, false) THEN
    -- El flujo runtime actual consulta por pais/tipo y no por tenant.
    -- Para evitar ambiguedad en maybeSingle(), las activas son globales.
    NEW.tenant_id := NULL;
  END IF;

  IF NEW.pais_id IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'pais_id es obligatorio en plantillas_asientos_ventas',
      ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plantillas_asientos_ventas_scope ON public.plantillas_asientos_ventas;
CREATE TRIGGER trg_enforce_plantillas_asientos_ventas_scope
BEFORE INSERT OR UPDATE ON public.plantillas_asientos_ventas
FOR EACH ROW
EXECUTE FUNCTION app.enforce_plantillas_asientos_ventas_scope();

-- Constraints de calidad/integridad.
ALTER TABLE public.plantillas_asientos
DROP CONSTRAINT IF EXISTS ck_plantillas_asientos_runtime;
ALTER TABLE public.plantillas_asientos
ADD CONSTRAINT ck_plantillas_asientos_runtime CHECK (
  nombre IS NOT NULL
  AND btrim(nombre) <> ''
  AND codigo IS NOT NULL
  AND btrim(codigo) <> ''
  AND estado IN ('ACTIVO', 'INACTIVO', 'ARCHIVADA')
  AND (
    (estado = 'ACTIVO' AND COALESCE(activo, true) = true)
    OR (estado <> 'ACTIVO' AND COALESCE(activo, false) = false)
  )
);

ALTER TABLE public.plantillas_asientos_detalle
DROP CONSTRAINT IF EXISTS ck_plantillas_asientos_detalle_runtime;
ALTER TABLE public.plantillas_asientos_detalle
ADD CONSTRAINT ck_plantillas_asientos_detalle_runtime CHECK (
  nombre IS NOT NULL
  AND btrim(nombre) <> ''
  AND orden >= 1
  AND lado IN ('DEBE', 'HABER')
  AND tipo_valor IN ('FIJO', 'PORCENTAJE', 'FORMULA')
  AND valor_base >= 0
  AND porcentaje >= 0
  AND porcentaje <= 1
  AND estado IN ('ACTIVO', 'INACTIVO', 'ARCHIVADA')
  AND (
    estado <> 'ACTIVO'
    OR (
      plantilla_id IS NOT NULL
      AND cuenta_codigo IS NOT NULL
      AND btrim(cuenta_codigo) <> ''
    )
  )
);

ALTER TABLE public.plantillas_asientos_historial
DROP CONSTRAINT IF EXISTS ck_plantillas_asientos_historial_runtime;
ALTER TABLE public.plantillas_asientos_historial
ADD CONSTRAINT ck_plantillas_asientos_historial_runtime CHECK (
  estado IN ('GENERADO', 'ERROR', 'PENDIENTE', 'ANULADO')
  AND fecha_generacion IS NOT NULL
  AND periodo IS NOT NULL
  AND periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
);

ALTER TABLE public.plantillas_asientos_ventas
DROP CONSTRAINT IF EXISTS ck_plantillas_asientos_ventas_runtime;
ALTER TABLE public.plantillas_asientos_ventas
ADD CONSTRAINT ck_plantillas_asientos_ventas_runtime CHECK (
  pais_id IS NOT NULL
  AND tipo_documento IS NOT NULL
  AND btrim(tipo_documento) <> ''
  AND prioridad >= 1
  AND moneda ~ '^[A-Z]{3}$'
  AND estado IN ('ACTIVO', 'INACTIVO', 'ARCHIVADA')
  AND (
    estado <> 'ACTIVO'
    OR (
      COALESCE(activo, true) = true
      AND tenant_id IS NULL
      AND cuenta_debe_codigo IS NOT NULL
      AND btrim(cuenta_debe_codigo) <> ''
      AND cuenta_haber_ventas_codigo IS NOT NULL
      AND btrim(cuenta_haber_ventas_codigo) <> ''
      AND cuenta_haber_impuesto_codigo IS NOT NULL
      AND btrim(cuenta_haber_impuesto_codigo) <> ''
    )
  )
);

-- Unicidades/indices operativos.
CREATE UNIQUE INDEX IF NOT EXISTS ux_plantillas_asientos_tenant_codigo_activo_runtime
ON public.plantillas_asientos (
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  upper(codigo)
)
WHERE codigo IS NOT NULL
  AND btrim(codigo) <> ''
  AND COALESCE(activo, true) = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_plantillas_asientos_detalle_plantilla_orden_activo_runtime
ON public.plantillas_asientos_detalle (plantilla_id, orden)
WHERE plantilla_id IS NOT NULL
  AND COALESCE(activo, true) = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_plantillas_asientos_ventas_active_pais_tipo_runtime
ON public.plantillas_asientos_ventas (pais_id, upper(tipo_documento))
WHERE pais_id IS NOT NULL
  AND tipo_documento IS NOT NULL
  AND btrim(tipo_documento) <> ''
  AND COALESCE(activo, true) = true;

CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_historial_tenant_periodo_runtime
ON public.plantillas_asientos_historial (tenant_id, periodo, fecha_generacion DESC);

CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_ventas_pais_tipo_prioridad_runtime
ON public.plantillas_asientos_ventas (pais_id, tipo_documento, prioridad, activo);

-- RLS hardening explicito.
ALTER TABLE IF EXISTS public.plantillas_asientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.plantillas_asientos FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.plantillas_asientos_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.plantillas_asientos_detalle FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.plantillas_asientos_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.plantillas_asientos_historial FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.plantillas_asientos_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.plantillas_asientos_ventas FORCE ROW LEVEL SECURITY;

SELECT app.apply_tenant_policy('public', 'plantillas_asientos');
SELECT app.apply_tenant_policy('public', 'plantillas_asientos_detalle');
SELECT app.apply_tenant_policy('public', 'plantillas_asientos_historial');
SELECT app.apply_global_or_tenant_policy('public', 'plantillas_asientos_ventas');

COMMIT;
