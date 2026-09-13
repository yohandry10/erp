import { UnrecoverableError } from 'bullmq';

// Esta cola histórica carece de actor, tipo de registro e idempotencia. No puede
// sustituir generar_reporte_sire_tx ni inventar una ruta de archivo terminado.
export async function rejectLegacySireGeneration(): Promise<never> {
  throw new UnrecoverableError(
    'SIRE_LEGACY_QUEUE_RETIRED: genere la instantánea mediante /api/sire/generar-reporte con actor, tipo de registro e idempotencia',
  );
}
