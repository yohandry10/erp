-- ============================================================================
-- 173__fiscal_baja_resumen_runtime_alignment.sql
-- Alineacion runtime para flujo fiscal SUNAT:
-- comunicaciones_baja, detalle_comunicacion_baja,
-- resumenes_diarios, detalle_resumen_diario, validaciones_sunat.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- comunicaciones_baja
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.comunicaciones_baja
  ADD COLUMN IF NOT EXISTS motivo_baja text,
  ADD COLUMN IF NOT EXISTS intentos_envio integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_error text,
  ADD COLUMN IF NOT EXISTS codigo_hash text,
  ADD COLUMN IF NOT EXISTS enviado_en timestamptz,
  ADD COLUMN IF NOT EXISTS respondido_en timestamptz;

ALTER TABLE IF EXISTS public.comunicaciones_baja
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN numero_comunicacion TYPE text USING NULLIF(upper(btrim(COALESCE(numero_comunicacion, ''))), ''),
  ALTER COLUMN fecha_generacion TYPE date USING app.to_date_or_null(COALESCE(fecha_generacion::text, '')),
  ALTER COLUMN fecha_comunicacion TYPE date USING app.to_date_or_null(COALESCE(fecha_comunicacion::text, '')),
  ALTER COLUMN cantidad_comprobantes TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(cantidad_comprobantes::text, '0')), 0),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')),
  ALTER COLUMN generado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(generado_por::text, '')),
  ALTER COLUMN enviado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(enviado_por::text, '')),
  ALTER COLUMN fecha_envio TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_envio::text, '')),
  ALTER COLUMN fecha_respuesta TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_respuesta::text, '')),
  ALTER COLUMN intentos_envio TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(intentos_envio::text, '0')), 0),
  ALTER COLUMN enviado_en TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(enviado_en::text, '')),
  ALTER COLUMN respondido_en TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(respondido_en::text, '')),
  ALTER COLUMN comprobantes_ids SET DEFAULT '{}'::uuid[],
  ALTER COLUMN cantidad_comprobantes SET DEFAULT 0,
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE',
  ALTER COLUMN intentos_envio SET DEFAULT 0,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.comunicaciones_baja cb
SET
  fecha_generacion = COALESCE(cb.fecha_generacion, cb.created_at::date, current_date),
  fecha_comunicacion = COALESCE(cb.fecha_comunicacion, cb.fecha_generacion, cb.created_at::date, current_date),
  numero_comunicacion = COALESCE(
    NULLIF(upper(btrim(COALESCE(cb.numero_comunicacion, ''))), ''),
    format('RA-%s-%s', to_char(COALESCE(cb.fecha_generacion, current_date), 'YYYYMMDD'), upper(left(replace(cb.id::text, '-', ''), 6)))
  ),
  comprobantes_ids = COALESCE(cb.comprobantes_ids, '{}'::uuid[]),
  cantidad_comprobantes = CASE
    WHEN cardinality(COALESCE(cb.comprobantes_ids, '{}'::uuid[])) > 0 THEN cardinality(COALESCE(cb.comprobantes_ids, '{}'::uuid[]))
    ELSE GREATEST(COALESCE(cb.cantidad_comprobantes, 0), 0)
  END,
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(cb.estado), ''), 'PENDIENTE')) IN ('PENDIENTE','GENERADO','ENVIADO','ACEPTADO','RECHAZADO','ERROR','ANULADO') THEN upper(COALESCE(NULLIF(btrim(cb.estado), ''), 'PENDIENTE'))
    WHEN upper(COALESCE(NULLIF(btrim(cb.estado), ''), 'PENDIENTE')) = 'ACTIVO' THEN 'PENDIENTE'
    WHEN upper(COALESCE(NULLIF(btrim(cb.estado), ''), 'PENDIENTE')) = 'INACTIVO' THEN 'ANULADO'
    ELSE 'PENDIENTE'
  END,
  codigo_hash = COALESCE(NULLIF(btrim(COALESCE(cb.codigo_hash, '')), ''), NULLIF(btrim(COALESCE(cb.hash_xml, '')), '')),
  enviado_en = COALESCE(cb.enviado_en, cb.fecha_envio),
  respondido_en = COALESCE(cb.respondido_en, cb.fecha_respuesta),
  intentos_envio = GREATEST(COALESCE(cb.intentos_envio, 0), 0),
  motivo_baja = NULLIF(btrim(COALESCE(cb.motivo_baja, '')), ''),
  ultimo_error = NULLIF(btrim(COALESCE(cb.ultimo_error, '')), ''),
  metadata = COALESCE(cb.metadata, '{}'::jsonb),
  updated_at = now()
