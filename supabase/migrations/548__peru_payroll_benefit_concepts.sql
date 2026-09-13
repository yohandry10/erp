BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';

CREATE FUNCTION app.ensure_peru_payroll_benefits_548(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.empresa_config WHERE tenant_id=p_tenant_id AND upper(pais)='PE') THEN RETURN; END IF;
  INSERT INTO public.conceptos_planilla(tenant_id,codigo,nombre,estado,activo,metadata)
  SELECT p_tenant_id,s.codigo,s.nombre,'ACTIVO',true,
    jsonb_build_object('tipo','ingreso','seed','peru_payroll_benefits_548')
  FROM (VALUES ('006','Gratificacion legal'),('007','Bonificacion extraordinaria 9%'),
    ('008','Remuneracion vacacional')) s(codigo,nombre)
  WHERE NOT EXISTS(SELECT 1 FROM public.conceptos_planilla cp
    WHERE cp.tenant_id=p_tenant_id AND upper(btrim(cp.codigo))=s.codigo)
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION app.ensure_peru_payroll_benefits_548(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app.seed_peru_payroll_benefits_548()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app AS $$
BEGIN
  PERFORM app.ensure_peru_payroll_benefits_548(NEW.tenant_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.seed_peru_payroll_benefits_548() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER seed_peru_payroll_benefits_548 AFTER INSERT OR UPDATE OF pais,tenant_id
ON public.empresa_config FOR EACH ROW EXECUTE FUNCTION app.seed_peru_payroll_benefits_548();

-- Catálogo operativo faltante, no datos sintéticos. Preserva códigos existentes
-- incluso inactivos o personalizados, así como sus referencias históricas.
SELECT app.ensure_peru_payroll_benefits_548(tenant_id)
FROM public.empresa_config WHERE upper(pais)='PE';

-- Rollback: retirar el trigger y las funciones tras detener runtime incompatible.
-- Conservar los conceptos, que pueden estar referenciados por planillas.
COMMIT;
