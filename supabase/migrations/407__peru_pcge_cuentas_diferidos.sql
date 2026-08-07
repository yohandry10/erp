-- Cuentas PCGE mínimas para que la interfaz de diferidos sea operativa en Perú.
-- El seed se restringe a empresa_config.pais = PE y es idempotente por tenant/código.

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
    SELECT 1
    FROM public.empresa_config ec
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
    p_tenant_id,
    c.codigo,
    c.nombre,
    c.tipo,
    c.tipo,
    2,
    true,
    true,
    'ACTIVO',
    jsonb_build_object(
      'source', '407__peru_pcge_cuentas_diferidos',
      'pais_codigo', 'PE'
    ),
    now(),
    now()
  FROM (
    VALUES
      ('18'::text, 'Servicios y otros contratados por anticipado'::text, 'ACTIVO'::text),
      ('49'::text, 'Pasivo diferido'::text, 'PASIVO'::text),
      ('65'::text, 'Otros gastos de gestión'::text, 'GASTO'::text),
      ('75'::text, 'Otros ingresos de gestión'::text, 'INGRESO'::text)
  ) AS c(codigo, nombre, tipo)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.plan_cuentas pc
    WHERE pc.tenant_id = p_tenant_id
      AND pc.codigo = c.codigo
  );

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN v_insertadas;
END;
$function$;

CREATE OR REPLACE FUNCTION app.seed_peru_cuentas_diferidos_empresa_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $function$
BEGIN
  IF upper(COALESCE(NEW.pais, '')) = 'PE' THEN
    PERFORM app.seed_peru_cuentas_diferidos(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seed_peru_cuentas_diferidos_empresa_config
ON public.empresa_config;
CREATE TRIGGER trg_seed_peru_cuentas_diferidos_empresa_config
AFTER INSERT OR UPDATE OF pais ON public.empresa_config
FOR EACH ROW
EXECUTE FUNCTION app.seed_peru_cuentas_diferidos_empresa_config();

SELECT app.seed_peru_cuentas_diferidos(ec.tenant_id)
FROM public.empresa_config ec
WHERE upper(COALESCE(ec.pais, '')) = 'PE';

REVOKE ALL ON FUNCTION app.seed_peru_cuentas_diferidos(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.seed_peru_cuentas_diferidos(uuid)
TO service_role;

COMMIT;
