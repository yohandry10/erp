-- ============================================================================
-- 096__security_rate_limit_integrity_constraints.sql
-- Integridad de datos y RLS para tablas de security rate limiting.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill de valores mínimos no nulos para constraints.
-- ----------------------------------------------------------------------------
UPDATE public.trusted_ips
SET
  description = COALESCE(
    NULLIF(btrim(COALESCE(description, '')), ''),
    CASE
      WHEN ip_address IS NOT NULL THEN format('Trusted IP %s', ip_address::text)
      ELSE 'Trusted IP'
    END
  ),
  active = COALESCE(active, true),
  estado = CASE WHEN COALESCE(active, true) THEN 'ACTIVO' ELSE 'INACTIVO' END,
  updated_at = now()
WHERE
  description IS NULL
  OR btrim(COALESCE(description, '')) = ''
  OR active IS NULL
  OR estado IS NULL
  OR btrim(COALESCE(estado, '')) = '';

UPDATE public.rate_limit_blocks
SET
  reason = COALESCE(NULLIF(btrim(COALESCE(reason, '')), ''), 'RATE_LIMIT'),
  request_count = GREATEST(COALESCE(request_count, 0), 0),
  estado = CASE
    WHEN released_at IS NOT NULL THEN 'INACTIVO'
    WHEN expires_at IS NOT NULL AND expires_at <= now() THEN 'INACTIVO'
    ELSE 'ACTIVO'
  END,
  updated_at = now()
WHERE
  reason IS NULL
  OR btrim(COALESCE(reason, '')) = ''
  OR request_count IS NULL
  OR request_count < 0
  OR estado IS NULL
  OR btrim(COALESCE(estado, '')) = '';

UPDATE public.rate_limit_anomalies
SET
  anomaly_type = upper(COALESCE(NULLIF(btrim(COALESCE(anomaly_type, '')), ''), 'SUSTAINED')),
  severity = upper(COALESCE(NULLIF(btrim(COALESCE(severity, '')), ''), 'MEDIUM')),
  description = COALESCE(
    NULLIF(btrim(COALESCE(description, '')), ''),
    format('Rate limit anomaly (%s)', upper(COALESCE(NULLIF(btrim(COALESCE(anomaly_type, '')), ''), 'SUSTAINED')))
  ),
  request_count = GREATEST(COALESCE(request_count, 0), 0),
  updated_at = now()
WHERE
  anomaly_type IS NULL
  OR btrim(COALESCE(anomaly_type, '')) = ''
  OR severity IS NULL
  OR btrim(COALESCE(severity, '')) = ''
  OR description IS NULL
  OR btrim(COALESCE(description, '')) = ''
  OR request_count IS NULL
  OR request_count < 0;

UPDATE public.rate_limit_configs
SET
  endpoint_pattern = upper(COALESCE(NULLIF(btrim(COALESCE(endpoint_pattern, '')), ''), 'DEFAULT')),
  base_limit = GREATEST(COALESCE(base_limit, 100), 1),
  window_ms = GREATEST(COALESCE(window_ms, 60000), 1000),
  adaptive_multiplier = GREATEST(COALESCE(adaptive_multiplier, 3), 0.1),
  burst_multiplier = GREATEST(COALESCE(burst_multiplier, 5), 1),
  enabled = COALESCE(enabled, true),
  estado = CASE WHEN COALESCE(enabled, true) THEN 'ACTIVO' ELSE 'INACTIVO' END,
  updated_at = now()
WHERE
  endpoint_pattern IS NULL
  OR btrim(COALESCE(endpoint_pattern, '')) = ''
  OR base_limit IS NULL
  OR base_limit <= 0
  OR window_ms IS NULL
  OR window_ms <= 0
  OR adaptive_multiplier IS NULL
  OR adaptive_multiplier <= 0
  OR burst_multiplier IS NULL
  OR burst_multiplier < 1
  OR enabled IS NULL
  OR estado IS NULL
  OR btrim(COALESCE(estado, '')) = '';