WHERE cb.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_comunicaciones_baja_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.fecha_generacion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_generacion::text, '')), NEW.created_at::date, current_date);
  NEW.fecha_comunicacion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_comunicacion::text, '')), NEW.fecha_generacion);
  NEW.numero_comunicacion := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.numero_comunicacion, ''))), ''), format('RA-%s-%s', to_char(NEW.fecha_generacion, 'YYYYMMDD'), upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 6))));
  NEW.comprobantes_ids := COALESCE(NEW.comprobantes_ids, '{}'::uuid[]);
  NEW.cantidad_comprobantes := CASE WHEN cardinality(NEW.comprobantes_ids) > 0 THEN cardinality(NEW.comprobantes_ids) ELSE GREATEST(COALESCE(NEW.cantidad_comprobantes, 0), 0) END;
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF NEW.estado NOT IN ('PENDIENTE','GENERADO','ENVIADO','ACEPTADO','RECHAZADO','ERROR','ANULADO') THEN
    NEW.estado := 'PENDIENTE';
  END IF;
  NEW.generado_por := app.to_uuid_or_null(COALESCE(NEW.generado_por::text, ''));
  NEW.enviado_por := app.to_uuid_or_null(COALESCE(NEW.enviado_por::text, ''));
  NEW.fecha_envio := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_envio::text, '')), app.to_timestamptz_or_null(COALESCE(NEW.enviado_en::text, '')));
  NEW.fecha_respuesta := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_respuesta::text, '')), app.to_timestamptz_or_null(COALESCE(NEW.respondido_en::text, '')));
  NEW.enviado_en := NEW.fecha_envio;
  NEW.respondido_en := NEW.fecha_respuesta;
  NEW.codigo_hash := COALESCE(NULLIF(btrim(COALESCE(NEW.codigo_hash, '')), ''), NULLIF(btrim(COALESCE(NEW.hash_xml, '')), ''));
  NEW.intentos_envio := GREATEST(COALESCE(NEW.intentos_envio, 0), 0);
  NEW.motivo_baja := NULLIF(btrim(COALESCE(NEW.motivo_baja, '')), '');
  NEW.ultimo_error := NULLIF(btrim(COALESCE(NEW.ultimo_error, '')), '');
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_comunicaciones_baja_row ON public.comunicaciones_baja;
CREATE TRIGGER trg_normalize_comunicaciones_baja_row
BEFORE INSERT OR UPDATE ON public.comunicaciones_baja
FOR EACH ROW
EXECUTE FUNCTION app.normalize_comunicaciones_baja_row();

-- ----------------------------------------------------------------------------
-- resumenes_diarios
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.resumenes_diarios
  ADD COLUMN IF NOT EXISTS intentos_envio integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_error text,
  ADD COLUMN IF NOT EXISTS codigo_hash text,
  ADD COLUMN IF NOT EXISTS enviado_en timestamptz,
  ADD COLUMN IF NOT EXISTS respondido_en timestamptz;

ALTER TABLE IF EXISTS public.resumenes_diarios
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN numero_resumen TYPE text USING NULLIF(upper(btrim(COALESCE(numero_resumen, ''))), ''),
  ALTER COLUMN fecha_generacion TYPE date USING app.to_date_or_null(COALESCE(fecha_generacion::text, '')),
  ALTER COLUMN fecha_referencia TYPE date USING app.to_date_or_null(COALESCE(fecha_referencia::text, '')),
  ALTER COLUMN cantidad_comprobantes TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(cantidad_comprobantes::text, '0')), 0),
  ALTER COLUMN total_gravadas TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(total_gravadas::text, '0')), 0),
  ALTER COLUMN total_exoneradas TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(total_exoneradas::text, '0')), 0),
  ALTER COLUMN total_inafectas TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(total_inafectas::text, '0')), 0),
  ALTER COLUMN total_igv TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(total_igv::text, '0')), 0),
  ALTER COLUMN total_general TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(total_general::text, '0')), 0),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')),
  ALTER COLUMN generado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(generado_por::text, '')),
  ALTER COLUMN enviado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(enviado_por::text, '')),
  ALTER COLUMN fecha_envio TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_envio::text, '')),
  ALTER COLUMN fecha_respuesta TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_respuesta::text, '')),
  ALTER COLUMN intentos_envio TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(intentos_envio::text, '0')), 0),
  ALTER COLUMN enviado_en TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(enviado_en::text, '')),
  ALTER COLUMN respondido_en TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(respondido_en::text, '')),
  ALTER COLUMN comprobantes_ids SET DEFAULT '{}'::uuid[],
  ALTER COLUMN cantidad_comprobantes SET DEFAULT 0,
  ALTER COLUMN total_gravadas SET DEFAULT 0,
  ALTER COLUMN total_exoneradas SET DEFAULT 0,
  ALTER COLUMN total_inafectas SET DEFAULT 0,
  ALTER COLUMN total_igv SET DEFAULT 0,
  ALTER COLUMN total_general SET DEFAULT 0,
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE',
  ALTER COLUMN intentos_envio SET DEFAULT 0,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.resumenes_diarios r
