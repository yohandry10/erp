-- ============================================================================
-- 182__contabilidad_plantillas_runtime_alignment.sql
-- Alineacion runtime para plantillas contables:
-- plantillas_asientos, plantillas_asientos_detalle,
-- plantillas_asientos_historial, plantillas_asientos_ventas.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app.normalize_plantilla_estado(
  p_input text,
  p_default text DEFAULT 'ACTIVO'
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_estado text;
  v_default text;
BEGIN
  v_default := upper(COALESCE(NULLIF(btrim(p_default), ''), 'ACTIVO'));
  IF v_default NOT IN ('ACTIVO', 'INACTIVO', 'ARCHIVADA') THEN
    v_default := 'ACTIVO';
  END IF;

  v_estado := upper(COALESCE(NULLIF(btrim(p_input), ''), v_default));
  IF v_estado IN ('ACTIVO', 'INACTIVO', 'ARCHIVADA') THEN
    RETURN v_estado;
  END IF;

  IF v_estado IN ('HABILITADO', 'VIGENTE') THEN
    RETURN 'ACTIVO';
  END IF;
  IF v_estado IN ('DESHABILITADO', 'BORRADOR', 'PENDIENTE') THEN
    RETURN 'INACTIVO';
  END IF;
  IF v_estado IN ('ANULADO', 'ANULADA', 'ELIMINADO', 'ELIMINADA') THEN
    RETURN 'ARCHIVADA';
  END IF;

  RETURN v_default;
END;
$$;

-- ----------------------------------------------------------------------------
-- plantillas_asientos
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.plantillas_asientos
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS tipo_origen text,
  ADD COLUMN IF NOT EXISTS modulo text,
  ADD COLUMN IF NOT EXISTS requiere_centro_costo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS aplica_por_defecto boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.plantillas_asientos
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN nombre TYPE text USING NULLIF(btrim(COALESCE(nombre, '')), ''),
  ALTER COLUMN codigo TYPE text USING NULLIF(upper(btrim(COALESCE(codigo, ''))), ''),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN tipo_origen TYPE text USING upper(COALESCE(NULLIF(btrim(tipo_origen), ''), 'GENERAL')),
  ALTER COLUMN modulo TYPE text USING upper(COALESCE(NULLIF(btrim(modulo), ''), 'CONTABILIDAD')),
  ALTER COLUMN estado TYPE text USING app.normalize_plantilla_estado(estado, 'ACTIVO'),
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN requiere_centro_costo SET DEFAULT false,
  ALTER COLUMN aplica_por_defecto SET DEFAULT false,
  ALTER COLUMN activo SET DEFAULT true;

UPDATE public.plantillas_asientos p
SET
  nombre = COALESCE(NULLIF(btrim(COALESCE(p.nombre, '')), ''), 'Plantilla Contable'),
  codigo = COALESCE(
    NULLIF(upper(btrim(COALESCE(p.codigo, ''))), ''),
    format('PLA-%s', upper(left(replace(p.id::text, '-', ''), 8)))
  ),
  descripcion = COALESCE(
    NULLIF(btrim(COALESCE(p.descripcion, '')), ''),
    COALESCE(NULLIF(btrim(COALESCE(p.nombre, '')), ''), 'Plantilla Contable')
  ),
  tipo_origen = CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(p.tipo_origen, '')), ''), 'GENERAL'))
      IN ('GENERAL', 'VENTA', 'COMPRA', 'COBRO', 'PAGO', 'PLANILLA', 'DEPRECIACION', 'AJUSTE')
    THEN upper(COALESCE(NULLIF(btrim(COALESCE(p.tipo_origen, '')), ''), 'GENERAL'))
    ELSE 'GENERAL'
  END,
  modulo = COALESCE(NULLIF(upper(btrim(COALESCE(p.modulo, ''))), ''), 'CONTABILIDAD'),
  estado = app.normalize_plantilla_estado(p.estado, 'ACTIVO'),
  activo = CASE
    WHEN app.normalize_plantilla_estado(p.estado, 'ACTIVO') = 'ACTIVO'
    THEN COALESCE(p.activo, true)
    ELSE false
  END,
  metadata = COALESCE(p.metadata, '{}'::jsonb),
  requiere_centro_costo = COALESCE(p.requiere_centro_costo, false),
  aplica_por_defecto = COALESCE(p.aplica_por_defecto, false),
  updated_at = now()
