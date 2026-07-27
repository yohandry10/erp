-- ============================================================================
-- 051__cpe_comprobantes_legacy_sync.sql
-- Alinea y sincroniza cpe <-> comprobantes_electronicos para evitar divergencia
-- en anulaciones, notas de credito y lecturas legacy de GRE/CPE.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Columnas faltantes para flujo de anulacion/nota de credito
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cpe
  ADD COLUMN IF NOT EXISTS documento_referencia_tipo text,
  ADD COLUMN IF NOT EXISTS documento_referencia_serie text,
  ADD COLUMN IF NOT EXISTS documento_referencia_numero text,
  ADD COLUMN IF NOT EXISTS tipo_nota_credito text,
  ADD COLUMN IF NOT EXISTS motivo_nota text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS nota_credito_id uuid,
  ADD COLUMN IF NOT EXISTS motivo_anulacion text,
  ADD COLUMN IF NOT EXISTS anulado_por uuid,
  ADD COLUMN IF NOT EXISTS anulado_at timestamptz;

ALTER TABLE IF EXISTS public.comprobantes_electronicos
  ADD COLUMN IF NOT EXISTS documento_referencia_tipo text,
  ADD COLUMN IF NOT EXISTS documento_referencia_serie text,
  ADD COLUMN IF NOT EXISTS documento_referencia_numero text,
  ADD COLUMN IF NOT EXISTS tipo_nota_credito text,
  ADD COLUMN IF NOT EXISTS motivo_nota text;

CREATE INDEX IF NOT EXISTS idx_cpe_tenant_tipo_serie_numero
ON public.cpe (tenant_id, tipo_documento, serie, numero);

CREATE INDEX IF NOT EXISTS idx_comprobantes_electronicos_tenant_tipo_serie_numero
ON public.comprobantes_electronicos (tenant_id, tipo_documento, serie, numero);

