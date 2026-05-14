-- ============================================================================
-- 311__documento_series_tipo_canonico_fix.sql
-- Alinea la numeracion fiscal con el tipo canonico usado por documentos.
-- documentos normaliza 01->FACTURA y 03->BOLETA; si el RPC numera por 01/03,
-- puede reutilizar correlativos ya existentes bajo FACTURA/BOLETA.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.obtener_siguiente_numero_documento(
  p_tenant_id uuid,
  p_tipo_documento text,
  p_serie text
)
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, app, pg_temp
AS $$
  SELECT public.obtener_siguiente_numero_serie(
    p_tenant_id,
    CASE
      WHEN upper(COALESCE(NULLIF(btrim(p_tipo_documento), ''), 'FACTURA')) IN ('01', 'FACTURA') THEN 'FACTURA'
      WHEN upper(COALESCE(NULLIF(btrim(p_tipo_documento), ''), 'FACTURA')) IN ('03', 'BOLETA') THEN 'BOLETA'
      WHEN upper(COALESCE(NULLIF(btrim(p_tipo_documento), ''), 'FACTURA')) IN ('07', 'NC', 'NOTA_CREDITO') THEN 'NOTA_CREDITO'
      WHEN upper(COALESCE(NULLIF(btrim(p_tipo_documento), ''), 'FACTURA')) IN ('08', 'ND', 'NOTA_DEBITO') THEN 'NOTA_DEBITO'
      ELSE upper(COALESCE(NULLIF(btrim(p_tipo_documento), ''), 'FACTURA'))
    END,
    p_serie
  );
$$;

COMMIT;
