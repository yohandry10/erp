-- ============================================================================
-- 384__contabilidad_multimoneda_y_diferencia_de_cambio.sql
-- La tabla tipos_cambio existia como cascaron del skeleton generico: 8 columnas
-- (nombre, codigo, estado, metadata, ...) y ni una sola columna de negocio.
-- Ningun servicio la leia. Al mismo tiempo, cuentas_por_cobrar y
-- cuentas_por_pagar guardan su importe en la moneda del documento pero no
-- registran a que tipo de cambio se contabilizaron, de modo que era imposible
-- calcular la diferencia de cambio de un saldo en moneda extranjera.
--
-- Esta migracion convierte tipos_cambio en un catalogo real de cotizaciones y
-- deja registrado el tipo de cambio de origen en las cuentas por cobrar y por
-- pagar, que es lo que permite revaluar saldos al cierre.
--
-- Objetos foco:
--   public.tipos_cambio (columnas de negocio + unicidad)
--   public.cuentas_por_cobrar.tipo_cambio_origen
--   public.cuentas_por_pagar.tipo_cambio_origen
--   public.detalle_asientos (moneda, importe_moneda_origen, tipo_cambio)
--   app.sembrar_permisos_contabilidad_multimoneda(uuid)
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

-- ----------------------------------------------------------------------------
-- 1. Catalogo de cotizaciones.
--    compra y venta se guardan por separado porque la normativa peruana exige
--    valuar activos al tipo de cambio compra y pasivos al de venta. Los paises
--    que publican una unica cotizacion repiten el mismo valor en ambas.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.tipos_cambio
  ADD COLUMN IF NOT EXISTS moneda_origen text,
  ADD COLUMN IF NOT EXISTS moneda_destino text,
  ADD COLUMN IF NOT EXISTS fecha date,
  ADD COLUMN IF NOT EXISTS compra numeric(18,6),
  ADD COLUMN IF NOT EXISTS venta numeric(18,6),
  ADD COLUMN IF NOT EXISTS fuente text,
  ADD COLUMN IF NOT EXISTS created_by text;

COMMENT ON COLUMN public.tipos_cambio.moneda_origen IS
  'Moneda cotizada en ISO 4217 (ej. USD).';
COMMENT ON COLUMN public.tipos_cambio.moneda_destino IS
  'Moneda en la que se expresa la cotizacion, normalmente la moneda local del tenant.';
COMMENT ON COLUMN public.tipos_cambio.fuente IS
  'Origen del dato: SUNAT, BCRA, MANUAL, etc.';

-- Normalizacion de codigos ISO y validacion de importes. Un tipo de cambio
-- negativo o cero corrompe silenciosamente toda valuacion posterior.
CREATE OR REPLACE FUNCTION app.normalize_tipos_cambio_384()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.moneda_origen := upper(btrim(COALESCE(NEW.moneda_origen, '')));
  NEW.moneda_destino := upper(btrim(COALESCE(NEW.moneda_destino, '')));
  NEW.fuente := upper(btrim(COALESCE(NEW.fuente, 'MANUAL')));

  IF NEW.moneda_origen = '' OR NEW.moneda_destino = '' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'moneda_origen y moneda_destino son obligatorias en tipos_cambio',
      ERRCODE = '23514';
  END IF;

  IF NEW.moneda_origen = NEW.moneda_destino THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Un tipo de cambio no puede tener la misma moneda de origen y destino',
      ERRCODE = '23514';
  END IF;

  IF NEW.fecha IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'La fecha es obligatoria en tipos_cambio',
      ERRCODE = '23514';
  END IF;

  -- Si solo se informa una de las dos cotizaciones se replica en la otra: es
  -- el caso de los paises con cotizacion unica.
  NEW.compra := COALESCE(NEW.compra, NEW.venta);
  NEW.venta := COALESCE(NEW.venta, NEW.compra);

  IF NEW.compra IS NULL OR NEW.venta IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Debe informarse al menos una cotizacion (compra o venta)',
      ERRCODE = '23514';
  END IF;

  IF NEW.compra <= 0 OR NEW.venta <= 0 THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Las cotizaciones deben ser mayores a cero',
      ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_tipos_cambio_384 ON public.tipos_cambio;
CREATE TRIGGER trg_normalize_tipos_cambio_384
BEFORE INSERT OR UPDATE ON public.tipos_cambio
FOR EACH ROW
EXECUTE FUNCTION app.normalize_tipos_cambio_384();

-- Una sola cotizacion por par y fecha. Sin esto, dos cargas del mismo dia
-- darian valuaciones distintas segun cual leyese la consulta.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tipos_cambio_tenant_par_fecha
ON public.tipos_cambio (tenant_id, moneda_origen, moneda_destino, fecha)
WHERE moneda_origen IS NOT NULL
  AND moneda_destino IS NOT NULL
  AND fecha IS NOT NULL;

-- La busqueda dominante es "la cotizacion vigente a una fecha": el par fijo y
-- la fecha descendente.
CREATE INDEX IF NOT EXISTS idx_tipos_cambio_tenant_par_fecha_desc
ON public.tipos_cambio (tenant_id, moneda_origen, moneda_destino, fecha DESC);