WHERE p.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_plantillas_asientos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Plantilla Contable');
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('PLA-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );
  NEW.descripcion := COALESCE(NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''), NEW.nombre);
  NEW.tipo_origen := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_origen, '')), ''), 'GENERAL'));
  IF NEW.tipo_origen NOT IN ('GENERAL', 'VENTA', 'COMPRA', 'COBRO', 'PAGO', 'PLANILLA', 'DEPRECIACION', 'AJUSTE') THEN
    NEW.tipo_origen := 'GENERAL';
  END IF;
  NEW.modulo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.modulo, ''))), ''), 'CONTABILIDAD');
  NEW.estado := app.normalize_plantilla_estado(NEW.estado, 'ACTIVO');
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'ACTIVO');
  IF NEW.estado <> 'ACTIVO' THEN
    NEW.activo := false;
  END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.requiere_centro_costo := COALESCE(NEW.requiere_centro_costo, false);
  NEW.aplica_por_defecto := COALESCE(NEW.aplica_por_defecto, false);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_plantillas_asientos_row ON public.plantillas_asientos;
CREATE TRIGGER trg_normalize_plantillas_asientos_row
BEFORE INSERT OR UPDATE ON public.plantillas_asientos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_plantillas_asientos_row();

-- ----------------------------------------------------------------------------
-- plantillas_asientos_detalle
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.plantillas_asientos_detalle
  ADD COLUMN IF NOT EXISTS plantilla_id uuid,
  ADD COLUMN IF NOT EXISTS orden integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lado text DEFAULT 'DEBE',
  ADD COLUMN IF NOT EXISTS cuenta_codigo text,
  ADD COLUMN IF NOT EXISTS tipo_valor text DEFAULT 'FIJO',
  ADD COLUMN IF NOT EXISTS valor_base numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS porcentaje numeric(9,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS formula text,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.plantillas_asientos_detalle
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN plantilla_id TYPE uuid USING app.to_uuid_or_null(COALESCE(plantilla_id::text, '')),
  ALTER COLUMN nombre TYPE text USING NULLIF(btrim(COALESCE(nombre, '')), ''),
  ALTER COLUMN codigo TYPE text USING NULLIF(upper(btrim(COALESCE(codigo, ''))), ''),
  ALTER COLUMN orden TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(orden::text, '1')), 1),
  ALTER COLUMN lado TYPE text USING upper(COALESCE(NULLIF(btrim(lado), ''), 'DEBE')),
  ALTER COLUMN cuenta_codigo TYPE text USING NULLIF(upper(btrim(COALESCE(cuenta_codigo, ''))), ''),
  ALTER COLUMN tipo_valor TYPE text USING upper(COALESCE(NULLIF(btrim(tipo_valor), ''), 'FIJO')),
  ALTER COLUMN valor_base TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(valor_base::text, '0')), 0),
  ALTER COLUMN porcentaje TYPE numeric(9,6) USING LEAST(GREATEST(app.to_numeric_or_zero(COALESCE(porcentaje::text, '0')), 0), 1),
  ALTER COLUMN formula TYPE text USING NULLIF(btrim(COALESCE(formula, '')), ''),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN estado TYPE text USING app.normalize_plantilla_estado(estado, 'ACTIVO'),
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN activo SET DEFAULT true;

