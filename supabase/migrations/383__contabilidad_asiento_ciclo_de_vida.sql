-- ============================================================================
-- 383__contabilidad_asiento_ciclo_de_vida.sql
-- Un contador no podia corregir un asiento: el modulo solo exponia creacion.
-- La migracion 203 ya habia dejado los estados canonicos BORRADOR/CONFIRMADO/
-- ANULADO y las materialized views ya excluyen BORRADOR y ANULADO, pero no
-- existia ninguna transicion ni trazabilidad de quien confirmo, quien anulo,
-- ni que asiento reversa a cual.
--
-- Aqui se agrega solo el soporte de datos de ese ciclo de vida:
--   - columnas de trazabilidad en asientos_contables
--   - enlace reversion -> original, con unicidad que impide reversar dos veces
--   - permisos RBAC de las nuevas transiciones, para tenants existentes y
--     para los que se creen despues
--
-- Objetos foco:
--   public.asientos_contables (columnas nuevas)
--   ux_asientos_contables_reversion_unica
--   app.sembrar_permisos_asientos_ciclo_vida(uuid)
--   app.seed_operational_rbac_for_tenant(uuid, uuid)  [wrapper]
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

-- ----------------------------------------------------------------------------
-- 1. Trazabilidad del ciclo de vida.
--    created_by ya existia (text); las columnas de actor nuevas mantienen ese
--    mismo tipo para no introducir dos convenciones en la misma tabla.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.asientos_contables
  ADD COLUMN IF NOT EXISTS reversion_de_asiento_id uuid,
  ADD COLUMN IF NOT EXISTS confirmado_por text,
  ADD COLUMN IF NOT EXISTS confirmado_en timestamptz,
  ADD COLUMN IF NOT EXISTS anulado_por text,
  ADD COLUMN IF NOT EXISTS anulado_en timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_anulacion text;

COMMENT ON COLUMN public.asientos_contables.reversion_de_asiento_id IS
  'Si esta poblado, este asiento es la reversion del asiento referenciado.';

-- FK al propio asiento original. Se usa el helper del proyecto porque la
-- tabla puede tener filas historicas en entornos ya desplegados.
SELECT app.add_fk_if_possible(
  'asientos_contables',
  'reversion_de_asiento_id',
  'asientos_contables',
  'id',
  'asientos_contables_reversion_de_asiento_id_fkey_383'
);

-- Un asiento confirmado se reversa una sola vez. Sin esta unicidad, dos
-- peticiones concurrentes crearian dos contra-asientos y duplicarian el
-- importe revertido en el libro.
CREATE UNIQUE INDEX IF NOT EXISTS ux_asientos_contables_reversion_unica
ON public.asientos_contables (tenant_id, reversion_de_asiento_id)
WHERE reversion_de_asiento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_asientos_contables_tenant_estado_fecha_383
ON public.asientos_contables (tenant_id, estado, fecha DESC);

-- Consistencia de tenant entre reversion y original: una reversion nunca
-- puede apuntar a un asiento de otra organizacion.
CREATE OR REPLACE FUNCTION app.enforce_asiento_reversion_tenant_383()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_original uuid;
  v_estado_original text;
BEGIN
  IF NEW.reversion_de_asiento_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reversion_de_asiento_id = NEW.id THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Un asiento no puede ser su propia reversion',
      ERRCODE = '23514';
  END IF;

  SELECT a.tenant_id, a.estado::text
    INTO v_tenant_original, v_estado_original
  FROM public.asientos_contables a
  WHERE a.id = NEW.reversion_de_asiento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      MESSAGE = format('Asiento a reversar no existe: %s', NEW.reversion_de_asiento_id),
      ERRCODE = '23503';
  END IF;

  IF v_tenant_original IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION USING
      MESSAGE = 'La reversion no pertenece al tenant del asiento original',
      ERRCODE = '23514';
  END IF;

  -- Solo se reversa lo que esta confirmado. Un borrador se edita o se
  -- descarta; un anulado ya no tiene efecto contable que revertir.
  IF upper(COALESCE(v_estado_original, '')) <> 'CONFIRMADO' THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Solo se puede reversar un asiento CONFIRMADO (estado actual: %s)',
        COALESCE(v_estado_original, 'NULO')
      ),
      ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_asiento_reversion_tenant_383 ON public.asientos_contables;
CREATE TRIGGER trg_enforce_asiento_reversion_tenant_383
BEFORE INSERT OR UPDATE OF reversion_de_asiento_id, tenant_id
ON public.asientos_contables
FOR EACH ROW
EXECUTE FUNCTION app.enforce_asiento_reversion_tenant_383();

-- ----------------------------------------------------------------------------
-- 2. Permisos RBAC de las transiciones nuevas.
--    Se aisla en una funcion idempotente para poder aplicarla a los tenants
--    que ya existen y engancharla al alta de tenants nuevos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sembrar_permisos_asientos_ciclo_vida(p_tenant_id uuid)
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
    ('contabilidad.asientos.actualizar'),
    ('contabilidad.asientos.eliminar'),
    ('contabilidad.asientos.confirmar'),
    ('contabilidad.asientos.anular'),
    ('contabilidad.asientos.reversar')
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

  -- ADMIN y CONTADOR son los roles con dominio sobre el libro diario. Se
  -- conceden con los mismos patrones que ya usa el catalogo canonico.
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true
  FROM public.roles r
  JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id
    AND upper(r.nombre) IN ('ADMIN', 'CONTADOR')
    AND COALESCE(r.activo, true) = true
    AND COALESCE(p.activo, true) = true
    AND lower(p.codigo) IN (
      'contabilidad.asientos.actualizar',
      'contabilidad.asientos.eliminar',
      'contabilidad.asientos.confirmar',
      'contabilidad.asientos.anular',
      'contabilidad.asientos.reversar'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.rol_permisos existing
      WHERE existing.role_id = r.id
        AND existing.permiso_id = p.id
    );

  RETURN v_seeded;
END;
$fn$;

GRANT EXECUTE ON FUNCTION app.sembrar_permisos_asientos_ciclo_vida(uuid) TO service_role;

-- Tenants existentes.
DO $$
DECLARE
  v_tenant record;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP
    PERFORM app.sembrar_permisos_asientos_ciclo_vida(v_tenant.id);
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Tenants futuros.
--    seed_operational_rbac_for_tenant clona de un tenant fuente cuando existe
--    (ese camino ya queda cubierto por el backfill de arriba) y cae en
--    sembrar_rbac_canonico cuando la base esta vacia. Para no duplicar el
--    catalogo canonico de ~200 permisos en este archivo -- con el riesgo de
--    divergencia que eso implica -- se envuelve la funcion existente en lugar
--    de reescribirla. La proxima migracion de RBAC deberia absorber estos
--    cinco codigos dentro de app.sembrar_rbac_canonico y retirar el wrapper.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app'
      AND p.proname = 'seed_operational_rbac_for_tenant'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app'
      AND p.proname = 'seed_operational_rbac_for_tenant_base_383'
  )
  THEN
    ALTER FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid)
      RENAME TO seed_operational_rbac_for_tenant_base_383;
  END IF;
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

  v_extra := app.sembrar_permisos_asientos_ciclo_vida(p_tenant_id);

  permisos_seeded := COALESCE(v_base.permisos_seeded, 0) + COALESCE(v_extra, 0);
  roles_seeded := COALESCE(v_base.roles_seeded, 0);
  role_permissions_seeded := COALESCE(v_base.role_permissions_seeded, 0);

  RETURN NEXT;
END;
$wrap$;

GRANT EXECUTE ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) TO service_role;

COMMIT;
