import { WorkerRuntimeConfig } from './runtime-config';

export async function startWorkerAfterReadiness(
  config: Pick<WorkerRuntimeConfig, 'apiBase' | 'requiredSchemaVersion'>,
  loadJobs: () => Promise<unknown>,
  request: typeof fetch = fetch,
): Promise<void> {
  const response = await request(`${config.apiBase}/health/ready`, {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('La API no está lista para iniciar el worker');
  const result = await response.json() as any;
  const db = result?.checks?.database;
  const contract = db?.contract;
  if (result?.status !== 'ready' || db?.ready !== true || result?.checks?.redis?.ready !== true
    || contract?.required_schema_applied !== true || contract?.service_role_reads !== true || contract?.outbox_rpcs !== true
    || !Number.isSafeInteger(contract?.schema_version) || !Number.isSafeInteger(contract?.required_schema_version)
    || contract.required_schema_version < config.requiredSchemaVersion || contract.schema_version < contract.required_schema_version) {
    throw new Error('Readiness de API, Redis o esquema incompatible con el worker');
  }
  // No registrar consumidores BullMQ, crons ni clientes de jobs antes del gate.
  await loadJobs();
}
