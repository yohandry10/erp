-- Configuracion, alta de tenant, demos y preferencias de pais comparten una
-- unica frontera transaccional. Las rutas HTTP solo pueden invocar estos RPC
-- con service_role; anon/authenticated no reciben permisos de ejecucion.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, extensions, pg_temp;

CREATE TABLE IF NOT EXISTS public.configuration_operation_intents (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  scope_type text NOT NULL,
  scope_id text NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  intent_fingerprint text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_configuration_intent_scope_464 CHECK (
    scope_type IN ('TENANT', 'PLATFORM', 'USER', 'DEMO')
  ),
  CONSTRAINT ck_configuration_intent_key_464 CHECK (
    length(btrim(idempotency_key)) BETWEEN 8 AND 255
  ),
  CONSTRAINT ux_configuration_intent_464 UNIQUE (
    scope_type, scope_id, operation, idempotency_key
  )
);

CREATE INDEX IF NOT EXISTS idx_configuration_intents_tenant_464
ON public.configuration_operation_intents (tenant_id, created_at DESC);

ALTER TABLE public.configuration_operation_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuration_operation_intents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS configuration_intents_service_only_464
  ON public.configuration_operation_intents;

CREATE OR REPLACE FUNCTION app.configuration_fingerprint_464(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(
    extensions.digest(
      convert_to(COALESCE(p_payload, '{}'::jsonb)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$function$;

CREATE OR REPLACE FUNCTION app.assert_configuration_actor_464(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_require_superadmin boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_actor public.usuarios_sistema;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'CONFIGURATION_ACTOR_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor
  FROM public.usuarios_sistema u
  WHERE u.id = p_actor_id
  LIMIT 1;

  IF NOT FOUND
     OR NOT COALESCE(v_actor.activo, false)
     OR lower(COALESCE(v_actor.estado::text, '')) <> 'activo'
     OR (p_require_superadmin AND NOT COALESCE(v_actor.is_super_admin, false))
     OR (
       NOT p_require_superadmin
       AND p_tenant_id IS NOT NULL
       AND v_actor.tenant_id IS DISTINCT FROM p_tenant_id
       AND NOT COALESCE(v_actor.is_super_admin, false)
     ) THEN
    RAISE EXCEPTION 'CONFIGURATION_ACTOR_INVALID' USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- Fundación operativa mínima de una demo. Se invoca desde el alta pública
-- dentro de la misma transacción: si falla una sola precondición no queda un
-- tenant parcial. La muestra histórica 412/413 sólo es válida para Perú.
CREATE OR REPLACE FUNCTION app.hydrate_demo_foundation_464(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_country text,
  p_certificado_pfx bytea DEFAULT NULL,
  p_certificado_password text DEFAULT NULL,
  p_certificado_expira_en timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_country text := upper(btrim(COALESCE(p_country, '')));
  v_country_id bigint;
  v_currency text;
  v_tax_id text;
  v_tax_rate numeric;
  v_patch jsonb;
  v_warehouse jsonb;
  v_warehouse_id uuid;
  v_category jsonb;
  v_product jsonb;
  v_client jsonb;
  v_supplier jsonb;
  v_caja_id uuid;
  v_employee_id uuid;
  v_role_id uuid;
  v_approver_password text;
  v_approver jsonb;
  v_readiness jsonb;
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, false);
  SELECT p.id, upper(p.moneda_codigo)
  INTO v_country_id, v_currency
  FROM public.paises p
  WHERE upper(p.codigo_iso) = v_country AND p.activo
    AND upper(p.codigo_iso) IN ('PE','AR','CO');
  IF v_country_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.empresa_config ec
    WHERE ec.tenant_id = p_tenant_id AND COALESCE(ec.is_demo, false)
  ) THEN
    RAISE EXCEPTION 'DEMO_FOUNDATION_TENANT_OR_COUNTRY_INVALID' USING ERRCODE = '23514';
  END IF;

  v_tax_id := CASE v_country
    WHEN 'AR' THEN '30710158229'
    WHEN 'CO' THEN '900123456-8'
    ELSE '20123456786'
  END;
  v_tax_rate := CASE v_country WHEN 'AR' THEN 21 WHEN 'CO' THEN 19 ELSE 18 END;
  v_patch := jsonb_build_object(
    'ruc', v_tax_id,
    'direccion_fiscal', CASE v_country
      WHEN 'AR' THEN 'Av. Corrientes 1234, Ciudad Autonoma de Buenos Aires'
      WHEN 'CO' THEN 'Carrera 7 # 72-41, Bogota D.C.'
      ELSE 'Av. Demo 123, Lima' END,
    'pais', v_country,
    'pais_id', v_country_id,
    'moneda_defecto', v_currency,
    'configuracion_completa', true,
    'igv_porcentaje', v_tax_rate,
    'usar_flujo_logistica', true,
    'gre_automatico_habilitado', false,
    'gre_obligatorio', false,
    'regimen_tributario', CASE v_country
      WHEN 'AR' THEN 'RESPONSABLE_INSCRIPTO'
      WHEN 'CO' THEN 'RESPONSABLE_IVA'
      ELSE 'GENERAL' END,
    'serie_factura', CASE v_country WHEN 'AR' THEN '00001' WHEN 'CO' THEN 'FE' ELSE 'F001' END,
    'serie_boleta', CASE v_country WHEN 'AR' THEN '00001' WHEN 'CO' THEN 'FE' ELSE 'B001' END,
    'serie_nota_credito', CASE v_country WHEN 'AR' THEN '00001' WHEN 'CO' THEN 'NC' ELSE 'FC01' END,
    'emision_cpe_modo', CASE v_country WHEN 'AR' THEN 'ARCA_WSFE' WHEN 'CO' THEN 'DIAN_DIRECTO' ELSE 'SUNAT_DIRECTO' END
  );
  IF v_country = 'PE' THEN
    v_patch := v_patch || jsonb_build_object('sunat_environment', 'homologacion');
  ELSIF v_country = 'AR' THEN
    v_patch := v_patch || jsonb_build_object(
      'arca_activo', false,
      'arca_environment', 'homologacion',
      'arca_cuit_representada', v_tax_id,
      'arca_punto_venta', 1,
      'arca_condicion_iva', 'RESPONSABLE_INSCRIPTO'
    );
  ELSE
    v_patch := v_patch || jsonb_build_object(
      'dian_activo', false,
      'dian_environment', 'HOMOLOGACION',
      'dian_regimen_fiscal', '48',
      'dian_tipo_contribuyente', 'PERSONA_JURIDICA'
    );
  END IF;
  IF v_country = 'PE' AND p_certificado_pfx IS NOT NULL THEN
    IF NULLIF(btrim(COALESCE(p_certificado_password, '')), '') IS NULL
       OR p_certificado_expira_en IS NULL OR p_certificado_expira_en <= now() THEN
      RAISE EXCEPTION 'DEMO_CERTIFICATE_METADATA_INVALID' USING ERRCODE = '22023';
    END IF;
    v_patch := v_patch || jsonb_build_object(
      'certificado_pfx', p_certificado_pfx,
      'certificado_password', p_certificado_password,
      'certificado_expira_en', p_certificado_expira_en
    );
  END IF;
  PERFORM app.apply_empresa_config_patch_464(p_tenant_id, v_patch);
  UPDATE public.tenants
  SET ruc = v_tax_id, pais = v_country, updated_at = now()
  WHERE id = p_tenant_id;

  v_warehouse := public.crear_almacen_maestro_tx(
    p_tenant_id, p_actor_id, 'demo-464-warehouse',
    jsonb_build_object(
      'codigo', 'ALM-PRINCIPAL', 'nombre', 'Almacen Principal',
      'descripcion', 'Almacen operativo de la demo', 'es_principal', true
    )
  );
  v_warehouse_id := (v_warehouse->>'id')::uuid;

  FOR v_category IN SELECT value FROM jsonb_array_elements('[
    {"codigo":"ALIMENTOS","nombre":"Alimentos","orden":1},
    {"codigo":"OFICINA","nombre":"Oficina","orden":2},
    {"codigo":"ELECTRONICA","nombre":"Electronica","orden":3},
    {"codigo":"HOGAR","nombre":"Hogar","orden":4}
  ]'::jsonb)
  LOOP
    PERFORM public.crear_categoria_producto_maestro_tx(
      p_tenant_id, p_actor_id,
      'demo-464-category-' || lower(v_category->>'codigo'),
      v_category || jsonb_build_object('descripcion', 'Categoria operativa de la demo')
    );
  END LOOP;

  FOR v_product IN SELECT value FROM jsonb_array_elements('[
    {"codigo":"DEMO-001","nombre":"Cafe Molido Premium 250g","categoria":"ALIMENTOS","precio_venta":25,"precio_compra":18,"stock_inicial":50},
    {"codigo":"DEMO-002","nombre":"Azucar Rubia 1kg","categoria":"ALIMENTOS","precio_venta":6.5,"precio_compra":4.8,"stock_inicial":120},
    {"codigo":"DEMO-003","nombre":"Cuaderno A4 96 hojas","categoria":"OFICINA","precio_venta":8.9,"precio_compra":5.5,"stock_inicial":80},
    {"codigo":"DEMO-004","nombre":"Audifonos Bluetooth","categoria":"ELECTRONICA","precio_venta":89.9,"precio_compra":60,"stock_inicial":15},
    {"codigo":"DEMO-005","nombre":"Detergente Liquido 1L","categoria":"HOGAR","precio_venta":14.5,"precio_compra":10,"stock_inicial":40},
    {"codigo":"DEMO-006","nombre":"Papa Blanca 1kg","categoria":"ALIMENTOS","precio_venta":3.5,"precio_compra":2.2,"stock_inicial":200,"afectacion_igv":"20"}
  ]'::jsonb)
  LOOP
    IF v_country = 'CO' THEN
      v_product := v_product || jsonb_build_object(
        'precio_venta', (v_product->>'precio_venta')::numeric * 1000,
        'precio_compra', (v_product->>'precio_compra')::numeric * 1000
      );
    END IF;
    PERFORM public.crear_producto_maestro_tx(
      p_tenant_id, p_actor_id,
      'demo-464-product-' || lower(v_product->>'codigo'),
      v_product || jsonb_build_object(
        'almacen_id', v_warehouse_id,
        'stock_minimo', 5,
        'stock_reservado', 0,
        'impuesto', v_tax_rate,
        'controla_stock', true,
        'es_servicio', false,
        'descripcion', 'Producto de ejemplo',
        'afectacion_igv', COALESCE(v_product->>'afectacion_igv', '10')
      )
    );
  END LOOP;

  INSERT INTO public.plan_cuentas (
    tenant_id, codigo, nombre, tipo, estado, activo, acepta_movimiento, nivel, metadata
  )
  SELECT p_tenant_id, x.codigo, x.nombre, x.tipo, 'ACTIVO', true, true, 2,
         jsonb_build_object('source', 'demo_foundation_464', 'pais', v_country)
  FROM (VALUES
    ('10','Caja y bancos','ACTIVO'), ('101','Caja','ACTIVO'),
    ('104','Bancos','ACTIVO'), ('12','Clientes','ACTIVO'),
    ('20','Inventarios','ACTIVO'), ('40','Tributos por pagar','PASIVO'),
    ('403','Aportes por pagar','PASIVO'), ('407','Contribuciones por pagar','PASIVO'),
    ('411','Remuneraciones por pagar','PASIVO'), ('415','Beneficios laborales por pagar','PASIVO'),
    ('42','Proveedores','PASIVO'), ('50','Capital','PATRIMONIO'),
    ('60','Compras','GASTO'), ('621','Sueldos','GASTO'),
    ('627','Seguridad social','GASTO'), ('629','Beneficios sociales','GASTO'),
    ('69','Costo de ventas','GASTO'), ('70','Ventas','INGRESO'),
    ('94','Gastos de administracion','GASTO')
  ) AS x(codigo,nombre,tipo)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.plan_cuentas pc
    WHERE pc.tenant_id = p_tenant_id AND upper(btrim(pc.codigo)) = x.codigo
  );

  INSERT INTO public.metodos_pago (tenant_id, codigo, nombre, tipo, estado, activo)
  SELECT p_tenant_id, x.codigo, x.nombre, x.tipo, 'ACTIVO', true
  FROM (VALUES
    ('EFECTIVO','Efectivo','EFECTIVO'),
    ('TARJETA','Tarjeta','TARJETA'),
    ('TRANSFERENCIA','Transferencia bancaria','TRANSFERENCIA'),
    (CASE v_country WHEN 'AR' THEN 'MERCADO_PAGO' WHEN 'CO' THEN 'NEQUI' ELSE 'YAPE' END,
     CASE v_country WHEN 'AR' THEN 'Mercado Pago' WHEN 'CO' THEN 'Nequi / Daviplata' ELSE 'Yape / Plin' END,
     'BILLETERA_DIGITAL')
  ) AS x(codigo,nombre,tipo)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.metodos_pago mp
    WHERE mp.tenant_id = p_tenant_id AND upper(btrim(mp.codigo)) = x.codigo
  );

  INSERT INTO public.cajas (tenant_id, codigo, nombre, estado, almacen_id)
  VALUES (p_tenant_id, 'CAJA-001', 'Caja Principal', 'ACTIVO', v_warehouse_id)
  RETURNING id INTO v_caja_id;
  PERFORM public.abrir_caja_tx(
    p_tenant_id, v_caja_id, p_actor_id,
    jsonb_build_object(
      'cajero_id', p_actor_id, 'monto_inicio', 100,
      'moneda', v_currency, 'dispositivo', 'demo-bootstrap-464'
    )
  );

  FOR v_client IN SELECT value FROM jsonb_array_elements(CASE v_country
    WHEN 'AR' THEN '[
      {"tipo":"PERSONA","documento_tipo":"DNI","documento_identidad":"30123456","razon_social":"Consumidor Final"},
      {"tipo":"PERSONA","documento_tipo":"DNI","documento_identidad":"32123456","razon_social":"Juan Perez Demo"},
      {"tipo":"EMPRESA","documento_tipo":"CUIT","documento_identidad":"30710158229","razon_social":"Comercial Pampa Demo S.A."}
    ]'::jsonb
    WHEN 'CO' THEN '[
      {"tipo":"PERSONA","documento_tipo":"CC","documento_identidad":"1000000001","razon_social":"Consumidor Final"},
      {"tipo":"PERSONA","documento_tipo":"CC","documento_identidad":"1012345678","razon_social":"Juan Perez Demo"},
      {"tipo":"EMPRESA","documento_tipo":"NIT","documento_identidad":"9001234568","razon_social":"Comercial Andina Demo S.A.S."}
    ]'::jsonb
    ELSE '[
      {"tipo":"PERSONA","documento_tipo":"DNI","documento_identidad":"99999999","razon_social":"Cliente General"},
      {"tipo":"PERSONA","documento_tipo":"DNI","documento_identidad":"12345678","razon_social":"Juan Perez Demo"},
      {"tipo":"EMPRESA","documento_tipo":"RUC","documento_identidad":"20600000013","razon_social":"Comercial Andina Demo S.A.C."}
    ]'::jsonb END)
  LOOP
    PERFORM public.crear_cliente_maestro_tx(p_tenant_id, p_actor_id, v_client);
  END LOOP;

  FOR v_supplier IN SELECT value FROM jsonb_array_elements(CASE v_country
    WHEN 'AR' THEN '[
      {"documento_tipo":"CUIT","ruc":"30712345671","razon_social":"Distribuidora del Plata S.A.","email":"ventas@distribuidoradelplata.demo","dias_credito":30},
      {"documento_tipo":"CUIT","ruc":"30714025003","razon_social":"Insumos Pampeanos S.R.L.","email":"pedidos@insumospampeanos.demo","dias_credito":15}
    ]'::jsonb
    WHEN 'CO' THEN '[
      {"documento_tipo":"NIT","ruc":"9003739135","razon_social":"Distribuciones Capital S.A.S.","email":"ventas@distribucionescapital.demo","dias_credito":30},
      {"documento_tipo":"NIT","ruc":"8600029645","razon_social":"Insumos Cafeteros S.A.S.","email":"pedidos@insumoscafeteros.demo","dias_credito":15}
    ]'::jsonb
    ELSE '[
      {"documento_tipo":"RUC","ruc":"20512345671","razon_social":"Distribuidora Andina S.A.C.","email":"ventas@distribuidoraandina.demo","dias_credito":30},
      {"documento_tipo":"RUC","ruc":"20487654320","razon_social":"Importaciones del Sur E.I.R.L.","email":"pedidos@impsur.demo","dias_credito":15}
    ]'::jsonb END)
  LOOP
    PERFORM public.crear_proveedor_maestro_tx(
      p_tenant_id, p_actor_id,
      v_supplier || jsonb_build_object(
        'documento_identidad', v_supplier->>'ruc',
        'limite_credito', 50000, 'condiciones_pago', 'CREDITO'
      )
    );
  END LOOP;

  INSERT INTO public.cuentas_bancarias (
    tenant_id, nombre, codigo, banco, numero_cuenta, tipo_cuenta, moneda,
    saldo, saldo_actual, saldo_contable, permite_sobregiro, activa, activo
  ) VALUES (
    p_tenant_id,
    CASE v_country WHEN 'AR' THEN 'Banco Nacion Cuenta Corriente' WHEN 'CO' THEN 'Bancolombia Cuenta Corriente' ELSE 'BCP Cuenta Corriente' END,
    CASE v_country WHEN 'AR' THEN 'BNA-CTE-ARS' WHEN 'CO' THEN 'BCO-CTE-COP' ELSE 'BCP-CTE-PEN' END,
    CASE v_country WHEN 'AR' THEN 'Banco Nacion' WHEN 'CO' THEN 'Bancolombia' ELSE 'BCP' END,
    CASE v_country WHEN 'AR' THEN '0000-123456/7' WHEN 'CO' THEN '12345678901' ELSE '194-1234567-0-56' END,
    'CORRIENTE', v_currency, 50000, 50000, 50000, false, true, true
  );

  INSERT INTO public.empleados (
    tenant_id, nombres, apellidos, tipo_documento, numero_documento,
    email, puesto, fecha_ingreso, estado, tiene_hijos,
    cantidad_hijos, asignacion_familiar, activo
  ) VALUES (
    p_tenant_id,
    CASE v_country WHEN 'AR' THEN 'Sofia' WHEN 'CO' THEN 'Laura Sofia' ELSE 'Maria Elena' END,
    CASE v_country WHEN 'AR' THEN 'Gonzalez' WHEN 'CO' THEN 'Gomez Rodriguez' ELSE 'Quispe Huaman' END,
    CASE v_country WHEN 'AR' THEN 'CUIL' WHEN 'CO' THEN 'CC' ELSE 'DNI' END,
    CASE v_country WHEN 'AR' THEN '27301234568' WHEN 'CO' THEN '52345678' ELSE '44556677' END,
    CASE v_country WHEN 'AR' THEN 'sgonzalez@demo.local' WHEN 'CO' THEN 'lgomez@demo.local' ELSE 'mquispe@demo.local' END,
    'Asistente Administrativo', current_date - 420, 'activo',
    v_country = 'PE', CASE WHEN v_country = 'PE' THEN 1 ELSE 0 END,
    v_country = 'PE', true
  ) RETURNING id INTO v_employee_id;
  INSERT INTO public.contratos (
    tenant_id, id_empleado, empleado_id, tipo_contrato, fecha_inicio,
    sueldo_bruto, salario, moneda, regimen_pensionario, estado, activo
  ) VALUES (
    p_tenant_id, v_employee_id, v_employee_id, 'INDEFINIDO', current_date - 420,
    CASE v_country WHEN 'AR' THEN 1800000 WHEN 'CO' THEN 2500000 ELSE 2500 END,
    CASE v_country WHEN 'AR' THEN 1800000 WHEN 'CO' THEN 2500000 ELSE 2500 END,
    v_currency,
    CASE v_country WHEN 'AR' THEN 'SIPA' WHEN 'CO' THEN 'COLPENSIONES' ELSE 'ONP' END,
    'VIGENTE', true
  );

  SELECT r.id INTO v_role_id FROM public.roles r
  WHERE r.tenant_id = p_tenant_id AND upper(btrim(r.nombre)) = 'ADMIN_DEMO'
    AND COALESCE(r.activo, true)
  LIMIT 1;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'DEMO_APPROVER_ROLE_MISSING' USING ERRCODE = '23503';
  END IF;
  v_approver_password := 'A!' || upper(left(md5(extensions.gen_random_uuid()::text), 14));
  v_approver := public.crear_usuario_rbac_tx(
    p_tenant_id, p_actor_id, 'demo-approver-464-' || left(p_tenant_id::text, 16),
    jsonb_build_object(
      'email', 'aprobador-' || left(p_tenant_id::text, 8) || '@temp.local',
      'nombre', 'Aprobador', 'apellido', 'Demo',
      'password_hash', extensions.crypt(v_approver_password, extensions.gen_salt('bf')),
      'estado', 'ACTIVO'
    ), ARRAY[v_role_id]
  );

  PERFORM public.completar_wizard_config_tx(
    p_tenant_id, p_actor_id,
    'demo-wizard-464-' || left(p_tenant_id::text, 16),
    jsonb_build_object('pais', v_country, 'pais_id', v_country_id, 'moneda_defecto', v_currency)
  );

  IF v_country = 'PE' THEN
    v_readiness := public.hydrate_demo_business_sample_tx(p_tenant_id, p_actor_id);
    IF COALESCE((v_readiness->>'ready')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'DEMO_PERU_BUSINESS_SAMPLE_NOT_READY:%', v_readiness USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT jsonb_build_object(
      'ready',
        (SELECT count(*) >= 6 FROM public.productos WHERE tenant_id = p_tenant_id AND activo)
        AND (SELECT count(*) >= 3 FROM public.clientes WHERE tenant_id = p_tenant_id AND activo)
        AND (SELECT count(*) >= 2 FROM public.proveedores WHERE tenant_id = p_tenant_id AND activo)
        AND EXISTS (SELECT 1 FROM public.sesiones_caja WHERE tenant_id = p_tenant_id AND lower(estado::text) = 'abierta')
        AND EXISTS (SELECT 1 FROM public.cuentas_bancarias WHERE tenant_id = p_tenant_id AND activo)
        AND EXISTS (SELECT 1 FROM public.empleados WHERE tenant_id = p_tenant_id AND activo),
      'country', v_country,
      'productos', (SELECT count(*) FROM public.productos WHERE tenant_id = p_tenant_id AND activo),
      'clientes', (SELECT count(*) FROM public.clientes WHERE tenant_id = p_tenant_id AND activo),
      'proveedores', (SELECT count(*) FROM public.proveedores WHERE tenant_id = p_tenant_id AND activo)
    ) INTO v_readiness;
    IF COALESCE((v_readiness->>'ready')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'DEMO_FOUNDATION_NOT_READY:%', v_readiness USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.empresa_config ec
    WHERE ec.tenant_id = p_tenant_id AND upper(ec.pais) = v_country
      AND ec.pais_id = v_country_id AND upper(ec.moneda_defecto) = v_currency
  ) THEN
    RAISE EXCEPTION 'DEMO_COUNTRY_WAS_MUTATED_DURING_HYDRATION' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'readiness', v_readiness,
    'aprobador_user_id', v_approver->>'id',
    'aprobador_email', v_approver->>'email',
    'aprobador_password', v_approver_password
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_demo_tenant_ready_tx(
  p_nombre varchar,
  p_dias_duracion integer,
  p_pais_codigo varchar,
  p_idempotency_key text,
  p_certificado_pfx bytea DEFAULT NULL,
  p_certificado_password text DEFAULT NULL,
  p_certificado_expira_en timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_country text := upper(btrim(COALESCE(p_pais_codigo, 'PE')));
  v_days integer := GREATEST(COALESCE(p_dias_duracion, 14), 1);
  v_fingerprint text;
  v_replay jsonb;
  v_base jsonb;
  v_foundation jsonb;
  v_tenant_id uuid;
  v_user_id uuid;
  v_result jsonb;
BEGIN
  IF v_country NOT IN ('PE','AR','CO') OR v_days > 60
     OR NULLIF(btrim(COALESCE(p_nombre, '')), '') IS NULL THEN
    RAISE EXCEPTION 'DEMO_CREATE_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  v_fingerprint := app.configuration_fingerprint_464(jsonb_build_object(
    'nombre', btrim(p_nombre), 'dias', v_days, 'pais', v_country,
    'certificate_hash', CASE WHEN p_certificado_pfx IS NULL THEN NULL
      ELSE encode(extensions.digest(p_certificado_pfx, 'sha256'), 'hex') END,
    'certificate_password_hash', CASE WHEN p_certificado_password IS NULL THEN NULL
      ELSE app.configuration_fingerprint_464(to_jsonb(p_certificado_password)) END,
    'certificate_expiry', p_certificado_expira_en
  ));
  v_replay := app.configuration_intent_replay_464(
    'DEMO', 'public-create', 'DEMO_CREATE_READY', p_idempotency_key, v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  v_base := public.create_demo_tenant(p_nombre, v_days, v_country);
  IF COALESCE((v_base->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'DEMO_BASE_CREATE_FAILED' USING ERRCODE = 'P0001';
  END IF;
  v_tenant_id := (v_base->>'tenant_id')::uuid;
  v_user_id := (v_base->>'user_id')::uuid;
  v_foundation := app.hydrate_demo_foundation_464(
    v_tenant_id, v_user_id, v_country,
    p_certificado_pfx, p_certificado_password, p_certificado_expira_en
  );

  PERFORM app.audit_configuration_464(
    v_tenant_id, v_user_id, 'tenants', 'INSERT', v_tenant_id::text,
    NULL,
    jsonb_build_object('tenant_id', v_tenant_id, 'pais', v_country, 'is_demo', true),
    'CREAR_DEMO_LISTA',
    jsonb_build_object('idempotency_key', lower(btrim(p_idempotency_key)), 'fingerprint', v_fingerprint)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, status, idempotency_key
  ) VALUES (
    v_tenant_id, 'tenant', v_tenant_id::text, 'demo.lista',
    jsonb_build_object('tenant_id', v_tenant_id, 'pais', v_country, 'actor_id', v_user_id),
    'pending', 'demo-ready-464:' || left(lower(btrim(p_idempotency_key)), 220)
  );

  v_result := v_base || v_foundation || jsonb_build_object(
    'ready', true,
    'pais', v_country,
    'idempotent', false
  );
  PERFORM app.configuration_intent_finish_464(
    v_tenant_id, 'DEMO', 'public-create', 'DEMO_CREATE_READY',
    p_idempotency_key, v_fingerprint, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.configuration_intent_replay_464(
  p_scope_type text,
  p_scope_id text,
  p_operation text,
  p_idempotency_key text,
  p_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_scope_type text := upper(btrim(COALESCE(p_scope_type, '')));
  v_scope_id text := lower(btrim(COALESCE(p_scope_id, '')));
  v_operation text := upper(btrim(COALESCE(p_operation, '')));
  v_key text := lower(btrim(COALESCE(p_idempotency_key, '')));
  v_row public.configuration_operation_intents;
BEGIN
  IF v_scope_type NOT IN ('TENANT', 'PLATFORM', 'USER', 'DEMO')
     OR v_scope_id = ''
     OR v_operation = ''
     OR length(v_key) NOT BETWEEN 8 AND 255
     OR p_fingerprint IS NULL THEN
    RAISE EXCEPTION 'CONFIGURATION_IDEMPOTENCY_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'configuration:' || v_scope_type || ':' || v_scope_id || ':' || v_operation || ':' || v_key,
    464
  ));

  SELECT * INTO v_row
  FROM public.configuration_operation_intents i
  WHERE i.scope_type = v_scope_type
    AND i.scope_id = v_scope_id
    AND i.operation = v_operation
    AND i.idempotency_key = v_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_row.intent_fingerprint IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'CONFIGURATION_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
  END IF;
  RETURN v_row.result || jsonb_build_object('idempotent', true);
END;
$function$;

CREATE OR REPLACE FUNCTION app.configuration_intent_finish_464(
  p_tenant_id uuid,
  p_scope_type text,
  p_scope_id text,
  p_operation text,
  p_idempotency_key text,
  p_fingerprint text,
  p_result jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  INSERT INTO public.configuration_operation_intents (
    tenant_id, scope_type, scope_id, operation, idempotency_key,
    intent_fingerprint, result
  ) VALUES (
    p_tenant_id,
    upper(btrim(p_scope_type)),
    lower(btrim(p_scope_id)),
    upper(btrim(p_operation)),
    lower(btrim(p_idempotency_key)),
    p_fingerprint,
    COALESCE(p_result, '{}'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.safe_empresa_config_464(p_row jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT COALESCE(p_row, '{}'::jsonb) - ARRAY[
    'certificado_pfx', 'certificado_password', 'pfx_encrypted',
    'pfx_password_encrypted', 'sunat_password', 'sunat_gre_client_secret',
    'ose_password', 'ose_api_key', 'ose_bearer_token',
    'dian_password', 'dian_software_pin'
  ]::text[]
$function$;

CREATE OR REPLACE FUNCTION app.audit_configuration_464(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_table_name text,
  p_operation text,
  p_record_id text,
  p_old jsonb,
  p_new jsonb,
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  INSERT INTO public.audit_log (
    tenant_id, user_id, table_name, operation, record_id,
    old_values, new_values, changed_fields, metadata
  ) VALUES (
    p_tenant_id, p_actor_id, p_table_name, upper(p_operation), p_record_id,
    p_old, p_new, NULL,
    jsonb_build_object('accion', p_action, 'source', 'configuration_464')
      || COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$function$;

-- El payload ya llega normalizado a nombres de columna y con secretos cifrados
-- por el backend. Solo se aceptan columnas de configuracion; identificadores,
-- estado demo y timestamps se administran en RPCs dedicados.
CREATE OR REPLACE FUNCTION app.apply_empresa_config_patch_464(
  p_tenant_id uuid,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_allowed constant text[] := ARRAY[
    'ruc','razon_social','nombre_comercial','email','telefono','direccion_fiscal',
    'sitio_web','representante_legal','dni_representante','actividad_economica',
    'direccion','departamento','provincia','distrito','ubigeo','pais','pais_id',
    'moneda_defecto','estado','plan','configuracion_completa','logo_url',
    'certificado_pfx','certificado_password','certificado_expira_en',
    'igv_porcentaje','aplicar_retencion','retencion_tasa','aplicar_percepcion',
    'percepcion_tasa','aplicar_detraccion','detraccion_tasa','detraccion_codigo',
    'serie_factura','serie_boleta','serie_nota_credito','serie_guia_remision',
    'gre_obligatorio','gre_automatico_habilitado','umbral_gre_automatico',
    'usar_flujo_logistica','tipo_empresa','regimen_tributario',
    'retencion_renta_porcentaje','emision_cpe_modo','sunat_environment',
    'sunat_username','sunat_password','sunat_cpe_url','sunat_summary_url',
    'sunat_query_url','sunat_gre_url','sunat_gre_transport',
    'sunat_gre_rest_base_url','sunat_gre_auth_url','sunat_gre_client_id',
    'sunat_gre_client_secret','sire_activo','sunat_cert_expected_ruc',
    'sunat_cert_ruc_mismatch_confirmed','sunat_cert_ruc_mismatch_reason',
    'ose_url','ose_status_url','ose_username','ose_password','ose_auth_tipo',
    'ose_api_key','ose_api_header','ose_bearer_token','ose_activo',
    'arca_activo','arca_environment','arca_wsaa_url','arca_wsfe_url',
    'arca_cuit_representada','arca_punto_venta','arca_condicion_iva',
    'ingresos_brutos','fecha_inicio_actividades','provincia_fiscal',
    'dian_activo','dian_url','dian_usuario','dian_password','dian_software_id',
    'dian_software_pin','dian_test_set_id','dian_environment',
    'dian_regimen_fiscal','dian_tipo_contribuyente','dian_resolucion_numero',
    'dian_resolucion_prefijo','dian_resolucion_desde','dian_resolucion_hasta',
    'dian_resolucion_fecha_inicio','dian_resolucion_fecha_fin',
    'redondeo_decimales','incluir_igv_en_precio','envio_automatico_sunat',
    'generar_pdf_automatico','enviar_email_cliente','validar_ruc_sunat',
    'usar_codigos_barra','formato_numeros','ultima_validacion',
    'errores_configuracion'
  ];
  v_old public.empresa_config;
  v_country text;
  v_country_id bigint;
  v_currency text;
  v_key text;
  v_type text;
  v_assignments text := '';
  v_expr text;
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL OR jsonb_typeof(COALESCE(p_patch, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'CONFIGURATION_PATCH_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFIGURATION_TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(COALESCE(p_patch, '{}'::jsonb))
  LOOP
    IF NOT (v_key = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'CONFIGURATION_PATCH_FIELD_NOT_ALLOWED:%', v_key USING ERRCODE = '42501';
    END IF;
  END LOOP;

  v_country := upper(COALESCE(NULLIF(btrim(p_patch->>'pais'), ''), v_old.pais, 'PE'));
  v_country_id := COALESCE(
    CASE WHEN p_patch ? 'pais_id' AND p_patch->'pais_id' <> 'null'::jsonb
      THEN (p_patch->>'pais_id')::bigint END,
    v_old.pais_id::text::bigint
  );

  SELECT p.moneda_codigo INTO v_currency
  FROM public.paises p
  WHERE p.id = v_country_id AND upper(p.codigo_iso) = v_country
    AND p.activo AND upper(p.codigo_iso) IN ('PE','AR','CO');
  IF v_currency IS NULL THEN
    RAISE EXCEPTION 'CONFIGURATION_COUNTRY_MISMATCH_OR_UNSUPPORTED' USING ERRCODE = '23514';
  END IF;
  IF p_patch ? 'moneda_defecto'
     AND upper(COALESCE(p_patch->>'moneda_defecto', '')) <> upper(v_currency) THEN
    RAISE EXCEPTION 'CONFIGURATION_COUNTRY_CURRENCY_MISMATCH' USING ERRCODE = '23514';
  END IF;
  p_patch := p_patch || jsonb_build_object(
    'pais', v_country,
    'pais_id', v_country_id,
    'moneda_defecto', upper(v_currency)
  );

  IF COALESCE(v_old.is_demo, false) AND (
    lower(COALESCE(p_patch->>'sunat_environment', v_old.sunat_environment, '')) = 'produccion'
    OR lower(COALESCE(p_patch->>'arca_environment', v_old.arca_environment, '')) = 'produccion'
    OR upper(COALESCE(p_patch->>'dian_environment', v_old.dian_environment, '')) = 'PRODUCCION'
  ) THEN
    RAISE EXCEPTION 'CONFIGURATION_DEMO_PRODUCTION_FISCAL_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Al cambiar de jurisdiccion se apagan adaptadores ajenos; las credenciales
  -- no se reinterpretan como validas para otro pais.
  IF v_country = 'PE' THEN
    p_patch := p_patch || jsonb_build_object('arca_activo', false, 'dian_activo', false);
  ELSIF v_country = 'AR' THEN
    p_patch := p_patch || jsonb_build_object(
      'sire_activo', false, 'ose_activo', false, 'dian_activo', false,
      'emision_cpe_modo', 'ARCA_WSFE'
    );
  ELSE
    p_patch := p_patch || jsonb_build_object(
      'sire_activo', false, 'ose_activo', false, 'arca_activo', false,
      'emision_cpe_modo', 'DIAN_DIRECTO'
    );
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch) ORDER BY 1
  LOOP
    SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
      INTO v_type
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.empresa_config'::regclass
      AND a.attname = v_key
      AND a.attnum > 0
      AND NOT a.attisdropped;
    IF v_type IS NULL THEN
      RAISE EXCEPTION 'CONFIGURATION_SCHEMA_FIELD_MISSING:%', v_key USING ERRCODE = '42703';
    END IF;

    IF v_type IN ('json', 'jsonb') THEN
      v_expr := format('%I = CASE WHEN $1->%L = ''null''::jsonb THEN NULL ELSE ($1->%L)::%s END',
        v_key, v_key, v_key, v_type);
    ELSE
      v_expr := format('%I = CASE WHEN $1->%L = ''null''::jsonb THEN NULL ELSE ($1->>%L)::%s END',
        v_key, v_key, v_key, v_type);
    END IF;
    v_assignments := v_assignments || CASE WHEN v_assignments = '' THEN '' ELSE ', ' END || v_expr;
  END LOOP;

  EXECUTE format(
    'UPDATE public.empresa_config SET %s, updated_at = now() WHERE tenant_id = $2 RETURNING to_jsonb(empresa_config.*)',
    v_assignments
  ) INTO v_result USING p_patch, p_tenant_id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_empresa_config_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_operation text,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_operation text := upper(btrim(COALESCE(p_operation, 'EMPRESA')));
  v_fingerprint text;
  v_replay jsonb;
  v_old jsonb;
  v_new jsonb;
  v_safe_old jsonb;
  v_safe_new jsonb;
  v_result jsonb;
BEGIN
  IF v_operation NOT IN ('EMPRESA','PARAMETROS','GRE','TENANT_UPDATE') THEN
    RAISE EXCEPTION 'CONFIGURATION_OPERATION_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_configuration_actor_464(
    p_tenant_id, p_actor_id, v_operation = 'TENANT_UPDATE'
  );
  v_fingerprint := app.configuration_fingerprint_464(jsonb_build_object(
    'tenant_id', p_tenant_id, 'operation', v_operation, 'patch', COALESCE(p_patch, '{}'::jsonb)
  ));
  v_replay := app.configuration_intent_replay_464(
    'TENANT', p_tenant_id::text, v_operation, p_idempotency_key, v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('configuration:tenant:' || p_tenant_id::text, 464));
  SELECT to_jsonb(ec.*) INTO v_old
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
  FOR UPDATE;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'CONFIGURATION_TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_new := app.apply_empresa_config_patch_464(p_tenant_id, COALESCE(p_patch, '{}'::jsonb));
  v_safe_old := app.safe_empresa_config_464(v_old);
  v_safe_new := app.safe_empresa_config_464(v_new);

  UPDATE public.tenants t
  SET nombre = COALESCE(v_new->>'razon_social', t.nombre),
      ruc = COALESCE(v_new->>'ruc', t.ruc),
      pais = COALESCE(v_new->>'pais', t.pais),
      estado = upper(COALESCE(v_new->>'estado', t.estado)),
      activo = upper(COALESCE(v_new->>'estado', t.estado)) = 'ACTIVO',
      updated_at = now()
  WHERE t.id = p_tenant_id;

  PERFORM app.audit_configuration_464(
    p_tenant_id, p_actor_id, 'empresa_config', 'UPDATE', p_tenant_id::text,
    v_safe_old, v_safe_new, 'ACTUALIZAR_' || v_operation,
    jsonb_build_object('idempotency_key', lower(btrim(p_idempotency_key)), 'fingerprint', v_fingerprint)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, idempotency_key
  ) VALUES (
    p_tenant_id, 'empresa_config', p_tenant_id::text,
    'configuracion.empresa.actualizada',
    jsonb_build_object('tenant_id', p_tenant_id, 'operation', v_operation, 'actor_id', p_actor_id),
    'pending', 'config-464:' || lower(btrim(p_idempotency_key))
  );

  v_result := jsonb_build_object('configuracion', v_safe_new, 'idempotent', false);
  PERFORM app.configuration_intent_finish_464(
    p_tenant_id, 'TENANT', p_tenant_id::text, v_operation,
    p_idempotency_key, v_fingerprint, v_result
  );
  RETURN v_result;
END;
$function$;

-- La tabla de progreso no es una bóveda: elimina secretos que versiones
-- anteriores pudieron guardar junto con el estado visual del asistente.
UPDATE public.wizard_progress
SET configuracion_temporal = COALESCE(configuracion_temporal, '{}'::jsonb) - ARRAY[
  'certificateBase64','certificatePassword','certificateFile',
  'certificado_pfx','certificado_password','logoBase64','logoFile',
  'sunat_password','sunat_gre_client_secret','ose_password','ose_api_key',
  'ose_bearer_token','dian_password','dian_software_pin'
]::text[]
WHERE COALESCE(configuracion_temporal, '{}'::jsonb) ?| ARRAY[
  'certificateBase64','certificatePassword','certificateFile',
  'certificado_pfx','certificado_password','logoBase64','logoFile',
  'sunat_password','sunat_gre_client_secret','ose_password','ose_api_key',
  'ose_bearer_token','dian_password','dian_software_pin'
];

CREATE OR REPLACE FUNCTION public.guardar_paso_wizard_config_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_paso_actual integer,
  p_configuracion_temporal jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_old jsonb;
  v_configuration jsonb;
  v_row public.wizard_progress;
  v_result jsonb;
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, false);
  IF p_paso_actual NOT BETWEEN 1 AND 7
     OR jsonb_typeof(COALESCE(p_configuracion_temporal, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'CONFIGURATION_WIZARD_STEP_INVALID' USING ERRCODE = '22023';
  END IF;
  v_configuration := COALESCE(p_configuracion_temporal, '{}'::jsonb) - ARRAY[
    'certificateBase64','certificatePassword','certificateFile',
    'certificado_pfx','certificado_password','logoBase64','logoFile',
    'sunat_password','sunat_gre_client_secret','ose_password','ose_api_key',
    'ose_bearer_token','dian_password','dian_software_pin'
  ]::text[];
  v_fingerprint := app.configuration_fingerprint_464(jsonb_build_object(
    'step', p_paso_actual, 'configuration', v_configuration
  ));
  v_replay := app.configuration_intent_replay_464(
    'TENANT', p_tenant_id::text, 'WIZARD_STEP', p_idempotency_key, v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('configuration:wizard:' || p_tenant_id::text, 464));
  SELECT to_jsonb(wp.*) INTO v_old
  FROM public.wizard_progress wp
  WHERE wp.tenant_id = p_tenant_id
  FOR UPDATE;
  INSERT INTO public.wizard_progress (
    tenant_id, paso_actual, pasos_completados, configuracion_temporal,
    completado, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_paso_actual, ARRAY[p_paso_actual],
    v_configuration, false, now(), now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET paso_actual = EXCLUDED.paso_actual,
      pasos_completados = ARRAY(
        SELECT DISTINCT x FROM unnest(
          COALESCE(public.wizard_progress.pasos_completados, '{}'::integer[]) || ARRAY[p_paso_actual]
        ) x ORDER BY x
      ),
      configuracion_temporal = COALESCE(public.wizard_progress.configuracion_temporal, '{}'::jsonb)
        || COALESCE(EXCLUDED.configuracion_temporal, '{}'::jsonb),
      updated_at = now()
  RETURNING * INTO v_row;

  v_result := jsonb_build_object('progress', to_jsonb(v_row), 'idempotent', false);
  PERFORM app.audit_configuration_464(
    p_tenant_id, p_actor_id, 'wizard_progress',
    CASE WHEN v_old IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    v_row.id::text, v_old, to_jsonb(v_row), 'GUARDAR_PASO_WIZARD',
    jsonb_build_object('idempotency_key', lower(btrim(p_idempotency_key)), 'fingerprint', v_fingerprint)
  );
  PERFORM app.configuration_intent_finish_464(
    p_tenant_id, 'TENANT', p_tenant_id::text, 'WIZARD_STEP',
    p_idempotency_key, v_fingerprint, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.completar_wizard_config_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_fingerprint text;
  v_patch jsonb;
  v_replay jsonb;
  v_old jsonb;
  v_new jsonb;
  v_wizard public.wizard_progress;
  v_result jsonb;
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, false);
  IF jsonb_typeof(COALESCE(p_patch, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'CONFIGURATION_WIZARD_PATCH_INVALID' USING ERRCODE = '22023';
  END IF;
  v_patch := COALESCE(p_patch, '{}'::jsonb) - '_intent_fingerprint';
  IF p_patch ? '_intent_fingerprint' THEN
    IF COALESCE(p_patch->>'_intent_fingerprint', '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'CONFIGURATION_WIZARD_FINGERPRINT_INVALID' USING ERRCODE = '22023';
    END IF;
    v_fingerprint := p_patch->>'_intent_fingerprint';
  ELSE
    v_fingerprint := app.configuration_fingerprint_464(v_patch);
  END IF;
  v_replay := app.configuration_intent_replay_464(
    'TENANT', p_tenant_id::text, 'WIZARD_COMPLETE', p_idempotency_key, v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('configuration:wizard:' || p_tenant_id::text, 464));
  SELECT app.safe_empresa_config_464(to_jsonb(ec.*)) INTO v_old
  FROM public.empresa_config ec WHERE ec.tenant_id = p_tenant_id FOR UPDATE;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'CONFIGURATION_TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_new := app.apply_empresa_config_patch_464(
    p_tenant_id,
    v_patch || jsonb_build_object(
      'configuracion_completa', true,
      'ultima_validacion', now()
    )
  );
  INSERT INTO public.wizard_progress (
    tenant_id, paso_actual, pasos_completados, configuracion_temporal,
    completado, completado_at, created_at, updated_at
  ) VALUES (
    p_tenant_id, 7, ARRAY[1,2,3,4,5,6,7], '{}'::jsonb,
    true, now(), now(), now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET paso_actual = 7,
      pasos_completados = ARRAY[1,2,3,4,5,6,7],
      configuracion_temporal = '{}'::jsonb,
      completado = true,
      completado_at = COALESCE(public.wizard_progress.completado_at, now()),
      updated_at = now()
  RETURNING * INTO v_wizard;

  UPDATE public.tenants t
  SET nombre = COALESCE(v_new->>'razon_social', t.nombre),
      ruc = COALESCE(v_new->>'ruc', t.ruc),
      pais = COALESCE(v_new->>'pais', t.pais),
      updated_at = now()
  WHERE t.id = p_tenant_id;

  PERFORM app.audit_configuration_464(
    p_tenant_id, p_actor_id, 'empresa_config', 'UPDATE', p_tenant_id::text,
    v_old, app.safe_empresa_config_464(v_new), 'COMPLETAR_WIZARD',
    jsonb_build_object('idempotency_key', lower(btrim(p_idempotency_key)), 'fingerprint', v_fingerprint)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, status, idempotency_key
  ) VALUES (
    p_tenant_id, 'empresa_config', p_tenant_id::text, 'configuracion.wizard.completado',
    jsonb_build_object('tenant_id', p_tenant_id, 'actor_id', p_actor_id),
    'pending', 'wizard-complete-464:' || lower(btrim(p_idempotency_key))
  );

  v_result := jsonb_build_object(
    'configuracion', app.safe_empresa_config_464(v_new),
    'progress', to_jsonb(v_wizard),
    'idempotent', false
  );
  PERFORM app.configuration_intent_finish_464(
    p_tenant_id, 'TENANT', p_tenant_id::text, 'WIZARD_COMPLETE',
    p_idempotency_key, v_fingerprint, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resetear_wizard_config_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_old jsonb;
  v_new jsonb;
  v_wizard public.wizard_progress;
  v_result jsonb;
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, false);
  v_fingerprint := app.configuration_fingerprint_464(jsonb_build_object('tenant_id', p_tenant_id, 'reset', true));
  v_replay := app.configuration_intent_replay_464(
    'TENANT', p_tenant_id::text, 'WIZARD_RESET', p_idempotency_key, v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('configuration:wizard:' || p_tenant_id::text, 464));
  SELECT app.safe_empresa_config_464(to_jsonb(ec.*)) INTO v_old
  FROM public.empresa_config ec WHERE ec.tenant_id = p_tenant_id FOR UPDATE;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'CONFIGURATION_TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  v_new := app.apply_empresa_config_patch_464(
    p_tenant_id,
    jsonb_build_object(
      'configuracion_completa', false,
      'certificado_pfx', NULL,
      'certificado_password', NULL,
      'certificado_expira_en', NULL,
      'ultima_validacion', NULL,
      'errores_configuracion', jsonb_build_object('reason', 'wizard_reset', 'at', now())
    )
  );
  INSERT INTO public.wizard_progress (
    tenant_id, paso_actual, pasos_completados, configuracion_temporal,
    completado, completado_at, created_at, updated_at
  ) VALUES (
    p_tenant_id, 1, '{}'::integer[], '{}'::jsonb, false, NULL, now(), now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET paso_actual = 1,
      pasos_completados = '{}'::integer[],
      configuracion_temporal = '{}'::jsonb,
      completado = false,
      completado_at = NULL,
      updated_at = now()
  RETURNING * INTO v_wizard;

  PERFORM app.audit_configuration_464(
    p_tenant_id, p_actor_id, 'empresa_config', 'UPDATE', p_tenant_id::text,
    v_old, app.safe_empresa_config_464(v_new), 'RESETEAR_WIZARD',
    jsonb_build_object('idempotency_key', lower(btrim(p_idempotency_key)), 'fingerprint', v_fingerprint)
  );
  v_result := jsonb_build_object(
    'configuracion', app.safe_empresa_config_464(v_new),
    'progress', to_jsonb(v_wizard),
    'idempotent', false
  );
  PERFORM app.configuration_intent_finish_464(
    p_tenant_id, 'TENANT', p_tenant_id::text, 'WIZARD_RESET',
    p_idempotency_key, v_fingerprint, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_serie_documento_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_tipo_documento text,
  p_serie text,
  p_correlativo_maximo integer,
  p_activo boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_tipo text := upper(btrim(COALESCE(p_tipo_documento, '')));
  v_serie text := upper(btrim(COALESCE(p_serie, '')));
  v_max integer := COALESCE(p_correlativo_maximo, 99999999);
  v_fingerprint text;
  v_replay jsonb;
  v_old public.documento_series;
  v_new public.documento_series;
  v_result jsonb;
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, false);
  IF v_tipo = '' OR v_serie !~ '^[A-Z0-9]{1,10}$' OR v_max NOT BETWEEN 1 AND 99999999 THEN
    RAISE EXCEPTION 'CONFIGURATION_SERIES_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  v_fingerprint := app.configuration_fingerprint_464(jsonb_build_object(
    'type', v_tipo, 'series', v_serie, 'maximum', v_max, 'active', COALESCE(p_activo, true)
  ));
  v_replay := app.configuration_intent_replay_464(
    'TENANT', p_tenant_id::text, 'DOCUMENT_SERIES_UPDATE', p_idempotency_key, v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':document-series-scope:' || v_tipo || ':' || v_serie, 464
  ));
  SELECT * INTO v_old
  FROM public.documento_series ds
  WHERE ds.tenant_id = p_tenant_id
    AND upper(ds.tipo_documento) = v_tipo
    AND upper(ds.serie) = v_serie
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.documento_series (
      tenant_id, tipo_documento, serie, correlativo_actual, correlativo_maximo,
      longitud_correlativo, activo, estado, idempotency_key, intent_fingerprint,
      metadata, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_tipo, v_serie, 0, v_max, 8,
      COALESCE(p_activo, true),
      CASE WHEN COALESCE(p_activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END,
      'config-464:' || left(lower(btrim(p_idempotency_key)), 220),
      v_fingerprint,
      jsonb_build_object(
        'created_by', p_actor_id,
        'source', 'configuration.series.atomic',
        'atomic_rpc', 'actualizar_serie_documento_tx',
        'schema_version', 464
      ),
      now(), now()
    ) RETURNING * INTO v_new;
    PERFORM app.audit_configuration_464(
      p_tenant_id, p_actor_id, 'documento_series', 'INSERT', v_new.id::text,
      NULL, to_jsonb(v_new), 'CREAR_SERIE_DOCUMENTO_CONFIGURACION',
      jsonb_build_object('idempotency_key', lower(btrim(p_idempotency_key)), 'fingerprint', v_fingerprint)
    );
    v_result := jsonb_build_object('serie', to_jsonb(v_new), 'idempotent', false);
    PERFORM app.configuration_intent_finish_464(
      p_tenant_id, 'TENANT', p_tenant_id::text, 'DOCUMENT_SERIES_UPDATE',
      p_idempotency_key, v_fingerprint, v_result
    );
    RETURN v_result;
  END IF;
  IF v_max < COALESCE(v_old.correlativo_actual, 0) THEN
    RAISE EXCEPTION 'CONFIGURATION_SERIES_MAX_BELOW_CURRENT' USING ERRCODE = '23514';
  END IF;

  UPDATE public.documento_series
  SET correlativo_maximo = v_max,
      activo = COALESCE(p_activo, true),
      estado = CASE WHEN COALESCE(p_activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END,
      updated_at = now(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'updated_by', p_actor_id,
        'atomic_rpc', 'actualizar_serie_documento_tx',
        'schema_version', 464
      )
  WHERE id = v_old.id
  RETURNING * INTO v_new;

  PERFORM app.audit_configuration_464(
    p_tenant_id, p_actor_id, 'documento_series', 'UPDATE', v_new.id::text,
    to_jsonb(v_old), to_jsonb(v_new), 'ACTUALIZAR_SERIE_DOCUMENTO',
    jsonb_build_object('idempotency_key', lower(btrim(p_idempotency_key)), 'fingerprint', v_fingerprint)
  );
  v_result := jsonb_build_object('serie', to_jsonb(v_new), 'idempotent', false);
  PERFORM app.configuration_intent_finish_464(
    p_tenant_id, 'TENANT', p_tenant_id::text, 'DOCUMENT_SERIES_UPDATE',
    p_idempotency_key, v_fingerprint, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_preferencia_pais_tx(
  p_usuario_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_preferencia jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_user public.usuarios_sistema;
  v_actor public.usuarios_sistema;
  v_country_id bigint;
  v_language text := lower(COALESCE(NULLIF(btrim(p_preferencia->>'idioma'), ''), 'es'));
  v_timezone text := COALESCE(NULLIF(btrim(p_preferencia->>'zona_horaria'), ''), 'America/Lima');
  v_fingerprint text;
  v_replay jsonb;
  v_old jsonb;
  v_new jsonb;
  v_result jsonb;
BEGIN
  IF p_usuario_id IS NULL OR p_actor_id IS NULL
     OR jsonb_typeof(COALESCE(p_preferencia, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'COUNTRY_PREFERENCE_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_user FROM public.usuarios_sistema u WHERE u.id = p_usuario_id FOR UPDATE;
  SELECT * INTO v_actor FROM public.usuarios_sistema u WHERE u.id = p_actor_id;
  IF NOT FOUND OR v_user.id IS NULL OR v_actor.id IS NULL
     OR NOT COALESCE(v_actor.activo, false)
     OR lower(COALESCE(v_actor.estado::text, '')) <> 'activo'
     OR (v_actor.id <> v_user.id AND NOT COALESCE(v_actor.is_super_admin, false)) THEN
    RAISE EXCEPTION 'COUNTRY_PREFERENCE_ACTOR_INVALID' USING ERRCODE = '42501';
  END IF;

  v_country_id := COALESCE((p_preferencia->>'pais_preferido_id')::bigint, 1);
  IF NOT EXISTS (
    SELECT 1 FROM public.paises p
    WHERE p.id = v_country_id AND p.activo AND upper(p.codigo_iso) IN ('PE','AR','CO')
  ) OR v_language !~ '^[a-z]{2}(-[a-z]{2})?$'
     OR v_timezone !~ '^[A-Za-z_]+(/[A-Za-z0-9_+\-]+)+$' THEN
    RAISE EXCEPTION 'COUNTRY_PREFERENCE_VALUE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(COALESCE(p_preferencia, '{}'::jsonb)) key
    WHERE key NOT IN ('pais_preferido_id','idioma','zona_horaria')
  ) THEN
    RAISE EXCEPTION 'COUNTRY_PREFERENCE_FIELD_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  v_fingerprint := app.configuration_fingerprint_464(jsonb_build_object(
    'user_id', p_usuario_id, 'country_id', v_country_id,
    'language', v_language, 'timezone', v_timezone
  ));
  v_replay := app.configuration_intent_replay_464(
    'USER', p_usuario_id::text, 'COUNTRY_PREFERENCE', p_idempotency_key, v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('configuration:user-country:' || p_usuario_id::text, 464));
  SELECT to_jsonb(uc.*) INTO v_old
  FROM public.usuario_configuracion uc
  WHERE uc.usuario_id = p_usuario_id
  FOR UPDATE;

  INSERT INTO public.usuario_configuracion (
    tenant_id, usuario_id, pais_preferido_id, idioma, zona_horaria,
    estado, metadata, created_at, updated_at
  ) VALUES (
    v_user.tenant_id, p_usuario_id, v_country_id, v_language, v_timezone,
    'ACTIVO',
    jsonb_build_object('updated_by', p_actor_id, 'atomic_rpc', 'actualizar_preferencia_pais_tx'),
    now(), now()
  )
  ON CONFLICT (usuario_id) DO UPDATE
  SET tenant_id = EXCLUDED.tenant_id,
      pais_preferido_id = EXCLUDED.pais_preferido_id,
      idioma = EXCLUDED.idioma,
      zona_horaria = EXCLUDED.zona_horaria,
      estado = 'ACTIVO',
      metadata = COALESCE(public.usuario_configuracion.metadata, '{}'::jsonb)
        || EXCLUDED.metadata,
      updated_at = now()
  RETURNING to_jsonb(usuario_configuracion.*) INTO v_new;

  PERFORM app.audit_configuration_464(
    v_user.tenant_id, p_actor_id, 'usuario_configuracion',
    CASE WHEN v_old IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    p_usuario_id::text, v_old, v_new, 'ACTUALIZAR_PREFERENCIA_PAIS',
    jsonb_build_object('idempotency_key', lower(btrim(p_idempotency_key)), 'fingerprint', v_fingerprint)
  );
  v_result := jsonb_build_object('configuracion', v_new, 'idempotent', false);
  PERFORM app.configuration_intent_finish_464(
    v_user.tenant_id, 'USER', p_usuario_id::text, 'COUNTRY_PREFERENCE',
    p_idempotency_key, v_fingerprint, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crear_tenant_empresa_admin_tx(
  p_actor_id uuid,
  p_idempotency_key text,
  p_tenant_id uuid,
  p_empresa jsonb,
  p_admin jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_country text := upper(NULLIF(btrim(COALESCE(p_empresa->>'pais', '')), ''));
  v_country_id bigint := (p_empresa->>'pais_id')::bigint;
  v_currency text;
  v_name text := NULLIF(btrim(COALESCE(p_empresa->>'razon_social', '')), '');
  v_tax_id text := NULLIF(btrim(COALESCE(p_empresa->>'ruc', '')), '');
  v_email text := lower(NULLIF(btrim(COALESCE(p_admin->>'email', '')), ''));
  v_fingerprint text;
  v_replay jsonb;
  v_role_id uuid;
  v_admin jsonb;
  v_empresa public.empresa_config;
  v_result jsonb;
BEGIN
  PERFORM app.assert_configuration_actor_464(NULL, p_actor_id, true);
  IF p_tenant_id IS NULL OR v_country NOT IN ('PE','AR','CO')
     OR v_country_id IS NULL OR v_name IS NULL OR v_tax_id IS NULL OR v_email IS NULL
     OR NULLIF(btrim(COALESCE(p_admin->>'password_hash', '')), '') IS NULL THEN
    RAISE EXCEPTION 'TENANT_CREATE_REQUIRED_FIELDS' USING ERRCODE = '22023';
  END IF;
  SELECT p.moneda_codigo INTO v_currency
  FROM public.paises p
  WHERE p.id = v_country_id AND upper(p.codigo_iso) = v_country AND p.activo;
  IF v_currency IS NULL THEN
    RAISE EXCEPTION 'TENANT_CREATE_COUNTRY_MISMATCH' USING ERRCODE = '23514';
  END IF;

  v_fingerprint := app.configuration_fingerprint_464(jsonb_build_object(
    'company', COALESCE(p_empresa, '{}'::jsonb) - ARRAY['password_hash']::text[],
    'admin', COALESCE(p_admin, '{}'::jsonb) - ARRAY['password_hash']::text[]
  ));
  v_replay := app.configuration_intent_replay_464(
    'PLATFORM', 'tenant-create', 'TENANT_CREATE', p_idempotency_key, v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('tenant:create:id:' || p_tenant_id::text, 464));
  PERFORM pg_advisory_xact_lock(hashtextextended('tenant:create:tax:' || v_country || ':' || v_tax_id, 464));
  PERFORM pg_advisory_xact_lock(hashtextextended('tenant:create:email:' || v_email, 464));
  IF EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id)
     OR EXISTS (
       SELECT 1 FROM public.empresa_config ec
       WHERE upper(COALESCE(ec.pais, '')) = v_country AND btrim(COALESCE(ec.ruc, '')) = v_tax_id
         AND NOT COALESCE(ec.is_demo, false)
     )
     OR EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE lower(btrim(u.email)) = v_email) THEN
    RAISE EXCEPTION 'TENANT_CREATE_ID_TAX_OR_EMAIL_CONFLICT' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.tenants (
    id, codigo, nombre, ruc, pais, plan, estado, activo, created_at, updated_at
  ) VALUES (
    p_tenant_id,
    COALESCE(NULLIF(btrim(p_empresa->>'codigo'), ''), 'TEN-' || upper(left(p_tenant_id::text, 8))),
    v_name, v_tax_id, v_country,
    upper(COALESCE(NULLIF(btrim(p_empresa->>'plan'), ''), 'BASICO')),
    'ACTIVO', true, now(), now()
  );

  INSERT INTO public.empresa_config (
    tenant_id, razon_social, nombre_comercial, ruc, direccion_fiscal,
    telefono, email, pais, pais_id, moneda_defecto, estado, plan,
    tipo_empresa, usar_flujo_logistica, gre_obligatorio,
    gre_automatico_habilitado, umbral_gre_automatico,
    configuracion_completa, is_demo, fecha_inicio, created_at, updated_at
  ) VALUES (
    p_tenant_id, v_name,
    COALESCE(NULLIF(btrim(p_empresa->>'nombre_comercial'), ''), v_name),
    v_tax_id, NULLIF(btrim(p_empresa->>'direccion_fiscal'), ''),
    NULLIF(btrim(p_empresa->>'telefono'), ''), NULLIF(lower(btrim(p_empresa->>'email')), ''),
    v_country, v_country_id, upper(v_currency), 'ACTIVO',
    upper(COALESCE(NULLIF(btrim(p_empresa->>'plan'), ''), 'BASICO')),
    upper(COALESCE(NULLIF(btrim(p_empresa->>'tipo_empresa'), ''), 'MICRO')),
    COALESCE((p_empresa->>'usar_flujo_logistica')::boolean, false),
    COALESCE((p_empresa->>'gre_obligatorio')::boolean, false),
    COALESCE((p_empresa->>'gre_automatico_habilitado')::boolean, false),
    COALESCE((p_empresa->>'umbral_gre_automatico')::numeric, 700),
    false, false, current_date, now(), now()
  ) RETURNING * INTO v_empresa;

  PERFORM app.seed_operational_rbac_for_tenant(p_tenant_id, NULL);
  SELECT r.id INTO v_role_id
  FROM public.roles r
  WHERE r.tenant_id = p_tenant_id
    AND upper(btrim(r.nombre)) IN ('ADMIN','ADMINISTRADOR')
    AND COALESCE(r.activo, true)
  ORDER BY CASE WHEN upper(btrim(r.nombre)) = 'ADMIN' THEN 0 ELSE 1 END, r.id
  LIMIT 1;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_CREATE_ADMIN_ROLE_MISSING' USING ERRCODE = '23503';
  END IF;

  v_admin := public.crear_primer_admin_tenant_tx(
    p_tenant_id,
    left(lower(btrim(p_idempotency_key)), 240) || ':admin',
    jsonb_build_object(
      'email', v_email,
      'nombre', COALESCE(NULLIF(btrim(p_admin->>'nombre'), ''), 'Administrador'),
      'apellido', NULLIF(btrim(p_admin->>'apellido'), ''),
      'password_hash', p_admin->>'password_hash'
    ),
    v_role_id
  );

  PERFORM app.audit_configuration_464(
    p_tenant_id, p_actor_id, 'tenants', 'INSERT', p_tenant_id::text,
    NULL, to_jsonb(v_empresa) - ARRAY['certificado_pfx','certificado_password']::text[],
    'CREAR_TENANT_EMPRESA_ADMIN',
    jsonb_build_object('idempotency_key', lower(btrim(p_idempotency_key)), 'fingerprint', v_fingerprint)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, status, idempotency_key
  ) VALUES (
    p_tenant_id, 'tenant', p_tenant_id::text, 'tenant.creado',
    jsonb_build_object('tenant_id', p_tenant_id, 'pais', v_country, 'actor_id', p_actor_id),
    'pending', 'tenant-create-464:' || lower(btrim(p_idempotency_key))
  );

  v_result := jsonb_build_object(
    'tenant', app.safe_empresa_config_464(to_jsonb(v_empresa)),
    'adminUser', v_admin,
    'idempotent', false
  );
  PERFORM app.configuration_intent_finish_464(
    p_tenant_id, 'PLATFORM', 'tenant-create', 'TENANT_CREATE',
    p_idempotency_key, v_fingerprint, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cambiar_estado_tenant_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_estado text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_state text := upper(btrim(COALESCE(p_estado, '')));
  v_fingerprint text;
  v_replay jsonb;
  v_old jsonb;
  v_new jsonb;
  v_revoked integer := 0;
  v_active_admins integer := 0;
  v_result jsonb;
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, true);
  IF v_state NOT IN ('ACTIVO','INACTIVO') THEN
    RAISE EXCEPTION 'TENANT_STATE_INVALID' USING ERRCODE = '22023';
  END IF;
  v_fingerprint := app.configuration_fingerprint_464(jsonb_build_object('tenant_id', p_tenant_id, 'state', v_state));
  v_replay := app.configuration_intent_replay_464(
    'TENANT', p_tenant_id::text, 'TENANT_STATE', p_idempotency_key, v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('tenant:state:' || p_tenant_id::text, 464));
  SELECT to_jsonb(ec.*) INTO v_old FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id FOR UPDATE;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'TENANT_STATE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_state = 'INACTIVO' THEN
    SELECT count(DISTINCT u.id)::integer INTO v_active_admins
    FROM public.usuarios_sistema u
    JOIN public.user_roles ur
      ON ur.tenant_id = p_tenant_id AND ur.usuario_sistema_id = u.id
    JOIN public.roles r
      ON r.tenant_id = p_tenant_id AND r.id = ur.role_id
    WHERE u.tenant_id = p_tenant_id
      AND upper(COALESCE(u.estado::text, '')) = 'ACTIVO'
      AND COALESCE(u.activo, true)
      AND upper(btrim(r.nombre)) IN ('ADMIN','ADMINISTRADOR')
      AND COALESCE(r.activo, true);
    IF v_active_admins = 0 THEN
      RAISE EXCEPTION 'TENANT_STATE_ACTIVE_ADMIN_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.empresa_config
  SET estado = v_state, updated_at = now()
  WHERE tenant_id = p_tenant_id
  RETURNING to_jsonb(empresa_config.*) INTO v_new;
  UPDATE public.tenants
  SET estado = v_state, activo = v_state = 'ACTIVO', updated_at = now()
  WHERE id = p_tenant_id;

  IF v_state = 'INACTIVO' THEN
    UPDATE public.user_sessions
    SET revoked_at = COALESCE(revoked_at, now()),
        estado = 'REVOCADA',
        revocation_reason = COALESCE(revocation_reason, 'TENANT_INACTIVO'),
        updated_at = now()
    WHERE tenant_id = p_tenant_id AND revoked_at IS NULL;
    GET DIAGNOSTICS v_revoked = ROW_COUNT;
  END IF;

  PERFORM app.audit_configuration_464(
    p_tenant_id, p_actor_id, 'tenants', 'UPDATE', p_tenant_id::text,
    app.safe_empresa_config_464(v_old), app.safe_empresa_config_464(v_new),
    'CAMBIAR_ESTADO_TENANT',
    jsonb_build_object(
      'idempotency_key', lower(btrim(p_idempotency_key)),
      'fingerprint', v_fingerprint,
      'sessions_revoked', v_revoked,
      'active_admins', v_active_admins
    )
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, status, idempotency_key
  ) VALUES (
    p_tenant_id, 'tenant', p_tenant_id::text,
    CASE WHEN v_state = 'ACTIVO' THEN 'tenant.activado' ELSE 'tenant.desactivado' END,
    jsonb_build_object(
      'tenant_id', p_tenant_id,
      'actor_id', p_actor_id,
      'sessions_revoked', v_revoked,
      'active_admins', v_active_admins
    ),
    'pending', 'tenant-state-464:' || lower(btrim(p_idempotency_key))
  );
  v_result := jsonb_build_object(
    'tenant', app.safe_empresa_config_464(v_new),
    'sessions_revoked', v_revoked,
    'active_admins', v_active_admins,
    'idempotent', false
  );
  PERFORM app.configuration_intent_finish_464(
    p_tenant_id, 'TENANT', p_tenant_id::text, 'TENANT_STATE',
    p_idempotency_key, v_fingerprint, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.configurar_demo_tenant_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_activo boolean,
  p_dias_duracion integer DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_password_hash text DEFAULT NULL,
  p_password_fingerprint text DEFAULT NULL,
  p_perfil jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_days integer := COALESCE(p_dias_duracion, 15);
  v_email text := lower(NULLIF(btrim(COALESCE(p_email, '')), ''));
  v_profile jsonb := COALESCE(p_perfil, '{}'::jsonb);
  v_fingerprint text;
  v_replay jsonb;
  v_old jsonb;
  v_new jsonb;
  v_role_id uuid;
  v_user_id uuid;
  v_user jsonb;
  v_old_user jsonb;
  v_new_user jsonb;
  v_demo_user record;
  v_expires_at timestamptz;
  v_unmarked integer := 0;
  v_result jsonb;
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, true);
  IF p_activo AND (
    v_days NOT BETWEEN 1 AND 90
    OR v_email IS NULL
    OR NULLIF(btrim(COALESCE(p_password_hash, '')), '') IS NULL
    OR NULLIF(btrim(COALESCE(p_password_fingerprint, '')), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'TENANT_DEMO_REQUIRED_FIELDS' USING ERRCODE = '22023';
  END IF;
  IF p_activo AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'TENANT_DEMO_EMAIL_INVALID' USING ERRCODE = '22023';
  END IF;

  v_fingerprint := app.configuration_fingerprint_464(jsonb_build_object(
    'tenant_id', p_tenant_id,
    'active', p_activo,
    'days', CASE WHEN p_activo THEN v_days ELSE NULL END,
    'email', CASE WHEN p_activo THEN v_email ELSE NULL END,
    'password_fingerprint', CASE WHEN p_activo THEN p_password_fingerprint ELSE NULL END,
    'profile', CASE WHEN p_activo THEN v_profile ELSE '{}'::jsonb END
  ));
  v_replay := app.configuration_intent_replay_464(
    'TENANT', p_tenant_id::text, 'TENANT_DEMO', p_idempotency_key, v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('tenant:demo:' || p_tenant_id::text, 464));
  SELECT to_jsonb(ec.*) INTO v_old
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
  FOR UPDATE;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'TENANT_DEMO_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF p_activo THEN
    v_expires_at := now() + make_interval(days => v_days);
    UPDATE public.empresa_config ec SET
      is_demo = true,
      demo_created_at = COALESCE(ec.demo_created_at, now()),
      demo_expires_at = v_expires_at,
      demo_extended = COALESCE(ec.is_demo, false),
      updated_at = now()
    WHERE ec.tenant_id = p_tenant_id
    RETURNING to_jsonb(ec.*) INTO v_new;

    SELECT r.id INTO v_role_id
    FROM public.roles r
    WHERE r.tenant_id = p_tenant_id
      AND upper(btrim(r.nombre)) IN ('ADMIN','ADMINISTRADOR')
      AND COALESCE(r.activo, true)
    ORDER BY CASE WHEN upper(btrim(r.nombre)) = 'ADMIN' THEN 0 ELSE 1 END, r.id
    LIMIT 1;
    IF v_role_id IS NULL THEN
      RAISE EXCEPTION 'TENANT_DEMO_ADMIN_ROLE_MISSING' USING ERRCODE = '23503';
    END IF;

    SELECT u.id, to_jsonb(u.*) INTO v_user_id, v_old_user
    FROM public.usuarios_sistema u
    WHERE u.tenant_id = p_tenant_id AND lower(btrim(u.email)) = v_email
    FOR UPDATE;
    IF v_user_id IS NULL THEN
      INSERT INTO public.usuarios_sistema (
        tenant_id, email, password_hash, nombre, apellido,
        estado, activo, is_super_admin, is_demo_user, demo_email_temp,
        demo_expires_at, demo_retention_until, demo_created_by,
        created_by, updated_by, creation_idempotency_key, creation_fingerprint
      ) VALUES (
        p_tenant_id, v_email, p_password_hash,
        COALESCE(NULLIF(btrim(v_profile->>'nombre'), ''), 'Demo'),
        COALESCE(NULLIF(btrim(v_profile->>'apellido'), ''), 'Usuario'),
        'ACTIVO', true, false, true, v_email,
        v_expires_at, v_expires_at + interval '30 days', p_actor_id,
        p_actor_id, p_actor_id,
        left(lower(btrim(p_idempotency_key)), 220) || ':demo-user',
        v_fingerprint
      )
      RETURNING id, to_jsonb(usuarios_sistema.*) INTO v_user_id, v_new_user;
    ELSE
      UPDATE public.usuarios_sistema u SET
        password_hash = p_password_hash,
        nombre = COALESCE(NULLIF(btrim(v_profile->>'nombre'), ''), u.nombre),
        apellido = COALESCE(NULLIF(btrim(v_profile->>'apellido'), ''), u.apellido),
        estado = 'ACTIVO', activo = true,
        is_demo_user = true, demo_email_temp = u.email,
        demo_expires_at = v_expires_at,
        demo_retention_until = v_expires_at + interval '30 days',
        demo_created_by = p_actor_id,
        updated_by = p_actor_id, updated_at = now()
      WHERE u.id = v_user_id AND u.tenant_id = p_tenant_id
      RETURNING to_jsonb(u.*) INTO v_new_user;
      UPDATE public.user_sessions s SET
        estado = 'REVOCADA',
        revoked_at = COALESCE(s.revoked_at, now()),
        revocation_reason = COALESCE(s.revocation_reason, 'DEMO_CREDENTIAL_ROTATION'),
        updated_at = now()
      WHERE s.usuario_sistema_id = v_user_id
        AND s.tenant_id = p_tenant_id
        AND s.revoked_at IS NULL;
    END IF;
    INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id, assigned_by)
    VALUES (v_user_id, v_role_id, p_tenant_id, p_actor_id)
    ON CONFLICT (usuario_sistema_id, role_id, tenant_id) DO NOTHING;
    v_user := app.safe_user_462(v_user_id);
    PERFORM app.audit_configuration_464(
      p_tenant_id, p_actor_id, 'usuarios_sistema',
      CASE WHEN v_old_user IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
      v_user_id::text,
      CASE WHEN v_old_user IS NULL THEN NULL ELSE v_old_user - ARRAY['password_hash','password_reset_token']::text[] END,
      v_new_user - ARRAY['password_hash','password_reset_token']::text[],
      CASE WHEN v_old_user IS NULL THEN 'CREAR_USUARIO_DEMO_TENANT' ELSE 'ROTAR_USUARIO_DEMO_TENANT' END,
      jsonb_build_object('idempotency_key', lower(btrim(p_idempotency_key)), 'role_id', v_role_id)
    );
  ELSE
    UPDATE public.empresa_config ec SET
      is_demo = false,
      demo_expires_at = NULL,
      demo_extended = false,
      updated_at = now()
    WHERE ec.tenant_id = p_tenant_id
    RETURNING to_jsonb(ec.*) INTO v_new;
    FOR v_demo_user IN
      SELECT u.id, to_jsonb(u.*) AS old_row
      FROM public.usuarios_sistema u
      WHERE u.tenant_id = p_tenant_id AND COALESCE(u.is_demo_user, false)
      ORDER BY u.id
      FOR UPDATE
    LOOP
      UPDATE public.usuarios_sistema u SET
        is_demo_user = false,
        demo_email_temp = NULL,
        demo_expires_at = NULL,
        demo_retention_until = NULL,
        updated_by = p_actor_id,
        updated_at = now()
      WHERE u.id = v_demo_user.id AND u.tenant_id = p_tenant_id
      RETURNING to_jsonb(u.*) INTO v_new_user;
      PERFORM app.audit_configuration_464(
        p_tenant_id, p_actor_id, 'usuarios_sistema', 'UPDATE', v_demo_user.id::text,
        v_demo_user.old_row - ARRAY['password_hash','password_reset_token']::text[],
        v_new_user - ARRAY['password_hash','password_reset_token']::text[],
        'DESMARCAR_USUARIO_DEMO_TENANT',
        jsonb_build_object('idempotency_key', lower(btrim(p_idempotency_key)))
      );
      v_unmarked := v_unmarked + 1;
    END LOOP;
  END IF;

  PERFORM app.audit_configuration_464(
    p_tenant_id, p_actor_id, 'empresa_config', 'UPDATE', p_tenant_id::text,
    app.safe_empresa_config_464(v_old), app.safe_empresa_config_464(v_new),
    CASE WHEN p_activo THEN 'ACTIVAR_DEMO_TENANT' ELSE 'DESACTIVAR_DEMO_TENANT' END,
    jsonb_build_object(
      'idempotency_key', lower(btrim(p_idempotency_key)),
      'fingerprint', v_fingerprint,
      'usuario_id', v_user_id
    )
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, status, idempotency_key
  ) VALUES (
    p_tenant_id, 'tenant', p_tenant_id::text,
    CASE WHEN p_activo THEN 'tenant.demo.activado' ELSE 'tenant.demo.desactivado' END,
    jsonb_build_object('tenant_id', p_tenant_id, 'actor_id', p_actor_id, 'usuario_id', v_user_id),
    'pending', 'tenant-demo-464:' || left(lower(btrim(p_idempotency_key)), 220)
  );
  v_result := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'is_demo', p_activo,
    'demo_expires_at', CASE WHEN p_activo THEN v_expires_at ELSE NULL END,
    'dias_duracion', CASE WHEN p_activo THEN v_days ELSE NULL END,
    'user', v_user,
    'usuarios_desmarcados', v_unmarked,
    'idempotent', false
  );
  PERFORM app.configuration_intent_finish_464(
    p_tenant_id, 'TENANT', p_tenant_id::text, 'TENANT_DEMO',
    p_idempotency_key, v_fingerprint, v_result
  );
  RETURN v_result;
END;
$function$;

-- La muestra demo 412 antecede al contrato 440: insertaba la recepción ya
-- cerrada y luego sus items, que hoy se rechazan correctamente. Este adaptador
-- sólo reconoce esa semilla interna, conserva BORRADOR durante la carga y
-- difiere el cierre hasta el commit; no relaja recepciones de usuarios.
CREATE OR REPLACE FUNCTION app.defer_legacy_demo_reception_464()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF COALESCE(NEW.metadata->>'source', '') = 'demo_business_seed_v1'
     AND upper(COALESCE(NEW.estado::text, '')) IN ('CERRADA','CONFIRMADA','RECIBIDA')
     AND EXISTS (
       SELECT 1 FROM public.empresa_config ec
       WHERE ec.tenant_id = NEW.tenant_id AND COALESCE(ec.is_demo, false)
     ) THEN
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object('deferred_final_state_464', upper(NEW.estado::text));
    NEW.estado := 'BORRADOR';
    NEW.cerrado_at := NULL;
    NEW.cerrado_por := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app.finalize_legacy_demo_reception_464()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_final text := NULLIF(NEW.metadata->>'deferred_final_state_464', '');
BEGIN
  IF COALESCE(NEW.metadata->>'source', '') = 'demo_business_seed_v1'
     AND v_final IS NOT NULL THEN
    UPDATE public.recepciones r
    SET estado = v_final,
        cerrado_at = COALESCE(r.cerrado_at, now()),
        cerrado_por = COALESCE(r.cerrado_por, r.created_by::text),
        metadata = COALESCE(r.metadata, '{}'::jsonb) - 'deferred_final_state_464',
        updated_at = now()
    WHERE r.id = NEW.id AND r.tenant_id = NEW.tenant_id
      AND upper(COALESCE(r.estado::text, '')) = 'BORRADOR';
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_defer_legacy_demo_reception_464 ON public.recepciones;
CREATE TRIGGER trg_defer_legacy_demo_reception_464
BEFORE INSERT ON public.recepciones
FOR EACH ROW
EXECUTE FUNCTION app.defer_legacy_demo_reception_464();

DROP TRIGGER IF EXISTS trg_finalize_legacy_demo_reception_464 ON public.recepciones;
CREATE CONSTRAINT TRIGGER trg_finalize_legacy_demo_reception_464
AFTER INSERT ON public.recepciones
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN ((NEW.metadata->>'source') = 'demo_business_seed_v1')
EXECUTE FUNCTION app.finalize_legacy_demo_reception_464();

REVOKE ALL ON TABLE public.configuration_operation_intents FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.configuration_operation_intents TO service_role;
REVOKE ALL ON FUNCTION app.configuration_fingerprint_464(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.assert_configuration_actor_464(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.configuration_intent_replay_464(text,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.configuration_intent_finish_464(uuid,text,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.safe_empresa_config_464(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.audit_configuration_464(uuid,uuid,text,text,text,jsonb,jsonb,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.apply_empresa_config_patch_464(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.hydrate_demo_foundation_464(uuid,uuid,text,bytea,text,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.defer_legacy_demo_reception_464() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.finalize_legacy_demo_reception_464() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.actualizar_empresa_config_tx(uuid,uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardar_paso_wizard_config_tx(uuid,uuid,text,integer,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.completar_wizard_config_tx(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resetear_wizard_config_tx(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_serie_documento_tx(uuid,uuid,text,text,text,integer,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_preferencia_pais_tx(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_tenant_empresa_admin_tx(uuid,text,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cambiar_estado_tenant_tx(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.configurar_demo_tenant_tx(uuid,uuid,text,boolean,integer,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_demo_tenant_ready_tx(varchar,integer,varchar,text,bytea,text,timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.actualizar_empresa_config_tx(uuid,uuid,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.guardar_paso_wizard_config_tx(uuid,uuid,text,integer,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.completar_wizard_config_tx(uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.resetear_wizard_config_tx(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_serie_documento_tx(uuid,uuid,text,text,text,integer,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_preferencia_pais_tx(uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.crear_tenant_empresa_admin_tx(uuid,text,uuid,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_tenant_tx(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.configurar_demo_tenant_tx(uuid,uuid,text,boolean,integer,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_demo_tenant_ready_tx(varchar,integer,varchar,text,bytea,text,timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
