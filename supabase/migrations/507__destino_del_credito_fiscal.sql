-- 507__destino_del_credito_fiscal.sql
--
-- La prorrata del credito fiscal no existia. El sistema ya registraba las
-- ventas exoneradas e inafectas --las usa para el coeficiente de renta-- pero el
-- IGV de compras entraba entero al credito fiscal sin importar a que operacion
-- estuviera destinada la compra.
--
-- Para un contribuyente que solo hace operaciones gravadas eso da el mismo
-- numero y por eso no se nota. Para uno con operaciones mixtas --venta de
-- productos gravados y de productos exonerados, que en Peru es de lo mas
-- comun-- significa tomar credito fiscal de mas todos los meses.
--
-- La regla del articulo 23 de la Ley del IGV distingue tres destinos, y la
-- distincion no la puede deducir el sistema: la hace quien registra la compra,
-- porque depende de para que se uso el bien o servicio.
--
--     GRAVADAS      credito integro
--     NO_GRAVADAS   sin credito
--     COMUN         credito por el coeficiente de los ultimos doce meses
--
-- El defecto es `GRAVADAS`, que es exactamente el comportamiento de hoy: aplicar
-- esta migracion no cambia ni un importe de ninguna declaracion ya calculada.
-- Quien tenga operaciones mixtas empieza a clasificar y la prorrata aparece
-- sola; quien no las tenga no nota nada.

BEGIN;

ALTER TABLE IF EXISTS public.cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS destino_credito_fiscal text NOT NULL DEFAULT 'GRAVADAS';

-- Normaliza y valida en un solo sitio, para que el API no tenga que fiarse de
-- que quien escribe mande el valor en mayusculas.
CREATE OR REPLACE FUNCTION app.normalize_destino_credito_fiscal_507()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.destino_credito_fiscal := upper(btrim(COALESCE(NEW.destino_credito_fiscal, 'GRAVADAS')));
  IF NEW.destino_credito_fiscal = '' THEN
    NEW.destino_credito_fiscal := 'GRAVADAS';
  END IF;

  IF NEW.destino_credito_fiscal NOT IN ('GRAVADAS', 'NO_GRAVADAS', 'COMUN') THEN
    RAISE EXCEPTION
      'CREDITO_FISCAL: destino % no reconocido; los del articulo 23 de la Ley del IGV son GRAVADAS, NO_GRAVADAS y COMUN',
      NEW.destino_credito_fiscal;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_destino_credito_fiscal_507 ON public.cuentas_por_pagar;
CREATE TRIGGER trg_normalize_destino_credito_fiscal_507
BEFORE INSERT OR UPDATE ON public.cuentas_por_pagar
FOR EACH ROW
EXECUTE FUNCTION app.normalize_destino_credito_fiscal_507();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_cuentas_por_pagar_destino_credito_fiscal'
  ) THEN
    ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_destino_credito_fiscal
      CHECK (destino_credito_fiscal IN ('GRAVADAS', 'NO_GRAVADAS', 'COMUN')) NOT VALID;
    ALTER TABLE public.cuentas_por_pagar
      VALIDATE CONSTRAINT ck_cuentas_por_pagar_destino_credito_fiscal;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_destino_credito
ON public.cuentas_por_pagar (tenant_id, destino_credito_fiscal, fecha_emision);

COMMIT;
