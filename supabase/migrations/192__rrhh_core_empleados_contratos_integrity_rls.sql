-- ============================================================================
-- 192__rrhh_core_empleados_contratos_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para:
-- departamentos, empleados y contratos.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant_id y aliases por relaciones parent.
-- ----------------------------------------------------------------------------
UPDATE public.departamentos d
SET tenant_id = e.tenant_id
FROM public.empleados e
WHERE COALESCE(e.id_departamento, e.departamento_id) = d.id
  AND e.tenant_id IS NOT NULL
  AND d.tenant_id IS NULL;

UPDATE public.empleados e
SET
  tenant_id = COALESCE(e.tenant_id, d.tenant_id),
  id_departamento = COALESCE(e.id_departamento, e.departamento_id, d.id),
  departamento_id = COALESCE(e.departamento_id, e.id_departamento, d.id),
  departamento = COALESCE(NULLIF(btrim(COALESCE(e.departamento, '')), ''), d.nombre)
FROM public.departamentos d
WHERE (e.id_departamento = d.id OR e.departamento_id = d.id)
  AND (
    e.tenant_id IS NULL
    OR (d.tenant_id IS NOT NULL AND e.tenant_id <> d.tenant_id)
    OR e.id_departamento IS NULL
    OR e.departamento_id IS NULL
    OR e.departamento IS NULL
    OR btrim(e.departamento) = ''
  );

UPDATE public.empleados e
SET
  id_departamento = d.id,
  departamento_id = d.id,
  departamento = COALESCE(NULLIF(btrim(COALESCE(e.departamento, '')), ''), d.nombre),
  tenant_id = COALESCE(e.tenant_id, d.tenant_id)
FROM public.departamentos d
WHERE COALESCE(e.id_departamento, e.departamento_id) IS NULL
  AND NULLIF(lower(btrim(COALESCE(e.departamento, ''))), '') = lower(btrim(d.nombre))
  AND (d.tenant_id IS NULL OR e.tenant_id IS NULL OR d.tenant_id = e.tenant_id);

UPDATE public.contratos c
SET
  tenant_id = COALESCE(c.tenant_id, e.tenant_id),
  id_empleado = COALESCE(c.id_empleado, c.empleado_id, e.id),
  empleado_id = COALESCE(c.empleado_id, c.id_empleado, e.id)
FROM public.empleados e
WHERE (c.id_empleado = e.id OR c.empleado_id = e.id)
  AND (
    c.tenant_id IS NULL
    OR (e.tenant_id IS NOT NULL AND c.tenant_id <> e.tenant_id)
    OR c.id_empleado IS NULL
    OR c.empleado_id IS NULL
  );

-- ----------------------------------------------------------------------------
-- FKs runtime para embeds/joins.
-- Nota: solo una FK por relacion para evitar ambiguedad en embeds PostgREST.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible('empleados', 'id_departamento', 'departamentos', 'id', 'empleados_id_departamento_fkey_runtime');
SELECT app.add_fk_if_possible('contratos', 'id_empleado', 'empleados', 'id', 'contratos_id_empleado_fkey_runtime');

-- ----------------------------------------------------------------------------
-- Dedupe operativo previo a unicidades.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    d.id,
    row_number() OVER (
      PARTITION BY d.tenant_id, upper(btrim(d.nombre))
      ORDER BY COALESCE(d.updated_at, d.created_at, now()) DESC, d.id::text DESC
    ) AS rn
  FROM public.departamentos d
  WHERE d.tenant_id IS NOT NULL
    AND d.nombre IS NOT NULL
    AND btrim(d.nombre) <> ''
    AND d.estado = 'activo'
)
UPDATE public.departamentos d
SET
  nombre = format('%s DUP %s', btrim(d.nombre), r.rn),
  codigo = format('%s-DUP-%s', COALESCE(NULLIF(upper(btrim(d.codigo)), ''), 'DEP'), r.rn),
  updated_at = now()
FROM ranked r
WHERE d.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    e.id,
    row_number() OVER (
      PARTITION BY e.tenant_id, upper(btrim(e.tipo_documento)), upper(btrim(e.numero_documento))
      ORDER BY COALESCE(e.updated_at, e.created_at, now()) DESC, e.id::text DESC
    ) AS rn
  FROM public.empleados e
  WHERE e.tenant_id IS NOT NULL
    AND e.tipo_documento IS NOT NULL
    AND e.numero_documento IS NOT NULL
    AND btrim(e.numero_documento) <> ''
    AND e.estado IN ('activo', 'inactivo', 'suspendido')
)
UPDATE public.empleados e
SET
  numero_documento = format('%s-DUP-%s', upper(btrim(e.numero_documento)), r.rn),
  updated_at = now()
