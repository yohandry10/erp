-- Migracion 513: los proveedores de la demo se pueden editar.
--
-- La semilla de la demo escribia `condiciones_pago = 'CREDITO'`, que **no es
-- ninguno de los valores que el sistema admite** --son CONTADO y CREDITO_15,
-- _30, _45, _60 y _90--. La consecuencia se ve al abrir el proveedor y darle a
-- guardar: el formulario no valida y el proveedor **no se puede editar**, con un
-- mensaje en ingles sobre un enum. Alcanza a 132 de los 134 proveedores que hay
-- en produccion, repartidos por 66 contribuyentes, que son justamente los que ve
-- quien esta probando el sistema.
--
-- La correccion no adivina nada: la semilla ya trae los dias de credito (15 y
-- 30), asi que la condicion sale de ahi.
--
-- Se corrigen las dos cosas: la funcion que siembra, para que no vuelva a
-- ocurrir, y las filas que ya estan escritas.

BEGIN;

CREATE OR REPLACE FUNCTION app.hydrate_demo_foundation_464(p_tenant_id uuid, p_actor_id uuid, p_country text, p_certificado_pfx bytea DEFAULT NULL::bytea, p_certificado_password text DEFAULT NULL::text, p_certificado_expira_en timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'extensions', 'pg_temp'
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
        'limite_credito', 50000,
        -- La condicion se deriva de los dias que ya trae la semilla. Antes se
        -- sembraba 'CREDITO' a secas, que no es ninguno de los valores que
        -- admite el sistema, y dejaba al proveedor inservible en la pantalla.
        'condiciones_pago', 'CREDITO_' || (v_supplier->>'dias_credito')
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

-- Filas ya sembradas. Solo se tocan las que tienen un dia de credito conocido:
-- si apareciera otro valor, se deja como esta y se ve en la pantalla antes que
-- inventarle una condicion.
UPDATE public.proveedores
SET condiciones_pago = 'CREDITO_' || dias_credito::text,
    updated_at = now()
WHERE condiciones_pago = 'CREDITO'
  AND dias_credito IN (15, 30, 45, 60, 90);

COMMIT;
