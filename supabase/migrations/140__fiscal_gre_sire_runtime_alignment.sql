-- ============================================================================
-- 140__fiscal_gre_sire_runtime_alignment.sql
-- Alineación runtime para fiscal GRE/SIRE.
-- Tablas: gre_guias, gre_detalles, sire_files, sire_registros_detalle.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- gre_guias: shape operativo completo para API/dashboard/reintentos SUNAT.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.gre_guias
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS correlativo integer,
  ADD COLUMN IF NOT EXISTS destinatario text,
  ADD COLUMN IF NOT EXISTS direccion_destino text,
  ADD COLUMN IF NOT EXISTS fecha_traslado timestamptz,
  ADD COLUMN IF NOT EXISTS modalidad text,
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS transportista text,
  ADD COLUMN IF NOT EXISTS placa_vehiculo text,
  ADD COLUMN IF NOT EXISTS licencia_conducir text,
  ADD COLUMN IF NOT EXISTS cpe_relacionado uuid,
  ADD COLUMN IF NOT EXISTS sunat_status text,
  ADD COLUMN IF NOT EXISTS datos_adicionales jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS xml_firmado text,
  ADD COLUMN IF NOT EXISTS hash_gre text,
  ADD COLUMN IF NOT EXISTS cdr_sunat text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS numero_sunat text,
  ADD COLUMN IF NOT EXISTS base_imponible numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text,
  ADD COLUMN IF NOT EXISTS fecha_emision timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento timestamptz,
  ADD COLUMN IF NOT EXISTS cliente_ruc text,
  ADD COLUMN IF NOT EXISTS cliente_nombre text,
  ADD COLUMN IF NOT EXISTS anio text,
  ADD COLUMN IF NOT EXISTS mes text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS es_automatica boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS venta_id uuid,
  ADD COLUMN IF NOT EXISTS movimiento_inventario_id uuid,
  ADD COLUMN IF NOT EXISTS motivo_creacion text,
  ADD COLUMN IF NOT EXISTS peso_total numeric(14,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.gre_guias
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN numero TYPE text USING NULLIF(btrim(COALESCE(numero::text, '')), ''),
  ALTER COLUMN serie TYPE text USING NULLIF(upper(btrim(COALESCE(serie::text, ''))), ''),
  ALTER COLUMN correlativo TYPE integer USING app.to_int_or_zero(correlativo::text),
  ALTER COLUMN destinatario TYPE text USING NULLIF(btrim(COALESCE(destinatario::text, '')), ''),
  ALTER COLUMN direccion_destino TYPE text USING NULLIF(btrim(COALESCE(direccion_destino::text, '')), ''),
  ALTER COLUMN fecha_traslado TYPE timestamptz USING CASE
    WHEN fecha_traslado IS NULL OR btrim(fecha_traslado::text) = '' THEN NULL
    ELSE fecha_traslado::timestamptz
  END,
  ALTER COLUMN modalidad TYPE text USING NULLIF(upper(btrim(COALESCE(modalidad::text, ''))), ''),
  ALTER COLUMN motivo TYPE text USING NULLIF(upper(btrim(COALESCE(motivo::text, ''))), ''),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones::text, '')), ''),
  ALTER COLUMN transportista TYPE text USING NULLIF(btrim(COALESCE(transportista::text, '')), ''),
  ALTER COLUMN placa_vehiculo TYPE text USING NULLIF(upper(btrim(COALESCE(placa_vehiculo::text, ''))), ''),
  ALTER COLUMN licencia_conducir TYPE text USING NULLIF(upper(btrim(COALESCE(licencia_conducir::text, ''))), ''),
  ALTER COLUMN cpe_relacionado TYPE uuid USING app.to_uuid_or_null(COALESCE(cpe_relacionado::text, '')),
  ALTER COLUMN sunat_status TYPE text USING NULLIF(upper(btrim(COALESCE(sunat_status::text, ''))), ''),
  ALTER COLUMN datos_adicionales TYPE jsonb USING COALESCE(
    CASE
      WHEN datos_adicionales IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(datos_adicionales) = 'object' THEN datos_adicionales
      ELSE '{}'::jsonb
    END,
    '{}'::jsonb
  ),
  ALTER COLUMN event_id TYPE uuid USING app.to_uuid_or_null(COALESCE(event_id::text, '')),
  ALTER COLUMN xml_firmado TYPE text USING NULLIF(btrim(COALESCE(xml_firmado::text, '')), ''),
  ALTER COLUMN hash_gre TYPE text USING NULLIF(btrim(COALESCE(hash_gre::text, '')), ''),
  ALTER COLUMN cdr_sunat TYPE text USING NULLIF(btrim(COALESCE(cdr_sunat::text, '')), ''),
  ALTER COLUMN error_message TYPE text USING NULLIF(btrim(COALESCE(error_message::text, '')), ''),
  ALTER COLUMN numero_sunat TYPE text USING NULLIF(btrim(COALESCE(numero_sunat::text, '')), ''),
  ALTER COLUMN base_imponible TYPE numeric(14,2) USING round(GREATEST(app.to_numeric_or_zero(base_imponible::text), 0)::numeric, 2),
  ALTER COLUMN igv TYPE numeric(14,2) USING round(GREATEST(app.to_numeric_or_zero(igv::text), 0)::numeric, 2),
  ALTER COLUMN total TYPE numeric(14,2) USING round(GREATEST(app.to_numeric_or_zero(total::text), 0)::numeric, 2),
  ALTER COLUMN moneda TYPE text USING NULLIF(upper(btrim(COALESCE(moneda::text, ''))), ''),
  ALTER COLUMN fecha_emision TYPE timestamptz USING CASE
    WHEN fecha_emision IS NULL OR btrim(fecha_emision::text) = '' THEN NULL
    ELSE fecha_emision::timestamptz
  END,
  ALTER COLUMN fecha_vencimiento TYPE timestamptz USING CASE
    WHEN fecha_vencimiento IS NULL OR btrim(fecha_vencimiento::text) = '' THEN NULL
    ELSE fecha_vencimiento::timestamptz
  END,
  ALTER COLUMN cliente_ruc TYPE text USING NULLIF(btrim(COALESCE(cliente_ruc::text, '')), ''),
  ALTER COLUMN cliente_nombre TYPE text USING NULLIF(btrim(COALESCE(cliente_nombre::text, '')), ''),
  ALTER COLUMN anio TYPE text USING NULLIF(btrim(COALESCE(anio::text, '')), ''),
  ALTER COLUMN mes TYPE text USING NULLIF(btrim(COALESCE(mes::text, '')), ''),
  ALTER COLUMN idempotency_key TYPE text USING NULLIF(btrim(COALESCE(idempotency_key::text, '')), ''),
  ALTER COLUMN retry_count TYPE integer USING GREATEST(app.to_int_or_zero(retry_count::text), 0),
  ALTER COLUMN next_retry_at TYPE timestamptz USING CASE
    WHEN next_retry_at IS NULL OR btrim(next_retry_at::text) = '' THEN NULL
    ELSE next_retry_at::timestamptz
  END,
  ALTER COLUMN es_automatica TYPE boolean USING COALESCE(es_automatica, false),
  ALTER COLUMN venta_id TYPE uuid USING app.to_uuid_or_null(COALESCE(venta_id::text, '')),
  ALTER COLUMN movimiento_inventario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(movimiento_inventario_id::text, '')),
  ALTER COLUMN motivo_creacion TYPE text USING NULLIF(upper(btrim(COALESCE(motivo_creacion::text, ''))), ''),
  ALTER COLUMN peso_total TYPE numeric(14,3) USING round(GREATEST(app.to_numeric_or_zero(peso_total::text), 0)::numeric, 3),
  ALTER COLUMN created_at TYPE timestamptz USING CASE
    WHEN created_at IS NULL OR btrim(created_at::text) = '' THEN now()
    ELSE created_at::timestamptz
  END,
  ALTER COLUMN updated_at TYPE timestamptz USING CASE
    WHEN updated_at IS NULL OR btrim(updated_at::text) = '' THEN now()
    ELSE updated_at::timestamptz
  END,
  ALTER COLUMN estado TYPE text USING NULLIF(upper(btrim(COALESCE(estado::text, ''))), ''),
  ALTER COLUMN datos_adicionales SET DEFAULT '{}'::jsonb,
  ALTER COLUMN estado SET DEFAULT 'BORRADOR',
  ALTER COLUMN sunat_status SET DEFAULT 'NOT_SENT',
  ALTER COLUMN base_imponible SET DEFAULT 0,
  ALTER COLUMN igv SET DEFAULT 0,
  ALTER COLUMN total SET DEFAULT 0,
  ALTER COLUMN peso_total SET DEFAULT 0,
  ALTER COLUMN retry_count SET DEFAULT 0,
  ALTER COLUMN es_automatica SET DEFAULT false,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

