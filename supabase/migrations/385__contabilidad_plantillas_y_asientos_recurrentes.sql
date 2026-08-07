-- ============================================================================
-- 385__contabilidad_plantillas_y_asientos_recurrentes.sql
-- plantillas_asientos y su detalle existian como cascarones: la 183 les puso
-- RLS y claves foraneas, pero de columnas de negocio solo tenian descripcion,
-- tipo_origen, plantilla_id y orden. No habia cuenta, ni importe, ni
-- periodicidad: era imposible instanciar un asiento desde una plantilla, y de
-- hecho ningun servicio las leia.
--
-- Aqui se convierten en plantillas utilizables y recurrentes: el contador
-- define una vez la provision mensual, el devengo de un alquiler o el
-- prorrateo de un seguro, y el sistema la instancia en cada periodo.
--
-- Objetos foco:
--   public.plantillas_asientos (periodicidad, proxima_ejecucion, estado destino)
--   public.plantillas_asientos_detalle (cuenta, debe/haber, centro de costo)
--   public.plantillas_asientos_historial (trazabilidad plantilla -> asiento)
--   app.sembrar_permisos_contabilidad_plantillas(uuid)
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

-- ----------------------------------------------------------------------------
-- 1. Cabecera de la plantilla.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.plantillas_asientos
  ADD COLUMN IF NOT EXISTS concepto text,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS periodicidad text NOT NULL DEFAULT 'NINGUNA',
  ADD COLUMN IF NOT EXISTS dia_ejecucion integer,
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS fecha_fin date,
  ADD COLUMN IF NOT EXISTS proxima_ejecucion date,
  ADD COLUMN IF NOT EXISTS ultima_ejecucion date,
  ADD COLUMN IF NOT EXISTS crear_en_estado text NOT NULL DEFAULT 'BORRADOR',
  ADD COLUMN IF NOT EXISTS activa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by text;

COMMENT ON COLUMN public.plantillas_asientos.periodicidad IS
  'NINGUNA = plantilla manual reutilizable. El resto la convierten en recurrente.';
COMMENT ON COLUMN public.plantillas_asientos.dia_ejecucion IS
  'Dia del mes en que toca generar. -1 significa ultimo dia del mes.';
