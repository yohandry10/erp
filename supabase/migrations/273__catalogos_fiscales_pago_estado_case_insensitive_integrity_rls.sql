-- ============================================================================
-- 273__catalogos_fiscales_pago_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estado case-insensitive en catalogos
-- fiscales/pago.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo para dejar estado/activo en estado canonico.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'paises',
    'metodos_pago',
    'tipos_documentos_fiscales',
    'tipos_impuestos',
    'tipos_cambio'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'UPDATE public.%I
       SET
         activo = COALESCE(activo, lower(app.normalize_estado_activo_inactivo_272(estado::text)::text) = ''activo''),
         estado = CASE
           WHEN COALESCE(activo, lower(app.normalize_estado_activo_inactivo_272(estado::text)::text) = ''activo'')
             THEN ''ACTIVO''::citext
           ELSE ''INACTIVO''::citext
         END,
         updated_at = COALESCE(updated_at, now())',
      v_table
    );
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- Constraints de dominio case-insensitive + consistencia estado/activo.
-- ----------------------------------------------------------------------------
ALTER TABLE public.paises DROP CONSTRAINT IF EXISTS ck_paises_estado_runtime_272;
ALTER TABLE public.paises
  ADD CONSTRAINT ck_paises_estado_runtime_272
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.paises DROP CONSTRAINT IF EXISTS ck_paises_estado_activo_sync_272;
ALTER TABLE public.paises
  ADD CONSTRAINT ck_paises_estado_activo_sync_272
  CHECK (
    (activo = true AND lower(estado::text) = 'activo')
    OR (activo = false AND lower(estado::text) = 'inactivo')
  ) NOT VALID;

ALTER TABLE public.metodos_pago DROP CONSTRAINT IF EXISTS ck_metodos_pago_estado_runtime_272;
ALTER TABLE public.metodos_pago
  ADD CONSTRAINT ck_metodos_pago_estado_runtime_272
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.metodos_pago DROP CONSTRAINT IF EXISTS ck_metodos_pago_estado_activo_sync_272;
ALTER TABLE public.metodos_pago
  ADD CONSTRAINT ck_metodos_pago_estado_activo_sync_272
  CHECK (
    (activo = true AND lower(estado::text) = 'activo')
    OR (activo = false AND lower(estado::text) = 'inactivo')
  ) NOT VALID;

ALTER TABLE public.tipos_documentos_fiscales DROP CONSTRAINT IF EXISTS ck_tipos_documentos_fiscales_estado_runtime_272;
ALTER TABLE public.tipos_documentos_fiscales
  ADD CONSTRAINT ck_tipos_documentos_fiscales_estado_runtime_272
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.tipos_documentos_fiscales DROP CONSTRAINT IF EXISTS ck_tipos_documentos_fiscales_estado_activo_sync_272;
ALTER TABLE public.tipos_documentos_fiscales
  ADD CONSTRAINT ck_tipos_documentos_fiscales_estado_activo_sync_272
  CHECK (
    (activo = true AND lower(estado::text) = 'activo')
    OR (activo = false AND lower(estado::text) = 'inactivo')
  ) NOT VALID;

ALTER TABLE public.tipos_impuestos DROP CONSTRAINT IF EXISTS ck_tipos_impuestos_estado_runtime_272;
ALTER TABLE public.tipos_impuestos
  ADD CONSTRAINT ck_tipos_impuestos_estado_runtime_272
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.tipos_impuestos DROP CONSTRAINT IF EXISTS ck_tipos_impuestos_estado_activo_sync_272;
ALTER TABLE public.tipos_impuestos
  ADD CONSTRAINT ck_tipos_impuestos_estado_activo_sync_272
  CHECK (
    (activo = true AND lower(estado::text) = 'activo')
    OR (activo = false AND lower(estado::text) = 'inactivo')
  ) NOT VALID;

ALTER TABLE public.tipos_cambio DROP CONSTRAINT IF EXISTS ck_tipos_cambio_estado_runtime_272;
ALTER TABLE public.tipos_cambio
  ADD CONSTRAINT ck_tipos_cambio_estado_runtime_272
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.tipos_cambio DROP CONSTRAINT IF EXISTS ck_tipos_cambio_estado_activo_sync_272;
ALTER TABLE public.tipos_cambio
  ADD CONSTRAINT ck_tipos_cambio_estado_activo_sync_272
  CHECK (
    (activo = true AND lower(estado::text) = 'activo')
    OR (activo = false AND lower(estado::text) = 'inactivo')
  ) NOT VALID;

-- ----------------------------------------------------------------------------
-- Contrato NOT NULL para columnas de estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.paises ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.paises ALTER COLUMN activo SET NOT NULL;

ALTER TABLE public.metodos_pago ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.metodos_pago ALTER COLUMN activo SET NOT NULL;

ALTER TABLE public.tipos_documentos_fiscales ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.tipos_documentos_fiscales ALTER COLUMN activo SET NOT NULL;

ALTER TABLE public.tipos_impuestos ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.tipos_impuestos ALTER COLUMN activo SET NOT NULL;

ALTER TABLE public.tipos_cambio ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.tipos_cambio ALTER COLUMN activo SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.paises VALIDATE CONSTRAINT ck_paises_estado_runtime_272;
ALTER TABLE public.paises VALIDATE CONSTRAINT ck_paises_estado_activo_sync_272;

ALTER TABLE public.metodos_pago VALIDATE CONSTRAINT ck_metodos_pago_estado_runtime_272;
ALTER TABLE public.metodos_pago VALIDATE CONSTRAINT ck_metodos_pago_estado_activo_sync_272;

ALTER TABLE public.tipos_documentos_fiscales VALIDATE CONSTRAINT ck_tipos_documentos_fiscales_estado_runtime_272;
ALTER TABLE public.tipos_documentos_fiscales VALIDATE CONSTRAINT ck_tipos_documentos_fiscales_estado_activo_sync_272;

ALTER TABLE public.tipos_impuestos VALIDATE CONSTRAINT ck_tipos_impuestos_estado_runtime_272;
ALTER TABLE public.tipos_impuestos VALIDATE CONSTRAINT ck_tipos_impuestos_estado_activo_sync_272;

ALTER TABLE public.tipos_cambio VALIDATE CONSTRAINT ck_tipos_cambio_estado_runtime_272;
ALTER TABLE public.tipos_cambio VALIDATE CONSTRAINT ck_tipos_cambio_estado_activo_sync_272;

-- ----------------------------------------------------------------------------
-- Reaplicacion explicita de RLS en catalogos mixtos (global + tenant).
-- ----------------------------------------------------------------------------
SELECT app.apply_global_or_tenant_policy('public', 'metodos_pago');
SELECT app.apply_global_or_tenant_policy('public', 'tipos_documentos_fiscales');
SELECT app.apply_global_or_tenant_policy('public', 'tipos_impuestos');
SELECT app.apply_global_or_tenant_policy('public', 'tipos_cambio');

COMMIT;