UPDATE public.gre_guias
SET
  serie = COALESCE(NULLIF(upper(btrim(COALESCE(serie, ''))), ''), split_part(COALESCE(numero, ''), '-', 1), 'T001'),
  correlativo = COALESCE(
    NULLIF(
      CASE
        WHEN split_part(COALESCE(numero, ''), '-', 2) ~ '^[0-9]+$'
          THEN split_part(numero, '-', 2)
        ELSE NULL
      END,
      ''
    )::integer,
    NULLIF(correlativo, 0),
    1
  ),
  numero = COALESCE(
    NULLIF(btrim(COALESCE(numero, '')), ''),
    COALESCE(NULLIF(upper(btrim(COALESCE(serie, ''))), ''), 'T001') || '-' ||
      lpad(COALESCE(NULLIF(correlativo, 0), 1)::text, 8, '0')
  ),
  sunat_status = COALESCE(NULLIF(upper(btrim(COALESCE(sunat_status, ''))), ''), 'NOT_SENT'),
  estado = COALESCE(NULLIF(upper(btrim(COALESCE(estado, ''))), ''), 'BORRADOR'),
  anio = COALESCE(
    NULLIF(regexp_replace(COALESCE(anio, ''), '[^0-9]', '', 'g'), ''),
    to_char(COALESCE(fecha_emision, fecha_traslado, created_at, now()), 'YYYY')
  ),
  mes = COALESCE(
    NULLIF(regexp_replace(COALESCE(mes, ''), '[^0-9]', '', 'g'), ''),
    to_char(COALESCE(fecha_emision, fecha_traslado, created_at, now()), 'MM')
  ),
  updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- gre_detalles: shape operativo de líneas GRE.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.gre_detalles
  ADD COLUMN IF NOT EXISTS gre_id uuid,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS cantidad numeric(14,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unidad_medida text,
  ADD COLUMN IF NOT EXISTS peso numeric(14,3),
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.gre_detalles
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN gre_id TYPE uuid USING app.to_uuid_or_null(COALESCE(gre_id::text, '')),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion::text, nombre::text, '')), ''),
  ALTER COLUMN cantidad TYPE numeric(14,3) USING round(GREATEST(app.to_numeric_or_zero(cantidad::text), 0)::numeric, 3),
  ALTER COLUMN unidad_medida TYPE text USING NULLIF(upper(btrim(COALESCE(unidad_medida::text, ''))), ''),
  ALTER COLUMN peso TYPE numeric(14,3) USING round(GREATEST(app.to_numeric_or_zero(peso::text), 0)::numeric, 3),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN estado TYPE text USING NULLIF(upper(btrim(COALESCE(estado::text, ''))), ''),
  ALTER COLUMN created_at TYPE timestamptz USING CASE
    WHEN created_at IS NULL OR btrim(created_at::text) = '' THEN now()
    ELSE created_at::timestamptz
  END,
  ALTER COLUMN updated_at TYPE timestamptz USING CASE
    WHEN updated_at IS NULL OR btrim(updated_at::text) = '' THEN now()
    ELSE updated_at::timestamptz
  END,
  ALTER COLUMN cantidad SET DEFAULT 0,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