COMMENT ON COLUMN public.plantillas_asientos.crear_en_estado IS
  'Estado del asiento generado. BORRADOR por defecto: un asiento automatico deberia revisarse antes de entrar al libro.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_plantillas_asientos_periodicidad_385'
  ) THEN
    ALTER TABLE public.plantillas_asientos
      ADD CONSTRAINT ck_plantillas_asientos_periodicidad_385
      CHECK (upper(periodicidad) IN ('NINGUNA','MENSUAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_plantillas_asientos_estado_destino_385'
  ) THEN
    ALTER TABLE public.plantillas_asientos
      ADD CONSTRAINT ck_plantillas_asientos_estado_destino_385
      CHECK (upper(crear_en_estado) IN ('BORRADOR','CONFIRMADO'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_plantillas_asientos_dia_385'
  ) THEN
    ALTER TABLE public.plantillas_asientos
      ADD CONSTRAINT ck_plantillas_asientos_dia_385
      CHECK (dia_ejecucion IS NULL OR dia_ejecucion = -1 OR (dia_ejecucion BETWEEN 1 AND 31))
      NOT VALID;
  END IF;
END;
$$;

-- Normalizacion: los enum viajan siempre en mayusculas y una plantilla
-- recurrente sin proxima ejecucion nunca se dispararia.
CREATE OR REPLACE FUNCTION app.normalize_plantillas_asientos_385()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.periodicidad := upper(btrim(COALESCE(NEW.periodicidad, 'NINGUNA')));
  NEW.crear_en_estado := upper(btrim(COALESCE(NEW.crear_en_estado, 'BORRADOR')));

  IF NEW.periodicidad <> 'NINGUNA' AND NEW.proxima_ejecucion IS NULL THEN
    NEW.proxima_ejecucion := COALESCE(NEW.fecha_inicio, CURRENT_DATE);
  END IF;

  IF NEW.periodicidad = 'NINGUNA' THEN
    -- Una plantilla manual no se agenda: dejar una proxima ejecucion colgando
    -- haria que el scheduler la considerase por error si algun dia se activa.
    NEW.proxima_ejecucion := NULL;
  END IF;

  IF NEW.fecha_fin IS NOT NULL AND NEW.fecha_inicio IS NOT NULL
     AND NEW.fecha_fin < NEW.fecha_inicio THEN
    RAISE EXCEPTION USING
      MESSAGE = 'La fecha de fin de la plantilla no puede ser anterior a la de inicio',
      ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_plantillas_asientos_385 ON public.plantillas_asientos;
CREATE TRIGGER trg_normalize_plantillas_asientos_385
BEFORE INSERT OR UPDATE ON public.plantillas_asientos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_plantillas_asientos_385();

-- Consulta del scheduler: plantillas activas que vencen hoy o antes.
CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_pendientes_385
ON public.plantillas_asientos (proxima_ejecucion, tenant_id)
WHERE activa = true AND proxima_ejecucion IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Lineas de la plantilla.
--    Importes fijos: la plantilla guarda el reparto contable, y quien la
--    instancia puede ajustar los importes antes de generar el asiento.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.plantillas_asientos_detalle
  ADD COLUMN IF NOT EXISTS cuenta_id uuid,
  ADD COLUMN IF NOT EXISTS debe numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS haber numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS concepto text,
  ADD COLUMN IF NOT EXISTS centro_costo_id uuid;

SELECT app.add_fk_if_possible(
  'plantillas_asientos_detalle',
  'cuenta_id',
  'plan_cuentas',
  'id',
  'plantillas_asientos_detalle_cuenta_id_fkey_385'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_plantillas_detalle_debe_o_haber_385'
  ) THEN
    ALTER TABLE public.plantillas_asientos_detalle
      ADD CONSTRAINT ck_plantillas_detalle_debe_o_haber_385
      -- Misma regla de partida doble que en el asiento real: una linea carga o
      -- abona, nunca las dos cosas.
      CHECK (debe >= 0 AND haber >= 0 AND NOT (debe > 0 AND haber > 0))
      NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_plantillas_detalle_plantilla_orden_385
ON public.plantillas_asientos_detalle (plantilla_id, orden);

-- ----------------------------------------------------------------------------
-- 3. Historial: que asiento salio de que plantilla y para que periodo.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.plantillas_asientos_historial
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS generado_en timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS generado_por text,
  ADD COLUMN IF NOT EXISTS automatico boolean NOT NULL DEFAULT false;

-- Una plantilla genera como mucho un asiento por periodo. Es la defensa contra
-- que el scheduler duplique la provision si se ejecuta dos veces el mismo dia.
CREATE UNIQUE INDEX IF NOT EXISTS ux_plantillas_historial_plantilla_periodo_385
ON public.plantillas_asientos_historial (tenant_id, plantilla_id, periodo)
WHERE periodo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plantillas_historial_plantilla_385
ON public.plantillas_asientos_historial (tenant_id, plantilla_id, generado_en DESC);

-- ----------------------------------------------------------------------------
-- 4. Permisos RBAC.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sembrar_permisos_contabilidad_plantillas(p_tenant_id uuid)
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
    ('contabilidad.plantillas.read'),
    ('contabilidad.plantillas.crear'),
    ('contabilidad.plantillas.actualizar'),
    ('contabilidad.plantillas.eliminar'),
    ('contabilidad.plantillas.generar')
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
        AND lower(p.codigo) LIKE 'contabilidad.plantillas.%'
      )
      OR (
        upper(r.nombre) IN ('FINANZAS', 'GERENCIA')
        AND lower(p.codigo) = 'contabilidad.plantillas.read'
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

GRANT EXECUTE ON FUNCTION app.sembrar_permisos_contabilidad_plantillas(uuid) TO service_role;

DO $$
DECLARE
  v_tenant record;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP
    PERFORM app.sembrar_permisos_contabilidad_plantillas(v_tenant.id);
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
    + COALESCE(app.sembrar_permisos_contabilidad_plantillas(p_tenant_id), 0);

  permisos_seeded := COALESCE(v_base.permisos_seeded, 0) + v_extra;
  roles_seeded := COALESCE(v_base.roles_seeded, 0);
  role_permissions_seeded := COALESCE(v_base.role_permissions_seeded, 0);

  RETURN NEXT;
END;
$wrap$;

GRANT EXECUTE ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) TO service_role;

COMMIT;
