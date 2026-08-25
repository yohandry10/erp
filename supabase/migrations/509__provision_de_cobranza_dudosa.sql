-- 509__provision_de_cobranza_dudosa.sql
--
-- La estimacion de cuentas de cobranza dudosa no existia. El sistema ya tenia el
-- dato --`reporte_cxc_aging_470` clasifica la deuda por antiguedad-- pero nadie
-- hacia el asiento, asi que el balance mostraba como cobrable todo lo que
-- llevaba anos sin cobrarse y el contribuyente perdia la deduccion.
--
-- Es un asiento de cierre que un contador hace todos los ejercicios:
--
--     Dr 68  Valuacion y deterioro de activos y provisiones
--     Cr 19  Estimacion de cuentas de cobranza dudosa
--
-- La deduccion tributaria (art. 37 inc. i de la Ley del Impuesto a la Renta, y
-- art. 21 de su reglamento) exige tres cosas: que la deuda este vencida, que se
-- demuestre la dificultad de cobro --y el reglamento admite como prueba que
-- hayan pasado mas de doce meses desde el vencimiento-- y que la estimacion
-- figure discriminada en el Libro de Inventarios y Balances.
--
-- Por eso esta funcion **no adivina** el criterio: recibe los dias de
-- vencimiento como parametro, con 360 por defecto, que es el umbral que no
-- necesita otra prueba. Un contador que tenga protestos o gestiones de cobro
-- documentadas puede provisionar antes indicando menos dias; el sistema no puede
-- saberlo por su cuenta.
--
-- Lo provisionado queda anotado documento a documento en
-- `public.provisiones_cobranza_dudosa`, que es lo que hace falta para el Libro
-- de Inventarios y Balances y lo que impide provisionar dos veces la misma
-- deuda.

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. El detalle, que es requisito y no comodidad
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provisiones_cobranza_dudosa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cuenta_por_cobrar_id uuid NOT NULL,
  cliente_id uuid,
  numero_documento text,
  fecha_vencimiento date,
  dias_vencido integer NOT NULL,
  monto_provisionado numeric(18,2) NOT NULL,
  -- Sin defecto: la migracion 500 retiro el 'PEN' de las 34 columnas `moneda`
  -- del esquema porque la moneda la decide el contribuyente, no la tabla. La
  -- provision hereda la del documento que provisiona.
  moneda text NOT NULL,
  periodo text NOT NULL,
  asiento_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Una deuda se provisiona una vez. Sin esto, ejecutar el cierre dos veces
-- duplicaria el gasto y el balance quedaria peor que sin provisionar.
CREATE UNIQUE INDEX IF NOT EXISTS ux_provisiones_cobranza_dudosa_documento
ON public.provisiones_cobranza_dudosa (tenant_id, cuenta_por_cobrar_id);

CREATE INDEX IF NOT EXISTS idx_provisiones_cobranza_dudosa_periodo
ON public.provisiones_cobranza_dudosa (tenant_id, periodo);

SELECT app.apply_tenant_policy('public', 'provisiones_cobranza_dudosa');

-- ----------------------------------------------------------------------------
-- 2. Que deuda es provisionable
--
--    En una funcion y no repetida en dos consultas: el criterio del total y el
--    del detalle tienen que ser el mismo o el asiento no cuadra con sus lineas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.cxc_provisionables_509(
  p_tenant_id uuid,
  p_corte date,
  p_dias_vencido integer
)
RETURNS TABLE (
  id uuid,
  cliente_id uuid,
  numero_documento text,
  fecha_vencimiento date,
  dias_vencido integer,
  monto numeric,
  moneda text
)
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $aux$
  SELECT
    cpc.id,
    cpc.cliente_id,
    cpc.numero_documento,
    cpc.fecha_vencimiento,
    (p_corte - cpc.fecha_vencimiento)::integer,
    round(COALESCE(cpc.saldo_pendiente, cpc.saldo, 0), 2),
    cpc.moneda
  FROM public.cuentas_por_cobrar cpc
  WHERE cpc.tenant_id = p_tenant_id
    AND cpc.fecha_vencimiento IS NOT NULL
    AND cpc.fecha_vencimiento < p_corte
    AND (p_corte - cpc.fecha_vencimiento)::integer >= p_dias_vencido
    AND round(COALESCE(cpc.saldo_pendiente, cpc.saldo, 0), 2) > 0
    AND upper(COALESCE(cpc.estado, '')) NOT IN ('ANULADO', 'ANULADA', 'CANCELADO', 'CANCELADA', 'PAGADO', 'PAGADA')
    AND NOT EXISTS (
      SELECT 1 FROM public.provisiones_cobranza_dudosa p
      WHERE p.tenant_id = p_tenant_id AND p.cuenta_por_cobrar_id = cpc.id
    );
$aux$;