UPDATE public.plantillas_asientos_detalle d
SET
  nombre = COALESCE(NULLIF(btrim(COALESCE(d.nombre, '')), ''), 'Linea Plantilla'),
  codigo = COALESCE(
    NULLIF(upper(btrim(COALESCE(d.codigo, ''))), ''),
    format('PLD-%s', upper(left(replace(d.id::text, '-', ''), 8)))
  ),
  orden = GREATEST(COALESCE(d.orden, 1), 1),
  lado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(d.lado, '')), ''), 'DEBE')) IN ('DEBE', 'HABER')
    THEN upper(COALESCE(NULLIF(btrim(COALESCE(d.lado, '')), ''), 'DEBE'))
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(d.lado, '')), ''), 'DEBE')) IN ('DEBITO', 'CARGO')
    THEN 'DEBE'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(d.lado, '')), ''), 'DEBE')) IN ('CREDITO', 'ABONO')
    THEN 'HABER'
    ELSE 'DEBE'
  END,
  cuenta_codigo = COALESCE(
    NULLIF(upper(btrim(COALESCE(d.cuenta_codigo, ''))), ''),
    CASE
      WHEN d.codigo ~ '^[0-9]{2,8}$' THEN upper(btrim(d.codigo))
      ELSE NULL
    END
  ),
  tipo_valor = CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(d.tipo_valor, '')), ''), 'FIJO')) IN ('FIJO', 'PORCENTAJE', 'FORMULA')
    THEN upper(COALESCE(NULLIF(btrim(COALESCE(d.tipo_valor, '')), ''), 'FIJO'))
    ELSE 'FIJO'
  END,
  valor_base = GREATEST(COALESCE(d.valor_base, 0), 0),
  porcentaje = LEAST(GREATEST(COALESCE(d.porcentaje, 0), 0), 1),
  formula = NULLIF(btrim(COALESCE(d.formula, '')), ''),
  descripcion = COALESCE(NULLIF(btrim(COALESCE(d.descripcion, '')), ''), COALESCE(NULLIF(btrim(COALESCE(d.nombre, '')), ''), 'Linea Plantilla')),
  estado = app.normalize_plantilla_estado(d.estado, 'ACTIVO'),
  activo = CASE
    WHEN app.normalize_plantilla_estado(d.estado, 'ACTIVO') = 'ACTIVO'
    THEN COALESCE(d.activo, true)
    ELSE false
  END,
  metadata = COALESCE(d.metadata, '{}'::jsonb),
  updated_at = now()
WHERE d.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_plantillas_asientos_detalle_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.plantilla_id := app.to_uuid_or_null(COALESCE(NEW.plantilla_id::text, ''));
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Linea Plantilla');
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('PLD-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );
  NEW.orden := GREATEST(COALESCE(NEW.orden, 1), 1);
  NEW.lado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.lado, '')), ''), 'DEBE'));
  IF NEW.lado IN ('DEBITO', 'CARGO') THEN NEW.lado := 'DEBE'; END IF;
  IF NEW.lado IN ('CREDITO', 'ABONO') THEN NEW.lado := 'HABER'; END IF;
  IF NEW.lado NOT IN ('DEBE', 'HABER') THEN NEW.lado := 'DEBE'; END IF;
  NEW.cuenta_codigo := NULLIF(upper(btrim(COALESCE(NEW.cuenta_codigo, ''))), '');
  NEW.tipo_valor := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_valor, '')), ''), 'FIJO'));
  IF NEW.tipo_valor NOT IN ('FIJO', 'PORCENTAJE', 'FORMULA') THEN NEW.tipo_valor := 'FIJO'; END IF;
  NEW.valor_base := GREATEST(COALESCE(NEW.valor_base, 0), 0);
  NEW.porcentaje := LEAST(GREATEST(COALESCE(NEW.porcentaje, 0), 0), 1);
  NEW.formula := NULLIF(btrim(COALESCE(NEW.formula, '')), '');
  NEW.descripcion := COALESCE(NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''), NEW.nombre);
  NEW.estado := app.normalize_plantilla_estado(NEW.estado, 'ACTIVO');
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'ACTIVO');
  IF NEW.estado <> 'ACTIVO' THEN
    NEW.activo := false;
  END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_plantillas_asientos_detalle_row ON public.plantillas_asientos_detalle;
CREATE TRIGGER trg_normalize_plantillas_asientos_detalle_row
BEFORE INSERT OR UPDATE ON public.plantillas_asientos_detalle
FOR EACH ROW
EXECUTE FUNCTION app.normalize_plantillas_asientos_detalle_row();

-- ----------------------------------------------------------------------------
-- plantillas_asientos_historial
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.plantillas_asientos_historial
  ADD COLUMN IF NOT EXISTS plantilla_id uuid,
  ADD COLUMN IF NOT EXISTS asiento_id uuid,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS fecha_generacion date,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS mensaje_error text,
  ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS usuario_id uuid;

