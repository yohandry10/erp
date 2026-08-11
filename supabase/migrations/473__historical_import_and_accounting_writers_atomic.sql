-- Importaciones historicas y writers contables sin ventanas parciales.
--
-- Las importaciones 336 escribian directamente maestros, CxC, CxP, CPE y
-- asientos. Un reintento podia sobrescribir saldos ya cobrados/pagados y el
-- balance de apertura dependia de un rollback manual. Esta migracion fija una
-- intencion durable por fila y mueve cada agregado a una sola transaccion SQL.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, extensions, pg_temp;

DO $preflight$
BEGIN
  IF to_regprocedure('app.assert_accounting_actor_458(uuid,uuid)') IS NULL
     OR to_regprocedure('app.ensure_accounting_period_open_458(uuid,date)') IS NULL
     OR to_regprocedure('public.crear_asiento_con_detalles_tx(uuid,jsonb,jsonb)') IS NULL
     OR to_regprocedure('public.crear_cliente_maestro_tx(uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.actualizar_cliente_maestro_tx(uuid,uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.crear_proveedor_maestro_tx(uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.actualizar_proveedor_maestro_tx(uuid,uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.aplicar_movimiento_inventario_tx(uuid,uuid,uuid,text,numeric,text,uuid,text,uuid,text,date,text,jsonb,boolean)') IS NULL
     OR to_regprocedure('public.guardar_plantilla_con_detalles_tx(uuid,text,uuid,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_473_REQUIRES_458_459';
  END IF;
END
$preflight$;

CREATE TABLE IF NOT EXISTS public.migration_row_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  operation_type text NOT NULL,
  external_id text NOT NULL,
  fingerprint text NOT NULL,
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  action text NOT NULL,
  run_id uuid REFERENCES public.migration_runs(id) ON DELETE SET NULL,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_migration_row_operations_type_473 CHECK (
    operation_type IN (
      'CLIENTE', 'PROVEEDOR', 'CXC_APERTURA', 'CXP_APERTURA',
      'CPE_HISTORICO', 'BALANCE_APERTURA', 'STOCK_INICIAL'
    )
  ),
  CONSTRAINT ck_migration_row_operations_external_473
    CHECK (btrim(external_id) <> ''),
  CONSTRAINT ck_migration_row_operations_fingerprint_473
    CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ux_migration_row_operations_intent_473
    UNIQUE (tenant_id, operation_type, external_id)
);

-- CREATE TABLE IF NOT EXISTS no actualiza checks al reejecutar localmente.
ALTER TABLE public.migration_row_operations
  DROP CONSTRAINT IF EXISTS ck_migration_row_operations_type_473;
ALTER TABLE public.migration_row_operations
  ADD CONSTRAINT ck_migration_row_operations_type_473 CHECK (
    operation_type IN (
      'CLIENTE', 'PROVEEDOR', 'CXC_APERTURA', 'CXP_APERTURA',
      'CPE_HISTORICO', 'BALANCE_APERTURA', 'STOCK_INICIAL'
    )
  );

CREATE INDEX IF NOT EXISTS ix_migration_row_operations_target_473
  ON public.migration_row_operations (tenant_id, target_table, target_id);

ALTER TABLE public.migration_row_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_row_operations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS migration_row_operations_tenant_read_473
  ON public.migration_row_operations;
CREATE POLICY migration_row_operations_tenant_read_473
  ON public.migration_row_operations
  FOR SELECT TO authenticated
  USING (tenant_id = app.current_tenant_id());

REVOKE ALL ON TABLE public.migration_row_operations FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.migration_row_operations FROM service_role;
GRANT SELECT ON TABLE public.migration_row_operations TO service_role;