-- ----------------------------------------------------------------------------
-- Dedupe para soportar índices únicos operativos.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), ip_address
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.trusted_ips
  WHERE ip_address IS NOT NULL
    AND COALESCE(active, true) = true
)
UPDATE public.trusted_ips t
SET
  active = false,
  estado = 'INACTIVO',
  updated_at = now()
FROM ranked r
WHERE t.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(endpoint_pattern)
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.rate_limit_configs
  WHERE endpoint_pattern IS NOT NULL
    AND btrim(endpoint_pattern) <> ''
    AND COALESCE(enabled, true) = true
)
UPDATE public.rate_limit_configs c
SET
  enabled = false,
  estado = 'INACTIVO',
  updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Constraints de calidad.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.trusted_ips') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_trusted_ips_description_nonempty'
        AND conrelid = 'public.trusted_ips'::regclass
    ) THEN
      ALTER TABLE public.trusted_ips
      ADD CONSTRAINT ck_trusted_ips_description_nonempty
      CHECK (description IS NOT NULL AND btrim(description) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_trusted_ips_expires_after_created'
        AND conrelid = 'public.trusted_ips'::regclass
    ) THEN
      ALTER TABLE public.trusted_ips
      ADD CONSTRAINT ck_trusted_ips_expires_after_created
      CHECK (expires_at IS NULL OR expires_at > created_at);
    END IF;
  END IF;

  IF to_regclass('public.rate_limit_blocks') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_rate_limit_blocks_reason_nonempty'
        AND conrelid = 'public.rate_limit_blocks'::regclass
    ) THEN
      ALTER TABLE public.rate_limit_blocks
      ADD CONSTRAINT ck_rate_limit_blocks_reason_nonempty
      CHECK (reason IS NOT NULL AND btrim(reason) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_rate_limit_blocks_request_count_nonnegative'
        AND conrelid = 'public.rate_limit_blocks'::regclass
    ) THEN
      ALTER TABLE public.rate_limit_blocks
      ADD CONSTRAINT ck_rate_limit_blocks_request_count_nonnegative
      CHECK (COALESCE(request_count, 0) >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_rate_limit_blocks_expires_after_created'
        AND conrelid = 'public.rate_limit_blocks'::regclass
    ) THEN
      ALTER TABLE public.rate_limit_blocks
      ADD CONSTRAINT ck_rate_limit_blocks_expires_after_created
      CHECK (expires_at IS NULL OR expires_at > created_at);
    END IF;
  END IF;

  IF to_regclass('public.rate_limit_baselines') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_rate_limit_baselines_metrics_nonnegative'
        AND conrelid = 'public.rate_limit_baselines'::regclass
    ) THEN
      ALTER TABLE public.rate_limit_baselines
      ADD CONSTRAINT ck_rate_limit_baselines_metrics_nonnegative
      CHECK (
        COALESCE(avg_requests_per_hour, 0) >= 0
        AND COALESCE(max_requests_per_hour, 0) >= 0
        AND COALESCE(std_deviation, 0) >= 0
        AND COALESCE(sample_count, 0) >= 0
      );
    END IF;
  END IF;

  IF to_regclass('public.request_logs') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_request_logs_status_code_range'
        AND conrelid = 'public.request_logs'::regclass
    ) THEN
      ALTER TABLE public.request_logs
      ADD CONSTRAINT ck_request_logs_status_code_range
      CHECK (status_code IS NULL OR (status_code >= 100 AND status_code <= 599));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_request_logs_response_time_nonnegative'
        AND conrelid = 'public.request_logs'::regclass
    ) THEN
      ALTER TABLE public.request_logs
      ADD CONSTRAINT ck_request_logs_response_time_nonnegative
      CHECK (response_time_ms IS NULL OR response_time_ms >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_request_logs_payload_sizes_nonnegative'
        AND conrelid = 'public.request_logs'::regclass
    ) THEN
      ALTER TABLE public.request_logs
      ADD CONSTRAINT ck_request_logs_payload_sizes_nonnegative
      CHECK (
        (request_size IS NULL OR request_size >= 0)
        AND (response_size IS NULL OR response_size >= 0)
      );
    END IF;
  END IF;

  IF to_regclass('public.rate_limit_anomalies') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_rate_limit_anomalies_severity_valid'
        AND conrelid = 'public.rate_limit_anomalies'::regclass
    ) THEN
      ALTER TABLE public.rate_limit_anomalies
      ADD CONSTRAINT ck_rate_limit_anomalies_severity_valid
      CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_rate_limit_anomalies_type_valid'
        AND conrelid = 'public.rate_limit_anomalies'::regclass
    ) THEN
      ALTER TABLE public.rate_limit_anomalies
      ADD CONSTRAINT ck_rate_limit_anomalies_type_valid
      CHECK (anomaly_type IN ('BURST', 'SUSTAINED', 'PATTERN', 'GEOGRAPHIC'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_rate_limit_anomalies_request_count_nonnegative'
        AND conrelid = 'public.rate_limit_anomalies'::regclass
    ) THEN
      ALTER TABLE public.rate_limit_anomalies
      ADD CONSTRAINT ck_rate_limit_anomalies_request_count_nonnegative
      CHECK (COALESCE(request_count, 0) >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_rate_limit_anomalies_block_id'
        AND conrelid = 'public.rate_limit_anomalies'::regclass
    ) THEN
      ALTER TABLE public.rate_limit_anomalies
      ADD CONSTRAINT fk_rate_limit_anomalies_block_id
      FOREIGN KEY (block_id) REFERENCES public.rate_limit_blocks(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('public.rate_limit_configs') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_rate_limit_configs_base_limit_positive'
        AND conrelid = 'public.rate_limit_configs'::regclass
    ) THEN
      ALTER TABLE public.rate_limit_configs
      ADD CONSTRAINT ck_rate_limit_configs_base_limit_positive
      CHECK (base_limit > 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_rate_limit_configs_window_positive'
        AND conrelid = 'public.rate_limit_configs'::regclass
    ) THEN
      ALTER TABLE public.rate_limit_configs
      ADD CONSTRAINT ck_rate_limit_configs_window_positive
      CHECK (window_ms > 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_rate_limit_configs_multipliers_positive'
        AND conrelid = 'public.rate_limit_configs'::regclass
    ) THEN
      ALTER TABLE public.rate_limit_configs
      ADD CONSTRAINT ck_rate_limit_configs_multipliers_positive
      CHECK (adaptive_multiplier > 0 AND burst_multiplier >= 1);
    END IF;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Validate constraints (idempotente).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_trusted_ips_description_nonempty' AND conrelid = 'public.trusted_ips'::regclass) THEN
    ALTER TABLE public.trusted_ips VALIDATE CONSTRAINT ck_trusted_ips_description_nonempty;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_trusted_ips_expires_after_created' AND conrelid = 'public.trusted_ips'::regclass) THEN
    ALTER TABLE public.trusted_ips VALIDATE CONSTRAINT ck_trusted_ips_expires_after_created;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rate_limit_blocks_reason_nonempty' AND conrelid = 'public.rate_limit_blocks'::regclass) THEN
    ALTER TABLE public.rate_limit_blocks VALIDATE CONSTRAINT ck_rate_limit_blocks_reason_nonempty;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rate_limit_blocks_request_count_nonnegative' AND conrelid = 'public.rate_limit_blocks'::regclass) THEN
    ALTER TABLE public.rate_limit_blocks VALIDATE CONSTRAINT ck_rate_limit_blocks_request_count_nonnegative;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rate_limit_blocks_expires_after_created' AND conrelid = 'public.rate_limit_blocks'::regclass) THEN
    ALTER TABLE public.rate_limit_blocks VALIDATE CONSTRAINT ck_rate_limit_blocks_expires_after_created;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rate_limit_baselines_metrics_nonnegative' AND conrelid = 'public.rate_limit_baselines'::regclass) THEN
    ALTER TABLE public.rate_limit_baselines VALIDATE CONSTRAINT ck_rate_limit_baselines_metrics_nonnegative;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_request_logs_status_code_range' AND conrelid = 'public.request_logs'::regclass) THEN
    ALTER TABLE public.request_logs VALIDATE CONSTRAINT ck_request_logs_status_code_range;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_request_logs_response_time_nonnegative' AND conrelid = 'public.request_logs'::regclass) THEN
    ALTER TABLE public.request_logs VALIDATE CONSTRAINT ck_request_logs_response_time_nonnegative;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_request_logs_payload_sizes_nonnegative' AND conrelid = 'public.request_logs'::regclass) THEN
    ALTER TABLE public.request_logs VALIDATE CONSTRAINT ck_request_logs_payload_sizes_nonnegative;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rate_limit_anomalies_severity_valid' AND conrelid = 'public.rate_limit_anomalies'::regclass) THEN
    ALTER TABLE public.rate_limit_anomalies VALIDATE CONSTRAINT ck_rate_limit_anomalies_severity_valid;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rate_limit_anomalies_type_valid' AND conrelid = 'public.rate_limit_anomalies'::regclass) THEN
    ALTER TABLE public.rate_limit_anomalies VALIDATE CONSTRAINT ck_rate_limit_anomalies_type_valid;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rate_limit_anomalies_request_count_nonnegative' AND conrelid = 'public.rate_limit_anomalies'::regclass) THEN
    ALTER TABLE public.rate_limit_anomalies VALIDATE CONSTRAINT ck_rate_limit_anomalies_request_count_nonnegative;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rate_limit_configs_base_limit_positive' AND conrelid = 'public.rate_limit_configs'::regclass) THEN
    ALTER TABLE public.rate_limit_configs VALIDATE CONSTRAINT ck_rate_limit_configs_base_limit_positive;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rate_limit_configs_window_positive' AND conrelid = 'public.rate_limit_configs'::regclass) THEN
    ALTER TABLE public.rate_limit_configs VALIDATE CONSTRAINT ck_rate_limit_configs_window_positive;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rate_limit_configs_multipliers_positive' AND conrelid = 'public.rate_limit_configs'::regclass) THEN
    ALTER TABLE public.rate_limit_configs VALIDATE CONSTRAINT ck_rate_limit_configs_multipliers_positive;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Unicidad operativa.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_trusted_ips_scope_active
ON public.trusted_ips (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), ip_address)
WHERE ip_address IS NOT NULL
  AND COALESCE(active, true) = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_rate_limit_configs_scope_endpoint_enabled
