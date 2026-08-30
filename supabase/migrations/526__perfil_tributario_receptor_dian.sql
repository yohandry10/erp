-- Perfil tributario DIAN del adquirente. No se deriva un perfil B2B del NIT:
-- el dato queda explícito en el maestro y se fotografía en cada CPE colombiano.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS dian_perfil_fiscal text,
  ADD COLUMN IF NOT EXISTS dian_responsabilidad_fiscal text,
  ADD COLUMN IF NOT EXISTS dian_responsabilidad_list_name text,
  ADD COLUMN IF NOT EXISTS dian_tributo_id text,
  ADD COLUMN IF NOT EXISTS dian_tributo_nombre text;

ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS ck_clientes_dian_perfil_526,
  DROP CONSTRAINT IF EXISTS ck_clientes_dian_b2b_nit_526;
ALTER TABLE public.clientes
  ADD CONSTRAINT ck_clientes_dian_perfil_526 CHECK (
    (dian_perfil_fiscal IS NULL
      AND dian_responsabilidad_fiscal IS NULL
      AND dian_responsabilidad_list_name IS NULL
      AND dian_tributo_id IS NULL
      AND dian_tributo_nombre IS NULL)
    OR
    (dian_perfil_fiscal = 'CONSUMIDOR_FINAL'
      AND dian_responsabilidad_fiscal = 'R-99-PN'
      AND dian_responsabilidad_list_name = '49'
      AND dian_tributo_id = 'ZY'
      AND dian_tributo_nombre = 'No causa')
    OR
    (dian_perfil_fiscal = 'ADQUIRIENTE_NIT_B2B'
      AND dian_responsabilidad_fiscal = 'O-99'
      AND dian_responsabilidad_list_name = '04'
      AND dian_tributo_id = '01'
      AND dian_tributo_nombre = 'IVA')
  ),
  ADD CONSTRAINT ck_clientes_dian_b2b_nit_526 CHECK (
    dian_perfil_fiscal IS DISTINCT FROM 'ADQUIRIENTE_NIT_B2B'
    OR upper(documento_tipo) = 'NIT'
  );

-- Backfill deliberadamente estrecho: sólo el cliente nominal inequívoco. Los
-- NIT y demás adquirentes existentes permanecen NULL y el envío real cierra.
UPDATE public.clientes c
SET dian_perfil_fiscal = 'CONSUMIDOR_FINAL',
    dian_responsabilidad_fiscal = 'R-99-PN',
    dian_responsabilidad_list_name = '49',
    dian_tributo_id = 'ZY',
    dian_tributo_nombre = 'No causa',
    updated_at = now()
FROM public.empresa_config ec
WHERE ec.tenant_id = c.tenant_id
  AND upper(coalesce(ec.pais, '')) = 'CO'
  AND upper(btrim(c.razon_social)) IN ('CONSUMIDOR FINAL', 'CONSUMIDOR O USUARIO FINAL')
  AND upper(coalesce(c.documento_tipo, '')) <> 'NIT'
  AND c.dian_perfil_fiscal IS NULL;

DO $rename_524$
BEGIN
  IF to_regprocedure('public.crear_cliente_maestro_tx_524_legacy_526(uuid,uuid,jsonb)') IS NULL THEN
    ALTER FUNCTION public.crear_cliente_maestro_tx(uuid, uuid, jsonb)
      RENAME TO crear_cliente_maestro_tx_524_legacy_526;
  END IF;
  IF to_regprocedure('public.actualizar_cliente_maestro_tx_524_legacy_526(uuid,uuid,uuid,jsonb)') IS NULL THEN
    ALTER FUNCTION public.actualizar_cliente_maestro_tx(uuid, uuid, uuid, jsonb)
      RENAME TO actualizar_cliente_maestro_tx_524_legacy_526;
  END IF;
END
$rename_524$;