UPDATE public.gre_detalles
SET
  descripcion = COALESCE(NULLIF(btrim(COALESCE(descripcion, '')), ''), NULLIF(btrim(COALESCE(nombre, '')), ''), 'ITEM'),
  cantidad = COALESCE(NULLIF(cantidad, 0), 1),
  estado = COALESCE(NULLIF(upper(btrim(COALESCE(estado, ''))), ''), 'ACTIVO'),
  updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- sire_files: compatibilidad API (`estado`/`periodo`) + worker (`status`/`period`).
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.sire_files
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS period text,
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'GENERANDO',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'RUNNING',
  ADD COLUMN IF NOT EXISTS filename text,
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS file_size bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_registros integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS request_summary jsonb,
  ADD COLUMN IF NOT EXISTS response_summary jsonb,
  ADD COLUMN IF NOT EXISTS correlacion_id uuid,
  ADD COLUMN IF NOT EXISTS correlacion_tipo text,
  ADD COLUMN IF NOT EXISTS servicio text,
  ADD COLUMN IF NOT EXISTS operacion text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sire_files'
      AND column_name = 'request_summary'
  ) THEN
    BEGIN
      ALTER TABLE public.sire_files
        ALTER COLUMN request_summary TYPE jsonb
        USING (
          CASE
            WHEN request_summary IS NULL OR btrim(request_summary::text) = '' THEN NULL
            WHEN left(btrim(request_summary::text), 1) IN ('{', '[') THEN request_summary::text::jsonb
            ELSE jsonb_build_object('raw', request_summary::text)
          END
        );
    EXCEPTION
      WHEN others THEN
        UPDATE public.sire_files SET request_summary = NULL WHERE request_summary IS NOT NULL;
        ALTER TABLE public.sire_files
          ALTER COLUMN request_summary TYPE jsonb
          USING NULL;
    END;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sire_files'
      AND column_name = 'response_summary'
  ) THEN
    BEGIN
      ALTER TABLE public.sire_files
        ALTER COLUMN response_summary TYPE jsonb
        USING (
          CASE
            WHEN response_summary IS NULL OR btrim(response_summary::text) = '' THEN NULL
            WHEN left(btrim(response_summary::text), 1) IN ('{', '[') THEN response_summary::text::jsonb
            ELSE jsonb_build_object('raw', response_summary::text)
          END
        );
    EXCEPTION
      WHEN others THEN
        UPDATE public.sire_files SET response_summary = NULL WHERE response_summary IS NOT NULL;
        ALTER TABLE public.sire_files
          ALTER COLUMN response_summary TYPE jsonb
          USING NULL;
    END;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.sire_files
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN periodo TYPE text USING NULLIF(btrim(COALESCE(periodo::text, '')), ''),
  ALTER COLUMN period TYPE text USING NULLIF(btrim(COALESCE(period::text, '')), ''),
  ALTER COLUMN tipo TYPE text USING NULLIF(upper(btrim(COALESCE(tipo::text, ''))), ''),
  ALTER COLUMN estado TYPE text USING NULLIF(upper(btrim(COALESCE(estado::text, ''))), ''),
  ALTER COLUMN status TYPE text USING NULLIF(upper(btrim(COALESCE(status::text, ''))), ''),
  ALTER COLUMN filename TYPE text USING NULLIF(btrim(COALESCE(filename::text, '')), ''),
  ALTER COLUMN file_path TYPE text USING NULLIF(btrim(COALESCE(file_path::text, '')), ''),
  ALTER COLUMN file_size TYPE bigint USING
    CASE
      WHEN file_size IS NULL OR btrim(file_size::text) = '' THEN 0
      WHEN btrim(file_size::text) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN floor(btrim(file_size::text)::numeric)::bigint
      ELSE 0
    END,
  ALTER COLUMN total_registros TYPE integer USING GREATEST(app.to_int_or_zero(total_registros::text), 0),
  ALTER COLUMN error_message TYPE text USING NULLIF(btrim(COALESCE(error_message::text, '')), ''),
  ALTER COLUMN correlacion_id TYPE uuid USING app.to_uuid_or_null(COALESCE(correlacion_id::text, '')),
  ALTER COLUMN correlacion_tipo TYPE text USING NULLIF(upper(btrim(COALESCE(correlacion_tipo::text, ''))), ''),
  ALTER COLUMN servicio TYPE text USING NULLIF(upper(btrim(COALESCE(servicio::text, ''))), ''),
  ALTER COLUMN operacion TYPE text USING NULLIF(upper(btrim(COALESCE(operacion::text, ''))), ''),
  ALTER COLUMN completed_at TYPE timestamptz USING CASE
    WHEN completed_at IS NULL OR btrim(completed_at::text) = '' THEN NULL
    ELSE completed_at::timestamptz
  END,
  ALTER COLUMN created_at TYPE timestamptz USING CASE
    WHEN created_at IS NULL OR btrim(created_at::text) = '' THEN now()
    ELSE created_at::timestamptz
  END,
  ALTER COLUMN updated_at TYPE timestamptz USING CASE
    WHEN updated_at IS NULL OR btrim(updated_at::text) = '' THEN now()
    ELSE updated_at::timestamptz
  END,
  ALTER COLUMN estado SET DEFAULT 'GENERANDO',
  ALTER COLUMN status SET DEFAULT 'RUNNING',
  ALTER COLUMN file_size SET DEFAULT 0,
  ALTER COLUMN total_registros SET DEFAULT 0,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