CREATE OR REPLACE FUNCTION app.migration_fingerprint_473(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(
    extensions.digest(convert_to(COALESCE(p_payload, '{}'::jsonb)::text, 'UTF8'), 'sha256'),
    'hex'
  )
$function$;

CREATE OR REPLACE FUNCTION app.assert_migration_actor_473(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_run_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  PERFORM app.assert_accounting_actor_458(p_tenant_id, p_actor_id);

  IF p_run_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.migration_runs r
    WHERE r.id = p_run_id
      AND r.tenant_id = p_tenant_id
      AND r.started_by = p_actor_id
      AND r.status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_RUN_INVALID_FOR_ACTOR'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.register_migration_operation_473(
  p_tenant_id uuid,
  p_operation_type text,
  p_external_id text,
  p_fingerprint text,
  p_target_table text,
  p_target_id uuid,
  p_action text,
  p_run_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  INSERT INTO public.migration_row_operations (
    tenant_id, operation_type, external_id, fingerprint,
    target_table, target_id, action, run_id, actor_id
  ) VALUES (
    p_tenant_id, p_operation_type, btrim(p_external_id), p_fingerprint,
    p_target_table, p_target_id, p_action, p_run_id, p_actor_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.importar_cliente_historico_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_run_id uuid,
  p_external_id text,
  p_cliente jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_external_id text := NULLIF(btrim(COALESCE(p_external_id, '')), '');
  v_payload jsonb;
  v_fingerprint text;
  v_operation public.migration_row_operations;
  v_existing public.clientes;
  v_result jsonb;
  v_target_id uuid;
  v_action text;
BEGIN
  PERFORM app.assert_migration_actor_473(p_tenant_id, p_actor_id, p_run_id);
  IF v_external_id IS NULL OR jsonb_typeof(COALESCE(p_cliente, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'MIGRATION_CUSTOMER_REQUIRED_FIELDS' USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'external_id', v_external_id,
    'tipo', upper(NULLIF(btrim(p_cliente->>'tipo'), '')),
    'documento_tipo', upper(NULLIF(btrim(COALESCE(p_cliente->>'documento_tipo', p_cliente->>'tipo_documento')), '')),
    'documento_identidad', NULLIF(btrim(COALESCE(p_cliente->>'documento_identidad', p_cliente->>'documento_numero')), ''),
    'razon_social', NULLIF(btrim(p_cliente->>'razon_social'), ''),
    'direccion', NULLIF(btrim(p_cliente->>'direccion'), ''),
    'email', NULLIF(lower(btrim(p_cliente->>'email')), ''),
    'telefono', NULLIF(btrim(p_cliente->>'telefono'), ''),
    'limite_credito', COALESCE((p_cliente->>'limite_credito')::numeric, 0),
    'pais', upper(COALESCE(NULLIF(btrim(p_cliente->>'pais'), ''), 'PE'))
  ));
  v_fingerprint := app.migration_fingerprint_473(v_payload);

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':migration:cliente:' || v_external_id, 0
  ));
  SELECT * INTO v_operation
  FROM public.migration_row_operations o
  WHERE o.tenant_id = p_tenant_id
    AND o.operation_type = 'CLIENTE'
    AND o.external_id = v_external_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_operation.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'MIGRATION_CUSTOMER_IDEMPOTENCY_COLLISION'
        USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'id', v_operation.target_id, 'action', 'IDEMPOTENT', 'idempotent', true
    );
  END IF;

  SELECT * INTO v_existing
  FROM public.clientes c
  WHERE c.tenant_id = p_tenant_id AND c.external_id = v_external_id
  FOR UPDATE;

  IF FOUND THEN
    v_result := public.actualizar_cliente_maestro_tx(
      v_existing.id,
      p_tenant_id,
      p_actor_id,
      v_payload - 'external_id' - 'limite_credito' - 'pais'
    );
    v_target_id := v_existing.id;
    v_action := 'ADOPTED';
  ELSE
    v_result := public.crear_cliente_maestro_tx(p_tenant_id, p_actor_id, v_payload);
    v_target_id := (v_result->>'id')::uuid;
    v_action := CASE WHEN COALESCE((v_result->>'idempotent')::boolean, false)
      THEN 'ADOPTED' ELSE 'CREATED' END;
  END IF;

  UPDATE public.clientes c
  SET external_id = v_external_id,
      limite_credito = (v_payload->>'limite_credito')::numeric,
      pais = v_payload->>'pais',
      metadata = COALESCE(c.metadata, '{}'::jsonb) || jsonb_build_object(
        'origen', 'migracion_historica', 'run_id', p_run_id
      ),
      updated_by = p_actor_id,
      updated_at = now()
  WHERE c.id = v_target_id AND c.tenant_id = p_tenant_id;

  PERFORM app.register_migration_operation_473(
    p_tenant_id, 'CLIENTE', v_external_id, v_fingerprint,
    'clientes', v_target_id, v_action, p_run_id, p_actor_id
  );
  RETURN jsonb_build_object('id', v_target_id, 'action', v_action, 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.importar_proveedor_historico_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_run_id uuid,
  p_external_id text,
  p_proveedor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_external_id text := NULLIF(btrim(COALESCE(p_external_id, '')), '');
  v_payload jsonb;
  v_fingerprint text;
  v_operation public.migration_row_operations;
  v_existing public.proveedores;
  v_result jsonb;
  v_target_id uuid;
  v_action text;
BEGIN
  PERFORM app.assert_migration_actor_473(p_tenant_id, p_actor_id, p_run_id);
  IF v_external_id IS NULL OR jsonb_typeof(COALESCE(p_proveedor, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'MIGRATION_SUPPLIER_REQUIRED_FIELDS' USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'external_id', v_external_id,
    'documento_tipo', upper(COALESCE(NULLIF(btrim(COALESCE(p_proveedor->>'documento_tipo', p_proveedor->>'tipo_documento')), ''), 'RUC')),
    'documento_identidad', NULLIF(btrim(COALESCE(p_proveedor->>'documento_identidad', p_proveedor->>'documento_numero')), ''),
    'razon_social', NULLIF(btrim(p_proveedor->>'razon_social'), ''),
    'direccion', NULLIF(btrim(p_proveedor->>'direccion'), ''),
    'email', NULLIF(lower(btrim(p_proveedor->>'email')), ''),
    'telefono', NULLIF(btrim(p_proveedor->>'telefono'), ''),
    'pais', upper(COALESCE(NULLIF(btrim(p_proveedor->>'pais'), ''), 'PE')),
    'sujeto_detraccion', COALESCE((p_proveedor->>'sujeto_detraccion')::boolean, false),
    'detraccion_tasa', COALESCE((p_proveedor->>'detraccion_tasa')::numeric, 0),
    'sujeto_retencion', COALESCE((p_proveedor->>'sujeto_retencion')::boolean, false),
    'retencion_tasa', COALESCE((p_proveedor->>'retencion_tasa')::numeric, 0),
    'condiciones_pago', upper(COALESCE(NULLIF(btrim(p_proveedor->>'condiciones_pago'), ''), 'CONTADO')),
    'limite_credito', COALESCE((p_proveedor->>'limite_credito')::numeric, 0),
    'dias_credito', COALESCE((p_proveedor->>'dias_credito')::integer, 0)
  ));
  IF v_payload->>'email' IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_SUPPLIER_EMAIL_REQUIRED' USING ERRCODE = '22023';
  END IF;
  v_fingerprint := app.migration_fingerprint_473(v_payload);

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':migration:proveedor:' || v_external_id, 0
  ));
  SELECT * INTO v_operation
  FROM public.migration_row_operations o
  WHERE o.tenant_id = p_tenant_id
    AND o.operation_type = 'PROVEEDOR'
    AND o.external_id = v_external_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_operation.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'MIGRATION_SUPPLIER_IDEMPOTENCY_COLLISION'
        USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'id', v_operation.target_id, 'action', 'IDEMPOTENT', 'idempotent', true
    );
  END IF;

  SELECT * INTO v_existing
  FROM public.proveedores p
  WHERE p.tenant_id = p_tenant_id AND p.external_id = v_external_id
  FOR UPDATE;
  IF FOUND THEN
    v_result := public.actualizar_proveedor_maestro_tx(
      v_existing.id,
      p_tenant_id,
      p_actor_id,
      v_payload - 'external_id' - 'pais' - 'sujeto_detraccion'
        - 'detraccion_tasa' - 'sujeto_retencion' - 'retencion_tasa'
    );
    v_target_id := v_existing.id;
    v_action := 'ADOPTED';
  ELSE
    v_result := public.crear_proveedor_maestro_tx(p_tenant_id, p_actor_id, v_payload);
    v_target_id := (v_result->>'id')::uuid;
    v_action := CASE WHEN COALESCE((v_result->>'idempotent')::boolean, false)
      THEN 'ADOPTED' ELSE 'CREATED' END;
  END IF;

  UPDATE public.proveedores p
  SET external_id = v_external_id,
      pais = v_payload->>'pais',
      metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
        'origen', 'migracion_historica', 'run_id', p_run_id,
        'sujeto_detraccion', (v_payload->>'sujeto_detraccion')::boolean,
        'detraccion_tasa', (v_payload->>'detraccion_tasa')::numeric,
        'sujeto_retencion', (v_payload->>'sujeto_retencion')::boolean,
        'retencion_tasa', (v_payload->>'retencion_tasa')::numeric
      ),
      updated_by = p_actor_id,
      updated_at = now()
  WHERE p.id = v_target_id AND p.tenant_id = p_tenant_id;

  PERFORM app.register_migration_operation_473(
    p_tenant_id, 'PROVEEDOR', v_external_id, v_fingerprint,
    'proveedores', v_target_id, v_action, p_run_id, p_actor_id
  );
  RETURN jsonb_build_object('id', v_target_id, 'action', v_action, 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.importar_cxc_apertura_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_run_id uuid,
  p_external_id text,
  p_cxc jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_external_id text := NULLIF(btrim(COALESCE(p_external_id, '')), '');
  v_payload jsonb;
  v_fingerprint text;
  v_operation public.migration_row_operations;
  v_existing public.cuentas_por_cobrar;
  v_target public.cuentas_por_cobrar;
  v_cliente_id uuid;
  v_total numeric;
  v_saldo numeric;
  v_fecha_emision date;
  v_fecha_vencimiento date;
BEGIN
  PERFORM app.assert_migration_actor_473(p_tenant_id, p_actor_id, p_run_id);
  IF v_external_id IS NULL OR jsonb_typeof(COALESCE(p_cxc, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'MIGRATION_CXC_REQUIRED_FIELDS' USING ERRCODE = '22023';
  END IF;

  v_cliente_id := NULLIF(p_cxc->>'cliente_id', '')::uuid;
  v_total := COALESCE((p_cxc->>'monto_total')::numeric, 0);
  v_saldo := COALESCE((p_cxc->>'saldo_pendiente')::numeric, 0);
  v_fecha_emision := NULLIF(p_cxc->>'fecha_emision', '')::date;
  v_fecha_vencimiento := NULLIF(p_cxc->>'fecha_vencimiento', '')::date;
  IF v_cliente_id IS NULL OR v_total <= 0 OR v_saldo < 0 OR v_saldo > v_total
     OR upper(COALESCE(p_cxc->>'tipo_documento', '')) NOT IN (
       'FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'NC', 'ND', 'RECIBO', 'OTRO'
     )
     OR upper(COALESCE(p_cxc->>'moneda', '')) NOT IN ('PEN', 'USD', 'EUR')
     OR NULLIF(btrim(p_cxc->>'serie'), '') IS NULL
     OR NULLIF(btrim(p_cxc->>'numero'), '') IS NULL
     OR v_fecha_emision IS NULL OR v_fecha_vencimiento IS NULL
     OR v_fecha_vencimiento < v_fecha_emision THEN
    RAISE EXCEPTION 'MIGRATION_CXC_INVALID_PAYLOAD' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = v_cliente_id AND c.tenant_id = p_tenant_id AND COALESCE(c.activo, true)
  ) THEN
    RAISE EXCEPTION 'MIGRATION_CXC_CUSTOMER_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'external_id', v_external_id,
    'cliente_id', v_cliente_id,
    'tipo_documento', upper(NULLIF(btrim(p_cxc->>'tipo_documento'), '')),
    'serie', upper(NULLIF(btrim(p_cxc->>'serie'), '')),
    'numero', NULLIF(btrim(p_cxc->>'numero'), ''),
    'fecha_emision', v_fecha_emision,
    'fecha_vencimiento', v_fecha_vencimiento,
    'moneda', upper(p_cxc->>'moneda'),
    'monto_total', round(v_total, 2),
    'saldo_pendiente', round(v_saldo, 2),
    'observaciones', NULLIF(btrim(p_cxc->>'observaciones'), '')
  ));
  v_fingerprint := app.migration_fingerprint_473(v_payload);

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':migration:cxc:' || v_external_id, 0
  ));
  SELECT * INTO v_operation
  FROM public.migration_row_operations o
  WHERE o.tenant_id = p_tenant_id
    AND o.operation_type = 'CXC_APERTURA'
    AND o.external_id = v_external_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_operation.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'MIGRATION_CXC_IDEMPOTENCY_COLLISION' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'id', v_operation.target_id, 'action', 'IDEMPOTENT', 'idempotent', true
    );
  END IF;

  SELECT * INTO v_existing
  FROM public.cuentas_por_cobrar c
  WHERE c.tenant_id = p_tenant_id AND c.external_id = v_external_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.cliente_id IS DISTINCT FROM v_cliente_id
       OR upper(COALESCE(v_existing.tipo_documento, '')) IS DISTINCT FROM (v_payload->>'tipo_documento')
       OR upper(COALESCE(v_existing.serie, '')) IS DISTINCT FROM (v_payload->>'serie')
       OR COALESCE(v_existing.numero, '') IS DISTINCT FROM (v_payload->>'numero')
       OR round(COALESCE(v_existing.monto_total, 0), 2) <> (v_payload->>'monto_total')::numeric
       OR round(COALESCE(v_existing.saldo_pendiente, v_existing.saldo, 0), 2) <> (v_payload->>'saldo_pendiente')::numeric THEN
      RAISE EXCEPTION 'MIGRATION_CXC_REPLAY_AFTER_ACTIVITY' USING ERRCODE = '55000';
    END IF;
    PERFORM app.register_migration_operation_473(
      p_tenant_id, 'CXC_APERTURA', v_external_id, v_fingerprint,
      'cuentas_por_cobrar', v_existing.id, 'ADOPTED', p_run_id, p_actor_id
    );
    RETURN jsonb_build_object('id', v_existing.id, 'action', 'ADOPTED', 'idempotent', true);
  END IF;

  INSERT INTO public.cuentas_por_cobrar (
    tenant_id, external_id, cliente_id, tipo_documento, serie, numero,
    fecha_emision, fecha_vencimiento, moneda, monto_total, monto_original,
    monto_pendiente, saldo, saldo_pendiente, dias_mora,
    retencion_total, percepcion_total, detraccion_total, anticipo_total,
    estado, event_source, idempotency_key, observaciones, activo, metadata
  ) VALUES (
    p_tenant_id, v_external_id, v_cliente_id, v_payload->>'tipo_documento',
    v_payload->>'serie', v_payload->>'numero',
    (v_payload->>'fecha_emision')::date, (v_payload->>'fecha_vencimiento')::date,
    v_payload->>'moneda', (v_payload->>'monto_total')::numeric,
    (v_payload->>'monto_total')::numeric, (v_payload->>'saldo_pendiente')::numeric,
    (v_payload->>'saldo_pendiente')::numeric, (v_payload->>'saldo_pendiente')::numeric,
    0, 0, 0, 0, 0,
    CASE WHEN (v_payload->>'saldo_pendiente')::numeric > 0 THEN 'PENDIENTE' ELSE 'CANCELADO' END,
    'migracion.apertura', 'migracion_apertura:' || v_external_id,
    v_payload->>'observaciones', true,
    jsonb_build_object(
      'origen', 'migracion_apertura', 'fecha_corte', p_cxc->>'fecha_corte',
      'run_id', p_run_id
    )
  ) RETURNING * INTO v_target;

  PERFORM app.register_migration_operation_473(
    p_tenant_id, 'CXC_APERTURA', v_external_id, v_fingerprint,
    'cuentas_por_cobrar', v_target.id, 'CREATED', p_run_id, p_actor_id
  );
  RETURN jsonb_build_object('id', v_target.id, 'action', 'CREATED', 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.importar_cxp_apertura_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_run_id uuid,
  p_external_id text,
  p_cxp jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_external_id text := NULLIF(btrim(COALESCE(p_external_id, '')), '');
  v_payload jsonb;
  v_fingerprint text;
  v_operation public.migration_row_operations;
  v_existing public.cuentas_por_pagar;
  v_target public.cuentas_por_pagar;
  v_proveedor_id uuid;
  v_total numeric;
  v_saldo numeric;
  v_fecha_emision date;
  v_fecha_vencimiento date;
BEGIN
  PERFORM app.assert_migration_actor_473(p_tenant_id, p_actor_id, p_run_id);
  IF v_external_id IS NULL OR jsonb_typeof(COALESCE(p_cxp, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'MIGRATION_CXP_REQUIRED_FIELDS' USING ERRCODE = '22023';
  END IF;

  v_proveedor_id := NULLIF(p_cxp->>'proveedor_id', '')::uuid;
  v_total := COALESCE((p_cxp->>'monto_total')::numeric, 0);
  v_saldo := COALESCE((p_cxp->>'saldo_pendiente')::numeric, 0);
  v_fecha_emision := NULLIF(p_cxp->>'fecha_emision', '')::date;
  v_fecha_vencimiento := NULLIF(p_cxp->>'fecha_vencimiento', '')::date;
  IF v_proveedor_id IS NULL OR v_total <= 0 OR v_saldo < 0 OR v_saldo > v_total
     OR upper(COALESCE(p_cxp->>'tipo_documento', '')) NOT IN (
       'FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'NC', 'ND', 'RECIBO', 'OTRO'
     )
     OR upper(COALESCE(p_cxp->>'moneda', '')) NOT IN ('PEN', 'USD', 'EUR')
     OR NULLIF(btrim(p_cxp->>'serie'), '') IS NULL
     OR NULLIF(btrim(p_cxp->>'numero'), '') IS NULL
     OR v_fecha_emision IS NULL OR v_fecha_vencimiento IS NULL
     OR v_fecha_vencimiento < v_fecha_emision THEN
    RAISE EXCEPTION 'MIGRATION_CXP_INVALID_PAYLOAD' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.proveedores p
    WHERE p.id = v_proveedor_id AND p.tenant_id = p_tenant_id AND COALESCE(p.activo, true)
  ) THEN
    RAISE EXCEPTION 'MIGRATION_CXP_SUPPLIER_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'external_id', v_external_id,
    'proveedor_id', v_proveedor_id,
    'tipo_documento', upper(NULLIF(btrim(p_cxp->>'tipo_documento'), '')),
    'serie', upper(NULLIF(btrim(p_cxp->>'serie'), '')),
    'numero', NULLIF(btrim(p_cxp->>'numero'), ''),
    'fecha_emision', v_fecha_emision,
    'fecha_vencimiento', v_fecha_vencimiento,
    'moneda', upper(p_cxp->>'moneda'),
    'monto_total', round(v_total, 2),
    'saldo_pendiente', round(v_saldo, 2),
    'observaciones', NULLIF(btrim(p_cxp->>'observaciones'), '')
  ));
  v_fingerprint := app.migration_fingerprint_473(v_payload);

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':migration:cxp:' || v_external_id, 0
  ));
  SELECT * INTO v_operation
  FROM public.migration_row_operations o
  WHERE o.tenant_id = p_tenant_id
    AND o.operation_type = 'CXP_APERTURA'
    AND o.external_id = v_external_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_operation.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'MIGRATION_CXP_IDEMPOTENCY_COLLISION' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'id', v_operation.target_id, 'action', 'IDEMPOTENT', 'idempotent', true
    );
  END IF;

  SELECT * INTO v_existing
  FROM public.cuentas_por_pagar p
  WHERE p.tenant_id = p_tenant_id AND p.external_id = v_external_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.proveedor_id IS DISTINCT FROM v_proveedor_id
       OR upper(COALESCE(v_existing.tipo_documento, '')) IS DISTINCT FROM (v_payload->>'tipo_documento')
       OR upper(COALESCE(v_existing.metadata->>'serie', '')) IS DISTINCT FROM (v_payload->>'serie')
       OR COALESCE(v_existing.numero_documento, v_existing.numero, '') IS DISTINCT FROM (v_payload->>'numero')
       OR round(COALESCE(v_existing.total, 0), 2) <> (v_payload->>'monto_total')::numeric
       OR round(COALESCE(v_existing.saldo_pendiente, v_existing.saldo, 0), 2) <> (v_payload->>'saldo_pendiente')::numeric THEN
      RAISE EXCEPTION 'MIGRATION_CXP_REPLAY_AFTER_ACTIVITY' USING ERRCODE = '55000';
    END IF;
    PERFORM app.register_migration_operation_473(
      p_tenant_id, 'CXP_APERTURA', v_external_id, v_fingerprint,
      'cuentas_por_pagar', v_existing.id, 'ADOPTED', p_run_id, p_actor_id
    );
    RETURN jsonb_build_object('id', v_existing.id, 'action', 'ADOPTED', 'idempotent', true);
  END IF;

  INSERT INTO public.cuentas_por_pagar (
    tenant_id, external_id, proveedor_id, referencia_tipo,
    tipo_documento, numero, numero_documento,
    fecha_emision, fecha_vencimiento, moneda, total, subtotal, igv,
    saldo, saldo_pendiente, retencion_total, percepcion_total,
    detraccion_total, anticipo_total, discrepancias, condiciones_pago,
    idempotency_key, estado, observaciones, metadata, created_by, updated_by
  ) VALUES (
    p_tenant_id, v_external_id, v_proveedor_id, 'MIGRACION_APERTURA',
    v_payload->>'tipo_documento', v_payload->>'numero', v_payload->>'numero',
    (v_payload->>'fecha_emision')::date,
    (v_payload->>'fecha_vencimiento')::date, v_payload->>'moneda',
    (v_payload->>'monto_total')::numeric, (v_payload->>'monto_total')::numeric,
    0, (v_payload->>'saldo_pendiente')::numeric,
    (v_payload->>'saldo_pendiente')::numeric, 0, 0, 0, 0, '[]'::jsonb,
    'CONTADO', 'migracion_apertura:' || v_external_id,
    CASE WHEN (v_payload->>'saldo_pendiente')::numeric > 0 THEN 'PENDIENTE' ELSE 'PAGADA' END,
    v_payload->>'observaciones',
    jsonb_build_object(
      'origen', 'migracion_apertura', 'fecha_corte', p_cxp->>'fecha_corte',
      'run_id', p_run_id, 'serie', v_payload->>'serie'
    ), p_actor_id, p_actor_id
  ) RETURNING * INTO v_target;

  PERFORM app.register_migration_operation_473(
    p_tenant_id, 'CXP_APERTURA', v_external_id, v_fingerprint,
    'cuentas_por_pagar', v_target.id, 'CREATED', p_run_id, p_actor_id
  );
  RETURN jsonb_build_object('id', v_target.id, 'action', 'CREATED', 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.importar_stock_inicial_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_run_id uuid,
  p_external_id text,
  p_stock jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_external_id text := NULLIF(btrim(COALESCE(p_external_id, '')), '');
  v_payload jsonb;
  v_fingerprint text;
  v_operation public.migration_row_operations;
  v_existing public.movimientos_inventario;
  v_producto_id uuid;
  v_almacen_id uuid;
  v_sucursal_id uuid;
  v_fecha_corte date;
  v_cantidad numeric;
  v_costo numeric;
  v_movimiento_id uuid;
BEGIN
  PERFORM app.assert_migration_actor_473(p_tenant_id, p_actor_id, p_run_id);
  IF v_external_id IS NULL OR jsonb_typeof(COALESCE(p_stock, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'MIGRATION_STOCK_REQUIRED_FIELDS' USING ERRCODE = '22023';
  END IF;

  v_producto_id := NULLIF(p_stock->>'producto_id', '')::uuid;
  v_almacen_id := NULLIF(p_stock->>'almacen_id', '')::uuid;
  v_sucursal_id := NULLIF(p_stock->>'sucursal_id', '')::uuid;
  v_fecha_corte := NULLIF(p_stock->>'fecha_corte', '')::date;
  v_cantidad := COALESCE((p_stock->>'cantidad')::numeric, 0);
  v_costo := COALESCE((p_stock->>'costo_unitario')::numeric, 0);
  IF v_producto_id IS NULL OR v_almacen_id IS NULL OR v_sucursal_id IS NULL
     OR v_fecha_corte IS NULL OR v_cantidad <= 0 OR v_costo < 0 THEN
    RAISE EXCEPTION 'MIGRATION_STOCK_INVALID_PAYLOAD' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.productos p
    WHERE p.id = v_producto_id AND p.tenant_id = p_tenant_id
      AND COALESCE(p.activo, true) AND NOT COALESCE(p.es_servicio, false)
      AND COALESCE(p.controla_stock, true)
  ) THEN
    RAISE EXCEPTION 'MIGRATION_STOCK_PRODUCT_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.almacenes a
    WHERE a.id = v_almacen_id AND a.tenant_id = p_tenant_id AND COALESCE(a.activo, true)
  ) THEN
    RAISE EXCEPTION 'MIGRATION_STOCK_WAREHOUSE_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sucursales s
    WHERE s.id = v_sucursal_id AND s.tenant_id = p_tenant_id
      AND lower(COALESCE(s.estado, 'activo')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_STOCK_BRANCH_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'external_id', v_external_id,
    'producto_id', v_producto_id,
    'almacen_id', v_almacen_id,
    'sucursal_id', v_sucursal_id,
    'fecha_corte', v_fecha_corte,
    'cantidad', round(v_cantidad, 6),
    'costo_unitario', round(v_costo, 6),
    'notas', NULLIF(btrim(p_stock->>'notas'), '')
  ));
  v_fingerprint := app.migration_fingerprint_473(v_payload);

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':migration:stock:' || v_external_id, 0
  ));
  SELECT * INTO v_operation
  FROM public.migration_row_operations o
  WHERE o.tenant_id = p_tenant_id
    AND o.operation_type = 'STOCK_INICIAL'
    AND o.external_id = v_external_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_operation.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'MIGRATION_STOCK_IDEMPOTENCY_COLLISION' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'id', v_operation.target_id, 'action', 'IDEMPOTENT', 'idempotent', true
    );
  END IF;

  SELECT mi.* INTO v_existing
  FROM public.movimientos_inventario mi
  WHERE mi.tenant_id = p_tenant_id
    AND mi.producto_id = v_producto_id
    AND mi.almacen_id = v_almacen_id
    AND mi.tipo = 'ENTRADA'
    AND mi.referencia_tipo = 'MIGRACION_APERTURA_' || v_fecha_corte::text
    AND mi.referencia_id = v_producto_id
  FOR UPDATE;
  IF FOUND THEN
    IF round(COALESCE(v_existing.cantidad, 0), 6) <> round(v_cantidad, 6)
       OR COALESCE(v_existing.metadata->>'sucursal_id', '') <> v_sucursal_id::text
       OR round(COALESCE((v_existing.metadata->>'costo_unitario')::numeric, 0), 6)
          <> round(v_costo, 6) THEN
      RAISE EXCEPTION 'MIGRATION_STOCK_REPLAY_PAYLOAD_CHANGED' USING ERRCODE = '55000';
    END IF;
    PERFORM app.register_migration_operation_473(
      p_tenant_id, 'STOCK_INICIAL', v_external_id, v_fingerprint,
      'movimientos_inventario', v_existing.id, 'ADOPTED', p_run_id, p_actor_id
    );
    RETURN jsonb_build_object('id', v_existing.id, 'action', 'ADOPTED', 'idempotent', true);
  END IF;

  v_movimiento_id := public.aplicar_movimiento_inventario_tx(
    p_tenant_id,
    v_producto_id,
    v_almacen_id,
    'ENTRADA',
    v_cantidad,
    'MIGRACION_APERTURA_' || v_fecha_corte::text,
    v_producto_id,
    COALESCE(v_payload->>'notas', 'Apertura migrada al ' || v_fecha_corte::text),
    NULL,
    NULL,
    NULL,
    p_actor_id::text,
    jsonb_build_object(
      'origen', 'migracion_apertura',
      'fecha_corte', v_fecha_corte,
      'costo_unitario', v_costo,
      'valor_total', round(v_cantidad * v_costo, 2),
      'sucursal_id', v_sucursal_id,
      'almacen_id', v_almacen_id,
      'run_id', p_run_id,
      'external_id_producto', p_stock->>'external_id_producto'
    ),
    false
  );

  PERFORM app.register_migration_operation_473(
    p_tenant_id, 'STOCK_INICIAL', v_external_id, v_fingerprint,
    'movimientos_inventario', v_movimiento_id, 'CREATED', p_run_id, p_actor_id
  );
  RETURN jsonb_build_object('id', v_movimiento_id, 'action', 'CREATED', 'idempotent', false);
