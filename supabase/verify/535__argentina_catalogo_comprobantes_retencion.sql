\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_cpe_535') THEN
    RAISE EXCEPTION 'VERIFY_535_SOLO_BASE_LOCAL_EFIMERA:%', current_database();
  END IF;
END;
$guard$;

DO $contract$
DECLARE
  v_argentina_id integer;
BEGIN
  SELECT p.id INTO v_argentina_id
  FROM public.paises p
  WHERE upper(btrim(p.codigo_iso)) = 'AR'
    AND p.tenant_id IS NULL;

  IF v_argentina_id IS NULL THEN
    RAISE EXCEPTION 'VERIFY_535_ARGENTINA_GLOBAL_MISSING';
  END IF;

  IF (
    SELECT count(*)
    FROM public.tipos_documentos_fiscales t
    WHERE t.pais_id = v_argentina_id
      AND (t.codigo, t.nombre) IN (
        ('51', 'Factura A sujeta a retención'),
        ('52', 'Nota de Débito A sujeta a retención'),
        ('53', 'Nota de Crédito A sujeta a retención')
      )
  ) <> 3 THEN
    RAISE EXCEPTION 'VERIFY_535_ARGENTINA_RETENTION_CATALOG_DIVERGED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tipos_documentos_fiscales t
    WHERE t.pais_id = v_argentina_id
      AND t.codigo IN ('51', '52', '53')
      AND t.nombre ILIKE '%clase M%'
  ) THEN
    RAISE EXCEPTION 'VERIFY_535_LEGACY_CLASS_M_LEAK';
  END IF;
END;
$contract$;

ROLLBACK;

\echo VERIFY_535_OK