ALTER TABLE IF EXISTS public.plantillas_asientos_historial
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN plantilla_id TYPE uuid USING app.to_uuid_or_null(COALESCE(plantilla_id::text, '')),
  ALTER COLUMN asiento_id TYPE uuid USING app.to_uuid_or_null(COALESCE(asiento_id::text, '')),
  ALTER COLUMN usuario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_id::text, '')),
  ALTER COLUMN nombre TYPE text USING NULLIF(btrim(COALESCE(nombre, '')), ''),
  ALTER COLUMN codigo TYPE text USING NULLIF(upper(btrim(COALESCE(codigo, ''))), ''),
  ALTER COLUMN periodo TYPE text USING (
    CASE
      WHEN NULLIF(regexp_replace(COALESCE(periodo::text, ''), '\s+', '', 'g'), '') ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
        THEN NULLIF(regexp_replace(COALESCE(periodo::text, ''), '\s+', '', 'g'), '')
      WHEN NULLIF(regexp_replace(COALESCE(periodo::text, ''), '\s+', '', 'g'), '') ~ '^[0-9]{6}$'
        THEN substr(NULLIF(regexp_replace(COALESCE(periodo::text, ''), '\s+', '', 'g'), ''), 1, 4)
             || '-' ||
             substr(NULLIF(regexp_replace(COALESCE(periodo::text, ''), '\s+', '', 'g'), ''), 5, 2)
      ELSE NULL
    END
  ),
  ALTER COLUMN fecha_generacion TYPE date USING app.to_date_or_null(COALESCE(fecha_generacion::text, '')),
  ALTER COLUMN referencia TYPE text USING NULLIF(btrim(COALESCE(referencia, '')), ''),
  ALTER COLUMN mensaje_error TYPE text USING NULLIF(btrim(COALESCE(mensaje_error, '')), ''),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'GENERADO')),
  ALTER COLUMN payload SET DEFAULT '{}'::jsonb,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.plantillas_asientos_historial h
SET
  nombre = COALESCE(NULLIF(btrim(COALESCE(h.nombre, '')), ''), 'Ejecucion Plantilla'),
  codigo = COALESCE(
    NULLIF(upper(btrim(COALESCE(h.codigo, ''))), ''),
    format('PLH-%s', upper(left(replace(h.id::text, '-', ''), 8)))
  ),
  fecha_generacion = COALESCE(h.fecha_generacion, h.created_at::date, current_date),
  periodo = CASE
    WHEN NULLIF(regexp_replace(COALESCE(h.periodo, ''), '\s+', '', 'g'), '') ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      THEN NULLIF(regexp_replace(COALESCE(h.periodo, ''), '\s+', '', 'g'), '')
    WHEN NULLIF(regexp_replace(COALESCE(h.periodo, ''), '\s+', '', 'g'), '') ~ '^[0-9]{6}$'
      THEN substr(NULLIF(regexp_replace(COALESCE(h.periodo, ''), '\s+', '', 'g'), ''), 1, 4)
           || '-' ||
           substr(NULLIF(regexp_replace(COALESCE(h.periodo, ''), '\s+', '', 'g'), ''), 5, 2)
    ELSE to_char(COALESCE(h.fecha_generacion, h.created_at::date, current_date), 'YYYY-MM')
  END,
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(h.estado), ''), 'GENERADO')) IN ('GENERADO', 'ERROR', 'PENDIENTE', 'ANULADO')
    THEN upper(COALESCE(NULLIF(btrim(h.estado), ''), 'GENERADO'))
    WHEN upper(COALESCE(NULLIF(btrim(h.estado), ''), 'GENERADO')) = 'ACTIVO' THEN 'GENERADO'
    WHEN upper(COALESCE(NULLIF(btrim(h.estado), ''), 'GENERADO')) = 'INACTIVO' THEN 'ANULADO'
    ELSE 'GENERADO'
  END,
  payload = COALESCE(h.payload, '{}'::jsonb),
  metadata = COALESCE(h.metadata, '{}'::jsonb),
  updated_at = now()