-- ----------------------------------------------------------------------------
-- Trigger: cpe -> comprobantes_electronicos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_comprobantes_electronicos_from_cpe()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_numero integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.comprobantes_electronicos ce
    WHERE ce.id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_numero := CASE
    WHEN NULLIF(btrim(NEW.numero::text), '') IS NULL THEN NULL
    WHEN btrim(NEW.numero::text) ~ '^[0-9]+$' THEN btrim(NEW.numero::text)::integer
    ELSE NULL
  END;

  INSERT INTO public.comprobantes_electronicos (
    id,
    tenant_id,
    nombre,
    codigo,
    estado,
    metadata,
    tipo_documento,
    serie,
    numero,
    ruc_emisor,
    razon_social_emisor,
    tipo_documento_receptor,
    documento_receptor,
    razon_social_receptor,
    moneda,
    total_gravadas,
    total_igv,
    total_venta,
    documento_referencia_tipo,
    documento_referencia_serie,
    documento_referencia_numero,
    tipo_nota_credito,
    motivo_nota,
    created_by,
    nota_credito_id,
    motivo_anulacion,
    anulado_por,
    anulado_at,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.tenant_id,
    COALESCE(NULLIF(btrim(NEW.razon_social_receptor), ''), NULLIF(btrim(NEW.razon_social_emisor), ''), 'COMPROBANTE'),
    COALESCE(NULLIF(btrim(NEW.serie), ''), 'CPE') || '-' || COALESCE(NULLIF(btrim(NEW.numero::text), ''), NEW.id::text),
    COALESCE(NULLIF(btrim(NEW.estado), ''), 'BORRADOR'),
    jsonb_build_object('sync_source', 'cpe'),
    NEW.tipo_documento,
    NEW.serie,
    v_numero,
    NEW.ruc_emisor,
    NEW.razon_social_emisor,
    NEW.tipo_documento_receptor,
    NEW.documento_receptor,
    NEW.razon_social_receptor,
    COALESCE(NULLIF(btrim(NEW.moneda), ''), 'PEN'),
    COALESCE(NEW.total_gravadas, 0),
    COALESCE(NEW.total_igv, 0),
    COALESCE(NEW.total_venta, 0),
    NEW.documento_referencia_tipo,
    NEW.documento_referencia_serie,
    NEW.documento_referencia_numero,
    NEW.tipo_nota_credito,
    NEW.motivo_nota,
    NEW.created_by,
    NEW.nota_credito_id,
    NEW.motivo_anulacion,
    NEW.anulado_por,
    NEW.anulado_at,
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    nombre = EXCLUDED.nombre,
    codigo = EXCLUDED.codigo,
    estado = EXCLUDED.estado,
    metadata = COALESCE(public.comprobantes_electronicos.metadata, '{}'::jsonb) || jsonb_build_object('sync_source', 'cpe'),
    tipo_documento = EXCLUDED.tipo_documento,
    serie = EXCLUDED.serie,
    numero = EXCLUDED.numero,
    ruc_emisor = EXCLUDED.ruc_emisor,
    razon_social_emisor = EXCLUDED.razon_social_emisor,
    tipo_documento_receptor = EXCLUDED.tipo_documento_receptor,
    documento_receptor = EXCLUDED.documento_receptor,
    razon_social_receptor = EXCLUDED.razon_social_receptor,
    moneda = EXCLUDED.moneda,
    total_gravadas = EXCLUDED.total_gravadas,
    total_igv = EXCLUDED.total_igv,
    total_venta = EXCLUDED.total_venta,
    documento_referencia_tipo = EXCLUDED.documento_referencia_tipo,
    documento_referencia_serie = EXCLUDED.documento_referencia_serie,
    documento_referencia_numero = EXCLUDED.documento_referencia_numero,
    tipo_nota_credito = EXCLUDED.tipo_nota_credito,
    motivo_nota = EXCLUDED.motivo_nota,
    created_by = EXCLUDED.created_by,
    nota_credito_id = EXCLUDED.nota_credito_id,
    motivo_anulacion = EXCLUDED.motivo_anulacion,
    anulado_por = EXCLUDED.anulado_por,
    anulado_at = EXCLUDED.anulado_at,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_comprobantes_electronicos_from_cpe ON public.cpe;

CREATE TRIGGER trg_sync_comprobantes_electronicos_from_cpe
AFTER INSERT OR UPDATE OR DELETE
ON public.cpe
FOR EACH ROW
EXECUTE FUNCTION app.sync_comprobantes_electronicos_from_cpe();

-- ----------------------------------------------------------------------------
-- Trigger: comprobantes_electronicos -> cpe
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_cpe_from_comprobantes_electronicos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
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

  IF NEW.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.cpe (
    id,
    tenant_id,
    tipo_documento,
    serie,
    numero,
    ruc_emisor,
    razon_social_emisor,
    tipo_documento_receptor,
    documento_receptor,
    razon_social_receptor,
    moneda,
    total_gravadas,
    total_igv,
    total_venta,
    estado,
    documento_referencia_tipo,
    documento_referencia_serie,
    documento_referencia_numero,
    tipo_nota_credito,
    motivo_nota,
    created_by,
    nota_credito_id,
    motivo_anulacion,
    anulado_por,
    anulado_at,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.tenant_id,
    NEW.tipo_documento,
    NEW.serie,
    CASE WHEN NEW.numero IS NULL THEN NULL ELSE NEW.numero::text END,
    NEW.ruc_emisor,
    NEW.razon_social_emisor,
    NEW.tipo_documento_receptor,
    NEW.documento_receptor,
    NEW.razon_social_receptor,
    COALESCE(NULLIF(btrim(NEW.moneda), ''), 'PEN'),
    COALESCE(NEW.total_gravadas, 0),
    COALESCE(NEW.total_igv, 0),
    COALESCE(NEW.total_venta, 0),
    COALESCE(NULLIF(btrim(NEW.estado), ''), 'BORRADOR'),
    NEW.documento_referencia_tipo,
    NEW.documento_referencia_serie,
    NEW.documento_referencia_numero,
    NEW.tipo_nota_credito,
    NEW.motivo_nota,
    NEW.created_by,
    NEW.nota_credito_id,
    NEW.motivo_anulacion,
    NEW.anulado_por,
    NEW.anulado_at,
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = COALESCE(EXCLUDED.tenant_id, public.cpe.tenant_id),
    tipo_documento = COALESCE(EXCLUDED.tipo_documento, public.cpe.tipo_documento),
    serie = COALESCE(EXCLUDED.serie, public.cpe.serie),
    numero = COALESCE(EXCLUDED.numero, public.cpe.numero),
    ruc_emisor = COALESCE(EXCLUDED.ruc_emisor, public.cpe.ruc_emisor),
    razon_social_emisor = COALESCE(EXCLUDED.razon_social_emisor, public.cpe.razon_social_emisor),
    tipo_documento_receptor = COALESCE(EXCLUDED.tipo_documento_receptor, public.cpe.tipo_documento_receptor),
    documento_receptor = COALESCE(EXCLUDED.documento_receptor, public.cpe.documento_receptor),
    razon_social_receptor = COALESCE(EXCLUDED.razon_social_receptor, public.cpe.razon_social_receptor),
    moneda = COALESCE(EXCLUDED.moneda, public.cpe.moneda),
    total_gravadas = COALESCE(EXCLUDED.total_gravadas, public.cpe.total_gravadas),
    total_igv = COALESCE(EXCLUDED.total_igv, public.cpe.total_igv),
    total_venta = COALESCE(EXCLUDED.total_venta, public.cpe.total_venta),
    estado = COALESCE(EXCLUDED.estado, public.cpe.estado),
    documento_referencia_tipo = COALESCE(EXCLUDED.documento_referencia_tipo, public.cpe.documento_referencia_tipo),
    documento_referencia_serie = COALESCE(EXCLUDED.documento_referencia_serie, public.cpe.documento_referencia_serie),
    documento_referencia_numero = COALESCE(EXCLUDED.documento_referencia_numero, public.cpe.documento_referencia_numero),
    tipo_nota_credito = COALESCE(EXCLUDED.tipo_nota_credito, public.cpe.tipo_nota_credito),
    motivo_nota = COALESCE(EXCLUDED.motivo_nota, public.cpe.motivo_nota),
    created_by = COALESCE(EXCLUDED.created_by, public.cpe.created_by),
    nota_credito_id = COALESCE(EXCLUDED.nota_credito_id, public.cpe.nota_credito_id),
    motivo_anulacion = COALESCE(EXCLUDED.motivo_anulacion, public.cpe.motivo_anulacion),
    anulado_por = COALESCE(EXCLUDED.anulado_por, public.cpe.anulado_por),
    anulado_at = COALESCE(EXCLUDED.anulado_at, public.cpe.anulado_at),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cpe_from_comprobantes_electronicos ON public.comprobantes_electronicos;

CREATE TRIGGER trg_sync_cpe_from_comprobantes_electronicos
AFTER INSERT OR UPDATE
ON public.comprobantes_electronicos
FOR EACH ROW
EXECUTE FUNCTION app.sync_cpe_from_comprobantes_electronicos();

-- ----------------------------------------------------------------------------
-- Backfill inicial bidireccional
-- ----------------------------------------------------------------------------
INSERT INTO public.comprobantes_electronicos (
  id,
  tenant_id,
  nombre,
  codigo,
  estado,
  metadata,
  tipo_documento,
  serie,
  numero,
  ruc_emisor,
  razon_social_emisor,
  tipo_documento_receptor,
  documento_receptor,
  razon_social_receptor,
  moneda,
  total_gravadas,
  total_igv,
  total_venta,
  documento_referencia_tipo,
  documento_referencia_serie,
  documento_referencia_numero,
  tipo_nota_credito,
  motivo_nota,
  created_by,
  nota_credito_id,
  motivo_anulacion,
  anulado_por,
  anulado_at,
  created_at,
  updated_at
)
SELECT
  c.id,
  c.tenant_id,
  COALESCE(NULLIF(btrim(c.razon_social_receptor), ''), NULLIF(btrim(c.razon_social_emisor), ''), 'COMPROBANTE'),
  COALESCE(NULLIF(btrim(c.serie), ''), 'CPE') || '-' || COALESCE(NULLIF(btrim(c.numero::text), ''), c.id::text),
  COALESCE(NULLIF(btrim(c.estado), ''), 'BORRADOR'),
  jsonb_build_object('sync_source', 'cpe_backfill'),
  c.tipo_documento,
  c.serie,
  CASE
    WHEN NULLIF(btrim(c.numero::text), '') IS NULL THEN NULL
    WHEN btrim(c.numero::text) ~ '^[0-9]+$' THEN btrim(c.numero::text)::integer
    ELSE NULL
  END,
  c.ruc_emisor,
  c.razon_social_emisor,
  c.tipo_documento_receptor,
  c.documento_receptor,
  c.razon_social_receptor,
  COALESCE(NULLIF(btrim(c.moneda), ''), 'PEN'),
  COALESCE(c.total_gravadas, 0),
  COALESCE(c.total_igv, 0),
  COALESCE(c.total_venta, 0),
  c.documento_referencia_tipo,
  c.documento_referencia_serie,
  c.documento_referencia_numero,
  c.tipo_nota_credito,
  c.motivo_nota,
  c.created_by,
  c.nota_credito_id,
  c.motivo_anulacion,
  c.anulado_por,
  c.anulado_at,
  COALESCE(c.created_at, now()),
  COALESCE(c.updated_at, now())
FROM public.cpe c
WHERE c.id IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  nombre = EXCLUDED.nombre,
  codigo = EXCLUDED.codigo,
  estado = EXCLUDED.estado,
  metadata = COALESCE(public.comprobantes_electronicos.metadata, '{}'::jsonb) || jsonb_build_object('sync_source', 'cpe_backfill'),
  tipo_documento = EXCLUDED.tipo_documento,
  serie = EXCLUDED.serie,
  numero = EXCLUDED.numero,
  ruc_emisor = EXCLUDED.ruc_emisor,
  razon_social_emisor = EXCLUDED.razon_social_emisor,
  tipo_documento_receptor = EXCLUDED.tipo_documento_receptor,
  documento_receptor = EXCLUDED.documento_receptor,
  razon_social_receptor = EXCLUDED.razon_social_receptor,
  moneda = EXCLUDED.moneda,
  total_gravadas = EXCLUDED.total_gravadas,
  total_igv = EXCLUDED.total_igv,
  total_venta = EXCLUDED.total_venta,
  documento_referencia_tipo = EXCLUDED.documento_referencia_tipo,
  documento_referencia_serie = EXCLUDED.documento_referencia_serie,
  documento_referencia_numero = EXCLUDED.documento_referencia_numero,
  tipo_nota_credito = EXCLUDED.tipo_nota_credito,
  motivo_nota = EXCLUDED.motivo_nota,
  created_by = EXCLUDED.created_by,
  nota_credito_id = EXCLUDED.nota_credito_id,
  motivo_anulacion = EXCLUDED.motivo_anulacion,
  anulado_por = EXCLUDED.anulado_por,
  anulado_at = EXCLUDED.anulado_at,
  updated_at = now();

INSERT INTO public.cpe (
  id,
  tenant_id,
  tipo_documento,
  serie,
  numero,
  ruc_emisor,
  razon_social_emisor,
  tipo_documento_receptor,
  documento_receptor,
  razon_social_receptor,
  moneda,
  total_gravadas,
  total_igv,
  total_venta,
  estado,
  documento_referencia_tipo,
  documento_referencia_serie,
  documento_referencia_numero,
  tipo_nota_credito,
  motivo_nota,
  created_by,
  nota_credito_id,
  motivo_anulacion,
  anulado_por,
  anulado_at,
  created_at,
  updated_at
)
SELECT
  ce.id,
  ce.tenant_id,
  ce.tipo_documento,
  ce.serie,
  CASE WHEN ce.numero IS NULL THEN NULL ELSE ce.numero::text END,
  ce.ruc_emisor,
  ce.razon_social_emisor,
  ce.tipo_documento_receptor,
  ce.documento_receptor,
  ce.razon_social_receptor,
  COALESCE(NULLIF(btrim(ce.moneda), ''), 'PEN'),
  COALESCE(ce.total_gravadas, 0),
  COALESCE(ce.total_igv, 0),
  COALESCE(ce.total_venta, 0),
  COALESCE(NULLIF(btrim(ce.estado), ''), 'BORRADOR'),
  ce.documento_referencia_tipo,
  ce.documento_referencia_serie,
  ce.documento_referencia_numero,
  ce.tipo_nota_credito,
  ce.motivo_nota,
  ce.created_by,
  ce.nota_credito_id,
  ce.motivo_anulacion,
  ce.anulado_por,
  ce.anulado_at,
  COALESCE(ce.created_at, now()),
  COALESCE(ce.updated_at, now())
FROM public.comprobantes_electronicos ce
WHERE ce.id IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = COALESCE(EXCLUDED.tenant_id, public.cpe.tenant_id),
  tipo_documento = COALESCE(EXCLUDED.tipo_documento, public.cpe.tipo_documento),
  serie = COALESCE(EXCLUDED.serie, public.cpe.serie),
  numero = COALESCE(EXCLUDED.numero, public.cpe.numero),
  ruc_emisor = COALESCE(EXCLUDED.ruc_emisor, public.cpe.ruc_emisor),
  razon_social_emisor = COALESCE(EXCLUDED.razon_social_emisor, public.cpe.razon_social_emisor),
  tipo_documento_receptor = COALESCE(EXCLUDED.tipo_documento_receptor, public.cpe.tipo_documento_receptor),
  documento_receptor = COALESCE(EXCLUDED.documento_receptor, public.cpe.documento_receptor),
  razon_social_receptor = COALESCE(EXCLUDED.razon_social_receptor, public.cpe.razon_social_receptor),
  moneda = COALESCE(EXCLUDED.moneda, public.cpe.moneda),
  total_gravadas = COALESCE(EXCLUDED.total_gravadas, public.cpe.total_gravadas),
  total_igv = COALESCE(EXCLUDED.total_igv, public.cpe.total_igv),
  total_venta = COALESCE(EXCLUDED.total_venta, public.cpe.total_venta),
  estado = COALESCE(EXCLUDED.estado, public.cpe.estado),
  documento_referencia_tipo = COALESCE(EXCLUDED.documento_referencia_tipo, public.cpe.documento_referencia_tipo),
  documento_referencia_serie = COALESCE(EXCLUDED.documento_referencia_serie, public.cpe.documento_referencia_serie),
  documento_referencia_numero = COALESCE(EXCLUDED.documento_referencia_numero, public.cpe.documento_referencia_numero),
  tipo_nota_credito = COALESCE(EXCLUDED.tipo_nota_credito, public.cpe.tipo_nota_credito),
  motivo_nota = COALESCE(EXCLUDED.motivo_nota, public.cpe.motivo_nota),
  created_by = COALESCE(EXCLUDED.created_by, public.cpe.created_by),
  nota_credito_id = COALESCE(EXCLUDED.nota_credito_id, public.cpe.nota_credito_id),
  motivo_anulacion = COALESCE(EXCLUDED.motivo_anulacion, public.cpe.motivo_anulacion),
  anulado_por = COALESCE(EXCLUDED.anulado_por, public.cpe.anulado_por),
  anulado_at = COALESCE(EXCLUDED.anulado_at, public.cpe.anulado_at),
  updated_at = now();

COMMIT;
