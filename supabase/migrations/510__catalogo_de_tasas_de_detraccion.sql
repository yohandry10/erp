-- 510__catalogo_de_tasas_de_detraccion.sql
--
-- La detraccion se teclea como importe suelto. La retencion y la percepcion si
-- tienen tasa configurada y validada --`RetencionesValidationService` la
-- comprueba-- pero la detraccion no tiene ni tasa ni catalogo: nada impide
-- escribir un 12 % donde correspondia un 4 %, ni al reves.
--
-- Esta migracion pone el mecanismo: un catalogo de codigos de bien o servicio
-- del sistema SPOT con su tasa y su vigencia, y una funcion que calcula el
-- importe que corresponde. La cuenta por pagar gana un `codigo_detraccion`.
--
-- **El catalogo se crea vacio, y es deliberado.** Las tasas y los codigos los
-- fija SUNAT por resolucion y cambian; cargarlos de memoria en una migracion
-- seria escribir en el sistema numeros que nadie ha verificado contra la fuente,
-- y una detraccion mal depositada es una multa mas la perdida del credito
-- fiscal. Quien carga el catalogo lo hace contra el anexo vigente, y hasta
-- entonces el sistema se comporta exactamente como hoy: acepta el importe que le
-- teclean.
--
-- Con el catalogo cargado, la funcion no impone nada: **compara**. Si el importe
-- declarado no coincide con el que sale del codigo, la diferencia se ve. Imponer
-- seria peor: hay operaciones con reglas especiales y el contador tiene que
-- poder apartarse del catalogo a sabiendas.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tasas_detraccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  descripcion text NOT NULL,
  anexo text,
  tasa numeric(5,4) NOT NULL,
  importe_minimo numeric(12,2),
  vigente_desde date NOT NULL,
  vigente_hasta date,
  fuente text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_tasas_detraccion_tasa CHECK (tasa > 0 AND tasa <= 1),
  CONSTRAINT ck_tasas_detraccion_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);

-- Un codigo puede cambiar de tasa: lo que no puede es tener dos tasas a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tasas_detraccion_codigo_vigencia
ON public.tasas_detraccion (codigo, vigente_desde);

CREATE INDEX IF NOT EXISTS idx_tasas_detraccion_codigo
ON public.tasas_detraccion (codigo, vigente_desde DESC);

-- El catalogo es normativa nacional, no dato del contribuyente: se lee por
-- cualquiera y solo lo escribe el service_role.
ALTER TABLE public.tasas_detraccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasas_detraccion FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasas_detraccion_read_all ON public.tasas_detraccion;
CREATE POLICY tasas_detraccion_read_all ON public.tasas_detraccion FOR SELECT USING (true);

ALTER TABLE IF EXISTS public.cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS codigo_detraccion text;

COMMENT ON COLUMN public.cuentas_por_pagar.codigo_detraccion IS
  'Codigo de bien o servicio sujeto al SPOT. Referencia a public.tasas_detraccion; sin catalogo cargado no se valida nada.';

-- ----------------------------------------------------------------------------
-- La tasa vigente para un codigo en una fecha
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tasa_detraccion_vigente(
  p_codigo text,
  p_fecha date DEFAULT current_date
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT t.tasa
  FROM public.tasas_detraccion t
  WHERE btrim(t.codigo) = btrim(COALESCE(p_codigo, ''))
    AND t.vigente_desde <= p_fecha
    AND (t.vigente_hasta IS NULL OR t.vigente_hasta >= p_fecha)
  ORDER BY t.vigente_desde DESC
  LIMIT 1;
$$;

-- ----------------------------------------------------------------------------
-- La comparacion, que no impone
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.contrastar_detraccion_510()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tasa numeric;
  v_esperado numeric;
BEGIN
  NEW.codigo_detraccion := NULLIF(btrim(COALESCE(NEW.codigo_detraccion, '')), '');
  IF NEW.codigo_detraccion IS NULL THEN
    RETURN NEW;
  END IF;

  v_tasa := public.tasa_detraccion_vigente(
    NEW.codigo_detraccion,
    COALESCE(NEW.fecha_emision, current_date)
  );

  -- Codigo que el catalogo no conoce: se avisa y se deja pasar. Bloquear aqui
  -- impediria registrar una compra por un catalogo incompleto, que es peor.
  IF v_tasa IS NULL THEN
    RAISE WARNING
      'DETRACCION: el codigo % no esta en el catalogo vigente; el importe declarado no se contrasta',
      NEW.codigo_detraccion;
    RETURN NEW;
  END IF;

  v_esperado := round(COALESCE(NEW.total, 0) * v_tasa, 2);

  IF round(COALESCE(NEW.detraccion_total, 0), 2) IS DISTINCT FROM v_esperado THEN
    RAISE WARNING
      'DETRACCION: el codigo % al %%% sobre % da %, y se declaro %',
      NEW.codigo_detraccion, round(v_tasa * 100, 2), round(COALESCE(NEW.total, 0), 2),
      v_esperado, round(COALESCE(NEW.detraccion_total, 0), 2);
  END IF;

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'detraccion_contraste', jsonb_build_object(
      'codigo', NEW.codigo_detraccion,
      'tasa', v_tasa,
      'importe_esperado', v_esperado,
      'importe_declarado', round(COALESCE(NEW.detraccion_total, 0), 2)
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrastar_detraccion_510 ON public.cuentas_por_pagar;
CREATE TRIGGER trg_contrastar_detraccion_510
BEFORE INSERT OR UPDATE ON public.cuentas_por_pagar
FOR EACH ROW
EXECUTE FUNCTION app.contrastar_detraccion_510();

COMMIT;
