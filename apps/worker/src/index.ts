import { runtimeConfig } from './runtime-environment';
import { startWorkerAfterReadiness } from './startup-readiness';

void startWorkerAfterReadiness(runtimeConfig, () => import('./runtime-worker')).catch(error => {
  console.error('Worker detenido antes de iniciar jobs:', error instanceof Error ? error.message : 'Readiness inválido');
  process.exitCode = 1;
});