SET
  fecha_generacion = COALESCE(r.fecha_generacion, r.created_at::date, current_date),
  fecha_referencia = COALESCE(r.fecha_referencia, r.fecha_generacion, r.created_at::date, current_date),
  numero_resumen = COALESCE(NULLIF(upper(btrim(COALESCE(r.numero_resumen, ''))), ''), format('RC-%s-%s', to_char(COALESCE(r.fecha_generacion, current_date), 'YYYYMMDD'), upper(left(replace(r.id::text, '-', ''), 6)))),
  comprobantes_ids = COALESCE(r.comprobantes_ids, '{}'::uuid[]),
  cantidad_comprobantes = CASE WHEN cardinality(COALESCE(r.comprobantes_ids, '{}'::uuid[])) > 0 THEN cardinality(COALESCE(r.comprobantes_ids, '{}'::uuid[])) ELSE GREATEST(COALESCE(r.cantidad_comprobantes, 0), 0) END,
  total_gravadas = GREATEST(COALESCE(r.total_gravadas, 0), 0),
  total_exoneradas = GREATEST(COALESCE(r.total_exoneradas, 0), 0),
  total_inafectas = GREATEST(COALESCE(r.total_inafectas, 0), 0),
  total_igv = GREATEST(COALESCE(r.total_igv, 0), 0),
  total_general = GREATEST(COALESCE(r.total_general, 0), 0),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(r.estado), ''), 'PENDIENTE')) IN ('PENDIENTE','GENERADO','ENVIADO','ACEPTADO','RECHAZADO','ERROR','ANULADO') THEN upper(COALESCE(NULLIF(btrim(r.estado), ''), 'PENDIENTE'))
    WHEN upper(COALESCE(NULLIF(btrim(r.estado), ''), 'PENDIENTE')) = 'ACTIVO' THEN 'PENDIENTE'
    WHEN upper(COALESCE(NULLIF(btrim(r.estado), ''), 'PENDIENTE')) = 'INACTIVO' THEN 'ANULADO'
    ELSE 'PENDIENTE'
  END,
  codigo_hash = COALESCE(NULLIF(btrim(COALESCE(r.codigo_hash, '')), ''), NULLIF(btrim(COALESCE(r.hash_xml, '')), '')),
  enviado_en = COALESCE(r.enviado_en, r.fecha_envio),
  respondido_en = COALESCE(r.respondido_en, r.fecha_respuesta),
  intentos_envio = GREATEST(COALESCE(r.intentos_envio, 0), 0),
  ultimo_error = NULLIF(btrim(COALESCE(r.ultimo_error, '')), ''),
  metadata = COALESCE(r.metadata, '{}'::jsonb),
  updated_at = now()
