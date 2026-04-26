-- ============================================================================
-- 095__security_rate_limit_runtime_alignment.sql
-- Alineación runtime para módulo de seguridad / adaptive rate limiting.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- trusted_ips: columnas usadas por AdaptiveRateLimitService.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.trusted_ips
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- ----------------------------------------------------------------------------
-- rate_limit_blocks: columnas usadas para bloqueos temporales.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.rate_limit_blocks
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS blocked_endpoint text,
  ADD COLUMN IF NOT EXISTS request_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_by uuid,
  ADD COLUMN IF NOT EXISTS release_reason text;

-- ----------------------------------------------------------------------------
-- rate_limit_anomalies: shape forense para detección/revisión.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.rate_limit_anomalies
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS anomaly_type text,
  ADD COLUMN IF NOT EXISTS severity text DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS request_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baseline_avg numeric(12,2),
  ADD COLUMN IF NOT EXISTS threshold_exceeded numeric(12,2),
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS action_taken text,
  ADD COLUMN IF NOT EXISTS block_id uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS review_notes text;

-- ----------------------------------------------------------------------------
-- rate_limit_configs: contrato de configuración por endpoint.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.rate_limit_configs
  ADD COLUMN IF NOT EXISTS endpoint_pattern text,
  ADD COLUMN IF NOT EXISTS base_limit integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS window_ms integer DEFAULT 60000,
  ADD COLUMN IF NOT EXISTS adaptive_multiplier numeric(10,2) DEFAULT 3,
  ADD COLUMN IF NOT EXISTS burst_multiplier numeric(10,2) DEFAULT 5,
  ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true;

-- ----------------------------------------------------------------------------
-- request_logs: métricas adicionales para análisis de tráfico.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.request_logs
  ADD COLUMN IF NOT EXISTS request_size integer,
  ADD COLUMN IF NOT EXISTS response_size integer;

