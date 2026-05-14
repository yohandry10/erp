-- ============================================================================
-- 143__gre_legacy_alias_runtime_alignment.sql
-- Alineación runtime para alias legacy GRE: gre <-> gre_guias.
-- Objetivo: mantener compatibilidad con código/worker que aún consulta public.gre.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Shape runtime de public.gre para contrato legacy (dashboard/worker).
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.gre
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS correlativo integer,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS sunat_status text,
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS cpe_relacionado uuid,
  ADD COLUMN IF NOT EXISTS error_message text;

DROP POLICY IF EXISTS tenant_isolation ON public.gre;

ALTER TABLE IF EXISTS public.gre
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN numero TYPE text USING NULLIF(btrim(COALESCE(numero::text, '')), ''),
  ALTER COLUMN serie TYPE text USING NULLIF(upper(btrim(COALESCE(serie::text, ''))), ''),
  ALTER COLUMN correlativo TYPE integer USING NULLIF(app.to_int_or_zero(correlativo::text), 0),
  ALTER COLUMN idempotency_key TYPE text USING NULLIF(btrim(COALESCE(idempotency_key::text, '')), ''),
  ALTER COLUMN sunat_status TYPE text USING NULLIF(upper(btrim(COALESCE(sunat_status::text, ''))), ''),
  ALTER COLUMN retry_count TYPE integer USING GREATEST(app.to_int_or_zero(retry_count::text), 0),
  ALTER COLUMN next_retry_at TYPE timestamptz USING CASE
    WHEN next_retry_at IS NULL OR btrim(next_retry_at::text) = '' THEN NULL
    ELSE next_retry_at::timestamptz
  END,
  ALTER COLUMN cpe_relacionado TYPE uuid USING app.to_uuid_or_null(COALESCE(cpe_relacionado::text, '')),
  ALTER COLUMN error_message TYPE text USING NULLIF(btrim(COALESCE(error_message::text, '')), ''),
  ALTER COLUMN fecha_emision TYPE timestamptz USING CASE
    WHEN fecha_emision IS NULL OR btrim(fecha_emision::text) = '' THEN NULL
    ELSE fecha_emision::timestamptz
  END,
  ALTER COLUMN estado TYPE text USING NULLIF(upper(btrim(COALESCE(estado::text, ''))), ''),
  ALTER COLUMN metadata TYPE jsonb USING COALESCE(
    CASE
      WHEN metadata IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(metadata) = 'object' THEN metadata
      ELSE '{}'::jsonb
    END,
    '{}'::jsonb
  ),
  ALTER COLUMN created_at TYPE timestamptz USING CASE
    WHEN created_at IS NULL OR btrim(created_at::text) = '' THEN now()
    ELSE created_at::timestamptz
  END,
  ALTER COLUMN updated_at TYPE timestamptz USING CASE
    WHEN updated_at IS NULL OR btrim(updated_at::text) = '' THEN now()
    ELSE updated_at::timestamptz
  END,
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE_ENVIO',
  ALTER COLUMN sunat_status SET DEFAULT 'NOT_SENT',
  ALTER COLUMN retry_count SET DEFAULT 0,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

-- ----------------------------------------------------------------------------
-- Helpers de mapeo de estados entre canónico (gre_guias) y legacy (gre).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.map_gre_guias_to_legacy_estado(
  p_estado text,
  p_sunat_status text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_estado text := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'BORRADOR'));
  v_sunat text := upper(COALESCE(NULLIF(btrim(COALESCE(p_sunat_status, '')), ''), 'NOT_SENT'));
