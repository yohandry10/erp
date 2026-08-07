-- Localización operativa Argentina (ARCA/ARS) sin alterar el contrato Perú.
-- Agrega catálogos fiscales, configuración WSAA/WSFE y creación de demos por país.

BEGIN;

INSERT INTO public.paises (
  id, codigo_iso, nombre, nombre_fiscal, moneda_codigo, moneda_simbolo,
  activo, created_at, updated_at
)
VALUES (5, 'AR', 'Argentina', 'ARCA', 'ARS', '$', true, now(), now())
ON CONFLICT (id) DO UPDATE
SET codigo_iso = EXCLUDED.codigo_iso,
    nombre = EXCLUDED.nombre,
    nombre_fiscal = EXCLUDED.nombre_fiscal,
    moneda_codigo = EXCLUDED.moneda_codigo,
    moneda_simbolo = EXCLUDED.moneda_simbolo,
    activo = true,
    updated_at = now();

ALTER TABLE public.empresa_config
  ADD COLUMN IF NOT EXISTS arca_activo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS arca_environment text NOT NULL DEFAULT 'homologacion',
  ADD COLUMN IF NOT EXISTS arca_wsaa_url text,
  ADD COLUMN IF NOT EXISTS arca_wsfe_url text,
  ADD COLUMN IF NOT EXISTS arca_cuit_representada text,
  ADD COLUMN IF NOT EXISTS arca_punto_venta integer,
  ADD COLUMN IF NOT EXISTS arca_condicion_iva text,
  ADD COLUMN IF NOT EXISTS ingresos_brutos text,
  ADD COLUMN IF NOT EXISTS fecha_inicio_actividades date,
  ADD COLUMN IF NOT EXISTS provincia_fiscal text,
  ADD COLUMN IF NOT EXISTS arca_qr_habilitado boolean NOT NULL DEFAULT true;

UPDATE public.empresa_config
SET arca_wsaa_url = COALESCE(
      NULLIF(btrim(arca_wsaa_url), ''),
      CASE WHEN lower(arca_environment) = 'produccion'
        THEN 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
        ELSE 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms'
      END
    ),
    arca_wsfe_url = COALESCE(
      NULLIF(btrim(arca_wsfe_url), ''),
      CASE WHEN lower(arca_environment) = 'produccion'
        THEN 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
        ELSE 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'
      END
    )
WHERE pais = 'AR' OR pais_id = 5;

ALTER TABLE public.empresa_config
  DROP CONSTRAINT IF EXISTS empresa_config_arca_environment_check;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT empresa_config_arca_environment_check
  CHECK (lower(arca_environment) IN ('homologacion', 'produccion'));

ALTER TABLE public.empresa_config
  DROP CONSTRAINT IF EXISTS empresa_config_arca_punto_venta_check;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT empresa_config_arca_punto_venta_check
  CHECK (arca_punto_venta IS NULL OR arca_punto_venta BETWEEN 1 AND 99999);

COMMENT ON COLUMN public.empresa_config.arca_cuit_representada IS
  'CUIT de 11 dígitos representada ante WSAA/WSFE; puede diferir del titular técnico del certificado.';
COMMENT ON COLUMN public.empresa_config.arca_punto_venta IS
  'Punto de venta electrónico previamente habilitado en ARCA.';
COMMENT ON COLUMN public.empresa_config.ingresos_brutos IS
  'Número de inscripción local o Convenio Multilateral. La alícuota se configura por jurisdicción.';

INSERT INTO public.configuracion_fiscal (
  tenant_id, pais_id, codigo, nombre, activo,
  impuesto_principal_nombre, impuesto_principal_porcentaje,
  documento_identidad_empresa, longitud_documento_empresa,
  formato_fecha, separador_decimal, separador_miles,
  requiere_libro_diario, requiere_libro_mayor, requiere_libro_inventarios,
  requiere_libro_compras, requiere_libro_ventas, requiere_kardex_valorizado,
  requiere_libro_mayor_balances, requiere_libros_societarios,
  max_items_por_documento, monto_maximo_documento, estado, created_at, updated_at
)
SELECT
  NULL, 5, 'AR', 'Argentina', true,
  'IVA', 0.21, 'CUIT', 11,
  'DD/MM/YYYY', ',', '.',
  true, true, true, true, true, true, true, true,
  999, 999999999999.99, 'ACTIVO', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.configuracion_fiscal
  WHERE tenant_id IS NULL AND pais_id = 5
);