UPDATE public.sire_files
SET
  periodo = COALESCE(
    NULLIF(btrim(COALESCE(periodo, '')), ''),
    NULLIF(btrim(COALESCE(period, '')), ''),
    to_char(COALESCE(created_at, now()), 'YYYY-MM')
  ),
  period = COALESCE(
    NULLIF(btrim(COALESCE(period, '')), ''),
    NULLIF(btrim(COALESCE(periodo, '')), ''),
    to_char(COALESCE(created_at, now()), 'YYYY-MM')
  ),
  tipo = COALESCE(NULLIF(upper(btrim(COALESCE(tipo, ''))), ''), 'REG_VEN'),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), NULLIF(btrim(COALESCE(status, '')), ''), 'GENERANDO')) IN ('RUNNING', 'GENERANDO') THEN 'GENERANDO'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), NULLIF(btrim(COALESCE(status, '')), ''), 'GENERANDO')) IN ('COMPLETED', 'GENERADO') THEN 'GENERADO'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), NULLIF(btrim(COALESCE(status, '')), ''), 'GENERANDO')) IN ('SENT', 'ENVIADO') THEN 'ENVIADO'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), NULLIF(btrim(COALESCE(status, '')), ''), 'GENERANDO')) IN ('PENDING', 'PENDIENTE') THEN 'PENDIENTE'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), NULLIF(btrim(COALESCE(status, '')), ''), 'GENERANDO')) IN ('CANCELLED', 'ANULADO') THEN 'ANULADO'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), NULLIF(btrim(COALESCE(status, '')), ''), 'GENERANDO')) IN ('FAILED', 'ERROR') THEN 'ERROR'
    ELSE 'GENERANDO'
  END,
  status = CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(status, '')), ''), NULLIF(btrim(COALESCE(estado, '')), ''), 'RUNNING')) IN ('RUNNING', 'GENERANDO') THEN 'RUNNING'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(status, '')), ''), NULLIF(btrim(COALESCE(estado, '')), ''), 'RUNNING')) IN ('COMPLETED', 'GENERADO') THEN 'COMPLETED'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(status, '')), ''), NULLIF(btrim(COALESCE(estado, '')), ''), 'RUNNING')) IN ('SENT', 'ENVIADO') THEN 'SENT'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(status, '')), ''), NULLIF(btrim(COALESCE(estado, '')), ''), 'RUNNING')) IN ('PENDING', 'PENDIENTE') THEN 'PENDING'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(status, '')), ''), NULLIF(btrim(COALESCE(estado, '')), ''), 'RUNNING')) IN ('CANCELLED', 'ANULADO') THEN 'CANCELLED'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(status, '')), ''), NULLIF(btrim(COALESCE(estado, '')), ''), 'RUNNING')) IN ('FAILED', 'ERROR') THEN 'ERROR'
    ELSE 'RUNNING'
  END,
  filename = NULLIF(btrim(COALESCE(filename, '')), ''),
  file_path = NULLIF(btrim(COALESCE(file_path, '')), ''),
  file_size = GREATEST(COALESCE(file_size, 0), 0),
  total_registros = GREATEST(COALESCE(total_registros, 0), 0),
  updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- sire_registros_detalle: shape operativo de detalle de comprobantes SIRE.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.sire_registros_detalle
  ADD COLUMN IF NOT EXISTS reporte_id uuid,
  ADD COLUMN IF NOT EXISTS cpe_id uuid,
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_registro timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS es_credito boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS venta_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.sire_registros_detalle
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN reporte_id TYPE uuid USING app.to_uuid_or_null(COALESCE(reporte_id::text, '')),
  ALTER COLUMN cpe_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cpe_id::text, '')),
  ALTER COLUMN tipo_documento TYPE text USING NULLIF(upper(btrim(COALESCE(tipo_documento::text, ''))), ''),
  ALTER COLUMN serie TYPE text USING NULLIF(upper(btrim(COALESCE(serie::text, ''))), ''),
  ALTER COLUMN numero TYPE text USING NULLIF(btrim(COALESCE(numero::text, '')), ''),
  ALTER COLUMN cliente_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cliente_id::text, '')),
  ALTER COLUMN total TYPE numeric(14,2) USING round(GREATEST(app.to_numeric_or_zero(total::text), 0)::numeric, 2),
  ALTER COLUMN fecha_registro TYPE timestamptz USING CASE
    WHEN fecha_registro IS NULL OR btrim(fecha_registro::text) = '' THEN now()
    ELSE fecha_registro::timestamptz
  END,
  ALTER COLUMN es_credito TYPE boolean USING COALESCE(es_credito, false),
  ALTER COLUMN venta_id TYPE uuid USING app.to_uuid_or_null(COALESCE(venta_id::text, '')),
  ALTER COLUMN estado TYPE text USING NULLIF(upper(btrim(COALESCE(estado::text, ''))), ''),
  ALTER COLUMN created_at TYPE timestamptz USING CASE
    WHEN created_at IS NULL OR btrim(created_at::text) = '' THEN now()
    ELSE created_at::timestamptz
  END,
  ALTER COLUMN updated_at TYPE timestamptz USING CASE
    WHEN updated_at IS NULL OR btrim(updated_at::text) = '' THEN now()
    ELSE updated_at::timestamptz
  END,
  ALTER COLUMN total SET DEFAULT 0,
  ALTER COLUMN fecha_registro SET DEFAULT now(),
  ALTER COLUMN es_credito SET DEFAULT false,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