FROM ranked r
WHERE e.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    c.id,
    row_number() OVER (
      PARTITION BY c.tenant_id, c.id_empleado, c.fecha_inicio, c.tipo_contrato
      ORDER BY COALESCE(c.updated_at, c.created_at, now()) DESC, c.id::text DESC
    ) AS rn
  FROM public.contratos c
  WHERE c.tenant_id IS NOT NULL
    AND c.id_empleado IS NOT NULL
    AND c.fecha_inicio IS NOT NULL
    AND c.tipo_contrato IS NOT NULL
    AND c.estado IN ('vigente', 'renovado', 'en_periodo_prueba', 'vencido')
)
UPDATE public.contratos c
SET
  fecha_inicio = c.fecha_inicio + (r.rn - 1),
  fecha_firma = COALESCE(c.fecha_firma, c.fecha_inicio + (r.rn - 1)),
  updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Triggers de consistencia tenant por relacion.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_empleados_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
  v_departamento text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_departamento := app.to_uuid_or_null(COALESCE(NEW.id_departamento::text, NEW.departamento_id::text, ''));
  NEW.departamento_id := NEW.id_departamento;

  IF NEW.id_departamento IS NOT NULL THEN
    SELECT d.tenant_id, d.nombre
    INTO v_tenant, v_departamento
    FROM public.departamentos d
    WHERE d.id = NEW.id_departamento;

    IF FOUND THEN
      IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := v_tenant;
      ELSIF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN
        RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con departamento en empleados', ERRCODE = '23514';
      END IF;

      IF NEW.departamento IS NULL OR btrim(NEW.departamento) = '' THEN
        NEW.departamento := v_departamento;
      END IF;
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en empleados', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_empleados_tenant_consistency ON public.empleados;
CREATE TRIGGER trg_enforce_empleados_tenant_consistency
BEFORE INSERT OR UPDATE ON public.empleados
FOR EACH ROW
EXECUTE FUNCTION app.enforce_empleados_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_contratos_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, NEW.empleado_id::text, ''));
  NEW.empleado_id := NEW.id_empleado;

  IF NEW.id_empleado IS NOT NULL THEN
    SELECT e.tenant_id
    INTO v_tenant
    FROM public.empleados e
    WHERE e.id = NEW.id_empleado;

    IF FOUND THEN
      IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := v_tenant;
      ELSIF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN
        RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con empleado en contratos', ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en contratos', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_contratos_tenant_consistency ON public.contratos;
CREATE TRIGGER trg_enforce_contratos_tenant_consistency
BEFORE INSERT OR UPDATE ON public.contratos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_contratos_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio.
-- ----------------------------------------------------------------------------
ALTER TABLE public.departamentos DROP CONSTRAINT IF EXISTS ck_departamentos_nombre_runtime;
ALTER TABLE public.departamentos
  ADD CONSTRAINT ck_departamentos_nombre_runtime
  CHECK (nombre IS NOT NULL AND btrim(nombre) <> '');

ALTER TABLE public.departamentos DROP CONSTRAINT IF EXISTS ck_departamentos_estado_runtime;
ALTER TABLE public.departamentos
  ADD CONSTRAINT ck_departamentos_estado_runtime
  CHECK (estado IN ('activo', 'inactivo'));

ALTER TABLE public.empleados DROP CONSTRAINT IF EXISTS ck_empleados_estado_runtime;
ALTER TABLE public.empleados
  ADD CONSTRAINT ck_empleados_estado_runtime
  CHECK (estado IN ('activo', 'inactivo', 'suspendido', 'cesado'));

ALTER TABLE public.empleados DROP CONSTRAINT IF EXISTS ck_empleados_documento_runtime;
ALTER TABLE public.empleados
  ADD CONSTRAINT ck_empleados_documento_runtime
  CHECK (tipo_documento IN ('DNI', 'CE', 'PASAPORTE', 'RUC', 'OTRO'));