WHERE r.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_resumenes_diarios_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.fecha_generacion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_generacion::text, '')), NEW.created_at::date, current_date);
  NEW.fecha_referencia := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_referencia::text, '')), NEW.fecha_generacion);
  NEW.numero_resumen := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.numero_resumen, ''))), ''), format('RC-%s-%s', to_char(NEW.fecha_generacion, 'YYYYMMDD'), upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 6))));
  NEW.comprobantes_ids := COALESCE(NEW.comprobantes_ids, '{}'::uuid[]);
  NEW.cantidad_comprobantes := CASE WHEN cardinality(NEW.comprobantes_ids) > 0 THEN cardinality(NEW.comprobantes_ids) ELSE GREATEST(COALESCE(NEW.cantidad_comprobantes, 0), 0) END;
  NEW.total_gravadas := GREATEST(COALESCE(NEW.total_gravadas, 0), 0);
  NEW.total_exoneradas := GREATEST(COALESCE(NEW.total_exoneradas, 0), 0);
  NEW.total_inafectas := GREATEST(COALESCE(NEW.total_inafectas, 0), 0);
  NEW.total_igv := GREATEST(COALESCE(NEW.total_igv, 0), 0);
  NEW.total_general := GREATEST(COALESCE(NEW.total_general, 0), 0);
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF NEW.estado NOT IN ('PENDIENTE','GENERADO','ENVIADO','ACEPTADO','RECHAZADO','ERROR','ANULADO') THEN
    NEW.estado := 'PENDIENTE';
  END IF;
  NEW.generado_por := app.to_uuid_or_null(COALESCE(NEW.generado_por::text, ''));
  NEW.enviado_por := app.to_uuid_or_null(COALESCE(NEW.enviado_por::text, ''));
  NEW.fecha_envio := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_envio::text, '')), app.to_timestamptz_or_null(COALESCE(NEW.enviado_en::text, '')));
  NEW.fecha_respuesta := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_respuesta::text, '')), app.to_timestamptz_or_null(COALESCE(NEW.respondido_en::text, '')));
  NEW.enviado_en := NEW.fecha_envio;
  NEW.respondido_en := NEW.fecha_respuesta;
  NEW.codigo_hash := COALESCE(NULLIF(btrim(COALESCE(NEW.codigo_hash, '')), ''), NULLIF(btrim(COALESCE(NEW.hash_xml, '')), ''));
  NEW.intentos_envio := GREATEST(COALESCE(NEW.intentos_envio, 0), 0);
  NEW.ultimo_error := NULLIF(btrim(COALESCE(NEW.ultimo_error, '')), '');
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_resumenes_diarios_row ON public.resumenes_diarios;
CREATE TRIGGER trg_normalize_resumenes_diarios_row
BEFORE INSERT OR UPDATE ON public.resumenes_diarios
FOR EACH ROW
EXECUTE FUNCTION app.normalize_resumenes_diarios_row();

-- ----------------------------------------------------------------------------
-- detalle_comunicacion_baja
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.detalle_comunicacion_baja
  ADD COLUMN IF NOT EXISTS comunicacion_id uuid,
  ADD COLUMN IF NOT EXISTS cpe_id uuid,
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS motivo_baja text,
  ADD COLUMN IF NOT EXISTS orden integer DEFAULT 1;

ALTER TABLE IF EXISTS public.detalle_comunicacion_baja
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN comunicacion_id TYPE uuid USING app.to_uuid_or_null(COALESCE(comunicacion_id::text, '')),
  ALTER COLUMN cpe_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cpe_id::text, '')),
  ALTER COLUMN tipo_documento TYPE text USING NULLIF(upper(btrim(COALESCE(tipo_documento, ''))), ''),
  ALTER COLUMN serie TYPE text USING NULLIF(upper(btrim(COALESCE(serie, ''))), ''),
  ALTER COLUMN numero TYPE text USING NULLIF(btrim(COALESCE(numero, '')), ''),
  ALTER COLUMN motivo_baja TYPE text USING NULLIF(btrim(COALESCE(motivo_baja, '')), ''),
  ALTER COLUMN orden TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(orden::text, '1')), 1),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')),
  ALTER COLUMN orden SET DEFAULT 1,
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.detalle_comunicacion_baja d
SET
  tenant_id = app.to_uuid_or_null(COALESCE(d.tenant_id::text, '')),
  comunicacion_id = app.to_uuid_or_null(COALESCE(d.comunicacion_id::text, '')),
  cpe_id = app.to_uuid_or_null(COALESCE(d.cpe_id::text, '')),
  tipo_documento = NULLIF(upper(btrim(COALESCE(d.tipo_documento, ''))), ''),
  serie = NULLIF(upper(btrim(COALESCE(d.serie, ''))), ''),
  numero = NULLIF(btrim(COALESCE(d.numero, '')), ''),
  motivo_baja = COALESCE(NULLIF(btrim(COALESCE(d.motivo_baja, '')), ''), 'BAJA DE DOCUMENTO'),
  orden = GREATEST(COALESCE(d.orden, 1), 1),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(d.estado), ''), 'PENDIENTE')) IN ('PENDIENTE', 'ACEPTADO', 'RECHAZADO', 'ANULADO') THEN upper(COALESCE(NULLIF(btrim(d.estado), ''), 'PENDIENTE'))
    WHEN upper(COALESCE(NULLIF(btrim(d.estado), ''), 'PENDIENTE')) = 'ACTIVO' THEN 'PENDIENTE'
    WHEN upper(COALESCE(NULLIF(btrim(d.estado), ''), 'PENDIENTE')) = 'INACTIVO' THEN 'ANULADO'
    ELSE 'PENDIENTE'
  END,
  metadata = COALESCE(d.metadata, '{}'::jsonb),
  updated_at = now()