UPDATE public.sire_registros_detalle
SET
  tipo_documento = COALESCE(NULLIF(upper(btrim(COALESCE(tipo_documento, ''))), ''), '01'),
  serie = COALESCE(NULLIF(upper(btrim(COALESCE(serie, ''))), ''), 'T001'),
  numero = COALESCE(NULLIF(btrim(COALESCE(numero, '')), ''), '00000001'),
  total = GREATEST(COALESCE(total, 0), 0),
  fecha_registro = COALESCE(fecha_registro, created_at, now()),
  estado = COALESCE(NULLIF(upper(btrim(COALESCE(estado, ''))), ''), 'REGISTRADO'),
  created_at = COALESCE(created_at, fecha_registro, now()),
  updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- Triggers de normalización runtime.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_gre_guias_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
  v_sunat text;
  v_period_source timestamptz;
  v_numero_raw text;
  v_num_part text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cpe_relacionado := app.to_uuid_or_null(COALESCE(NEW.cpe_relacionado::text, ''));
  NEW.event_id := app.to_uuid_or_null(COALESCE(NEW.event_id::text, ''));
  NEW.venta_id := app.to_uuid_or_null(COALESCE(NEW.venta_id::text, ''));
  NEW.movimiento_inventario_id := app.to_uuid_or_null(COALESCE(NEW.movimiento_inventario_id::text, ''));

  NEW.destinatario := NULLIF(btrim(COALESCE(NEW.destinatario, '')), '');
  NEW.direccion_destino := NULLIF(btrim(COALESCE(NEW.direccion_destino, '')), '');
  NEW.transportista := NULLIF(btrim(COALESCE(NEW.transportista, '')), '');
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');
  NEW.error_message := NULLIF(btrim(COALESCE(NEW.error_message, '')), '');
  NEW.placa_vehiculo := NULLIF(upper(btrim(COALESCE(NEW.placa_vehiculo, ''))), '');
  NEW.licencia_conducir := NULLIF(upper(btrim(COALESCE(NEW.licencia_conducir, ''))), '');
  NEW.idempotency_key := NULLIF(btrim(COALESCE(NEW.idempotency_key, '')), '');

  NEW.modalidad := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.modalidad, '')), ''), 'TRANSPORTE_PUBLICO'));
  IF NEW.modalidad NOT IN ('TRANSPORTE_PUBLICO', 'TRANSPORTE_PRIVADO') THEN
    NEW.modalidad := 'TRANSPORTE_PUBLICO';
  END IF;

  NEW.motivo := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.motivo, '')), ''), 'VENTA'));
  NEW.moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));

  NEW.base_imponible := round(GREATEST(COALESCE(NEW.base_imponible, 0), 0)::numeric, 2);
  NEW.igv := round(GREATEST(COALESCE(NEW.igv, 0), 0)::numeric, 2);
  NEW.total := round(GREATEST(COALESCE(NEW.total, 0), 0)::numeric, 2);
  NEW.peso_total := round(GREATEST(COALESCE(NEW.peso_total, 0), 0)::numeric, 3);
  NEW.retry_count := GREATEST(COALESCE(NEW.retry_count, 0), 0);
  NEW.es_automatica := COALESCE(NEW.es_automatica, false);

  IF NEW.total > 0 AND NEW.base_imponible = 0 AND NEW.total >= NEW.igv THEN
    NEW.base_imponible := round((NEW.total - NEW.igv)::numeric, 2);
  END IF;

  v_numero_raw := NULLIF(btrim(COALESCE(NEW.numero, '')), '');
  IF v_numero_raw IS NOT NULL THEN
    v_numero_raw := upper(v_numero_raw);
  END IF;

  IF NEW.serie IS NULL OR btrim(NEW.serie) = '' THEN
    NEW.serie := NULLIF(upper(btrim(split_part(COALESCE(v_numero_raw, ''), '-', 1))), '');
  END IF;
  NEW.serie := regexp_replace(COALESCE(NEW.serie, 'T001'), '[^A-Z0-9]', '', 'g');
  NEW.serie := COALESCE(NULLIF(NEW.serie, ''), 'T001');
  NEW.serie := left(NEW.serie, 10);

  IF NEW.correlativo IS NULL OR NEW.correlativo <= 0 THEN
    v_num_part := split_part(COALESCE(v_numero_raw, ''), '-', 2);
    IF v_num_part ~ '^[0-9]+$' THEN
      NEW.correlativo := v_num_part::integer;
    END IF;
  END IF;
  NEW.correlativo := GREATEST(COALESCE(NEW.correlativo, 1), 1);

  IF v_numero_raw IS NULL OR v_numero_raw !~ '^[A-Z0-9]+-[0-9]+$' THEN
    NEW.numero := NEW.serie || '-' || lpad(NEW.correlativo::text, 8, '0');
  ELSE
    NEW.numero := NEW.serie || '-' || lpad(NEW.correlativo::text, GREATEST(8, length(split_part(v_numero_raw, '-', 2))), '0');
  END IF;

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'BORRADOR'));
  IF v_estado IN ('ACTIVO', 'PENDIENTE', 'GENERATED', 'NOT_SENT') THEN v_estado := 'BORRADOR'; END IF;
  IF v_estado IN ('EMITIDO', 'READY', 'LISTO') THEN v_estado := 'FIRMADO'; END IF;
  IF v_estado IN ('SENT', 'SENDING') THEN v_estado := 'ENVIADO'; END IF;
  IF v_estado IN ('ACCEPTED', 'ACEPTADA') THEN v_estado := 'ACEPTADO'; END IF;
  IF v_estado IN ('REJECTED', 'RECHAZADA') THEN v_estado := 'RECHAZADO'; END IF;
  IF v_estado IN ('FAILED') THEN v_estado := 'ERROR'; END IF;
  IF v_estado IN ('CANCELADO', 'ANULADA') THEN v_estado := 'ANULADO'; END IF;
  IF v_estado NOT IN ('BORRADOR', 'FIRMADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO', 'ERROR') THEN
    v_estado := 'BORRADOR';
  END IF;
  NEW.estado := v_estado;

  v_sunat := upper(COALESCE(
    NULLIF(btrim(COALESCE(NEW.sunat_status, '')), ''),
    CASE
      WHEN NEW.estado = 'BORRADOR' THEN 'NOT_SENT'
      WHEN NEW.estado = 'FIRMADO' THEN 'READY'
      WHEN NEW.estado = 'ENVIADO' THEN 'SENDING'
      WHEN NEW.estado = 'ACEPTADO' THEN 'ACCEPTED'
      WHEN NEW.estado = 'RECHAZADO' THEN 'REJECTED'
      WHEN NEW.estado = 'ERROR' THEN 'ERROR'
      ELSE 'NOT_SENT'
    END
  ));

  IF v_sunat IN ('BORRADOR', 'PENDIENTE', 'NOT_SENT') THEN v_sunat := 'NOT_SENT'; END IF;
  IF v_sunat IN ('FIRMADO', 'READY') THEN v_sunat := 'READY'; END IF;
  IF v_sunat IN ('ENVIADO', 'SENDING', 'SENT') THEN v_sunat := 'SENDING'; END IF;
  IF v_sunat IN ('ACEPTADO', 'ACCEPTED') THEN v_sunat := 'ACCEPTED'; END IF;
  IF v_sunat IN ('RECHAZADO', 'REJECTED') THEN v_sunat := 'REJECTED'; END IF;
  IF v_sunat IN ('FAILED', 'ERROR') THEN v_sunat := 'ERROR'; END IF;

  IF NEW.estado = 'ACEPTADO' THEN v_sunat := 'ACCEPTED'; END IF;
  IF NEW.estado = 'RECHAZADO' THEN v_sunat := 'REJECTED'; END IF;
  IF NEW.estado = 'ERROR' THEN v_sunat := 'ERROR'; END IF;

  IF v_sunat NOT IN ('NOT_SENT', 'READY', 'SENDING', 'ACCEPTED', 'REJECTED', 'ERROR') THEN
    v_sunat := 'NOT_SENT';
  END IF;
  NEW.sunat_status := v_sunat;

  NEW.numero_sunat := NULLIF(btrim(COALESCE(NEW.numero_sunat, '')), '');
  NEW.xml_firmado := NULLIF(btrim(COALESCE(NEW.xml_firmado, '')), '');
  NEW.hash_gre := NULLIF(btrim(COALESCE(NEW.hash_gre, '')), '');
  NEW.cdr_sunat := NULLIF(btrim(COALESCE(NEW.cdr_sunat, '')), '');

  NEW.fecha_traslado := COALESCE(NEW.fecha_traslado, NEW.fecha_emision);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  v_period_source := COALESCE(NEW.fecha_emision, NEW.fecha_traslado, NEW.created_at, now());

  NEW.anio := COALESCE(NULLIF(regexp_replace(COALESCE(NEW.anio, ''), '[^0-9]', '', 'g'), ''), to_char(v_period_source, 'YYYY'));
  IF length(NEW.anio) <> 4 THEN
    NEW.anio := to_char(v_period_source, 'YYYY');
  END IF;

  NEW.mes := COALESCE(NULLIF(regexp_replace(COALESCE(NEW.mes, ''), '[^0-9]', '', 'g'), ''), to_char(v_period_source, 'MM'));
  IF NEW.mes ~ '^[0-9]{1,2}$' THEN
    NEW.mes := lpad((GREATEST(LEAST(NEW.mes::integer, 12), 1))::text, 2, '0');
  ELSE
    NEW.mes := to_char(v_period_source, 'MM');
  END IF;

  NEW.datos_adicionales := COALESCE(NEW.datos_adicionales, '{}'::jsonb);
  IF jsonb_typeof(NEW.datos_adicionales) <> 'object' THEN
    NEW.datos_adicionales := jsonb_build_object('raw', NEW.datos_adicionales);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_gre_guias_row ON public.gre_guias;