END;
$function$;

-- MIGRADO es evidencia historica interna: nunca equivale a aceptacion SUNAT.
CREATE OR REPLACE FUNCTION app.normalize_cpe_estado_218(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $function$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'BORRADOR'));

  IF v_estado IN ('ACTIVO', 'DRAFT', 'PENDIENTE', 'PENDING') THEN v_estado := 'BORRADOR'; END IF;
  IF v_estado IN ('READY', 'LISTO', 'GENERADO') THEN v_estado := 'FIRMADO'; END IF;
  IF v_estado IN ('SENT', 'SENDING') THEN v_estado := 'ENVIADO'; END IF;
  IF v_estado IN ('ACCEPTED', 'ACEPTADA') THEN v_estado := 'ACEPTADO'; END IF;
  IF v_estado IN ('REJECTED', 'RECHAZADA') THEN v_estado := 'RECHAZADO'; END IF;
  IF v_estado IN ('FAILED') THEN v_estado := 'ERROR'; END IF;
  IF v_estado IN ('CANCELLED', 'ANULADA') THEN v_estado := 'ANULADO'; END IF;

  IF v_estado NOT IN (
    'BORRADOR', 'FIRMADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO',
    'ANULADO', 'ERROR', 'MIGRADO'
  ) THEN
    v_estado := 'BORRADOR';
  END IF;

  RETURN v_estado::citext;