WHERE d.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_detalle_comunicacion_baja_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.comunicacion_id := app.to_uuid_or_null(COALESCE(NEW.comunicacion_id::text, ''));
  NEW.cpe_id := app.to_uuid_or_null(COALESCE(NEW.cpe_id::text, ''));
  NEW.tipo_documento := NULLIF(upper(btrim(COALESCE(NEW.tipo_documento, ''))), '');
  NEW.serie := NULLIF(upper(btrim(COALESCE(NEW.serie, ''))), '');
  NEW.numero := NULLIF(btrim(COALESCE(NEW.numero, '')), '');
  NEW.motivo_baja := COALESCE(NULLIF(btrim(COALESCE(NEW.motivo_baja, '')), ''), 'BAJA DE DOCUMENTO');
  NEW.orden := GREATEST(COALESCE(NEW.orden, 1), 1);
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF NEW.estado NOT IN ('PENDIENTE', 'ACEPTADO', 'RECHAZADO', 'ANULADO') THEN
    NEW.estado := 'PENDIENTE';
  END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_detalle_comunicacion_baja_row ON public.detalle_comunicacion_baja;
CREATE TRIGGER trg_normalize_detalle_comunicacion_baja_row
BEFORE INSERT OR UPDATE ON public.detalle_comunicacion_baja
FOR EACH ROW
EXECUTE FUNCTION app.normalize_detalle_comunicacion_baja_row();

-- ----------------------------------------------------------------------------
-- detalle_resumen_diario
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.detalle_resumen_diario
  ADD COLUMN IF NOT EXISTS resumen_id uuid,
  ADD COLUMN IF NOT EXISTS cpe_id uuid,
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS tipo_operacion text DEFAULT '3',
  ADD COLUMN IF NOT EXISTS total_gravadas numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_exoneradas numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_inafectas numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS orden integer DEFAULT 1;

ALTER TABLE IF EXISTS public.detalle_resumen_diario
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN resumen_id TYPE uuid USING app.to_uuid_or_null(COALESCE(resumen_id::text, '')),
  ALTER COLUMN cpe_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cpe_id::text, '')),
  ALTER COLUMN tipo_documento TYPE text USING NULLIF(upper(btrim(COALESCE(tipo_documento, ''))), ''),
  ALTER COLUMN serie TYPE text USING NULLIF(upper(btrim(COALESCE(serie, ''))), ''),
  ALTER COLUMN numero TYPE text USING NULLIF(btrim(COALESCE(numero, '')), ''),
  ALTER COLUMN tipo_operacion TYPE text USING COALESCE(NULLIF(btrim(COALESCE(tipo_operacion, '')), ''), '3'),
  ALTER COLUMN total_gravadas TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(total_gravadas::text, '0')), 0),
  ALTER COLUMN total_exoneradas TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(total_exoneradas::text, '0')), 0),
  ALTER COLUMN total_inafectas TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(total_inafectas::text, '0')), 0),
  ALTER COLUMN total_igv TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(total_igv::text, '0')), 0),
  ALTER COLUMN total TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(total::text, '0')), 0),
  ALTER COLUMN orden TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(orden::text, '1')), 1),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')),
  ALTER COLUMN tipo_operacion SET DEFAULT '3',
  ALTER COLUMN total_gravadas SET DEFAULT 0,
  ALTER COLUMN total_exoneradas SET DEFAULT 0,
  ALTER COLUMN total_inafectas SET DEFAULT 0,
  ALTER COLUMN total_igv SET DEFAULT 0,
  ALTER COLUMN total SET DEFAULT 0,
  ALTER COLUMN orden SET DEFAULT 1,
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.detalle_resumen_diario d
SET
  tenant_id = app.to_uuid_or_null(COALESCE(d.tenant_id::text, '')),
  resumen_id = app.to_uuid_or_null(COALESCE(d.resumen_id::text, '')),
  cpe_id = app.to_uuid_or_null(COALESCE(d.cpe_id::text, '')),
  tipo_documento = NULLIF(upper(btrim(COALESCE(d.tipo_documento, ''))), ''),
  serie = NULLIF(upper(btrim(COALESCE(d.serie, ''))), ''),
  numero = NULLIF(btrim(COALESCE(d.numero, '')), ''),
  tipo_operacion = COALESCE(NULLIF(btrim(COALESCE(d.tipo_operacion, '')), ''), '3'),
  total_gravadas = GREATEST(COALESCE(d.total_gravadas, 0), 0),
  total_exoneradas = GREATEST(COALESCE(d.total_exoneradas, 0), 0),
  total_inafectas = GREATEST(COALESCE(d.total_inafectas, 0), 0),
  total_igv = GREATEST(COALESCE(d.total_igv, 0), 0),
  total = GREATEST(COALESCE(d.total, 0), 0),
  orden = GREATEST(COALESCE(d.orden, 1), 1),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(d.estado), ''), 'PENDIENTE')) IN ('PENDIENTE', 'ACEPTADO', 'RECHAZADO', 'ANULADO') THEN upper(COALESCE(NULLIF(btrim(d.estado), ''), 'PENDIENTE'))
    WHEN upper(COALESCE(NULLIF(btrim(d.estado), ''), 'PENDIENTE')) = 'ACTIVO' THEN 'PENDIENTE'
    WHEN upper(COALESCE(NULLIF(btrim(d.estado), ''), 'PENDIENTE')) = 'INACTIVO' THEN 'ANULADO'
    ELSE 'PENDIENTE'
  END,
  metadata = COALESCE(d.metadata, '{}'::jsonb),
  updated_at = now()
