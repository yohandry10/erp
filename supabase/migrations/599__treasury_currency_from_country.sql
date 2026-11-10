-- La moneda predeterminada comercial no redefine la moneda contable del país.
-- No modifica países, preferencias, tasas, documentos ni valuaciones anteriores.
BEGIN;
CREATE OR REPLACE FUNCTION app.treasury_local_currency_452(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $fn$
 -- country_currency_599: mismo perfil contable PE/AR/CO que el runtime.
 SELECT CASE upper(coalesce(nullif(btrim(ec.pais),''),nullif(btrim(t.pais),''),'PE'))
   WHEN 'AR' THEN 'ARS'
   WHEN 'CO' THEN 'COP'
   ELSE 'PEN'
  END
 FROM public.tenants t
 LEFT JOIN LATERAL (
  SELECT config.pais FROM public.empresa_config config
  WHERE config.tenant_id=t.id ORDER BY config.updated_at DESC NULLS LAST,config.id LIMIT 1
 ) ec ON true
 WHERE t.id=p_tenant_id;
$fn$;
COMMIT;