CREATE TRIGGER trg_normalize_gre_guias_row
BEFORE INSERT OR UPDATE ON public.gre_guias
FOR EACH ROW
EXECUTE FUNCTION app.normalize_gre_guias_row();

CREATE OR REPLACE FUNCTION app.normalize_gre_detalles_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.gre_id := app.to_uuid_or_null(COALESCE(NEW.gre_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));

  NEW.descripcion := COALESCE(
    NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    'ITEM'
  );
  NEW.unidad_medida := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.unidad_medida, '')), ''), 'NIU'));
  NEW.cantidad := round(GREATEST(COALESCE(NEW.cantidad, 0), 0)::numeric, 3);
  IF NEW.cantidad <= 0 THEN
    NEW.cantidad := 1;
  END IF;
  NEW.peso := round(GREATEST(COALESCE(NEW.peso, 0), 0)::numeric, 3);

  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO'));
  IF NEW.estado NOT IN ('ACTIVO', 'INACTIVO') THEN
    NEW.estado := 'ACTIVO';
  END IF;

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_gre_detalles_row ON public.gre_detalles;
CREATE TRIGGER trg_normalize_gre_detalles_row
BEFORE INSERT OR UPDATE ON public.gre_detalles
FOR EACH ROW
EXECUTE FUNCTION app.normalize_gre_detalles_row();