ALTER TABLE public.empleados DROP CONSTRAINT IF EXISTS ck_empleados_fechas_hijos_runtime;
ALTER TABLE public.empleados
  ADD CONSTRAINT ck_empleados_fechas_hijos_runtime
  CHECK (
    cantidad_hijos >= 0
    AND (fecha_nacimiento IS NULL OR fecha_nacimiento <= current_date)
    AND (fecha_ingreso IS NULL OR fecha_nacimiento IS NULL OR fecha_ingreso >= fecha_nacimiento)
  );

ALTER TABLE public.empleados DROP CONSTRAINT IF EXISTS ck_empleados_email_runtime;
ALTER TABLE public.empleados
  ADD CONSTRAINT ck_empleados_email_runtime
  CHECK (
    email IS NULL
    OR email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  );

ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS ck_contratos_estado_runtime;
ALTER TABLE public.contratos
  ADD CONSTRAINT ck_contratos_estado_runtime
  CHECK (estado IN ('vigente', 'renovado', 'finalizado', 'terminado', 'vencido', 'en_periodo_prueba', 'anulado'));

ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS ck_contratos_tipo_runtime;
ALTER TABLE public.contratos
  ADD CONSTRAINT ck_contratos_tipo_runtime
  CHECK (tipo_contrato IN ('indefinido', 'temporal', 'practicas', 'locacion_servicios', 'part_time', 'por_horas', 'servicios'));

ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS ck_contratos_montos_fechas_runtime;
ALTER TABLE public.contratos
  ADD CONSTRAINT ck_contratos_montos_fechas_runtime
  CHECK (
    sueldo_bruto >= 0
    AND salario >= 0
    AND periodo_prueba_meses >= 0
    AND periodo_prueba_meses <= 24
    AND (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio)
  );

ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS ck_contratos_regimen_runtime;
ALTER TABLE public.contratos
  ADD CONSTRAINT ck_contratos_regimen_runtime
  CHECK (regimen_pensionario IN ('AFP', 'ONP', 'MIXTO', 'SIN_REGIMEN'));

ALTER TABLE public.departamentos VALIDATE CONSTRAINT ck_departamentos_nombre_runtime;
ALTER TABLE public.departamentos VALIDATE CONSTRAINT ck_departamentos_estado_runtime;
ALTER TABLE public.empleados VALIDATE CONSTRAINT ck_empleados_estado_runtime;
ALTER TABLE public.empleados VALIDATE CONSTRAINT ck_empleados_documento_runtime;
ALTER TABLE public.empleados VALIDATE CONSTRAINT ck_empleados_fechas_hijos_runtime;
ALTER TABLE public.empleados VALIDATE CONSTRAINT ck_empleados_email_runtime;
ALTER TABLE public.contratos VALIDATE CONSTRAINT ck_contratos_estado_runtime;
ALTER TABLE public.contratos VALIDATE CONSTRAINT ck_contratos_tipo_runtime;
ALTER TABLE public.contratos VALIDATE CONSTRAINT ck_contratos_montos_fechas_runtime;
ALTER TABLE public.contratos VALIDATE CONSTRAINT ck_contratos_regimen_runtime;

-- ----------------------------------------------------------------------------
-- Unicidades operativas.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_departamentos_tenant_nombre_activo
ON public.departamentos (tenant_id, upper(btrim(nombre)))
WHERE tenant_id IS NOT NULL
  AND nombre IS NOT NULL
  AND btrim(nombre) <> ''
  AND estado = 'activo';

CREATE UNIQUE INDEX IF NOT EXISTS ux_empleados_tenant_documento_activo
ON public.empleados (tenant_id, upper(btrim(tipo_documento)), upper(btrim(numero_documento)))
WHERE tenant_id IS NOT NULL
  AND tipo_documento IS NOT NULL
  AND numero_documento IS NOT NULL
  AND btrim(numero_documento) <> ''
  AND estado IN ('activo', 'inactivo', 'suspendido');

CREATE UNIQUE INDEX IF NOT EXISTS ux_contratos_tenant_empleado_fecha_tipo_activo
ON public.contratos (tenant_id, id_empleado, fecha_inicio, tipo_contrato)
WHERE tenant_id IS NOT NULL
  AND id_empleado IS NOT NULL
  AND fecha_inicio IS NOT NULL
  AND tipo_contrato IS NOT NULL
  AND estado IN ('vigente', 'renovado', 'en_periodo_prueba', 'vencido');

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'departamentos');
SELECT app.apply_tenant_policy('public', 'empleados');
SELECT app.apply_tenant_policy('public', 'contratos');

COMMIT;
