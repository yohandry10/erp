-- Rubro explícito y durable para demos. Se conserva la firma 464 de siete
-- argumentos para despliegues DB-first y se añade una sobrecarga canónica.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_demo_tenant_ready_tx(
  p_nombre varchar,
  p_dias_duracion integer,
  p_pais_codigo varchar,
  p_idempotency_key text,
  p_certificado_pfx bytea,
  p_certificado_password text,
  p_certificado_expira_en timestamptz,
  p_rubro text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_rubro text := upper(btrim(COALESCE(p_rubro, 'COMERCIO')));
  v_result jsonb;
  v_tenant_id uuid;
  v_actor_id uuid;
  v_current text;
  v_rbac jsonb;
BEGIN
  IF v_rubro NOT IN ('COMERCIO','DISTRIBUCION','SERVICIOS','RESTAURANTE','MANUFACTURA') THEN
    RAISE EXCEPTION 'DEMO_BUSINESS_SECTOR_INVALID' USING ERRCODE = '22023';
  END IF;

  v_result := public.create_demo_tenant_ready_tx(
    p_nombre, p_dias_duracion, p_pais_codigo, p_idempotency_key,
    p_certificado_pfx, p_certificado_password, p_certificado_expira_en
  );
  v_tenant_id := (v_result->>'tenant_id')::uuid;
  v_actor_id := (v_result->>'user_id')::uuid;

  SELECT to_jsonb(seed) INTO v_rbac
  FROM app.seed_operational_rbac_for_tenant(v_tenant_id, NULL) AS seed;
  IF (
    SELECT count(DISTINCT upper(r.nombre))
    FROM public.roles r
    WHERE r.tenant_id = v_tenant_id
      AND upper(r.nombre) IN (
        'ADMIN','GERENCIA','COMPRAS','ALMACEN','VENDEDOR',
        'CAJERO','FINANZAS','CONTADOR','RRHH','AUDITOR'
      )
      AND COALESCE(r.activo, true)
  ) <> 10 THEN
    RAISE EXCEPTION 'DEMO_STANDARD_ROLES_NOT_READY' USING ERRCODE = '23514';
  END IF;

  SELECT upper(NULLIF(btrim(ec.actividad_economica), '')) INTO v_current
  FROM public.empresa_config ec
  WHERE ec.tenant_id = v_tenant_id
  FOR UPDATE;

  IF COALESCE((v_result->>'idempotent')::boolean, false)
     AND v_current IS NOT NULL AND v_current <> v_rubro THEN
    RAISE EXCEPTION 'CONFIGURATION_IDEMPOTENCY_CONFLICT:DEMO_RUBRO'
      USING ERRCODE = '23505';
  END IF;

  UPDATE public.empresa_config
  SET actividad_economica = v_rubro, updated_at = now()
  WHERE tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEMO_BUSINESS_SECTOR_COMPANY_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  IF NOT COALESCE((v_result->>'idempotent')::boolean, false) THEN
    PERFORM app.audit_configuration_464(
      v_tenant_id, v_actor_id, 'empresa_config', 'UPDATE', v_tenant_id::text,
      jsonb_build_object('actividad_economica', v_current),
      jsonb_build_object('actividad_economica', v_rubro),
      'ASIGNAR_RUBRO_DEMO',
      jsonb_build_object('idempotency_key', lower(btrim(p_idempotency_key)), 'rubro', v_rubro)
    );
  END IF;

  RETURN v_result || jsonb_build_object('rubro', v_rubro, 'rbac', v_rbac);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_demo_tenant_ready_tx(
  varchar,integer,varchar,text,bytea,text,timestamptz,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_demo_tenant_ready_tx(
  varchar,integer,varchar,text,bytea,text,timestamptz,text
) TO service_role;

COMMIT;
