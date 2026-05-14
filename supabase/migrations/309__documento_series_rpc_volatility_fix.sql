-- ============================================================================
-- 309__documento_series_rpc_volatility_fix.sql
-- Corrige la volatilidad del wrapper de numeracion fiscal.
-- El wrapper llama a obtener_siguiente_numero_serie(), que inserta/actualiza
-- documento_series; por tanto no puede declararse STABLE.
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
  SELECT public.obtener_siguiente_numero_serie(p_tenant_id, p_tipo_documento, p_serie);
$$;

COMMIT;
