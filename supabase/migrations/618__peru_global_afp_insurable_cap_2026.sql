BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Remuneración máxima asegurable AFP (tope de la prima de seguro) de la
-- normativa global Perú 2026. La 332 sembró los doce períodos y la 583 añadió
-- la columna sin valor: sin él, la planilla rechaza calcular una prima AFP y
-- cada empresa tenía que registrar su propia normativa para poder pagar.
--
-- Valores publicados por la SBS por mes de devengue (consulta del 2026-11-10).
-- Diciembre todavía no figura en esa consulta: lleva el valor del trimestre
-- octubre-diciembre, porque el tope se actualiza por trimestre calendario, y
-- queda marcado como tal. Una empresa puede registrar su propia versión del
-- período si la SBS publicara otro valor.
--
-- Sólo completa filas globales activas sin tope. No toca la normativa propia
-- de ninguna empresa, no pisa un valor ya registrado y no recalcula planillas:
-- cada una conserva la norma usada en su cálculo. Rollback: devolver a NULL el
-- tope de las filas cuya fuente cita esta migración.
DO $cap618$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('2026-01', 12209.11::numeric, 'SBS_MES_DE_DEVENGUE'),
    ('2026-02', 12209.11::numeric, 'SBS_MES_DE_DEVENGUE'),
    ('2026-03', 12209.11::numeric, 'SBS_MES_DE_DEVENGUE'),
    ('2026-04', 12598.91::numeric, 'SBS_MES_DE_DEVENGUE'),
    ('2026-05', 12598.91::numeric, 'SBS_MES_DE_DEVENGUE'),
    ('2026-06', 12598.91::numeric, 'SBS_MES_DE_DEVENGUE'),
    ('2026-07', 12672.65::numeric, 'SBS_MES_DE_DEVENGUE'),
    ('2026-08', 12672.65::numeric, 'SBS_MES_DE_DEVENGUE'),
    ('2026-09', 12672.65::numeric, 'SBS_MES_DE_DEVENGUE'),
    ('2026-10', 12732.70::numeric, 'SBS_MES_DE_DEVENGUE'),
    ('2026-11', 12732.70::numeric, 'SBS_MES_DE_DEVENGUE'),
    ('2026-12', 12732.70::numeric, 'SBS_TRIMESTRE_OCTUBRE_DICIEMBRE')
  ) AS oficial(periodo, tope, base)
  LOOP
    UPDATE public.normativa_peru_periodos n
       SET afp_remuneracion_max_asegurable = r.tope,
           fuente = COALESCE(n.fuente, '{}'::jsonb) || jsonb_build_object(
             'afp_remuneracion_max_asegurable', jsonb_build_object(
               'valor', r.tope,
               'base', r.base,
               'url', 'https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/Paginas/comision_prima.aspx',
               'consultado', '2026-11-10',
               'source_migration', '618__peru_global_afp_insurable_cap_2026')),
           updated_at = now()
     WHERE n.tenant_id IS NULL
       AND n.activo
       AND n.periodo = r.periodo
       AND n.afp_remuneracion_max_asegurable IS NULL;

    -- Con RLS forzado, un rol sin BYPASSRLS actualizaría cero filas sin error.
    -- La migración no puede confirmar dejando un período sin tope.
    IF NOT EXISTS (
      SELECT 1 FROM public.normativa_peru_periodos n
       WHERE n.tenant_id IS NULL AND n.activo AND n.periodo = r.periodo
         AND n.afp_remuneracion_max_asegurable IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'NORMATIVA_618_GLOBAL_CAP_NOT_APPLIED: %', r.periodo;
    END IF;
  END LOOP;
END;
$cap618$;

COMMIT;