-- ----------------------------------------------------------------------------
-- Normalización de trusted_ips.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_trusted_ips_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.description := COALESCE(
    NULLIF(btrim(COALESCE(NEW.description, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    CASE
      WHEN NEW.ip_address IS NOT NULL THEN format('Trusted IP %s', NEW.ip_address::text)
      ELSE 'Trusted IP'
    END
  );

  NEW.active := COALESCE(
    NEW.active,
    CASE
      WHEN upper(COALESCE(NEW.estado, 'ACTIVO')) = 'INACTIVO' THEN false
      ELSE true
    END
  );
  NEW.estado := CASE WHEN NEW.active THEN 'ACTIVO' ELSE 'INACTIVO' END;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_trusted_ips_row ON public.trusted_ips;
CREATE TRIGGER trg_normalize_trusted_ips_row
BEFORE INSERT OR UPDATE ON public.trusted_ips
FOR EACH ROW
EXECUTE FUNCTION app.normalize_trusted_ips_row();

-- ----------------------------------------------------------------------------
-- Normalización de rate_limit_blocks.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_rate_limit_blocks_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.reason := COALESCE(
    NULLIF(btrim(COALESCE(NEW.reason, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    'RATE_LIMIT'
  );
  NEW.blocked_endpoint := NULLIF(btrim(COALESCE(NEW.blocked_endpoint, '')), '');
  NEW.request_count := GREATEST(COALESCE(NEW.request_count, 0), 0);

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  NEW.estado := CASE
    WHEN NEW.released_at IS NOT NULL THEN 'INACTIVO'
    WHEN NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() THEN 'INACTIVO'
    ELSE 'ACTIVO'
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_rate_limit_blocks_row ON public.rate_limit_blocks;
CREATE TRIGGER trg_normalize_rate_limit_blocks_row
BEFORE INSERT OR UPDATE ON public.rate_limit_blocks
FOR EACH ROW
EXECUTE FUNCTION app.normalize_rate_limit_blocks_row();

-- ----------------------------------------------------------------------------
-- Normalización de rate_limit_configs.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_rate_limit_configs_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.endpoint_pattern := COALESCE(
    NULLIF(btrim(COALESCE(NEW.endpoint_pattern, '')), ''),
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    'DEFAULT'
  );
  NEW.endpoint_pattern := upper(NEW.endpoint_pattern);

  NEW.base_limit := GREATEST(COALESCE(NEW.base_limit, 100), 1);
  NEW.window_ms := GREATEST(COALESCE(NEW.window_ms, 60000), 1000);
  NEW.adaptive_multiplier := GREATEST(COALESCE(NEW.adaptive_multiplier, 3), 0.1);
  NEW.burst_multiplier := GREATEST(COALESCE(NEW.burst_multiplier, 5), 1);

  NEW.enabled := COALESCE(
    NEW.enabled,
    CASE
      WHEN upper(COALESCE(NEW.estado, 'ACTIVO')) = 'INACTIVO' THEN false
      ELSE true
    END
  );
  NEW.estado := CASE WHEN NEW.enabled THEN 'ACTIVO' ELSE 'INACTIVO' END;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_rate_limit_configs_row ON public.rate_limit_configs;
CREATE TRIGGER trg_normalize_rate_limit_configs_row
BEFORE INSERT OR UPDATE ON public.rate_limit_configs
FOR EACH ROW
EXECUTE FUNCTION app.normalize_rate_limit_configs_row();

-- ----------------------------------------------------------------------------
-- Normalización de rate_limit_anomalies.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_rate_limit_anomalies_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.endpoint := COALESCE(
    NULLIF(btrim(COALESCE(NEW.endpoint, '')), ''),
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    'UNKNOWN'
  );
  NEW.anomaly_type := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.anomaly_type, '')), ''), 'SUSTAINED'));
  NEW.severity := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.severity, '')), ''), 'MEDIUM'));
  NEW.description := COALESCE(
    NULLIF(btrim(COALESCE(NEW.description, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    format('Rate limit anomaly (%s)', NEW.anomaly_type)
  );
  NEW.request_count := GREATEST(COALESCE(NEW.request_count, 0), 0);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  NEW.estado := COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_rate_limit_anomalies_row ON public.rate_limit_anomalies;
CREATE TRIGGER trg_normalize_rate_limit_anomalies_row
BEFORE INSERT OR UPDATE ON public.rate_limit_anomalies
FOR EACH ROW
EXECUTE FUNCTION app.normalize_rate_limit_anomalies_row();

-- ----------------------------------------------------------------------------
-- Backfill de normalización.
-- ----------------------------------------------------------------------------
UPDATE public.trusted_ips
SET updated_at = COALESCE(updated_at, now());

UPDATE public.rate_limit_blocks
SET updated_at = COALESCE(updated_at, now());

UPDATE public.rate_limit_configs
SET updated_at = COALESCE(updated_at, now());

UPDATE public.rate_limit_anomalies
SET updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Seed mínimo global de rate limit configs (idempotente).
-- ----------------------------------------------------------------------------
INSERT INTO public.rate_limit_configs (
  tenant_id,
  endpoint_pattern,
  base_limit,
  window_ms,
  adaptive_multiplier,
  burst_multiplier,
  enabled,
  estado,
  metadata,
  created_at,
  updated_at
)
SELECT
  NULL::uuid,
  s.endpoint_pattern,
  s.base_limit,
  s.window_ms,
  s.adaptive_multiplier,
  s.burst_multiplier,
  true,
  'ACTIVO',
  '{}'::jsonb,
  now(),
  now()
FROM (
  VALUES
    ('POST /API/AUTH/LOGIN'::text, 5::integer, 60000::integer, 1.5::numeric, 2.0::numeric),
    ('POST /API/AUTH/REFRESH'::text, 10::integer, 60000::integer, 2.0::numeric, 3.0::numeric),
    ('POST /API/PEDIDOS'::text, 100::integer, 3600000::integer, 3.0::numeric, 5.0::numeric),
    ('GET /API/PRODUCTOS'::text, 1000::integer, 3600000::integer, 3.0::numeric, 5.0::numeric),
    ('POST /API/POS/VENTAS'::text, 200::integer, 3600000::integer, 3.0::numeric, 5.0::numeric),
    ('GET /API/REPORTES'::text, 50::integer, 3600000::integer, 2.0::numeric, 3.0::numeric),
    ('DEFAULT'::text, 100::integer, 60000::integer, 3.0::numeric, 5.0::numeric)
) AS s(endpoint_pattern, base_limit, window_ms, adaptive_multiplier, burst_multiplier)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.rate_limit_configs c
  WHERE c.tenant_id IS NULL
    AND upper(COALESCE(c.endpoint_pattern, '')) = s.endpoint_pattern
);

-- ----------------------------------------------------------------------------
-- Índices runtime.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_trusted_ips_active_expires_runtime
ON public.trusted_ips (active, expires_at, ip_address);

CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_tenant_user_expires_runtime
ON public.rate_limit_blocks (tenant_id, user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_active_runtime
ON public.rate_limit_blocks (tenant_id, user_id, created_at DESC)
WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rate_limit_configs_tenant_enabled_endpoint_runtime
ON public.rate_limit_configs (tenant_id, enabled, endpoint_pattern);

CREATE INDEX IF NOT EXISTS idx_rate_limit_anomalies_tenant_created_runtime
ON public.rate_limit_anomalies (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limit_anomalies_tenant_severity_created_runtime
ON public.rate_limit_anomalies (tenant_id, severity, created_at DESC);

COMMIT;