WHERE h.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_plantillas_asientos_historial_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_periodo text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.plantilla_id := app.to_uuid_or_null(COALESCE(NEW.plantilla_id::text, ''));
  NEW.asiento_id := app.to_uuid_or_null(COALESCE(NEW.asiento_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Ejecucion Plantilla');
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('PLH-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );
  NEW.fecha_generacion := COALESCE(
    app.to_date_or_null(COALESCE(NEW.fecha_generacion::text, '')),
    NEW.created_at::date,
    current_date
  );

  v_periodo := NULLIF(regexp_replace(COALESCE(NEW.periodo, ''), '\s+', '', 'g'), '');
  IF v_periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    NEW.periodo := v_periodo;
  ELSIF v_periodo ~ '^[0-9]{6}$' THEN
    NEW.periodo := substr(v_periodo, 1, 4) || '-' || substr(v_periodo, 5, 2);
  ELSE
    NEW.periodo := to_char(COALESCE(NEW.fecha_generacion, current_date), 'YYYY-MM');
  END IF;

  NEW.referencia := NULLIF(btrim(COALESCE(NEW.referencia, '')), '');
  NEW.mensaje_error := NULLIF(btrim(COALESCE(NEW.mensaje_error, '')), '');
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'GENERADO'));
  IF NEW.estado = 'ACTIVO' THEN NEW.estado := 'GENERADO'; END IF;
  IF NEW.estado = 'INACTIVO' THEN NEW.estado := 'ANULADO'; END IF;
  IF NEW.estado NOT IN ('GENERADO', 'ERROR', 'PENDIENTE', 'ANULADO') THEN
    NEW.estado := 'GENERADO';
  END IF;
  NEW.payload := COALESCE(NEW.payload, '{}'::jsonb);
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_plantillas_asientos_historial_row ON public.plantillas_asientos_historial;
CREATE TRIGGER trg_normalize_plantillas_asientos_historial_row
BEFORE INSERT OR UPDATE ON public.plantillas_asientos_historial
FOR EACH ROW
EXECUTE FUNCTION app.normalize_plantillas_asientos_historial_row();

-- ----------------------------------------------------------------------------
-- plantillas_asientos_ventas
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.plantillas_asientos_ventas
  ADD COLUMN IF NOT EXISTS pais_id bigint,
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS cuenta_debe_codigo text,
  ADD COLUMN IF NOT EXISTS cuenta_haber_ventas_codigo text,
  ADD COLUMN IF NOT EXISTS cuenta_haber_impuesto_codigo text,
  ADD COLUMN IF NOT EXISTS cuenta_debe_retencion_codigo text,
  ADD COLUMN IF NOT EXISTS cuenta_haber_percepcion_codigo text,
  ADD COLUMN IF NOT EXISTS prioridad integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.plantillas_asientos_ventas
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN pais_id TYPE bigint USING (
    CASE
      WHEN NULLIF(regexp_replace(COALESCE(pais_id::text, ''), '[^0-9]', '', 'g'), '') IS NULL THEN NULL
      ELSE NULLIF(regexp_replace(COALESCE(pais_id::text, ''), '[^0-9]', '', 'g'), '')::bigint
    END
  ),
  ALTER COLUMN nombre TYPE text USING NULLIF(btrim(COALESCE(nombre, '')), ''),
  ALTER COLUMN codigo TYPE text USING NULLIF(upper(btrim(COALESCE(codigo, ''))), ''),
  ALTER COLUMN tipo_documento TYPE text USING NULLIF(upper(btrim(COALESCE(tipo_documento, ''))), ''),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN cuenta_debe_codigo TYPE text USING NULLIF(upper(btrim(COALESCE(cuenta_debe_codigo, ''))), ''),
  ALTER COLUMN cuenta_haber_ventas_codigo TYPE text USING NULLIF(upper(btrim(COALESCE(cuenta_haber_ventas_codigo, ''))), ''),
  ALTER COLUMN cuenta_haber_impuesto_codigo TYPE text USING NULLIF(upper(btrim(COALESCE(cuenta_haber_impuesto_codigo, ''))), ''),
  ALTER COLUMN cuenta_debe_retencion_codigo TYPE text USING NULLIF(upper(btrim(COALESCE(cuenta_debe_retencion_codigo, ''))), ''),
  ALTER COLUMN cuenta_haber_percepcion_codigo TYPE text USING NULLIF(upper(btrim(COALESCE(cuenta_haber_percepcion_codigo, ''))), ''),
  ALTER COLUMN prioridad TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(prioridad::text, '100')), 1),
  ALTER COLUMN moneda TYPE text USING COALESCE(NULLIF(upper(btrim(COALESCE(moneda, ''))), ''), 'PEN'),
  ALTER COLUMN estado TYPE text USING app.normalize_plantilla_estado(estado, 'ACTIVO'),
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN prioridad SET DEFAULT 100,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN activo SET DEFAULT true;

