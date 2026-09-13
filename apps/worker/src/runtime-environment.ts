import { loadWorkerEnvironment, loadWorkerRuntimeConfig } from './runtime-config';

// Importar antes de los jobs: algunos crean clientes al cargar el módulo.
loadWorkerEnvironment();
export const runtimeConfig = loadWorkerRuntimeConfig(process.env);
