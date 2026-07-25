-- 342__sunat_tenant_onboarding_credentials.sql
-- Cierra el contrato de onboarding SUNAT directo por tenant.

ALTER TABLE public.empresa_config
  ADD COLUMN IF NOT EXISTS sunat_environment text DEFAULT 'homologacion',
  ADD COLUMN IF NOT EXISTS sunat_username text,
  ADD COLUMN IF NOT EXISTS sunat_password text,
  ADD COLUMN IF NOT EXISTS sunat_cpe_url text,
  ADD COLUMN IF NOT EXISTS sunat_summary_url text,
  ADD COLUMN IF NOT EXISTS sunat_query_url text,
  ADD COLUMN IF NOT EXISTS sunat_gre_url text,
  ADD COLUMN IF NOT EXISTS sunat_gre_transport text DEFAULT 'soap',
  ADD COLUMN IF NOT EXISTS sunat_gre_rest_base_url text DEFAULT 'https://api-cpe.sunat.gob.pe/v1',
  ADD COLUMN IF NOT EXISTS sunat_gre_auth_url text,
  ADD COLUMN IF NOT EXISTS sunat_gre_client_id text,
  ADD COLUMN IF NOT EXISTS sunat_gre_client_secret text,
  ADD COLUMN IF NOT EXISTS sunat_cert_expected_ruc text,
  ADD COLUMN IF NOT EXISTS sunat_cert_ruc_mismatch_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sunat_cert_ruc_mismatch_reason text;

UPDATE public.empresa_config
SET
  sunat_environment = COALESCE(NULLIF(btrim(sunat_environment), ''), 'homologacion'),
  sunat_gre_transport = COALESCE(NULLIF(lower(btrim(sunat_gre_transport)), ''), 'soap'),
  sunat_gre_rest_base_url = COALESCE(NULLIF(btrim(sunat_gre_rest_base_url), ''), 'https://api-cpe.sunat.gob.pe/v1'),
  sunat_cert_ruc_mismatch_confirmed = COALESCE(sunat_cert_ruc_mismatch_confirmed, false)
WHERE sunat_environment IS NULL
   OR btrim(sunat_environment) = ''
   OR sunat_gre_transport IS NULL
   OR btrim(sunat_gre_transport) = ''
   OR sunat_gre_rest_base_url IS NULL
   OR btrim(sunat_gre_rest_base_url) = ''
   OR sunat_cert_ruc_mismatch_confirmed IS NULL;

ALTER TABLE public.empresa_config
  DROP CONSTRAINT IF EXISTS ck_empresa_config_sunat_environment_342;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT ck_empresa_config_sunat_environment_342
  CHECK (lower(sunat_environment) IN ('homologacion', 'produccion')) NOT VALID;

ALTER TABLE public.empresa_config
  DROP CONSTRAINT IF EXISTS ck_empresa_config_sunat_gre_transport_342;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT ck_empresa_config_sunat_gre_transport_342
  CHECK (lower(sunat_gre_transport) IN ('soap', 'rest')) NOT VALID;

ALTER TABLE public.empresa_config
  DROP CONSTRAINT IF EXISTS ck_empresa_config_sunat_cert_mismatch_reason_342;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT ck_empresa_config_sunat_cert_mismatch_reason_342
  CHECK (
    sunat_cert_ruc_mismatch_confirmed IS NOT TRUE
    OR NULLIF(btrim(COALESCE(sunat_cert_ruc_mismatch_reason, '')), '') IS NOT NULL
  ) NOT VALID;

ALTER TABLE public.empresa_config
  VALIDATE CONSTRAINT ck_empresa_config_sunat_environment_342;
ALTER TABLE public.empresa_config
  VALIDATE CONSTRAINT ck_empresa_config_sunat_gre_transport_342;
ALTER TABLE public.empresa_config
  VALIDATE CONSTRAINT ck_empresa_config_sunat_cert_mismatch_reason_342;

COMMENT ON COLUMN public.empresa_config.sunat_username IS
  'Usuario SOL secundario o username completo requerido por servicios SUNAT directos.';
COMMENT ON COLUMN public.empresa_config.sunat_password IS
  'Clave SOL secundaria cifrada por backend.';
COMMENT ON COLUMN public.empresa_config.sunat_gre_client_id IS
  'Client ID OAuth SUNAT para Plataforma Nueva GRE REST.';
COMMENT ON COLUMN public.empresa_config.sunat_gre_client_secret IS
  'Client secret OAuth SUNAT para GRE REST, cifrado por backend.';

NOTIFY pgrst, 'reload schema';
