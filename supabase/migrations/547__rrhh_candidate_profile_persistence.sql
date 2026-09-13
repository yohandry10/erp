BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';

-- La pantalla ya captura estado civil; el writer lo descartaba. Sin default
-- ni backfill: no se inventa información personal para candidatos existentes.
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS estado_civil text;

DO $migration$
DECLARE
  definition text;
  fragment text;
BEGIN
  SELECT pg_get_functiondef('public.ejecutar_operacion_rrhh_tx(uuid,uuid,text,jsonb,text)'::regprocedure)
    INTO definition;
  fragment := '''tipo_documento'',''fecha_nacimiento'',''direccion'',''nivel_educacion'',''experiencia_anos'',';
  IF (length(definition)-length(replace(definition,fragment,'')))/length(fragment) <> 2 THEN
    RAISE EXCEPTION 'RRHH_547_WRITER_PICK_CONTRACT_CHANGED';
  END IF;
  definition := replace(definition,fragment,
    '''tipo_documento'',''fecha_nacimiento'',''direccion'',''nivel_educacion'',''experiencia_anos'',''estado_civil'',');
  fragment := 'fecha_nacimiento,direccion,nivel_educacion,experiencia_anos,pretension_salarial,';
  IF strpos(definition,fragment)=0 THEN RAISE EXCEPTION 'RRHH_547_INSERT_CONTRACT_CHANGED'; END IF;
  definition := replace(definition,fragment,
    'fecha_nacimiento,direccion,nivel_educacion,experiencia_anos,estado_civil,pretension_salarial,');
  fragment := 'v_candidate.nivel_educacion,v_candidate.experiencia_anos,v_candidate.pretension_salarial,';
  IF strpos(definition,fragment)=0 THEN RAISE EXCEPTION 'RRHH_547_VALUES_CONTRACT_CHANGED'; END IF;
  definition := replace(definition,fragment,
    'v_candidate.nivel_educacion,v_candidate.experiencia_anos,v_candidate.estado_civil,v_candidate.pretension_salarial,');
  fragment := 'experiencia_anos=v_candidate.experiencia_anos,pretension_salarial=v_candidate.pretension_salarial,';
  IF strpos(definition,fragment)=0 THEN RAISE EXCEPTION 'RRHH_547_UPDATE_CONTRACT_CHANGED'; END IF;
  definition := replace(definition,fragment,
    'experiencia_anos=v_candidate.experiencia_anos,estado_civil=v_candidate.estado_civil,pretension_salarial=v_candidate.pretension_salarial,');
  EXECUTE definition;
END;
$migration$;

-- Conserva la misma transacción, actor, permisos, huella, auditoría y replay
-- del writer 475. No cambia ACL/RLS ni habilita DML del runtime.
-- Rollback: detener el runtime incompatible y restaurar la definición previa
-- del writer desde respaldo. Conservar la columna para no borrar evidencia.
COMMIT;
