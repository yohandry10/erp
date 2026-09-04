BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE
  v_argentina_id integer;
BEGIN
  IF to_regclass('public.paises') IS NULL
     OR to_regclass('public.tipos_documentos_fiscales') IS NULL THEN
    RAISE EXCEPTION '535 requiere los catálogos fiscales base';
  END IF;

  SELECT p.id INTO v_argentina_id
  FROM public.paises p
  WHERE upper(btrim(p.codigo_iso)) = 'AR'
    AND p.tenant_id IS NULL;

  IF v_argentina_id IS NULL THEN
    RAISE EXCEPTION '535 no encontró el país global Argentina';
  END IF;

  IF (
    SELECT count(DISTINCT t.codigo)
    FROM public.tipos_documentos_fiscales t
    WHERE t.pais_id = v_argentina_id
      AND t.codigo IN ('51', '52', '53')
  ) <> 3 THEN
    RAISE EXCEPTION '535 requiere los comprobantes ARCA 51, 52 y 53 existentes';
  END IF;
END;
$preflight$;

-- Desde diciembre de 2025 los códigos 51/52/53 dejaron de representar la
-- antigua clase M. ARCA los conserva como comprobantes clase A sujetos a
-- retención; el runtime ya falla cerrado si no existe habilitación autoritativa.
UPDATE public.tipos_documentos_fiscales t
SET nombre = CASE t.codigo
  WHEN '51' THEN 'Factura A sujeta a retención'
  WHEN '52' THEN 'Nota de Débito A sujeta a retención'
  WHEN '53' THEN 'Nota de Crédito A sujeta a retención'
END,
updated_at = now()
FROM public.paises p
WHERE p.id = t.pais_id
  AND upper(btrim(p.codigo_iso)) = 'AR'
  AND t.codigo IN ('51', '52', '53')
  AND t.nombre IS DISTINCT FROM CASE t.codigo
    WHEN '51' THEN 'Factura A sujeta a retención'
    WHEN '52' THEN 'Nota de Débito A sujeta a retención'
    WHEN '53' THEN 'Nota de Crédito A sujeta a retención'
  END;

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tipos_documentos_fiscales t
    JOIN public.paises p ON p.id = t.pais_id
    WHERE upper(btrim(p.codigo_iso)) = 'AR'
      AND t.codigo IN ('51', '52', '53')
      AND t.nombre IS DISTINCT FROM CASE t.codigo
        WHEN '51' THEN 'Factura A sujeta a retención'
        WHEN '52' THEN 'Nota de Débito A sujeta a retención'
        WHEN '53' THEN 'Nota de Crédito A sujeta a retención'
      END
  ) THEN
    RAISE EXCEPTION '535 no pudo corregir todos los nombres 51/52/53 de Argentina';
  END IF;
END;
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