END;
$function$;

ALTER TABLE public.cpe DROP CONSTRAINT IF EXISTS ck_cpe_estado_valid_runtime_218;
ALTER TABLE public.cpe
  ADD CONSTRAINT ck_cpe_estado_valid_runtime_218 CHECK (
    lower(estado::text) = ANY (ARRAY[
      'borrador', 'firmado', 'enviado', 'aceptado', 'rechazado',
      'anulado', 'error', 'migrado'
    ])
  );

ALTER TABLE public.cpe DROP CONSTRAINT IF EXISTS ck_cpe_estado_sunat_consistency_runtime_218;
ALTER TABLE public.cpe
  ADD CONSTRAINT ck_cpe_estado_sunat_consistency_runtime_218 CHECK (
    ((lower(estado::text) <> 'aceptado') OR (lower(sunat_status::text) = 'accepted'))
    AND ((lower(estado::text) <> 'rechazado') OR (lower(sunat_status::text) = ANY (ARRAY['rejected', 'error'])))
    AND ((lower(estado::text) <> 'enviado') OR (lower(sunat_status::text) = ANY (ARRAY['sending', 'ready'])))
    AND ((lower(estado::text) <> 'firmado') OR (lower(sunat_status::text) = ANY (ARRAY['ready', 'not_sent'])))
    AND ((lower(estado::text) <> 'borrador') OR (lower(sunat_status::text) = ANY (ARRAY['not_sent', 'ready'])))
    AND ((lower(estado::text) <> 'migrado') OR (lower(sunat_status::text) = 'not_sent'))
  );