UPDATE public.plantillas_asientos_ventas pv
SET
  pais_id = COALESCE(
    pv.pais_id,
    (SELECT p.id FROM public.paises p WHERE upper(p.codigo_iso) IN ('PE', 'PER') ORDER BY p.id LIMIT 1),
    1
  ),
  tipo_documento = COALESCE(
    NULLIF(upper(btrim(COALESCE(pv.tipo_documento, ''))), ''),
    CASE
      WHEN upper(COALESCE(pv.codigo, '')) LIKE '%BOL%' THEN '03'
      WHEN upper(COALESCE(pv.codigo, '')) LIKE '%NC%' THEN '07'
      WHEN upper(COALESCE(pv.codigo, '')) LIKE '%ND%' THEN '08'
      ELSE '01'
    END
  ),
  nombre = COALESCE(NULLIF(btrim(COALESCE(pv.nombre, '')), ''), 'Plantilla Venta'),
  codigo = COALESCE(
    NULLIF(upper(btrim(COALESCE(pv.codigo, ''))), ''),
    format('PAV-%s', upper(left(replace(pv.id::text, '-', ''), 8)))
  ),
  descripcion = COALESCE(
    NULLIF(btrim(COALESCE(pv.descripcion, '')), ''),
    format('Plantilla contable ventas %s', COALESCE(NULLIF(upper(btrim(COALESCE(pv.tipo_documento, ''))), ''), '01'))
  ),
  cuenta_debe_codigo = COALESCE(NULLIF(upper(btrim(COALESCE(pv.cuenta_debe_codigo, ''))), ''), '12'),
  cuenta_haber_ventas_codigo = COALESCE(NULLIF(upper(btrim(COALESCE(pv.cuenta_haber_ventas_codigo, ''))), ''), '70'),
  cuenta_haber_impuesto_codigo = COALESCE(NULLIF(upper(btrim(COALESCE(pv.cuenta_haber_impuesto_codigo, ''))), ''), '40'),
  cuenta_debe_retencion_codigo = NULLIF(upper(btrim(COALESCE(pv.cuenta_debe_retencion_codigo, ''))), ''),
  cuenta_haber_percepcion_codigo = NULLIF(upper(btrim(COALESCE(pv.cuenta_haber_percepcion_codigo, ''))), ''),
  prioridad = GREATEST(COALESCE(pv.prioridad, 100), 1),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(pv.moneda, ''))), ''), 'PEN'),
  estado = app.normalize_plantilla_estado(pv.estado, 'ACTIVO'),
  activo = CASE
    WHEN app.normalize_plantilla_estado(pv.estado, 'ACTIVO') = 'ACTIVO'
    THEN COALESCE(pv.activo, true)
    ELSE false
  END,
  metadata = COALESCE(pv.metadata, '{}'::jsonb),
  updated_at = now()