BEGIN
  IF v_estado = 'ACEPTADO' OR v_sunat = 'ACCEPTED' THEN RETURN 'ACEPTADO'; END IF;
  IF v_estado = 'RECHAZADO' OR v_sunat = 'REJECTED' THEN RETURN 'RECHAZADO'; END IF;
  IF v_estado = 'ANULADO' THEN RETURN 'ANULADO'; END IF;
  IF v_estado = 'ERROR' OR v_sunat = 'ERROR' THEN RETURN 'ERROR'; END IF;
  IF v_estado = 'ENVIADO' OR v_sunat = 'SENDING' THEN RETURN 'ENVIADO'; END IF;
  RETURN 'PENDIENTE_ENVIO';
END;
$$;

CREATE OR REPLACE FUNCTION app.map_gre_legacy_to_gre_guias_estado(
  p_legacy_estado text,
  p_sunat_status text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_estado text := upper(COALESCE(NULLIF(btrim(COALESCE(p_legacy_estado, '')), ''), 'PENDIENTE_ENVIO'));
  v_sunat text := upper(COALESCE(NULLIF(btrim(COALESCE(p_sunat_status, '')), ''), ''));
BEGIN
  IF v_estado IN ('ACEPTADO', 'ACCEPTED') OR v_sunat = 'ACCEPTED' THEN RETURN 'ACEPTADO'; END IF;
  IF v_estado IN ('RECHAZADO', 'REJECTED') OR v_sunat = 'REJECTED' THEN RETURN 'RECHAZADO'; END IF;
  IF v_estado IN ('ANULADO', 'CANCELADO', 'CANCELLED') THEN RETURN 'ANULADO'; END IF;
  IF v_estado IN ('ERROR', 'FAILED') OR v_sunat = 'ERROR' THEN RETURN 'ERROR'; END IF;
  IF v_estado IN ('ENVIADO', 'SENT', 'SENDING') OR v_sunat = 'SENDING' THEN RETURN 'ENVIADO'; END IF;
  IF v_sunat = 'READY' THEN RETURN 'FIRMADO'; END IF;
  IF v_estado IN ('PENDIENTE_ENVIO', 'PENDIENTE', 'READY') THEN RETURN 'FIRMADO'; END IF;
  RETURN 'BORRADOR';
END;
$$;

CREATE OR REPLACE FUNCTION app.map_gre_legacy_to_sunat_status(
  p_legacy_estado text,
  p_sunat_status text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_estado text := upper(COALESCE(NULLIF(btrim(COALESCE(p_legacy_estado, '')), ''), 'PENDIENTE_ENVIO'));
  v_sunat text := upper(COALESCE(NULLIF(btrim(COALESCE(p_sunat_status, '')), ''), ''));
BEGIN
  IF v_sunat IN ('NOT_SENT', 'READY', 'SENDING', 'ACCEPTED', 'REJECTED', 'ERROR') THEN
    RETURN v_sunat;
  END IF;

  IF v_estado IN ('ACEPTADO', 'ACCEPTED') THEN RETURN 'ACCEPTED'; END IF;
  IF v_estado IN ('RECHAZADO', 'REJECTED') THEN RETURN 'REJECTED'; END IF;
  IF v_estado IN ('ERROR', 'FAILED', 'ANULADO', 'CANCELADO') THEN RETURN 'ERROR'; END IF;
  IF v_estado IN ('ENVIADO', 'SENDING', 'SENT') THEN RETURN 'SENDING'; END IF;
  IF v_estado IN ('PENDIENTE_ENVIO', 'PENDIENTE', 'READY', 'FIRMADO') THEN RETURN 'READY'; END IF;

  RETURN 'NOT_SENT';
END;
$$;

-- ----------------------------------------------------------------------------
-- Trigger de normalización runtime para public.gre.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_gre_legacy_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_numero_raw text;
  v_num_part text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cpe_relacionado := app.to_uuid_or_null(COALESCE(NEW.cpe_relacionado::text, ''));

  NEW.nombre := NULLIF(btrim(COALESCE(NEW.nombre, '')), '');
  NEW.codigo := NULLIF(btrim(COALESCE(NEW.codigo, '')), '');
  NEW.idempotency_key := NULLIF(btrim(COALESCE(NEW.idempotency_key, '')), '');
  NEW.error_message := NULLIF(btrim(COALESCE(NEW.error_message, '')), '');

  v_numero_raw := NULLIF(upper(btrim(COALESCE(NEW.numero, ''))), '');

  IF NEW.serie IS NULL OR btrim(NEW.serie) = '' THEN
    NEW.serie := NULLIF(upper(btrim(split_part(COALESCE(v_numero_raw, ''), '-', 1))), '');
  END IF;
  NEW.serie := regexp_replace(COALESCE(NEW.serie, 'T001'), '[^A-Z0-9]', '', 'g');
  NEW.serie := COALESCE(NULLIF(left(NEW.serie, 10), ''), 'T001');

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

  NEW.estado := app.map_gre_guias_to_legacy_estado(NEW.estado, NEW.sunat_status);
  NEW.sunat_status := app.map_gre_legacy_to_sunat_status(NEW.estado, NEW.sunat_status);
  NEW.retry_count := GREATEST(COALESCE(NEW.retry_count, 0), 0);
  NEW.fecha_emision := COALESCE(NEW.fecha_emision, NEW.created_at, now());

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  IF jsonb_typeof(NEW.metadata) <> 'object' THEN
    NEW.metadata := jsonb_build_object('raw', NEW.metadata);
  END IF;

  NEW.nombre := COALESCE(NEW.nombre, 'GRE ' || NEW.numero);
  NEW.codigo := COALESCE(NEW.codigo, NEW.numero);

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_gre_legacy_row ON public.gre;
CREATE TRIGGER trg_normalize_gre_legacy_row
BEFORE INSERT OR UPDATE ON public.gre
FOR EACH ROW
EXECUTE FUNCTION app.normalize_gre_legacy_row();

-- ----------------------------------------------------------------------------
-- Trigger de sincronización canónico -> legacy (gre_guias -> gre).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_gre_from_gre_guias()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_legacy_estado text;
  v_sunat_status text;
  v_numero text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.gre g
    WHERE g.id = OLD.id;
    RETURN OLD;
  END IF;

  v_legacy_estado := app.map_gre_guias_to_legacy_estado(NEW.estado, NEW.sunat_status);
  v_sunat_status := app.map_gre_legacy_to_sunat_status(v_legacy_estado, NEW.sunat_status);

  v_numero := COALESCE(
    NULLIF(btrim(COALESCE(NEW.numero, '')), ''),
    COALESCE(NULLIF(upper(btrim(COALESCE(NEW.serie, ''))), ''), 'T001')
      || '-' || lpad(COALESCE(NULLIF(NEW.correlativo, 0), 1)::text, 8, '0')
  );

  INSERT INTO public.gre (
    id,
    tenant_id,
    nombre,
    codigo,
    estado,
    metadata,
    created_at,
    updated_at,
    fecha_emision,
    numero,
    serie,
    correlativo,
    idempotency_key,
    sunat_status,
    retry_count,
    next_retry_at,
    cpe_relacionado,
    error_message
  )
  VALUES (
    NEW.id,
    NEW.tenant_id,
    COALESCE(
      NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
      NULLIF(btrim(COALESCE(NEW.cliente_nombre, '')), ''),
      NULLIF(btrim(COALESCE(NEW.destinatario, '')), ''),
      'GRE ' || COALESCE(v_numero, NEW.id::text)
    ),
    COALESCE(NULLIF(btrim(COALESCE(NEW.codigo, '')), ''), v_numero, NEW.id::text),
    v_legacy_estado,
    COALESCE(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'sync_source', 'gre_guias',
        'gre_guias_estado', COALESCE(NEW.estado, 'BORRADOR'),
        'gre_guias_sunat_status', COALESCE(NEW.sunat_status, 'NOT_SENT')
      ),
    COALESCE(NEW.created_at, now()),
    now(),
    COALESCE(NEW.fecha_emision, NEW.fecha_traslado, NEW.created_at, now()),
    v_numero,
    NEW.serie,
    NEW.correlativo,
    NEW.idempotency_key,
    v_sunat_status,
    COALESCE(NEW.retry_count, 0),
    NEW.next_retry_at,
    NEW.cpe_relacionado,
    NEW.error_message
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    nombre = EXCLUDED.nombre,
    codigo = EXCLUDED.codigo,
    estado = EXCLUDED.estado,
    metadata = COALESCE(public.gre.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
    fecha_emision = COALESCE(EXCLUDED.fecha_emision, public.gre.fecha_emision),
    numero = COALESCE(EXCLUDED.numero, public.gre.numero),
    serie = COALESCE(EXCLUDED.serie, public.gre.serie),
    correlativo = COALESCE(EXCLUDED.correlativo, public.gre.correlativo),
    idempotency_key = COALESCE(EXCLUDED.idempotency_key, public.gre.idempotency_key),
    sunat_status = COALESCE(EXCLUDED.sunat_status, public.gre.sunat_status),
    retry_count = GREATEST(COALESCE(EXCLUDED.retry_count, public.gre.retry_count, 0), 0),
    next_retry_at = COALESCE(EXCLUDED.next_retry_at, public.gre.next_retry_at),
    cpe_relacionado = COALESCE(EXCLUDED.cpe_relacionado, public.gre.cpe_relacionado),
    error_message = COALESCE(EXCLUDED.error_message, public.gre.error_message),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_gre_from_gre_guias ON public.gre_guias;
CREATE TRIGGER trg_sync_gre_from_gre_guias
AFTER INSERT OR UPDATE OR DELETE
ON public.gre_guias
FOR EACH ROW
EXECUTE FUNCTION app.sync_gre_from_gre_guias();

-- ----------------------------------------------------------------------------
-- Trigger de sincronización legacy -> canónico (gre -> gre_guias).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_gre_guias_from_gre()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado_guia text;
  v_sunat_status text;
  v_numero text;
  v_serie text;
  v_correlativo integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  v_numero := NULLIF(btrim(COALESCE(NEW.numero, '')), '');
  v_serie := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.serie, ''))), ''),
    NULLIF(upper(btrim(split_part(COALESCE(v_numero, ''), '-', 1))), ''),
    'T001'
  );

  v_correlativo := COALESCE(
    NULLIF(NEW.correlativo, 0),
    CASE
      WHEN split_part(COALESCE(v_numero, ''), '-', 2) ~ '^[0-9]+$'
        THEN split_part(v_numero, '-', 2)::integer
      ELSE NULL
    END,
    1
  );

  IF v_numero IS NULL THEN
    v_numero := v_serie || '-' || lpad(v_correlativo::text, 8, '0');
  END IF;

  v_sunat_status := app.map_gre_legacy_to_sunat_status(NEW.estado, NEW.sunat_status);
  v_estado_guia := app.map_gre_legacy_to_gre_guias_estado(NEW.estado, v_sunat_status);

  INSERT INTO public.gre_guias (
    id,
    tenant_id,
    nombre,
    codigo,
    estado,
    metadata,
    created_at,
    updated_at,
    fecha_emision,
    numero,
    serie,
    correlativo,
    sunat_status,
    idempotency_key,
    retry_count,
    next_retry_at,
    cpe_relacionado,
    error_message
  )
  VALUES (
    NEW.id,
    NEW.tenant_id,
    COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'GRE ' || v_numero),
    COALESCE(NULLIF(btrim(COALESCE(NEW.codigo, '')), ''), v_numero),
    v_estado_guia,
    COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('sync_source', 'gre_legacy'),
    COALESCE(NEW.created_at, now()),
    now(),
    NEW.fecha_emision,
    v_numero,
    v_serie,
    v_correlativo,
    v_sunat_status,
    NEW.idempotency_key,
    COALESCE(NEW.retry_count, 0),
    NEW.next_retry_at,
    NEW.cpe_relacionado,
    NEW.error_message
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    nombre = COALESCE(EXCLUDED.nombre, public.gre_guias.nombre),
    codigo = COALESCE(EXCLUDED.codigo, public.gre_guias.codigo),
    estado = COALESCE(EXCLUDED.estado, public.gre_guias.estado),
    metadata = COALESCE(public.gre_guias.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
    fecha_emision = COALESCE(EXCLUDED.fecha_emision, public.gre_guias.fecha_emision),
    numero = COALESCE(EXCLUDED.numero, public.gre_guias.numero),
    serie = COALESCE(EXCLUDED.serie, public.gre_guias.serie),
    correlativo = COALESCE(EXCLUDED.correlativo, public.gre_guias.correlativo),
    sunat_status = COALESCE(EXCLUDED.sunat_status, public.gre_guias.sunat_status),
    idempotency_key = COALESCE(EXCLUDED.idempotency_key, public.gre_guias.idempotency_key),
    retry_count = GREATEST(COALESCE(EXCLUDED.retry_count, public.gre_guias.retry_count, 0), 0),
    next_retry_at = COALESCE(EXCLUDED.next_retry_at, public.gre_guias.next_retry_at),
    cpe_relacionado = COALESCE(EXCLUDED.cpe_relacionado, public.gre_guias.cpe_relacionado),
    error_message = COALESCE(EXCLUDED.error_message, public.gre_guias.error_message),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_gre_guias_from_gre ON public.gre;
CREATE TRIGGER trg_sync_gre_guias_from_gre
AFTER INSERT OR UPDATE
ON public.gre
FOR EACH ROW
EXECUTE FUNCTION app.sync_gre_guias_from_gre();

-- ----------------------------------------------------------------------------
-- Backfill inicial: prioriza canónico (gre_guias -> gre) y completa faltantes.
-- ----------------------------------------------------------------------------
INSERT INTO public.gre (
  id,
  tenant_id,
  nombre,
  codigo,
  estado,
  metadata,
  created_at,
  updated_at,
  fecha_emision,
  numero,
  serie,
  correlativo,
  idempotency_key,
  sunat_status,
  retry_count,
  next_retry_at,
  cpe_relacionado,
  error_message
)
SELECT
  gg.id,
  gg.tenant_id,
  COALESCE(NULLIF(btrim(COALESCE(gg.nombre, '')), ''), NULLIF(btrim(COALESCE(gg.cliente_nombre, '')), ''), 'GRE ' || COALESCE(gg.numero, gg.id::text)),
  COALESCE(NULLIF(btrim(COALESCE(gg.codigo, '')), ''), gg.numero, gg.id::text),
  app.map_gre_guias_to_legacy_estado(gg.estado, gg.sunat_status),
  COALESCE(gg.metadata, '{}'::jsonb) || jsonb_build_object('sync_source', 'gre_guias_backfill'),
  COALESCE(gg.created_at, now()),
  COALESCE(gg.updated_at, now()),
  COALESCE(gg.fecha_emision, gg.fecha_traslado, gg.created_at, now()),
  gg.numero,
  gg.serie,
  gg.correlativo,
  gg.idempotency_key,
  app.map_gre_legacy_to_sunat_status(app.map_gre_guias_to_legacy_estado(gg.estado, gg.sunat_status), gg.sunat_status),
  COALESCE(gg.retry_count, 0),
  gg.next_retry_at,
  gg.cpe_relacionado,
  gg.error_message
FROM public.gre_guias gg
WHERE gg.id IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  nombre = EXCLUDED.nombre,
  codigo = EXCLUDED.codigo,
  estado = EXCLUDED.estado,
  metadata = COALESCE(public.gre.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
  fecha_emision = COALESCE(EXCLUDED.fecha_emision, public.gre.fecha_emision),
  numero = COALESCE(EXCLUDED.numero, public.gre.numero),
  serie = COALESCE(EXCLUDED.serie, public.gre.serie),
  correlativo = COALESCE(EXCLUDED.correlativo, public.gre.correlativo),
  idempotency_key = COALESCE(EXCLUDED.idempotency_key, public.gre.idempotency_key),
  sunat_status = COALESCE(EXCLUDED.sunat_status, public.gre.sunat_status),
  retry_count = GREATEST(COALESCE(EXCLUDED.retry_count, public.gre.retry_count, 0), 0),
  next_retry_at = COALESCE(EXCLUDED.next_retry_at, public.gre.next_retry_at),
  cpe_relacionado = COALESCE(EXCLUDED.cpe_relacionado, public.gre.cpe_relacionado),
  error_message = COALESCE(EXCLUDED.error_message, public.gre.error_message),
  updated_at = now();

INSERT INTO public.gre_guias (
  id,
  tenant_id,
  nombre,
  codigo,
  estado,
  metadata,
  created_at,
  updated_at,
  fecha_emision,
  numero,
  serie,
  correlativo,
  sunat_status,
  idempotency_key,
  retry_count,
  next_retry_at,
  cpe_relacionado,
  error_message
)
SELECT
  g.id,
  g.tenant_id,
  COALESCE(NULLIF(btrim(COALESCE(g.nombre, '')), ''), 'GRE ' || COALESCE(g.numero, g.id::text)),
  COALESCE(NULLIF(btrim(COALESCE(g.codigo, '')), ''), g.numero, g.id::text),
  app.map_gre_legacy_to_gre_guias_estado(g.estado, g.sunat_status),
  COALESCE(g.metadata, '{}'::jsonb) || jsonb_build_object('sync_source', 'gre_legacy_backfill'),
  COALESCE(g.created_at, now()),
  COALESCE(g.updated_at, now()),
  g.fecha_emision,
  COALESCE(
    NULLIF(btrim(COALESCE(g.numero, '')), ''),
    COALESCE(NULLIF(upper(btrim(COALESCE(g.serie, ''))), ''), 'T001')
      || '-' || lpad(COALESCE(NULLIF(g.correlativo, 0), 1)::text, 8, '0')
  ),
  g.serie,
  g.correlativo,
  app.map_gre_legacy_to_sunat_status(g.estado, g.sunat_status),
  g.idempotency_key,
  COALESCE(g.retry_count, 0),
  g.next_retry_at,
  g.cpe_relacionado,
  g.error_message
FROM public.gre g
LEFT JOIN public.gre_guias gg
  ON gg.id = g.id
WHERE gg.id IS NULL
  AND g.id IS NOT NULL
  AND g.tenant_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

UPDATE public.gre
SET
  estado = app.map_gre_guias_to_legacy_estado(estado, sunat_status),
  sunat_status = app.map_gre_legacy_to_sunat_status(estado, sunat_status),
  metadata = COALESCE(metadata, '{}'::jsonb),
  retry_count = GREATEST(COALESCE(retry_count, 0), 0),
  updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- Índices runtime para consultas legacy.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gre_tenant_estado_created_runtime
ON public.gre (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gre_tenant_retry_queue_runtime
ON public.gre (tenant_id, estado, retry_count, next_retry_at, updated_at DESC)
WHERE tenant_id IS NOT NULL
  AND estado IN ('PENDIENTE_ENVIO', 'RECHAZADO', 'ERROR');

CREATE INDEX IF NOT EXISTS idx_gre_tenant_numero_runtime
ON public.gre (tenant_id, upper(numero))
WHERE tenant_id IS NOT NULL
  AND numero IS NOT NULL
  AND btrim(numero) <> '';

SELECT app.apply_tenant_policy('public', 'gre');

COMMIT;