CREATE OR REPLACE FUNCTION app.normalize_sire_files_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_periodo text;
  v_raw_status text;
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.correlacion_id := app.to_uuid_or_null(COALESCE(NEW.correlacion_id::text, ''));

  v_periodo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.periodo, '')), ''),
    NULLIF(btrim(COALESCE(NEW.period, '')), ''),
    to_char(COALESCE(NEW.created_at, now()), 'YYYY-MM')
  );
  v_periodo := left(v_periodo, 10);
  NEW.periodo := v_periodo;
  NEW.period := v_periodo;

  NEW.tipo := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo, '')), ''), 'REG_VEN'));
  NEW.tipo := left(NEW.tipo, 10);

  v_raw_status := upper(COALESCE(
    NULLIF(btrim(COALESCE(NEW.estado, '')), ''),
    NULLIF(btrim(COALESCE(NEW.status, '')), ''),
    'GENERANDO'
  ));

  IF v_raw_status IN ('RUNNING', 'GENERANDO', 'GENERATING') THEN v_estado := 'GENERANDO'; END IF;
  IF v_raw_status IN ('COMPLETED', 'GENERADO') THEN v_estado := 'GENERADO'; END IF;
  IF v_raw_status IN ('SENT', 'ENVIADO') THEN v_estado := 'ENVIADO'; END IF;
  IF v_raw_status IN ('PENDING', 'PENDIENTE') THEN v_estado := 'PENDIENTE'; END IF;
  IF v_raw_status IN ('FAILED', 'ERROR') THEN v_estado := 'ERROR'; END IF;
  IF v_raw_status IN ('CANCELLED', 'ANULADO') THEN v_estado := 'ANULADO'; END IF;
  v_estado := COALESCE(v_estado, 'GENERANDO');

  NEW.estado := v_estado;
  NEW.status := CASE v_estado
    WHEN 'GENERANDO' THEN 'RUNNING'
    WHEN 'GENERADO' THEN 'COMPLETED'
    WHEN 'ENVIADO' THEN 'SENT'
    WHEN 'PENDIENTE' THEN 'PENDING'
    WHEN 'ANULADO' THEN 'CANCELLED'
    WHEN 'ERROR' THEN 'ERROR'
    ELSE 'RUNNING'
  END;

  NEW.servicio := NULLIF(upper(btrim(COALESCE(NEW.servicio, ''))), '');
  NEW.operacion := NULLIF(upper(btrim(COALESCE(NEW.operacion, ''))), '');
  NEW.correlacion_tipo := NULLIF(upper(btrim(COALESCE(NEW.correlacion_tipo, ''))), '');
  NEW.error_message := NULLIF(btrim(COALESCE(NEW.error_message, '')), '');

  NEW.filename := COALESCE(
    NULLIF(btrim(COALESCE(NEW.filename, '')), ''),
    'SIRE_' || NEW.tipo || '_' || replace(NEW.periodo, '-', '') || '.txt'
  );
  NEW.file_path := NULLIF(btrim(COALESCE(NEW.file_path, '')), '');

  NEW.file_size := GREATEST(COALESCE(NEW.file_size, 0), 0);
  NEW.total_registros := GREATEST(COALESCE(NEW.total_registros, 0), 0);

  IF NEW.request_summary IS NOT NULL AND jsonb_typeof(NEW.request_summary) NOT IN ('object', 'array') THEN
    NEW.request_summary := jsonb_build_object('value', NEW.request_summary);
  END IF;
  IF NEW.response_summary IS NOT NULL AND jsonb_typeof(NEW.response_summary) NOT IN ('object', 'array') THEN
    NEW.response_summary := jsonb_build_object('value', NEW.response_summary);
  END IF;

  IF NEW.completed_at IS NULL AND NEW.estado IN ('GENERADO', 'ENVIADO', 'ERROR', 'ANULADO') THEN
    NEW.completed_at := now();
  END IF;

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_sire_files_row ON public.sire_files;
CREATE TRIGGER trg_normalize_sire_files_row
BEFORE INSERT OR UPDATE ON public.sire_files
FOR EACH ROW
EXECUTE FUNCTION app.normalize_sire_files_row();