-- ----------------------------------------------------------------------------
-- 2. Tipo de cambio de origen en las posiciones monetarias.
--    saldo/total ya estan expresados en la moneda del documento; lo que faltaba
--    es a que cotizacion se llevaron a moneda local, sin lo cual la diferencia
--    de cambio no es calculable.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS tipo_cambio_origen numeric(18,6);

ALTER TABLE IF EXISTS public.cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS tipo_cambio_origen numeric(18,6);

COMMENT ON COLUMN public.cuentas_por_cobrar.tipo_cambio_origen IS
  'Cotizacion usada al contabilizar el documento. Base de la diferencia de cambio.';
COMMENT ON COLUMN public.cuentas_por_pagar.tipo_cambio_origen IS
  'Cotizacion usada al contabilizar el documento. Base de la diferencia de cambio.';

-- Solo las posiciones en moneda extranjera con cotizacion de origen conocida
-- son revaluables; el indice sirve exactamente a esa consulta.
CREATE INDEX IF NOT EXISTS idx_cxc_revaluables_384
ON public.cuentas_por_cobrar (tenant_id, moneda)
WHERE tipo_cambio_origen IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cxp_revaluables_384
ON public.cuentas_por_pagar (tenant_id, moneda)
WHERE tipo_cambio_origen IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Moneda a nivel de linea de asiento.
--    debe/haber siguen siendo siempre moneda local: los libros y los estados
--    financieros no cambian de unidad. Estas columnas conservan el importe
--    original y la cotizacion aplicada, que es lo que el contador necesita ver
--    en el mayor de una cuenta en moneda extranjera.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.detalle_asientos
  ADD COLUMN IF NOT EXISTS moneda text,
  ADD COLUMN IF NOT EXISTS importe_moneda_origen numeric(14,2),
  ADD COLUMN IF NOT EXISTS tipo_cambio numeric(18,6);

COMMENT ON COLUMN public.detalle_asientos.moneda IS
  'Moneda del importe original. NULL significa moneda local del tenant.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_detalle_asientos_moneda_coherente_384'
  ) THEN
    ALTER TABLE public.detalle_asientos
      ADD CONSTRAINT ck_detalle_asientos_moneda_coherente_384
      CHECK (
        -- O la linea es en moneda local (sin datos de cambio), o trae el juego
        -- completo. Una moneda sin cotizacion no es interpretable.
        (moneda IS NULL AND importe_moneda_origen IS NULL AND tipo_cambio IS NULL)
        OR (moneda IS NOT NULL AND importe_moneda_origen IS NOT NULL AND tipo_cambio IS NOT NULL AND tipo_cambio > 0)
      )
      NOT VALID;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Permisos RBAC.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sembrar_permisos_contabilidad_multimoneda(p_tenant_id uuid)
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
    ('contabilidad.tipos_cambio.read'),
    ('contabilidad.tipos_cambio.crear'),
    ('contabilidad.tipos_cambio.actualizar'),
    ('contabilidad.tipos_cambio.eliminar'),
    ('contabilidad.revaluacion.simular'),
    ('contabilidad.revaluacion.ejecutar')
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

  -- ADMIN y CONTADOR ejecutan; FINANZAS y GERENCIA solo consultan y simulan,
  -- porque la revaluacion genera un asiento y esa es una decision contable.
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
        AND lower(p.codigo) IN (
          'contabilidad.tipos_cambio.read',
          'contabilidad.tipos_cambio.crear',
          'contabilidad.tipos_cambio.actualizar',
          'contabilidad.tipos_cambio.eliminar',
          'contabilidad.revaluacion.simular',
          'contabilidad.revaluacion.ejecutar'
        )
      )
      OR (
        upper(r.nombre) IN ('FINANZAS', 'GERENCIA')
        AND lower(p.codigo) IN (
          'contabilidad.tipos_cambio.read',
          'contabilidad.revaluacion.simular'
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

GRANT EXECUTE ON FUNCTION app.sembrar_permisos_contabilidad_multimoneda(uuid) TO service_role;

DO $$
DECLARE
  v_tenant record;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP
    PERFORM app.sembrar_permisos_contabilidad_multimoneda(v_tenant.id);
  END LOOP;
END;
$$;

-- El wrapper de la 383 ya intercepta el alta de tenants nuevos; aqui solo se
-- añade la segunda tanda de permisos al mismo punto.
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
  v_ciclo_vida integer := 0;
  v_multimoneda integer := 0;
BEGIN
  SELECT * INTO v_base
  FROM app.seed_operational_rbac_for_tenant_base_383(p_tenant_id, p_source_tenant_id);

  v_ciclo_vida := app.sembrar_permisos_asientos_ciclo_vida(p_tenant_id);
  v_multimoneda := app.sembrar_permisos_contabilidad_multimoneda(p_tenant_id);

  permisos_seeded := COALESCE(v_base.permisos_seeded, 0)
    + COALESCE(v_ciclo_vida, 0)
    + COALESCE(v_multimoneda, 0);
  roles_seeded := COALESCE(v_base.roles_seeded, 0);
  role_permissions_seeded := COALESCE(v_base.role_permissions_seeded, 0);

  RETURN NEXT;
END;
$wrap$;

GRANT EXECUTE ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) TO service_role;

COMMIT;
