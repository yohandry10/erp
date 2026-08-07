-- Completa en instalaciones que ya aplicaron la 407 las cuentas de resultado
-- necesarias para devengar gastos (65) e ingresos (75) diferidos.

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

CREATE OR REPLACE FUNCTION app.seed_peru_cuentas_diferidos(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $function$
DECLARE
  v_insertadas integer := 0;
BEGIN
  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.empresa_config ec
    WHERE ec.tenant_id = p_tenant_id
      AND upper(COALESCE(ec.pais, '')) = 'PE'
  ) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.plan_cuentas (
    tenant_id, codigo, nombre, tipo, tipo_cuenta, nivel,
    acepta_movimiento, activo, estado, metadata, created_at, updated_at
  )
  SELECT
    p_tenant_id, c.codigo, c.nombre, c.tipo, c.tipo, 2,
    true, true, 'ACTIVO',
    jsonb_build_object(
      'source', '408__peru_pcge_resultados_diferidos',
      'pais_codigo', 'PE'
    ),
    now(), now()
  FROM (
    VALUES
      ('18'::text, 'Servicios y otros contratados por anticipado'::text, 'ACTIVO'::text),
      ('49'::text, 'Pasivo diferido'::text, 'PASIVO'::text),
      ('65'::text, 'Otros gastos de gestión'::text, 'GASTO'::text),
      ('75'::text, 'Otros ingresos de gestión'::text, 'INGRESO'::text)
  ) AS c(codigo, nombre, tipo)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.plan_cuentas pc
    WHERE pc.tenant_id = p_tenant_id
      AND pc.codigo = c.codigo
  );

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN v_insertadas;
END;
$function$;

SELECT app.seed_peru_cuentas_diferidos(ec.tenant_id)
FROM public.empresa_config ec
WHERE upper(COALESCE(ec.pais, '')) = 'PE';

REVOKE ALL ON FUNCTION app.seed_peru_cuentas_diferidos(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.seed_peru_cuentas_diferidos(uuid)
TO service_role;

COMMIT;