CREATE OR REPLACE FUNCTION app.normalize_sire_registros_detalle_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.reporte_id := app.to_uuid_or_null(COALESCE(NEW.reporte_id::text, ''));
  NEW.cpe_id := app.to_uuid_or_null(COALESCE(NEW.cpe_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.venta_id := app.to_uuid_or_null(COALESCE(NEW.venta_id::text, ''));

  NEW.tipo_documento := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_documento, '')), ''), '01'));
  NEW.serie := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.serie, '')), ''), 'T001'));
  NEW.numero := COALESCE(NULLIF(btrim(COALESCE(NEW.numero, '')), ''), '00000001');
  NEW.total := round(GREATEST(COALESCE(NEW.total, 0), 0)::numeric, 2);
  NEW.es_credito := COALESCE(NEW.es_credito, false);
  NEW.fecha_registro := COALESCE(NEW.fecha_registro, now());

  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'REGISTRADO'));
  IF NEW.estado IN ('ACTIVO', 'COMPLETADO') THEN
    NEW.estado := 'REGISTRADO';
  END IF;
  IF NEW.estado NOT IN ('REGISTRADO', 'ANULADO') THEN
    NEW.estado := 'REGISTRADO';
  END IF;

  NEW.created_at := COALESCE(NEW.created_at, NEW.fecha_registro, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_sire_registros_detalle_row ON public.sire_registros_detalle;
CREATE TRIGGER trg_normalize_sire_registros_detalle_row
BEFORE INSERT OR UPDATE ON public.sire_registros_detalle
FOR EACH ROW
EXECUTE FUNCTION app.normalize_sire_registros_detalle_row();

UPDATE public.gre_guias SET updated_at = COALESCE(updated_at, now()) WHERE true;
UPDATE public.gre_detalles SET updated_at = COALESCE(updated_at, now()) WHERE true;
UPDATE public.sire_files SET updated_at = COALESCE(updated_at, now()) WHERE true;
UPDATE public.sire_registros_detalle SET updated_at = COALESCE(updated_at, now()) WHERE true;

-- ----------------------------------------------------------------------------
-- Índices runtime por patrones reales de consulta.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gre_guias_tenant_created_runtime
ON public.gre_guias (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gre_guias_tenant_estado_created_runtime
ON public.gre_guias (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gre_guias_tenant_sunat_retry_runtime
ON public.gre_guias (tenant_id, sunat_status, retry_count, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_gre_guias_tenant_serie_correlativo_runtime
ON public.gre_guias (tenant_id, serie, correlativo DESC);

CREATE INDEX IF NOT EXISTS idx_gre_detalles_tenant_gre_runtime
ON public.gre_detalles (tenant_id, gre_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gre_detalles_tenant_producto_runtime
ON public.gre_detalles (tenant_id, producto_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sire_files_tenant_periodo_tipo_runtime
ON public.sire_files (tenant_id, periodo, tipo, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sire_files_tenant_estado_created_runtime
ON public.sire_files (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sire_files_tenant_status_created_runtime
ON public.sire_files (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sire_registros_detalle_tenant_reporte_runtime
ON public.sire_registros_detalle (tenant_id, reporte_id, fecha_registro DESC);

CREATE INDEX IF NOT EXISTS idx_sire_registros_detalle_tenant_cpe_runtime
ON public.sire_registros_detalle (tenant_id, cpe_id, fecha_registro DESC);

COMMIT;