-- ----------------------------------------------------------------------------
-- 3. El writer
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provisionar_cobranza_dudosa_tx(
  p_tenant_id uuid,
  p_periodo text,
  p_actor_id uuid,
  p_dias_vencido integer DEFAULT 360
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_corte date;
  v_cuenta_68 uuid;
  v_cuenta_19 uuid;
  v_total numeric := 0;
  v_documentos integer := 0;
  v_asiento jsonb;
  v_source_event_id uuid;
  v_fila record;
BEGIN
  IF p_periodo !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'PROVISION_COBRANZA: el periodo debe ser YYYY-MM, recibido %', p_periodo;
  END IF;
  IF COALESCE(p_dias_vencido, 0) < 1 THEN
    RAISE EXCEPTION 'PROVISION_COBRANZA: los dias de vencimiento deben ser positivos';
  END IF;

  -- El corte es el ultimo dia del periodo, no hoy: provisionar un cierre pasado
  -- tiene que dar el mismo resultado se ejecute cuando se ejecute.
  v_corte := (to_date(p_periodo || '-01', 'YYYY-MM-DD') + INTERVAL '1 month - 1 day')::date;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(format('%s:provision-cobranza:%s', p_tenant_id, p_periodo), 0)
  );

  -- Sin tabla temporal a proposito. Una `TEMP TABLE ... ON COMMIT DROP`
  -- sobrevive entre dos llamadas dentro de la misma transaccion, y la segunda
  -- falla con "relation already exists": lo caza el propio verificador al
  -- comprobar que ejecutarla dos veces no duplica.
  SELECT COALESCE(sum(x.monto), 0), count(*)
    INTO v_total, v_documentos
  FROM app.cxc_provisionables_509(p_tenant_id, v_corte, p_dias_vencido) x;

  IF v_documentos = 0 THEN
    RETURN jsonb_build_object(
      'periodo', p_periodo,
      'dias_vencido', p_dias_vencido,
      'documentos', 0,
      'monto_provisionado', 0,
      'asiento_id', NULL,
      'mensaje', 'No hay deuda vencida sin provisionar con ese criterio'
    );
  END IF;

  SELECT pc.id INTO v_cuenta_68 FROM public.plan_cuentas pc
  WHERE pc.tenant_id = p_tenant_id AND btrim(pc.codigo) = '68'
  ORDER BY pc.created_at, pc.id LIMIT 1;

  SELECT pc.id INTO v_cuenta_19 FROM public.plan_cuentas pc
  WHERE pc.tenant_id = p_tenant_id AND btrim(pc.codigo) = '19'
  ORDER BY pc.created_at, pc.id LIMIT 1;

  IF v_cuenta_68 IS NULL OR v_cuenta_19 IS NULL THEN
    RAISE EXCEPTION
      'PROVISION_COBRANZA: faltan las cuentas 68 y 19 en el plan del contribuyente';
  END IF;

  v_source_event_id := (
    substr(encode(extensions.digest(convert_to(
      format('provision-cobranza-dudosa:%s:%s', p_tenant_id, p_periodo), 'UTF8'
    ), 'sha256'), 'hex'), 1, 32)
  )::uuid;

  v_asiento := public.crear_asiento_con_detalles_tx(
    p_tenant_id,
    jsonb_build_object(
      'fecha', v_corte::text,
      'concepto', format('Estimacion de cobranza dudosa %s', p_periodo),
      'descripcion', format('Provision de %s documentos vencidos mas de %s dias', v_documentos, p_dias_vencido),
      'tipo_asiento', 'PROVISION',
      'origen', 'PROVISION_COBRANZA_DUDOSA',
      'referencia', format('PCD-%s', p_periodo),
      'source_event_id', v_source_event_id,
      'estado', 'CONFIRMADO',
      'created_by', p_actor_id,
      'confirmado_por', p_actor_id
    ),
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_cuenta_68, 'debe', round(v_total, 2), 'haber', 0,
                         'concepto', 'Estimacion de cuentas de cobranza dudosa'),
      jsonb_build_object('cuenta_id', v_cuenta_19, 'debe', 0, 'haber', round(v_total, 2),
                         'concepto', 'Estimacion de cuentas de cobranza dudosa')
    )
  );

  FOR v_fila IN
    SELECT * FROM app.cxc_provisionables_509(p_tenant_id, v_corte, p_dias_vencido)
  LOOP
    INSERT INTO public.provisiones_cobranza_dudosa (
      tenant_id, cuenta_por_cobrar_id, cliente_id, numero_documento,
      fecha_vencimiento, dias_vencido, monto_provisionado, moneda, periodo, asiento_id
    ) VALUES (
      p_tenant_id, v_fila.id, v_fila.cliente_id, v_fila.numero_documento,
      v_fila.fecha_vencimiento, v_fila.dias_vencido, v_fila.monto, v_fila.moneda,
      p_periodo, NULLIF(v_asiento->>'id', '')::uuid
    );
  END LOOP;

  RETURN jsonb_build_object(
    'periodo', p_periodo,
    'dias_vencido', p_dias_vencido,
    'documentos', v_documentos,
    'monto_provisionado', round(v_total, 2),
    'asiento_id', v_asiento->>'id'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.provisionar_cobranza_dudosa_tx(uuid, text, uuid, integer)
FROM PUBLIC, anon, authenticated;

COMMIT;