WHERE pv.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_plantillas_asientos_ventas_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Plantilla Venta');
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('PAV-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );
  NEW.tipo_documento := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_documento, '')), ''), '01'));
  IF NEW.tipo_documento = 'FACTURA' THEN NEW.tipo_documento := '01'; END IF;
  IF NEW.tipo_documento = 'BOLETA' THEN NEW.tipo_documento := '03'; END IF;
  IF NEW.tipo_documento IN ('NC', 'NOTA_CREDITO') THEN NEW.tipo_documento := '07'; END IF;
  IF NEW.tipo_documento IN ('ND', 'NOTA_DEBITO') THEN NEW.tipo_documento := '08'; END IF;
  IF NEW.tipo_documento !~ '^[A-Z0-9]{2,6}$' THEN NEW.tipo_documento := '01'; END IF;
  NEW.descripcion := COALESCE(NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''), format('Plantilla contable ventas %s', NEW.tipo_documento));
  NEW.cuenta_debe_codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.cuenta_debe_codigo, ''))), ''), '12');
  NEW.cuenta_haber_ventas_codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.cuenta_haber_ventas_codigo, ''))), ''), '70');
  NEW.cuenta_haber_impuesto_codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.cuenta_haber_impuesto_codigo, ''))), ''), '40');
  NEW.cuenta_debe_retencion_codigo := NULLIF(upper(btrim(COALESCE(NEW.cuenta_debe_retencion_codigo, ''))), '');
  NEW.cuenta_haber_percepcion_codigo := NULLIF(upper(btrim(COALESCE(NEW.cuenta_haber_percepcion_codigo, ''))), '');
  NEW.prioridad := GREATEST(COALESCE(NEW.prioridad, 100), 1);
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.estado := app.normalize_plantilla_estado(NEW.estado, 'ACTIVO');
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'ACTIVO');
  IF NEW.estado <> 'ACTIVO' THEN
    NEW.activo := false;
  END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_plantillas_asientos_ventas_row ON public.plantillas_asientos_ventas;
CREATE TRIGGER trg_normalize_plantillas_asientos_ventas_row
BEFORE INSERT OR UPDATE ON public.plantillas_asientos_ventas
FOR EACH ROW
EXECUTE FUNCTION app.normalize_plantillas_asientos_ventas_row();

-- Seed minimo global para flujo de asientos por CPE.
WITH base AS (
  SELECT COALESCE(
    (SELECT p.id FROM public.paises p WHERE upper(p.codigo_iso) IN ('PE', 'PER') ORDER BY p.id LIMIT 1),
    1::bigint
  ) AS pais_id
),
defs AS (
  SELECT *
  FROM (VALUES
    ('01', 'Plantilla Venta Factura', 'PAV-01-PE', '12', '70', '40'),
    ('03', 'Plantilla Venta Boleta', 'PAV-03-PE', '12', '70', '40'),
    ('07', 'Plantilla Nota Credito', 'PAV-07-PE', '12', '70', '40'),
    ('08', 'Plantilla Nota Debito', 'PAV-08-PE', '12', '70', '40')
  ) t(tipo_documento, nombre, codigo, cuenta_debe, cuenta_haber_ventas, cuenta_haber_impuesto)
)
INSERT INTO public.plantillas_asientos_ventas (
  tenant_id,
  pais_id,
  tipo_documento,
  nombre,
  codigo,
  descripcion,
  cuenta_debe_codigo,
  cuenta_haber_ventas_codigo,
  cuenta_haber_impuesto_codigo,
  prioridad,
  moneda,
  estado,
  activo,
  metadata
)
SELECT
  NULL,
  b.pais_id,
  d.tipo_documento,
  d.nombre,
  d.codigo,
  format('Seed runtime base para documento %s', d.tipo_documento),
  d.cuenta_debe,
  d.cuenta_haber_ventas,
  d.cuenta_haber_impuesto,
  100,
  'PEN',
  'ACTIVO',
  true,
  jsonb_build_object('seed_runtime', true, 'source', '182')
FROM base b
CROSS JOIN defs d
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plantillas_asientos_ventas pv
  WHERE pv.pais_id = b.pais_id
    AND upper(btrim(COALESCE(pv.tipo_documento, ''))) = d.tipo_documento
    AND COALESCE(pv.activo, true) = true
);

-- Indices runtime
CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_tenant_estado_modulo_runtime
ON public.plantillas_asientos (tenant_id, estado, modulo, tipo_origen);

CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_detalle_plantilla_orden_runtime
ON public.plantillas_asientos_detalle (tenant_id, plantilla_id, orden);

CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_historial_tenant_fecha_runtime
ON public.plantillas_asientos_historial (tenant_id, fecha_generacion DESC, estado);

CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_ventas_runtime_lookup
ON public.plantillas_asientos_ventas (pais_id, tipo_documento, activo, tenant_id);

COMMIT;