INSERT INTO public.tipos_documentos_fiscales (
  tenant_id, pais_id, codigo, nombre, activo, estado, created_at, updated_at
)
SELECT NULL, 5, source.codigo, source.nombre, true, 'ACTIVO', now(), now()
FROM (
  VALUES
    ('1', 'Factura A'),
    ('2', 'Nota de Débito A'),
    ('3', 'Nota de Crédito A'),
    ('6', 'Factura B'),
    ('7', 'Nota de Débito B'),
    ('8', 'Nota de Crédito B'),
    ('11', 'Factura C'),
    ('12', 'Nota de Débito C'),
    ('13', 'Nota de Crédito C'),
    ('19', 'Factura de Exportación E'),
    ('20', 'Nota de Débito por Operaciones con el Exterior'),
    ('21', 'Nota de Crédito por Operaciones con el Exterior'),
    ('51', 'Factura M'),
    ('52', 'Nota de Débito M'),
    ('53', 'Nota de Crédito M')
) AS source(codigo, nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tipos_documentos_fiscales target
  WHERE target.tenant_id IS NULL
    AND target.pais_id = 5
    AND target.codigo = source.codigo
);

INSERT INTO public.tipos_impuestos (
  tenant_id, pais_id, codigo, nombre, porcentaje,
  activo, estado, created_at, updated_at
)
SELECT NULL, 5, source.codigo, source.nombre, source.porcentaje,
       true, 'ACTIVO', now(), now()
FROM (
  VALUES
    ('IVA_0', 'IVA 0%', 0.00::numeric),
    ('IVA_105', 'IVA 10,5%', 10.50::numeric),
    ('IVA_21', 'IVA 21%', 21.00::numeric),
    ('IVA_27', 'IVA 27%', 27.00::numeric),
    ('IVA_EXENTO', 'IVA Exento', 0.00::numeric),
    ('IVA_NO_GRAVADO', 'IVA No Gravado', 0.00::numeric),
    ('IIBB', 'Ingresos Brutos (según jurisdicción)', 0.00::numeric),
    ('PERCEPCION_IVA', 'Percepción de IVA', 0.00::numeric),
    ('PERCEPCION_IIBB', 'Percepción de Ingresos Brutos', 0.00::numeric)
) AS source(codigo, nombre, porcentaje)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tipos_impuestos target
  WHERE target.tenant_id IS NULL
    AND target.pais_id = 5
    AND target.codigo = source.codigo
);