WHERE d.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_detalle_resumen_diario_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.resumen_id := app.to_uuid_or_null(COALESCE(NEW.resumen_id::text, ''));
  NEW.cpe_id := app.to_uuid_or_null(COALESCE(NEW.cpe_id::text, ''));
  NEW.tipo_documento := NULLIF(upper(btrim(COALESCE(NEW.tipo_documento, ''))), '');
  NEW.serie := NULLIF(upper(btrim(COALESCE(NEW.serie, ''))), '');
  NEW.numero := NULLIF(btrim(COALESCE(NEW.numero, '')), '');
  NEW.tipo_operacion := COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_operacion, '')), ''), '3');
  NEW.total_gravadas := GREATEST(COALESCE(NEW.total_gravadas, 0), 0);
  NEW.total_exoneradas := GREATEST(COALESCE(NEW.total_exoneradas, 0), 0);
  NEW.total_inafectas := GREATEST(COALESCE(NEW.total_inafectas, 0), 0);
  NEW.total_igv := GREATEST(COALESCE(NEW.total_igv, 0), 0);
  NEW.total := GREATEST(COALESCE(NEW.total, NEW.total_gravadas + NEW.total_exoneradas + NEW.total_inafectas + NEW.total_igv, 0), 0);
  NEW.orden := GREATEST(COALESCE(NEW.orden, 1), 1);
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF NEW.estado NOT IN ('PENDIENTE', 'ACEPTADO', 'RECHAZADO', 'ANULADO') THEN
    NEW.estado := 'PENDIENTE';
  END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_detalle_resumen_diario_row ON public.detalle_resumen_diario;
CREATE TRIGGER trg_normalize_detalle_resumen_diario_row
BEFORE INSERT OR UPDATE ON public.detalle_resumen_diario
FOR EACH ROW
EXECUTE FUNCTION app.normalize_detalle_resumen_diario_row();

-- ----------------------------------------------------------------------------
-- validaciones_sunat
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.validaciones_sunat
  ADD COLUMN IF NOT EXISTS cpe_id uuid,
  ADD COLUMN IF NOT EXISTS documento_id uuid,
  ADD COLUMN IF NOT EXISTS tipo_validacion text,
  ADD COLUMN IF NOT EXISTS ruc_consultado text,
  ADD COLUMN IF NOT EXISTS codigo_respuesta text,
  ADD COLUMN IF NOT EXISTS descripcion_respuesta text,
  ADD COLUMN IF NOT EXISTS request_payload jsonb,
  ADD COLUMN IF NOT EXISTS response_payload jsonb,
  ADD COLUMN IF NOT EXISTS validado_en timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expiracion_en timestamptz,
  ADD COLUMN IF NOT EXISTS fuente text DEFAULT 'SUNAT',
  ADD COLUMN IF NOT EXISTS severidad text DEFAULT 'INFO';