CREATE OR REPLACE FUNCTION public.importar_cpe_historico_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_run_id uuid,
  p_external_id text,
  p_cpe jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_external_id text := NULLIF(btrim(COALESCE(p_external_id, '')), '');
  v_payload jsonb;
  v_fingerprint text;
  v_operation public.migration_row_operations;
  v_existing public.cpe;
  v_target public.cpe;
  v_cliente public.clientes;
  v_tipo_origen text;
  v_tipo text;
  v_serie text;
  v_numero text;
  v_subtotal numeric;
  v_igv numeric;
  v_total numeric;
BEGIN
  PERFORM app.assert_migration_actor_473(p_tenant_id, p_actor_id, p_run_id);
  IF v_external_id IS NULL OR jsonb_typeof(COALESCE(p_cpe, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'MIGRATION_CPE_REQUIRED_FIELDS' USING ERRCODE = '22023';
  END IF;

  v_tipo_origen := upper(NULLIF(btrim(p_cpe->>'tipo_documento'), ''));
  v_tipo := CASE v_tipo_origen
    WHEN 'FACTURA' THEN '01'
    WHEN 'BOLETA' THEN '03'
    WHEN 'NOTA_CREDITO' THEN '07'
    WHEN 'NC' THEN '07'
    WHEN 'NOTA_DEBITO' THEN '08'
    WHEN 'ND' THEN '08'
    ELSE NULL
  END;
  v_serie := upper(NULLIF(btrim(p_cpe->>'serie'), ''));
  v_numero := NULLIF(btrim(p_cpe->>'numero'), '');
  v_subtotal := COALESCE((p_cpe->>'subtotal')::numeric, 0);
  v_igv := COALESCE((p_cpe->>'igv')::numeric, 0);
  v_total := COALESCE((p_cpe->>'total')::numeric, 0);
  IF v_tipo IS NULL
     OR v_serie IS NULL OR v_serie !~ '^[A-Z0-9]{1,4}$'
     OR v_numero IS NULL OR v_numero !~ '^[0-9]{1,8}$'
     OR NULLIF(p_cpe->>'fecha_emision', '')::date IS NULL
     OR upper(COALESCE(p_cpe->>'moneda', '')) NOT IN ('PEN', 'USD', 'EUR')
     OR v_subtotal < 0 OR v_igv < 0 OR v_total <= 0
     OR abs(round(v_subtotal + v_igv - v_total, 2)) > 0.05 THEN
    RAISE EXCEPTION 'MIGRATION_CPE_INVALID_PAYLOAD' USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO v_cliente
  FROM public.clientes c
  WHERE c.id = NULLIF(p_cpe->>'cliente_id', '')::uuid
    AND c.tenant_id = p_tenant_id
    AND COALESCE(c.activo, true);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MIGRATION_CPE_CUSTOMER_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'external_id', v_external_id,
    'tipo_documento', v_tipo,
    'serie', v_serie,
    'numero', v_numero,
    'fecha_emision', (p_cpe->>'fecha_emision')::date,
    'cliente_id', v_cliente.id,
    'moneda', upper(p_cpe->>'moneda'),
    'subtotal', round(v_subtotal, 2),
    'igv', round(v_igv, 2),
    'total', round(v_total, 2),
    'observaciones', NULLIF(btrim(p_cpe->>'observaciones'), '')
  ));
  v_fingerprint := app.migration_fingerprint_473(v_payload);

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':migration:cpe:' || v_external_id, 0
  ));
  SELECT * INTO v_operation
  FROM public.migration_row_operations o
  WHERE o.tenant_id = p_tenant_id
    AND o.operation_type = 'CPE_HISTORICO'
    AND o.external_id = v_external_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_operation.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'MIGRATION_CPE_IDEMPOTENCY_COLLISION' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'id', v_operation.target_id, 'action', 'IDEMPOTENT', 'idempotent', true
    );
  END IF;

  SELECT c.* INTO v_existing
  FROM public.cpe c
  WHERE c.tenant_id = p_tenant_id
    AND CASE upper(c.tipo_documento)
      WHEN 'FACTURA' THEN '01'
      WHEN 'BOLETA' THEN '03'
      WHEN 'NOTA_CREDITO' THEN '07'
      WHEN 'NC' THEN '07'
      WHEN 'NOTA_DEBITO' THEN '08'
      WHEN 'ND' THEN '08'
      ELSE upper(c.tipo_documento)
    END = v_tipo
    AND upper(c.serie) = v_serie
    AND lpad(btrim(c.numero), 8, '0') = lpad(v_numero, 8, '0')
  FOR UPDATE;
  IF FOUND THEN
    IF lower(v_existing.estado::text) <> 'migrado'
       OR v_existing.metadata->>'external_id' IS DISTINCT FROM v_external_id
       OR v_existing.cliente_id IS DISTINCT FROM v_cliente.id
       OR round(COALESCE(v_existing.total_venta, v_existing.total, 0), 2) <> round(v_total, 2) THEN
      RAISE EXCEPTION 'MIGRATION_CPE_FISCAL_NUMBER_COLLISION' USING ERRCODE = '23505';
    END IF;
    PERFORM app.register_migration_operation_473(
      p_tenant_id, 'CPE_HISTORICO', v_external_id, v_fingerprint,
      'cpe', v_existing.id, 'ADOPTED', p_run_id, p_actor_id
    );
    RETURN jsonb_build_object('id', v_existing.id, 'action', 'ADOPTED', 'idempotent', true);
  END IF;

  INSERT INTO public.cpe (
    tenant_id, tipo_documento, serie, numero, numero_comprobante,
    fecha_emision, moneda, cliente_id,
    documento_receptor, tipo_documento_receptor, razon_social_receptor,
    total_gravadas, total_igv, total_venta, total,
    estado, sunat_status, estado_sunat, activo, idempotency_key,
    created_by, metadata
  ) VALUES (
    p_tenant_id, v_tipo, v_serie, v_numero, v_numero::integer,
    (v_payload->>'fecha_emision')::date, v_payload->>'moneda', v_cliente.id,
    COALESCE(v_cliente.documento_identidad, v_cliente.ruc, v_cliente.codigo),
    COALESCE(v_cliente.documento_tipo, v_cliente.tipo_documento),
    v_cliente.razon_social,
    (v_payload->>'subtotal')::numeric, (v_payload->>'igv')::numeric,
    (v_payload->>'total')::numeric, (v_payload->>'total')::numeric,
    'MIGRADO', 'not_sent', NULL, false,
    'migracion_historica:' || v_external_id, p_actor_id,
    jsonb_build_object(
      'origen', 'migracion_historica', 'external_id', v_external_id,
      'run_id', p_run_id, 'observaciones', v_payload->>'observaciones',
      'tipo_documento_origen', v_tipo_origen,
      'no_sunat', true, 'no_evento_factura', true, 'solo_lectura', true
    )
  ) RETURNING * INTO v_target;

  PERFORM app.register_migration_operation_473(
    p_tenant_id, 'CPE_HISTORICO', v_external_id, v_fingerprint,
    'cpe', v_target.id, 'CREATED', p_run_id, p_actor_id
  );
  RETURN jsonb_build_object('id', v_target.id, 'action', 'CREATED', 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.importar_balance_apertura_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_run_id uuid,
  p_fecha_corte date,
  p_detalles jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_external_id text;
  v_payload jsonb;
  v_fingerprint text;
  v_operation public.migration_row_operations;
  v_existing public.asientos_contables;
  v_asiento jsonb;
  v_asiento_id uuid;
BEGIN
  PERFORM app.assert_migration_actor_473(p_tenant_id, p_actor_id, p_run_id);
  IF p_fecha_corte IS NULL OR jsonb_typeof(COALESCE(p_detalles, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_detalles) < 2 THEN
    RAISE EXCEPTION 'MIGRATION_OPENING_BALANCE_REQUIRED_FIELDS' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_detalles)
      AS x(cuenta_id uuid, centro_costo_id uuid, debe numeric, haber numeric, concepto text)
    LEFT JOIN public.plan_cuentas c
      ON c.id = x.cuenta_id AND c.tenant_id = p_tenant_id
    WHERE c.id IS NULL OR NOT COALESCE(c.activo, false)
      OR NOT COALESCE(c.acepta_movimiento, false)
  ) THEN
    RAISE EXCEPTION 'MIGRATION_OPENING_BALANCE_ACCOUNT_INVALID' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_detalles)
      AS x(cuenta_id uuid, centro_costo_id uuid, debe numeric, haber numeric, concepto text)
    LEFT JOIN public.centros_costo cc
      ON cc.id = x.centro_costo_id AND cc.tenant_id = p_tenant_id
    WHERE x.centro_costo_id IS NOT NULL
      AND (cc.id IS NULL OR NOT COALESCE(cc.activo, false))
  ) THEN
    RAISE EXCEPTION 'MIGRATION_OPENING_BALANCE_COST_CENTER_INVALID' USING ERRCODE = '23503';
  END IF;
  PERFORM app.ensure_accounting_period_open_458(p_tenant_id, p_fecha_corte);

  v_external_id := 'APERTURA-' || p_fecha_corte::text;
  v_payload := jsonb_build_object(
    'external_id', v_external_id,
    'fecha_corte', p_fecha_corte,
    'detalles', p_detalles
  );
  v_fingerprint := app.migration_fingerprint_473(v_payload);

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':migration:balance:' || p_fecha_corte::text, 0
  ));
  SELECT * INTO v_operation
  FROM public.migration_row_operations o
  WHERE o.tenant_id = p_tenant_id
    AND o.operation_type = 'BALANCE_APERTURA'
    AND o.external_id = v_external_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_operation.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'MIGRATION_OPENING_BALANCE_IDEMPOTENCY_COLLISION'
        USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'id', v_operation.target_id, 'action', 'IDEMPOTENT', 'idempotent', true
    );
  END IF;

  SELECT * INTO v_existing
  FROM public.asientos_contables a
  WHERE a.tenant_id = p_tenant_id AND a.external_id = v_external_id
  FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'MIGRATION_OPENING_BALANCE_UNMANAGED_ALREADY_EXISTS'
      USING ERRCODE = '55000';
  END IF;

  v_asiento := public.crear_asiento_con_detalles_tx(
    p_tenant_id,
    jsonb_build_object(
      'fecha', p_fecha_corte::timestamptz,
      'concepto', 'Asiento de apertura por migracion (' || p_fecha_corte::text || ')',
      'descripcion', 'Saldos iniciales migrados desde ERP externo al ' || p_fecha_corte::text,
      'referencia', v_external_id,
      'estado', 'CONFIRMADO',
      'tipo_asiento', 'APERTURA',
      'origen', 'MIGRACION',
      'created_by', p_actor_id,
      'confirmado_por', p_actor_id,
      'confirmado_en', now()
    ),
    p_detalles
  );
  v_asiento_id := (v_asiento->>'id')::uuid;

  UPDATE public.asientos_contables a
  SET external_id = v_external_id,
      usuario_id = p_actor_id,
      metadata = COALESCE(a.metadata, '{}'::jsonb) || jsonb_build_object(
        'origen', 'migracion_apertura', 'run_id', p_run_id,
        'fecha_corte', p_fecha_corte
      ),
      updated_at = now()
  WHERE a.id = v_asiento_id AND a.tenant_id = p_tenant_id;

  PERFORM app.register_migration_operation_473(
    p_tenant_id, 'BALANCE_APERTURA', v_external_id, v_fingerprint,
    'asientos_contables', v_asiento_id, 'CREATED', p_run_id, p_actor_id
  );
  RETURN jsonb_build_object('id', v_asiento_id, 'action', 'CREATED', 'idempotent', false);