REVOKE ALL ON FUNCTION public.crear_cliente_maestro_tx_524_legacy_526(uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.actualizar_cliente_maestro_tx_524_legacy_526(uuid,uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crear_cliente_maestro_tx(
  p_tenant_id uuid, p_actor_id uuid, p_cliente jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_country text;
  v_is_demo boolean;
  v_demo_country text := upper(nullif(btrim(current_setting('app.demo_hydration_country_524', true)), ''));
  v_document_type text := upper(nullif(btrim(p_cliente->>'documento_tipo'), ''));
  v_profile text := upper(nullif(btrim(p_cliente->>'dian_perfil_fiscal'), ''));
  v_result jsonb;
  v_id uuid;
BEGIN
  SELECT upper(coalesce(nullif(btrim(ec.pais), ''), 'PE')), coalesce(ec.is_demo, false)
  INTO v_country, v_is_demo FROM public.empresa_config ec WHERE ec.tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_CONFIG_NOT_FOUND'; END IF;
  IF v_country = 'CO' AND v_profile IS NULL AND v_is_demo AND v_demo_country = 'CO' THEN
    v_profile := CASE WHEN v_document_type = 'NIT'
      THEN 'ADQUIRIENTE_NIT_B2B' ELSE 'CONSUMIDOR_FINAL' END;
  END IF;
  IF v_country = 'CO' AND v_profile IS NULL THEN
    RAISE EXCEPTION 'DIAN_RECEIVER_TAX_PROFILE_REQUIRED';
  ELSIF v_country <> 'CO' AND v_profile IS NOT NULL THEN
    RAISE EXCEPTION 'DIAN_RECEIVER_TAX_PROFILE_ONLY_CO';
  ELSIF v_profile = 'ADQUIRIENTE_NIT_B2B' AND v_document_type <> 'NIT' THEN
    RAISE EXCEPTION 'DIAN_B2B_PROFILE_REQUIRES_NIT';
  ELSIF v_profile = 'CONSUMIDOR_FINAL' AND v_document_type = 'NIT' THEN
    RAISE EXCEPTION 'DIAN_NIT_CANNOT_BE_FINAL_CONSUMER';
  ELSIF v_profile IS NOT NULL AND v_profile NOT IN ('CONSUMIDOR_FINAL', 'ADQUIRIENTE_NIT_B2B') THEN
    RAISE EXCEPTION 'DIAN_RECEIVER_TAX_PROFILE_INVALID';
  END IF;
  v_result := public.crear_cliente_maestro_tx_524_legacy_526(p_tenant_id, p_actor_id, p_cliente);
  v_id := (v_result->>'id')::uuid;
  UPDATE public.clientes SET
    dian_perfil_fiscal = v_profile,
    dian_responsabilidad_fiscal = CASE v_profile WHEN 'CONSUMIDOR_FINAL' THEN 'R-99-PN' WHEN 'ADQUIRIENTE_NIT_B2B' THEN 'O-99' END,
    dian_responsabilidad_list_name = CASE v_profile WHEN 'CONSUMIDOR_FINAL' THEN '49' WHEN 'ADQUIRIENTE_NIT_B2B' THEN '04' END,
    dian_tributo_id = CASE v_profile WHEN 'CONSUMIDOR_FINAL' THEN 'ZY' WHEN 'ADQUIRIENTE_NIT_B2B' THEN '01' END,
    dian_tributo_nombre = CASE v_profile WHEN 'CONSUMIDOR_FINAL' THEN 'No causa' WHEN 'ADQUIRIENTE_NIT_B2B' THEN 'IVA' END
  WHERE id = v_id AND tenant_id = p_tenant_id;
  RETURN v_result || jsonb_build_object('dian_perfil_fiscal', v_profile);
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_cliente_maestro_tx(
  p_cliente_id uuid, p_tenant_id uuid, p_actor_id uuid, p_cambios jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_country text;
  v_document_type text;
  v_profile text;
  v_result jsonb;
BEGIN
  SELECT upper(coalesce(nullif(btrim(ec.pais), ''), 'PE')) INTO v_country
  FROM public.empresa_config ec WHERE ec.tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_CONFIG_NOT_FOUND'; END IF;
  SELECT
    CASE WHEN p_cambios ? 'documento_tipo' THEN upper(nullif(btrim(p_cambios->>'documento_tipo'), ''))
      ELSE upper(c.documento_tipo) END,
    CASE WHEN p_cambios ? 'dian_perfil_fiscal' THEN upper(nullif(btrim(p_cambios->>'dian_perfil_fiscal'), ''))
      ELSE c.dian_perfil_fiscal END
  INTO v_document_type, v_profile
  FROM public.clientes c WHERE c.id = p_cliente_id AND c.tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLIENTE_NOT_FOUND'; END IF;
  IF v_country = 'CO' AND v_profile IS NULL THEN
    RAISE EXCEPTION 'DIAN_RECEIVER_TAX_PROFILE_REQUIRED';
  ELSIF v_country <> 'CO' AND v_profile IS NOT NULL THEN
    RAISE EXCEPTION 'DIAN_RECEIVER_TAX_PROFILE_ONLY_CO';
  ELSIF v_profile = 'ADQUIRIENTE_NIT_B2B' AND v_document_type <> 'NIT' THEN
    RAISE EXCEPTION 'DIAN_B2B_PROFILE_REQUIRES_NIT';
  ELSIF v_profile = 'CONSUMIDOR_FINAL' AND v_document_type = 'NIT' THEN
    RAISE EXCEPTION 'DIAN_NIT_CANNOT_BE_FINAL_CONSUMER';
  ELSIF v_profile IS NOT NULL AND v_profile NOT IN ('CONSUMIDOR_FINAL', 'ADQUIRIENTE_NIT_B2B') THEN
    RAISE EXCEPTION 'DIAN_RECEIVER_TAX_PROFILE_INVALID';
  END IF;
  v_result := public.actualizar_cliente_maestro_tx_524_legacy_526(
    p_cliente_id, p_tenant_id, p_actor_id, p_cambios
  );
  UPDATE public.clientes SET
    dian_perfil_fiscal = v_profile,
    dian_responsabilidad_fiscal = CASE v_profile WHEN 'CONSUMIDOR_FINAL' THEN 'R-99-PN' WHEN 'ADQUIRIENTE_NIT_B2B' THEN 'O-99' END,
    dian_responsabilidad_list_name = CASE v_profile WHEN 'CONSUMIDOR_FINAL' THEN '49' WHEN 'ADQUIRIENTE_NIT_B2B' THEN '04' END,
    dian_tributo_id = CASE v_profile WHEN 'CONSUMIDOR_FINAL' THEN 'ZY' WHEN 'ADQUIRIENTE_NIT_B2B' THEN '01' END,
    dian_tributo_nombre = CASE v_profile WHEN 'CONSUMIDOR_FINAL' THEN 'No causa' WHEN 'ADQUIRIENTE_NIT_B2B' THEN 'IVA' END
  WHERE id = p_cliente_id AND tenant_id = p_tenant_id;
  RETURN v_result || jsonb_build_object('dian_perfil_fiscal', v_profile);
END;
$function$;

CREATE OR REPLACE FUNCTION app.snapshot_dian_receiver_profile_526()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_country text;
  v_client public.clientes%ROWTYPE;
  v_old_snapshot jsonb;
  v_new_snapshot jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_snapshot := coalesce(OLD.metadata, '{}'::jsonb)->'dian_receptor_tax_profile';
    v_new_snapshot := coalesce(NEW.metadata, '{}'::jsonb)->'dian_receptor_tax_profile';
    IF v_old_snapshot IS NOT NULL THEN
      IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
         OR v_new_snapshot IS DISTINCT FROM v_old_snapshot THEN
        RAISE EXCEPTION 'DIAN_RECEIVER_PROFILE_IMMUTABLE' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;
  END IF;
  SELECT upper(coalesce(nullif(btrim(pais), ''), 'PE')) INTO v_country
  FROM public.empresa_config WHERE tenant_id = NEW.tenant_id;
  IF v_country <> 'CO' THEN
    IF coalesce(NEW.metadata, '{}'::jsonb) ? 'dian_receptor_tax_profile' THEN
      RAISE EXCEPTION 'DIAN_RECEIVER_PROFILE_ONLY_CO' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.cliente_id IS NULL THEN
    IF NEW.simulated_origin IS FALSE THEN
      RAISE EXCEPTION 'DIAN_RECEIVER_TAX_PROFILE_REQUIRED' USING ERRCODE = '23514';
    END IF;
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) - 'dian_receptor_tax_profile';
    RETURN NEW;
  END IF;
  SELECT * INTO v_client FROM public.clientes
  WHERE id = NEW.cliente_id AND tenant_id = NEW.tenant_id;
  IF NOT FOUND OR v_client.dian_perfil_fiscal IS NULL THEN
    IF NEW.simulated_origin IS FALSE THEN
      RAISE EXCEPTION 'DIAN_RECEIVER_TAX_PROFILE_REQUIRED' USING ERRCODE = '23514';
    END IF;
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) - 'dian_receptor_tax_profile';
    RETURN NEW;
  END IF;
  NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'dian_receptor_tax_profile', jsonb_build_object(
      'profile', v_client.dian_perfil_fiscal,
      'taxLevelCode', v_client.dian_responsabilidad_fiscal,
      'taxLevelListName', v_client.dian_responsabilidad_list_name,
      'taxSchemeId', v_client.dian_tributo_id,
      'taxSchemeName', v_client.dian_tributo_nombre
    )
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_snapshot_dian_receiver_profile_526 ON public.cpe;
CREATE TRIGGER trg_snapshot_dian_receiver_profile_526
BEFORE INSERT OR UPDATE ON public.cpe
FOR EACH ROW EXECUTE FUNCTION app.snapshot_dian_receiver_profile_526();

-- Todo CPE colombiano real nace con una fotografía tributaria válida. Los
-- comprobantes históricos fueron marcados como simulados por la 525 y no se
-- convierten retroactivamente en documentos transmisibles.
ALTER TABLE public.cpe DROP CONSTRAINT IF EXISTS ck_cpe_dian_receiver_snapshot_526;
ALTER TABLE public.cpe ADD CONSTRAINT ck_cpe_dian_receiver_snapshot_526 CHECK (
  simulated_origin
  OR upper(coalesce(issuer_snapshot->>'country_code', '')) <> 'CO'
  OR (
    jsonb_typeof(metadata->'dian_receptor_tax_profile') = 'object'
    AND (
      (
        metadata#>>'{dian_receptor_tax_profile,profile}' = 'CONSUMIDOR_FINAL'
        AND metadata#>>'{dian_receptor_tax_profile,taxLevelCode}' = 'R-99-PN'
        AND metadata#>>'{dian_receptor_tax_profile,taxLevelListName}' = '49'
        AND metadata#>>'{dian_receptor_tax_profile,taxSchemeId}' = 'ZY'
        AND metadata#>>'{dian_receptor_tax_profile,taxSchemeName}' = 'No causa'
      )
      OR (
        metadata#>>'{dian_receptor_tax_profile,profile}' = 'ADQUIRIENTE_NIT_B2B'
        AND metadata#>>'{dian_receptor_tax_profile,taxLevelCode}' = 'O-99'
        AND metadata#>>'{dian_receptor_tax_profile,taxLevelListName}' = '04'
        AND metadata#>>'{dian_receptor_tax_profile,taxSchemeId}' = '01'
        AND metadata#>>'{dian_receptor_tax_profile,taxSchemeName}' = 'IVA'
      )
    )
  )
);

REVOKE ALL ON FUNCTION app.snapshot_dian_receiver_profile_526() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crear_cliente_maestro_tx(uuid,uuid,jsonb),
  public.actualizar_cliente_maestro_tx(uuid,uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_cliente_maestro_tx(uuid,uuid,jsonb),
  public.actualizar_cliente_maestro_tx(uuid,uuid,uuid,jsonb)
  TO service_role;

COMMIT;