ALTER TABLE IF EXISTS public.validaciones_sunat
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN cpe_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cpe_id::text, '')),
  ALTER COLUMN documento_id TYPE uuid USING app.to_uuid_or_null(COALESCE(documento_id::text, '')),
  ALTER COLUMN tipo_validacion TYPE text USING upper(COALESCE(NULLIF(btrim(tipo_validacion), ''), 'CERTIFICADO')),
  ALTER COLUMN ruc_consultado TYPE text USING NULLIF(regexp_replace(COALESCE(ruc_consultado, ''), '[^0-9]', '', 'g'), ''),
  ALTER COLUMN codigo_respuesta TYPE text USING NULLIF(btrim(COALESCE(codigo_respuesta, '')), ''),
  ALTER COLUMN descripcion_respuesta TYPE text USING NULLIF(btrim(COALESCE(descripcion_respuesta, '')), ''),
  ALTER COLUMN validado_en TYPE timestamptz USING COALESCE(app.to_timestamptz_or_null(COALESCE(validado_en::text, '')), created_at, now()),
  ALTER COLUMN expiracion_en TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(expiracion_en::text, '')),
  ALTER COLUMN fuente TYPE text USING upper(COALESCE(NULLIF(btrim(fuente), ''), 'SUNAT')),
  ALTER COLUMN severidad TYPE text USING upper(COALESCE(NULLIF(btrim(severidad), ''), 'INFO')),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')),
  ALTER COLUMN request_payload SET DEFAULT '{}'::jsonb,
  ALTER COLUMN response_payload SET DEFAULT '{}'::jsonb,
  ALTER COLUMN validado_en SET DEFAULT now(),
  ALTER COLUMN fuente SET DEFAULT 'SUNAT',
  ALTER COLUMN severidad SET DEFAULT 'INFO',
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.validaciones_sunat v
SET
  tenant_id = app.to_uuid_or_null(COALESCE(v.tenant_id::text, '')),
  cpe_id = app.to_uuid_or_null(COALESCE(v.cpe_id::text, '')),
  documento_id = app.to_uuid_or_null(COALESCE(v.documento_id::text, '')),
  tipo_validacion = COALESCE(NULLIF(upper(btrim(COALESCE(v.tipo_validacion, ''))), ''), 'CERTIFICADO'),
  ruc_consultado = NULLIF(regexp_replace(COALESCE(v.ruc_consultado, ''), '[^0-9]', '', 'g'), ''),
  codigo_respuesta = NULLIF(btrim(COALESCE(v.codigo_respuesta, '')), ''),
  descripcion_respuesta = NULLIF(btrim(COALESCE(v.descripcion_respuesta, '')), ''),
  request_payload = CASE WHEN jsonb_typeof(COALESCE(v.request_payload, '{}'::jsonb)) = 'object' THEN COALESCE(v.request_payload, '{}'::jsonb) ELSE '{}'::jsonb END,
  response_payload = CASE WHEN jsonb_typeof(COALESCE(v.response_payload, '{}'::jsonb)) = 'object' THEN COALESCE(v.response_payload, '{}'::jsonb) ELSE '{}'::jsonb END,
  validado_en = COALESCE(v.validado_en, v.created_at, now()),
  expiracion_en = CASE
    WHEN v.expiracion_en IS NULL THEN NULL
    WHEN v.validado_en IS NULL THEN v.expiracion_en
    WHEN v.expiracion_en < v.validado_en THEN v.validado_en
    ELSE v.expiracion_en
  END,
  fuente = COALESCE(NULLIF(upper(btrim(COALESCE(v.fuente, ''))), ''), 'SUNAT'),
  severidad = COALESCE(NULLIF(upper(btrim(COALESCE(v.severidad, ''))), ''), 'INFO'),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(v.estado), ''), 'PENDIENTE')) IN ('PENDIENTE', 'VALIDO', 'INVALIDO', 'ERROR', 'VENCIDO') THEN upper(COALESCE(NULLIF(btrim(v.estado), ''), 'PENDIENTE'))
    WHEN upper(COALESCE(NULLIF(btrim(v.estado), ''), 'PENDIENTE')) = 'ACTIVO' THEN 'VALIDO'
    WHEN upper(COALESCE(NULLIF(btrim(v.estado), ''), 'PENDIENTE')) = 'INACTIVO' THEN 'INVALIDO'
    ELSE 'PENDIENTE'
  END,
  metadata = COALESCE(v.metadata, '{}'::jsonb),
  updated_at = now()