END;
$function$;

-- La cabecera y las lineas de una plantilla ya se guardaban mediante 405,
-- pero esa RPC no validaba al actor y la eliminacion seguia haciendo dos
-- requests PostgREST. Estos wrappers fijan ambas fronteras sin duplicar la
-- logica contable de 405.
CREATE OR REPLACE FUNCTION public.guardar_plantilla_contable_tx_473(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_plantilla_id uuid,
  p_plantilla jsonb,
  p_detalles jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  PERFORM app.assert_accounting_actor_458(p_tenant_id, p_actor_id);
  RETURN public.guardar_plantilla_con_detalles_tx(
    p_tenant_id,
    p_actor_id::text,
    p_plantilla_id,
    p_plantilla,
    p_detalles
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.eliminar_plantilla_contable_tx_473(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_plantilla_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_plantilla public.plantillas_asientos;
BEGIN
  PERFORM app.assert_accounting_actor_458(p_tenant_id, p_actor_id);
  IF p_plantilla_id IS NULL THEN
    RAISE EXCEPTION 'PLANTILLA_ID_REQUERIDO' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_plantilla
  FROM public.plantillas_asientos p
  WHERE p.id = p_plantilla_id AND p.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'id', p_plantilla_id, 'action', 'IDEMPOTENT', 'idempotent', true
    );
  END IF;

  DELETE FROM public.plantillas_asientos_detalle d
  WHERE d.tenant_id = p_tenant_id AND d.plantilla_id = p_plantilla_id;

  DELETE FROM public.plantillas_asientos p
  WHERE p.id = p_plantilla_id AND p.tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'id', p_plantilla_id,
    'action', 'DELETED',
    'idempotent', false,
    'historial_preservado', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION app.migration_fingerprint_473(jsonb),
  app.assert_migration_actor_473(uuid,uuid,uuid),
  app.register_migration_operation_473(uuid,text,text,text,text,uuid,text,uuid,uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION app.migration_fingerprint_473(jsonb),
  app.assert_migration_actor_473(uuid,uuid,uuid),
  app.register_migration_operation_473(uuid,text,text,text,text,uuid,text,uuid,uuid)
FROM service_role;

REVOKE ALL ON FUNCTION public.importar_cliente_historico_tx(uuid,uuid,uuid,text,jsonb),
  public.importar_proveedor_historico_tx(uuid,uuid,uuid,text,jsonb),
  public.importar_cxc_apertura_tx(uuid,uuid,uuid,text,jsonb),
  public.importar_cxp_apertura_tx(uuid,uuid,uuid,text,jsonb),
  public.importar_stock_inicial_tx(uuid,uuid,uuid,text,jsonb),
  public.importar_cpe_historico_tx(uuid,uuid,uuid,text,jsonb),
  public.importar_balance_apertura_tx(uuid,uuid,uuid,date,jsonb),
  public.guardar_plantilla_contable_tx_473(uuid,uuid,uuid,jsonb,jsonb),
  public.eliminar_plantilla_contable_tx_473(uuid,uuid,uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.importar_cliente_historico_tx(uuid,uuid,uuid,text,jsonb),
  public.importar_proveedor_historico_tx(uuid,uuid,uuid,text,jsonb),
  public.importar_cxc_apertura_tx(uuid,uuid,uuid,text,jsonb),
  public.importar_cxp_apertura_tx(uuid,uuid,uuid,text,jsonb),
  public.importar_stock_inicial_tx(uuid,uuid,uuid,text,jsonb),
  public.importar_cpe_historico_tx(uuid,uuid,uuid,text,jsonb),
  public.importar_balance_apertura_tx(uuid,uuid,uuid,date,jsonb),
  public.guardar_plantilla_contable_tx_473(uuid,uuid,uuid,jsonb,jsonb),
  public.eliminar_plantilla_contable_tx_473(uuid,uuid,uuid)
TO service_role;

COMMIT;