CREATE OR REPLACE FUNCTION app.argentina_cuit_check_digit(p_base text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
  v_sum integer := 0;
  v_weights integer[] := ARRAY[5,4,3,2,7,6,5,4,3,2];
  v_result integer;
  i integer;
BEGIN
  IF p_base !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'La base de CUIT debe tener 10 dígitos';
  END IF;
  FOR i IN 1..10 LOOP
    v_sum := v_sum + substr(p_base, i, 1)::integer * v_weights[i];
  END LOOP;
  v_result := 11 - (v_sum % 11);
  IF v_result = 11 THEN RETURN 0; END IF;
  IF v_result = 10 THEN RETURN 9; END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_demo_tenant(
  p_nombre varchar DEFAULT 'DEMO COMERCIAL S.A.C.',
  p_dias_duracion integer DEFAULT 14,
  p_pais_codigo varchar DEFAULT 'PE'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, extensions, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := extensions.gen_random_uuid();
  v_user_id uuid := extensions.gen_random_uuid();
  v_demo_email text;
  v_demo_password text;
  v_expires_at timestamptz;
  v_admin_demo_role_id uuid;
  v_country text := upper(btrim(COALESCE(p_pais_codigo, 'PE')));
  v_pais_id bigint;
  v_currency text;
  v_tax_id text;
  v_cuit_base text;
BEGIN
  IF v_country NOT IN ('PE', 'AR') THEN
    RAISE EXCEPTION 'País demo no soportado: %. Use PE o AR.', v_country;
  END IF;

  SELECT id, moneda_codigo INTO v_pais_id, v_currency
  FROM public.paises
  WHERE codigo_iso = v_country AND activo = true;
  IF v_pais_id IS NULL THEN
    RAISE EXCEPTION 'Catálogo del país % no disponible', v_country;
  END IF;

  IF v_country = 'AR' THEN
    v_cuit_base := '30' || lpad(floor(random() * 100000000)::bigint::text, 8, '0');
    v_tax_id := v_cuit_base || app.argentina_cuit_check_digit(v_cuit_base)::text;
  ELSE
    v_tax_id := '20' || lpad((random() * 999999999)::int::text, 9, '0');
  END IF;

  v_demo_email := 'demo-' || lower(v_country) || '-' || left(v_tenant_id::text, 8) || '@temp.local';
  v_demo_password := upper(left(md5(random()::text), 8));
  v_expires_at := now() + make_interval(days => GREATEST(COALESCE(p_dias_duracion, 14), 1));

  INSERT INTO public.tenants (
    id, codigo, nombre, descripcion, pais, plan, activo, estado, created_at, updated_at
  ) VALUES (
    v_tenant_id, 'DEMO-' || v_country || '-' || upper(left(v_tenant_id::text, 8)),
    p_nombre, 'Tenant demo autogenerado para ' || v_country,
    v_country, 'demo', true, 'ACTIVO', now(), now()
  );

  INSERT INTO public.empresa_config (
    id, tenant_id, razon_social, nombre_comercial, ruc, pais, pais_id, moneda_defecto,
    tipo_empresa, usar_flujo_logistica,
    is_demo, demo_created_at, demo_expires_at, demo_extended, demo_conversion_attempted,
    estado, plan, created_at, updated_at
  ) VALUES (
    extensions.gen_random_uuid(), v_tenant_id, p_nombre, p_nombre, v_tax_id,
    v_country, v_pais_id, v_currency, 'MICRO', false,
    true, now(), v_expires_at, false, false,
    'PRUEBA', 'BASICO', now(), now()
  );

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado, is_super_admin, is_demo_user, demo_email_temp,
    demo_expires_at, demo_retention_until, created_at, updated_at
  ) VALUES (
    v_user_id, v_tenant_id, 'Usuario', 'Demo ' || v_country, v_demo_email, 'demo',
    extensions.crypt(v_demo_password, extensions.gen_salt('bf')),
    true, 'ACTIVO', false, true, v_demo_email, v_expires_at,
    v_expires_at + interval '30 days', now(), now()
  );

  INSERT INTO public.users (
    id, tenant_id, email, nombre, apellido, activo, estado, created_at, updated_at
  ) VALUES (
    v_user_id, v_tenant_id, v_demo_email, 'Usuario', 'Demo ' || v_country,
    true, 'ACTIVO', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  PERFORM app.ensure_demo_admin_rbac_for_tenant(v_tenant_id);
  SELECT id INTO v_admin_demo_role_id
  FROM public.roles
  WHERE tenant_id = v_tenant_id AND upper(nombre::text) = 'ADMIN_DEMO'
  LIMIT 1;

  IF v_admin_demo_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (
      id, usuario_sistema_id, role_id, tenant_id, created_at
    ) VALUES (
      extensions.gen_random_uuid(), v_user_id, v_admin_demo_role_id, v_tenant_id, now()
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'tenant_id', v_tenant_id, 'user_id', v_user_id,
    'email', v_demo_email, 'password', v_demo_password,
    'expires_at', v_expires_at,
    'dias_restantes', GREATEST(COALESCE(p_dias_duracion, 14), 1),
    'pais', v_country, 'pais_id', v_pais_id, 'moneda', v_currency
  );
END;
$$;

REVOKE ALL ON FUNCTION app.argentina_cuit_check_digit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.argentina_cuit_check_digit(text) TO service_role;
REVOKE ALL ON FUNCTION public.create_demo_tenant(varchar, integer, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_demo_tenant(varchar, integer, varchar) FROM anon;
REVOKE ALL ON FUNCTION public.create_demo_tenant(varchar, integer, varchar) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_demo_tenant(varchar, integer, varchar) TO service_role;

COMMIT;
