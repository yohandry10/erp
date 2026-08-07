BEGIN;

ALTER TABLE public.normativa_colombia_periodos
  ADD COLUMN IF NOT EXISTS jornada_semanal numeric(6,2) NOT NULL DEFAULT 42,
  ADD COLUMN IF NOT EXISTS recargo_dominical_festivo numeric(9,6) NOT NULL DEFAULT 0.90,
  ADD COLUMN IF NOT EXISTS recargo_nocturno numeric(9,6) NOT NULL DEFAULT 0.35,
  ADD COLUMN IF NOT EXISTS hora_inicio_nocturna smallint NOT NULL DEFAULT 19,
  ADD COLUMN IF NOT EXISTS uvt numeric(14,2) NOT NULL DEFAULT 52374,
  ADD COLUMN IF NOT EXISTS tope_ibc_smmlv numeric(8,2) NOT NULL DEFAULT 25;

ALTER TABLE public.normativa_colombia_periodos
  DROP CONSTRAINT IF EXISTS ck_normativa_colombia_laboral_2026;
ALTER TABLE public.normativa_colombia_periodos
  ADD CONSTRAINT ck_normativa_colombia_laboral_2026 CHECK (
    jornada_semanal > 0 AND horas_mensuales > 0
    AND recargo_dominical_festivo BETWEEN 0 AND 2
    AND recargo_nocturno BETWEEN 0 AND 1
    AND hora_inicio_nocturna BETWEEN 0 AND 23
    AND uvt > 0 AND tope_ibc_smmlv > 0
  );

-- La reducción a 42 horas opera desde el 15 de julio de 2026. Para planillas
-- mensuales se versiona desde 2026-07; los periodos anteriores conservan 230.
UPDATE public.normativa_colombia_periodos
SET horas_mensuales = 210,
    jornada_semanal = 42,
    recargo_dominical_festivo = 0.90,
    recargo_nocturno = 0.35,
    hora_inicio_nocturna = 19,
    uvt = 52374,
    tope_ibc_smmlv = 25,
    fuente = 'Ley 2101/2021; Ley 2466/2025; Res. DIAN 238/2025; UGPP',
    updated_at = now()
WHERE periodo >= '2026-07';

UPDATE public.normativa_colombia_periodos
SET recargo_dominical_festivo = CASE WHEN periodo >= '2026-07' THEN 0.90 ELSE 0.80 END,
    recargo_nocturno = 0.35,
    hora_inicio_nocturna = 19,
    uvt = 52374,
    tope_ibc_smmlv = 25,
    updated_at = now()
WHERE periodo BETWEEN '2026-01' AND '2026-06';

COMMENT ON COLUMN public.normativa_colombia_periodos.horas_mensuales IS
  'Divisor mensual de la jornada máxima legal: 210 desde 2026-07-15.';
COMMENT ON COLUMN public.normativa_colombia_periodos.recargo_dominical_festivo IS
  'Recargo ordinario por descanso obligatorio/festivo: 90% desde 2026-07-01.';

COMMIT;