WHERE v.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_validaciones_sunat_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cpe_id := app.to_uuid_or_null(COALESCE(NEW.cpe_id::text, ''));
  NEW.documento_id := app.to_uuid_or_null(COALESCE(NEW.documento_id::text, ''));
  NEW.tipo_validacion := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.tipo_validacion, ''))), ''), 'CERTIFICADO');
  NEW.ruc_consultado := NULLIF(regexp_replace(COALESCE(NEW.ruc_consultado, ''), '[^0-9]', '', 'g'), '');
  NEW.codigo_respuesta := NULLIF(btrim(COALESCE(NEW.codigo_respuesta, '')), '');
  NEW.descripcion_respuesta := NULLIF(btrim(COALESCE(NEW.descripcion_respuesta, '')), '');
  NEW.request_payload := CASE WHEN jsonb_typeof(COALESCE(NEW.request_payload, '{}'::jsonb)) = 'object' THEN COALESCE(NEW.request_payload, '{}'::jsonb) ELSE '{}'::jsonb END;
  NEW.response_payload := CASE WHEN jsonb_typeof(COALESCE(NEW.response_payload, '{}'::jsonb)) = 'object' THEN COALESCE(NEW.response_payload, '{}'::jsonb) ELSE '{}'::jsonb END;
  NEW.validado_en := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.validado_en::text, '')), NEW.created_at, now());
  NEW.expiracion_en := app.to_timestamptz_or_null(COALESCE(NEW.expiracion_en::text, ''));
  IF NEW.expiracion_en IS NOT NULL AND NEW.expiracion_en < NEW.validado_en THEN
    NEW.expiracion_en := NEW.validado_en;
  END IF;
  NEW.fuente := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.fuente, ''))), ''), 'SUNAT');
  NEW.severidad := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.severidad, ''))), ''), 'INFO');
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF NEW.estado NOT IN ('PENDIENTE', 'VALIDO', 'INVALIDO', 'ERROR', 'VENCIDO') THEN
    NEW.estado := 'PENDIENTE';
  END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_validaciones_sunat_row ON public.validaciones_sunat;
CREATE TRIGGER trg_normalize_validaciones_sunat_row
BEFORE INSERT OR UPDATE ON public.validaciones_sunat
FOR EACH ROW
EXECUTE FUNCTION app.normalize_validaciones_sunat_row();

-- ----------------------------------------------------------------------------
-- Indices runtime
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_comunicaciones_baja_tenant_estado_fecha_runtime
ON public.comunicaciones_baja (tenant_id, estado, fecha_generacion DESC);

CREATE INDEX IF NOT EXISTS idx_comunicaciones_baja_tenant_ticket_runtime
ON public.comunicaciones_baja (tenant_id, ticket_sunat);

CREATE INDEX IF NOT EXISTS idx_comunicaciones_baja_tenant_fecha_comunicacion_runtime
ON public.comunicaciones_baja (tenant_id, fecha_comunicacion DESC);

CREATE INDEX IF NOT EXISTS idx_resumenes_diarios_tenant_estado_fecha_runtime
ON public.resumenes_diarios (tenant_id, estado, fecha_generacion DESC);

CREATE INDEX IF NOT EXISTS idx_resumenes_diarios_tenant_ticket_runtime
ON public.resumenes_diarios (tenant_id, ticket_sunat);

CREATE INDEX IF NOT EXISTS idx_resumenes_diarios_tenant_fecha_referencia_runtime
ON public.resumenes_diarios (tenant_id, fecha_referencia DESC);

CREATE INDEX IF NOT EXISTS idx_detalle_comunicacion_baja_tenant_comunicacion_runtime
ON public.detalle_comunicacion_baja (tenant_id, comunicacion_id, orden);

CREATE INDEX IF NOT EXISTS idx_detalle_comunicacion_baja_tenant_cpe_runtime
ON public.detalle_comunicacion_baja (tenant_id, cpe_id);

CREATE INDEX IF NOT EXISTS idx_detalle_resumen_diario_tenant_resumen_runtime
ON public.detalle_resumen_diario (tenant_id, resumen_id, orden);

CREATE INDEX IF NOT EXISTS idx_detalle_resumen_diario_tenant_cpe_runtime
ON public.detalle_resumen_diario (tenant_id, cpe_id);

CREATE INDEX IF NOT EXISTS idx_validaciones_sunat_tenant_tipo_validado_runtime
ON public.validaciones_sunat (tenant_id, tipo_validacion, validado_en DESC);

CREATE INDEX IF NOT EXISTS idx_validaciones_sunat_tenant_estado_runtime
ON public.validaciones_sunat (tenant_id, estado, validado_en DESC);

CREATE INDEX IF NOT EXISTS idx_validaciones_sunat_tenant_cpe_runtime
ON public.validaciones_sunat (tenant_id, cpe_id);

COMMIT;