ON public.rate_limit_configs (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(endpoint_pattern))
WHERE endpoint_pattern IS NOT NULL
  AND btrim(endpoint_pattern) <> ''
  AND COALESCE(enabled, true) = true;

-- ----------------------------------------------------------------------------
-- RLS explícito en tablas tenant-scoped.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'rate_limit_baselines');
SELECT app.apply_tenant_policy('public', 'rate_limit_blocks');
SELECT app.apply_tenant_policy('public', 'rate_limit_anomalies');
SELECT app.apply_tenant_policy('public', 'request_logs');

-- ----------------------------------------------------------------------------
-- RLS global+tenant para catálogos de seguridad.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.trusted_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trusted_ips FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trusted_ips_tenant_or_global_select ON public.trusted_ips;
CREATE POLICY trusted_ips_tenant_or_global_select
ON public.trusted_ips
FOR SELECT
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
  OR (
    app.current_tenant_id() IS NOT NULL
    AND tenant_id IS NULL
  )
);

DROP POLICY IF EXISTS trusted_ips_tenant_write ON public.trusted_ips;
CREATE POLICY trusted_ips_tenant_write
ON public.trusted_ips
FOR ALL
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
)
WITH CHECK (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
);

ALTER TABLE IF EXISTS public.rate_limit_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rate_limit_configs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_limit_configs_tenant_or_global_select ON public.rate_limit_configs;
CREATE POLICY rate_limit_configs_tenant_or_global_select
ON public.rate_limit_configs
FOR SELECT
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
  OR (
    app.current_tenant_id() IS NOT NULL
    AND tenant_id IS NULL
  )
);

DROP POLICY IF EXISTS rate_limit_configs_tenant_write ON public.rate_limit_configs;
CREATE POLICY rate_limit_configs_tenant_write
ON public.rate_limit_configs
FOR ALL
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
)
WITH CHECK (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
);

COMMIT;
