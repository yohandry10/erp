-- Verificador 506: la tabla muerta no vuelve, y las vivas siguen ahi.
--
-- Las dos mitades importan lo mismo. Retirar `detalle_retenciones_categoria` es
-- barato de comprobar; lo que de verdad puede salir mal es que alguien, leyendo
-- esta migracion, se lleve por delante las dos tablas de retenciones que si
-- estan vivas y que se le parecen mucho en el nombre.
--
-- `libro_retenciones` esta vacia y aun asi es imprescindible: la lee
-- `planilla-electronica-peru.service.ts` para la cuarta categoria del
-- T-Registro. Una tabla vacia no es una tabla muerta.

BEGIN;

DO $verify$
DECLARE
  v_filas bigint;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. La tabla muerta no existe
  ---------------------------------------------------------------------------
  IF to_regclass('public.detalle_retenciones_categoria') IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_506: detalle_retenciones_categoria sigue existiendo; era una tabla sin un solo uso en codigo ni en migraciones';
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Las que si estan vivas siguen ahi
  --
  --    Sin esta mitad, retirar de mas pasaria el verificador tan contento.
  ---------------------------------------------------------------------------
  IF to_regclass('public.libro_retenciones') IS NULL THEN
    RAISE EXCEPTION
      'VERIFY_506: falta libro_retenciones. Esta vacia porque la retencion de cuarta '
      'categoria no se calcula todavia, pero es de donde la PLAME lee el T-Registro '
      'de cuarta: vaciarla no la convierte en prescindible.';
  END IF;

  IF to_regclass('public.configuracion_retenciones') IS NULL THEN
    RAISE EXCEPTION
      'VERIFY_506: falta configuracion_retenciones, que tiene datos reales en produccion';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Y `libro_retenciones` conserva las columnas por las que la consulta la
  --    planilla electronica. Son las del `select` de
  --    `planilla-electronica-peru.service.ts`, no una lista inventada: si
  --    desaparece cualquiera, el T-Registro de cuarta revienta en tiempo de
  --    ejecucion y no antes.
  ---------------------------------------------------------------------------
  SELECT count(*) INTO v_filas
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'libro_retenciones'
    AND column_name IN (
      'tenant_id', 'proveedor_id', 'numero_comprobante', 'fecha_emision',
      'fecha_pago', 'monto_pago', 'tasa_retencion', 'monto_retencion',
      'monto_neto', 'estado', 'categoria_retencion'
    );

  IF v_filas < 11 THEN
    RAISE EXCEPTION
      'VERIFY_506: libro_retenciones tiene % de las 11 columnas que consulta la planilla electronica', v_filas;
  END IF;

  RAISE NOTICE
    'VERIFY_506 OK: la tabla sin uso retirada, y libro_retenciones y configuracion_retenciones intactas';
END;
$verify$;

ROLLBACK;
