import { runtimeConfig } from './runtime-environment';
import { createClient } from '@supabase/supabase-js';
import { Worker, Queue, UnrecoverableError } from 'bullmq';
import cron from 'node-cron';
import winston from 'winston';
// Redis import removed as it's not used directly
import { EventEmitter } from 'events';
import { runCertificateValidationJob } from './jobs/certificate-validation.job';
import { runConfigurationCheckJob } from './jobs/configuration-check.job';
import { runPosCpeRetryJob } from './jobs/pos-cpe-retry.job';
import { runPosFacturaPendienteJob } from './jobs/pos-facturacion-pendiente.job';
import { rejectLegacySireGeneration } from './jobs/legacy-sire.job';
import axios from 'axios';
import { parseCpeDeliveryResult, parseGreDeliveryResult, cpeWorkerIdentity } from './api-response';
import jwt from 'jsonwebtoken';


// ERP API base (para endpoints protegidos con service role)
const apiBase = runtimeConfig.apiBase;
const healthPort = runtimeConfig.healthPort;

// Métricas básicas en memoria
const metrics = {
  posCpeRetry: { runs: 0, procesadas: 0, errores: 0, omitidas: 0 },
  posFacturacionDb: { runs: 0, procesadas: 0, errores: 0 },
};

function renderPrometheusMetrics(): string {
  const lines = [
    '# HELP erp_worker_up Worker process liveness.',
    '# TYPE erp_worker_up gauge',
    'erp_worker_up 1',
    '# HELP erp_worker_pos_cpe_retry_runs_total POS CPE retry job runs.',
    '# TYPE erp_worker_pos_cpe_retry_runs_total counter',
    `erp_worker_pos_cpe_retry_runs_total ${metrics.posCpeRetry.runs}`,
    '# HELP erp_worker_pos_cpe_retry_processed_total POS CPE retry processed documents.',
    '# TYPE erp_worker_pos_cpe_retry_processed_total counter',
    `erp_worker_pos_cpe_retry_processed_total ${metrics.posCpeRetry.procesadas}`,
    '# HELP erp_worker_pos_cpe_retry_errors_total POS CPE retry job errors.',
    '# TYPE erp_worker_pos_cpe_retry_errors_total counter',
    `erp_worker_pos_cpe_retry_errors_total ${metrics.posCpeRetry.errores}`,
    '# HELP erp_worker_pos_cpe_retry_skipped_total POS CPE retry skipped documents.',
    '# TYPE erp_worker_pos_cpe_retry_skipped_total counter',
    `erp_worker_pos_cpe_retry_skipped_total ${metrics.posCpeRetry.omitidas}`,
    '# HELP erp_worker_pos_invoicing_runs_total POS pending invoicing job runs.',
    '# TYPE erp_worker_pos_invoicing_runs_total counter',
    `erp_worker_pos_invoicing_runs_total ${metrics.posFacturacionDb.runs}`,
    '# HELP erp_worker_pos_invoicing_processed_total POS pending invoicing processed documents.',
    '# TYPE erp_worker_pos_invoicing_processed_total counter',
    `erp_worker_pos_invoicing_processed_total ${metrics.posFacturacionDb.procesadas}`,
    '# HELP erp_worker_pos_invoicing_errors_total POS pending invoicing job errors.',
    '# TYPE erp_worker_pos_invoicing_errors_total counter',
    `erp_worker_pos_invoicing_errors_total ${metrics.posFacturacionDb.errores}`,
  ];

  return `${lines.join('\n')}\n`;
}

// Registro operativo estructurado para crons globales y de empresa.
async function logCronRun(entry: {
  tenant_id?: string;
  servicio: string;
  operacion: string;
  status: 'SUCCESS' | 'ERROR';
  error_message?: string;
  request_summary?: any;
  response_summary?: any;
}) {
  // Un cron global no tiene tenant UUID. Se registra como evento operativo;
  // usar el literal "system" en integration_logs producía un error ignorado.
  logger.log({
    level: entry.status === 'ERROR' ? 'error' : 'info',
    message: 'Resultado del cron',
    servicio: entry.servicio,
    operacion: entry.operacion,
    status: entry.status,
    ...(entry.tenant_id ? { tenant_id: entry.tenant_id } : {}),
    ...(entry.error_message ? { error_message: entry.error_message } : {}),
    request_summary: entry.request_summary,
    response_summary: entry.response_summary,
  });
}
// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
  ],
});

// Supabase client
const supabase = createClient(
  runtimeConfig.supabaseUrl,
  runtimeConfig.supabaseServiceRoleKey
);

// Redis connection
const redisConnection = {
  host: runtimeConfig.redisHost,
  port: runtimeConfig.redisPort,
  password: runtimeConfig.redisPassword,
};

// Job queues
const cpeQueue = new Queue('cpe-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 }, // backoff extra para CPE
    removeOnComplete: true,
    removeOnFail: false,
  },
});
const greQueue = new Queue('gre-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }, // backoff extra para GRE
    removeOnComplete: true,
    removeOnFail: false,
  },
});
const sireQueue = new Queue('sire-processing', { connection: redisConnection });

// CPE Processing Worker con configuración de reintentos
const cpeWorker = new Worker('cpe-processing', async (job) => {
  logger.info(`Processing CPE job: ${job.id} (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 3})`);

  const { cpeId } = job.data;
  const action = job.data.action ?? job.name;

  try {
    switch (action) {
      case 'SEND_TO_OSE':
        await processCpeSendToOse(cpeId);
        break;
      case 'CHECK_STATUS':
        await processCpeCheckStatus(cpeId, `cpe-query-${job.id}`);
        break;
      case 'GENERATE_PDF':
        await processCpeGeneratePdf(cpeId);
        break;
      default:
        throw new Error(`Unknown CPE action: ${action}`);
    }

    logger.info(`CPE job ${job.id} completed successfully`);
  } catch (error: any) {
    logger.error(`CPE job ${job.id} failed (attempt ${job.attemptsMade + 1}):`, error.message);

    // Si es un error de "not implemented", no reintentar
    if (error.message?.includes('not implemented')) {
      throw new UnrecoverableError(error.message);
    }

    throw error;
  }
}, {
  connection: redisConnection,
  settings: {
    // Configuración de reintentos con backoff exponencial
    backoffStrategy: (attemptsMade: number) => {
      return Math.min(Math.pow(2, attemptsMade) * 1000, 60000); // Max 1 minuto
    }
  }
});

// SIRE Processing Worker con límites de reintentos
const sireWorker = new Worker('sire-processing', async (job) => {
  logger.info(`Processing SIRE job: ${job.id}`);

  try {
    await rejectLegacySireGeneration();
  } catch (error) {
    logger.error(`SIRE job ${job.id} failed:`, error);
    throw error;
  }
}, {
  connection: redisConnection,
  limiter: {
    max: 5,
    duration: 1000,
  },
  settings: {
    backoffStrategy: (attemptsMade: number) => {
      return Math.min(Math.pow(2, attemptsMade) * 1000, 60000);
    },
  },
});

// Helpers SUNAT/OSE: usar API ERP con token de servicio
// Helpers SUNAT/OSE: usar API ERP con token de servicio
function signWorkerToken(tenantId: string, actorId?: string) {
  return jwt.sign(
    {
      iss: 'pos.worker',
      sub: 'worker-service',
      ...(actorId ? { actor_id: actorId } : {}),
      tenant_id: tenantId,
      scope: 'pos.worker',
      role: 'service_role' // O un rol específico si se configura en el API
    },
    runtimeConfig.workerJwtSecret,
    { expiresIn: '5m' }
  );
}

function getAuthHeaders(tenantId: string, actorId?: string) {
  try {
    const token = signWorkerToken(tenantId, actorId);
    return {
      'Authorization': `Bearer ${token}`,
      'X-Tenant-Id': tenantId
    };
  } catch (error) {
    logger.error(`Error generando token para tenant ${tenantId}:`, error);
    // Fail fast: sin token no se debe llamar al API
    throw new Error('POS_WORKER_JWT_SECRET inválido o ausente; abortando llamada');
  }
}

async function processCpeSendToOse(cpeId: string) {
  return processCpeDelivery(cpeId, 'SEND');
}

async function processCpeCheckStatus(cpeId: string, idempotencyKey: string) {
  return processCpeDelivery(cpeId, 'QUERY', idempotencyKey);
}

async function processCpeDelivery(cpeId: string, action: 'SEND' | 'QUERY', idempotencyKey?: string) {
  const { data: cpe, error } = await supabase.from('cpe')
    .select('id, tenant_id, created_by').eq('id', cpeId).single();
  if (error || !cpe) throw new Error(`No se pudo leer el CPE ${cpeId}`);
  const { tenantId, actorId } = cpeWorkerIdentity(cpe);
  const options = { headers: { ...getAuthHeaders(tenantId, actorId),
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) }, timeout: 45000 };
  const response = action === 'SEND'
    ? await axios.post(`${apiBase}/cpe/worker/${cpeId}/enviar-sunat`, {}, options)
    : await axios.get(`${apiBase}/cpe/worker/${cpeId}/status`, options);
  const result = parseCpeDeliveryResult(response.data);
  logger.info('Resultado de operación CPE', { cpeId, action, result, operationId: response.data.operationId });
  if (result === 'REJECTED') throw new UnrecoverableError('CPE rechazado por la autoridad fiscal');
  return { success: true, result };
}

async function processCpeGeneratePdf(cpeId: string) {
  const { data: cpe, error } = await supabase.from('cpe').select('id, tenant_id').eq('id', cpeId).single();
  if (error || !cpe) throw new Error(`No se pudo leer el CPE ${cpeId}`);
  const response = await axios.get(`${apiBase}/cpe/worker/comprobantes/${cpeId}/pdf`, {
    headers: getAuthHeaders(cpe.tenant_id), responseType: 'arraybuffer', timeout: 30000,
  });
  const pdf = Buffer.from(response.data);
  if (response.status !== 200 || pdf.length < 5 || pdf.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('El generador no devolvió un PDF válido');
  }
  // La API es dueña del documento; no fingir persistencia con un UPDATE rechazado.
  logger.info('Representación PDF generada', { cpeId, bytes: pdf.length });
  return { success: true };
}

// Scheduled Jobs
cron.schedule('0 */6 * * *', async () => {
  logger.info('Running scheduled CPE status check');

  try {
    const { data: pendingCpes, error } = await supabase
      .from('cpe')
      .select('id')
      .eq('estado', 'ENVIADO')
      .eq('sunat_status', 'SENDING')
      .lt('fecha_envio', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .limit(100)
      .order('fecha_envio', { ascending: true });

    if (error) {
      logger.error('Error fetching pending CPEs for status check:', error);
      return;
    }

    logger.info(`Found ${pendingCpes?.length ?? 0} pending CPEs for status check`);
    for (const cpe of pendingCpes || []) {
      await cpeQueue.add('CHECK_STATUS', { cpeId: cpe.id, action: 'CHECK_STATUS' },
        { jobId: `cpe-check-${cpe.id}-${Math.floor(Date.now() / 21600000)}` });
    }
  } catch (err) {
    logger.error('CPE status cron failed:', err);
  }
});

// Health check endpoint for container orchestration
const healthCheck = () => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    queues: {
      cpe: cpeQueue.name,
      gre: greQueue.name,
      sire: sireQueue.name,
    },
    metrics,
    uptimeSeconds: Math.floor(process.uptime()),
  };
};

// Error handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown (single handler — avoids duplicate SIGTERM race)
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  try {
    await cpeWorker.close();
    await sireWorker.close();
  } catch (err) {
    logger.error('Error during graceful shutdown:', err);
  }
  process.exit(0);
});

logger.info('Worker started successfully');
logger.info('Health check available:', healthCheck());

// 🚀 WORKER DE BACKGROUND PARA AUTOMATIZACIÓN ERP
console.log('🤖 [Worker] Iniciando Worker de Background para Sistema ERP...');

// Event Bus para comunicación
const eventBus = new EventEmitter();
eventBus.setMaxListeners(100);

interface TaskConfig {
  id: string;
  type: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  maxRetries: number;
  retryDelay: number; // milliseconds
  processor: (data: any) => Promise<boolean>;
}

class BackgroundWorker {
  private tasks: Map<string, TaskConfig> = new Map();
  private processingQueue: Array<{ taskId: string; data: any; attempt: number }> = [];
  private isRunning = false;

  constructor() {
    this.registerTasks();
    this.startProcessing();
    console.log('✅ [Worker] Background Worker inicializado correctamente');
  }

  private registerTasks() {
    // 📨 TAREA: Reenvío de CPE a SUNAT
    this.tasks.set('cpe.retry_envio', {
      id: 'cpe.retry_envio',
      type: 'SUNAT_RETRY',
      priority: 'HIGH',
      maxRetries: 5,
      retryDelay: 5 * 60 * 1000, // 5 minutos
      processor: this.processCpeRetry.bind(this)
    });

    // 📨 TAREA: Reenvío de GRE a SUNAT
    this.tasks.set('gre.retry_envio', {
      id: 'gre.retry_envio',
      type: 'SUNAT_RETRY',
      priority: 'HIGH',
      maxRetries: 5,
      retryDelay: 5 * 60 * 1000,
      processor: this.processGreRetry.bind(this)
    });

    // 📦 TAREA: Verificación de stock crítico
    this.tasks.set('inventory.check_critical_stock', {
      id: 'inventory.check_critical_stock',
      type: 'INVENTORY_CHECK',
      priority: 'MEDIUM',
      maxRetries: 2,
      retryDelay: 15 * 60 * 1000, // 15 minutos
      processor: this.checkCriticalStock.bind(this)
    });

    console.log(`📋 [Worker] ${this.tasks.size} tareas registradas`);
  }

  // 📨 PROCESADOR: Reintento de envío CPE a SUNAT
  private async processCpeRetry(data: any): Promise<boolean> {
    try {
      await processCpeSendToOse(data.cpeId);
      return true;
    } catch (error) {
      logger.error('No se pudo reintentar CPE', { cpeId: data.cpeId, error: error instanceof Error ? error.message : 'Error fiscal' });
      return false;
    }
  }

  // 📨 PROCESADOR: Reintento de envío GRE a SUNAT
  private async processGreRetry(data: any): Promise<boolean> {
    try {
      const { data: gre, error } = await supabase.from('gre_guias')
        .select('id, tenant_id, estado, retry_count').eq('id', data.greId).maybeSingle();
      if (error || !gre) throw new Error('No se pudo leer la guía de remisión');
      if (['ACEPTADO', 'ENVIADO'].includes(gre.estado)) return true;
      if (!['FIRMADO', 'ERROR'].includes(gre.estado)) throw new Error('La guía no está lista para envío');
      const retryCount = Number(gre.retry_count ?? 0);
      if (!Number.isSafeInteger(retryCount) || retryCount < 0) throw new Error('Contador GRE inválido');
      const idempotencyKey = `gre.send:${gre.tenant_id}:${gre.id}:attempt:${retryCount + 1}`;
      const response = await axios.post(`${apiBase}/gre/worker/${gre.id}/enviar-sunat`, {}, {
        headers: { ...getAuthHeaders(gre.tenant_id), 'Idempotency-Key': idempotencyKey }, timeout: 30000,
      });
      const result = parseGreDeliveryResult(response.data);
      logger.info('Resultado GRE', { greId: gre.id, result });
      return true;
    } catch (error) {
      logger.error('No se pudo reintentar GRE', { greId: data.greId, error: error instanceof Error ? error.message : 'Error fiscal' });
      return false;
    }
  }

  // 📦 PROCESADOR: Verificación de stock crítico
  private async checkCriticalStock(_data: any): Promise<boolean> {
    try {
      console.log('📦 [Worker] Verificando stock crítico...');

      // Traer stock y mínimo con tenant_id, filtrar en memoria para evitar comparaciones columna-columna en PostgREST
      const { data: productos, error } = await supabase
        .from('productos')
        .select('tenant_id, codigo, nombre, stock, stock_minimo');

      if (error) {
        console.error('❌ [Worker] Error consultando stock crítico:', error);
        return false;
      }

      const criticos =
        (productos || []).filter((p: any) => {
          const stock = Number(p?.stock ?? 0);
          const minimo = Number(p?.stock_minimo ?? 0);
          return !Number.isNaN(stock) && !Number.isNaN(minimo) && stock < minimo;
        }) || [];

      if (criticos.length === 0) {
        console.log('✅ [Worker] Todos los productos tienen stock adecuado');
        return true;
      }

      // Agrupar por tenant para separar la información por contexto
      const criticosPorTenant = new Map<string, typeof criticos>();
      for (const p of criticos) {
        const tid = (p as any).tenant_id || 'sin-tenant';
        if (!criticosPorTenant.has(tid)) criticosPorTenant.set(tid, []);
        criticosPorTenant.get(tid)!.push(p);
      }

      console.log(`⚠️ [Worker] ${criticos.length} productos con stock crítico detectados en ${criticosPorTenant.size} tenant(s)`);
      for (const [tid, items] of criticosPorTenant) {
        console.log(`⚠️ [Worker] Tenant ${tid}: ${items.length} productos con stock crítico`);
      }

      return true;
    } catch (error) {
      console.error('❌ [Worker] Error verificando stock:', error);
      return false;
    }
  }

  // MOTOR DE PROCESAMIENTO
  public addTask(taskId: string, data: any, attempt: number = 1) {
    if (!this.tasks.has(taskId)) {
      console.error(`❌ [Worker] Tarea desconocida: ${taskId}`);
      return;
    }

    this.processingQueue.push({ taskId, data, attempt });
    console.log(`📝 [Worker] Tarea ${taskId} agregada a la cola (intento ${attempt})`);
  }

  private async startProcessing() {
    this.isRunning = true;
    console.log('🔄 [Worker] Motor de procesamiento iniciado');

    while (this.isRunning) {
      if (this.processingQueue.length > 0) {
        const { taskId, data, attempt } = this.processingQueue.shift()!;
        const taskConfig = this.tasks.get(taskId)!;

        try {
          console.log(`⚡ [Worker] Procesando tarea: ${taskId} (intento ${attempt}/${taskConfig.maxRetries})`);

          const success = await taskConfig.processor(data);

          if (success) {
            console.log(`✅ [Worker] Tarea ${taskId} completada exitosamente`);
          } else if (attempt < taskConfig.maxRetries) {
            // Programar reintento
            console.log(`🔄 [Worker] Reintentando tarea ${taskId} en ${taskConfig.retryDelay / 1000} segundos...`);

            setTimeout(() => {
              this.addTask(taskId, data, attempt + 1);
            }, taskConfig.retryDelay);
          } else {
            console.error(`❌ [Worker] Tarea ${taskId} falló después de ${taskConfig.maxRetries} intentos`);
          }
        } catch (error) {
          console.error(`❌ [Worker] Error ejecutando tarea ${taskId}:`, error);
        }
      }

      // Esperar 1 segundo antes del siguiente ciclo
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  public stop() {
    this.isRunning = false;
    console.log('🛑 [Worker] Motor de procesamiento detenido');
  }
}

// INICIALIZAR WORKER
const worker = new BackgroundWorker();

// TAREAS PROGRAMADAS

setInterval(() => {
  worker.addTask('inventory.check_critical_stock', {});
}, 15 * 60 * 1000); // Cada 15 minutos


// 🔐 SCHEDULED JOB: Certificate Validation (Daily at 2:00 AM)
cron.schedule('0 2 * * *', async () => {
  logger.info('🔐 [Cron] Running scheduled certificate validation job');
  try {
    await runCertificateValidationJob();
  } catch (error) {
    logger.error('❌ [Cron] Certificate validation job failed:', error);
  }
});

// ⚙️ SCHEDULED JOB: Configuration Check (Daily at 3:00 AM)
cron.schedule('0 3 * * *', async () => {
  logger.info('⚙️ [Cron] Running scheduled configuration check job');
  try {
    await runConfigurationCheckJob();
  } catch (error) {
    logger.error('❌ [Cron] Configuration check job failed:', error);
  }
});

// 🔄 SCHEDULED JOB: POS CPE Retry (Every 10 minutes)
cron.schedule('*/10 * * * *', async () => {
  logger.info('🔄 [Cron] Running scheduled POS CPE retry job');
  try {
    const result = await runPosCpeRetryJob();
    metrics.posCpeRetry.runs += 1;
    metrics.posCpeRetry.procesadas += result.procesadas;
    metrics.posCpeRetry.errores += result.errores;
    metrics.posCpeRetry.omitidas += result.omitidas;
    await logCronRun({
      servicio: 'POS_CPE_RETRY',
      operacion: 'CRON',
      status: result.success && result.errores === 0 ? 'SUCCESS' : 'ERROR',
      request_summary: { job: 'pos-cpe-retry' },
      response_summary: result,
    });
    logger.log(result.success ? 'info' : 'error', `[Cron] POS CPE retry finalizado: ${result.procesadas} procesadas, ${result.errores} errores, ${result.omitidas} omitidas`);
  } catch (error) {
    metrics.posCpeRetry.errores += 1;
    await logCronRun({
      servicio: 'POS_CPE_RETRY',
      operacion: 'CRON',
      status: 'ERROR',
      error_message: error instanceof Error ? error.message : `${error}`,
      request_summary: { job: 'pos-cpe-retry' },
    });
    logger.error('❌ [Cron] POS CPE retry job failed:', error);
  }
});

// 🔄 SCHEDULED JOB: POS Facturación Pendiente (Every 10 minutes)
cron.schedule('*/10 * * * *', async () => {
  logger.info('🧾 [Cron] Running scheduled POS pending invoicing job');
  try {
    const result = await runPosFacturaPendienteJob();
    metrics.posFacturacionDb.runs += 1;
    metrics.posFacturacionDb.procesadas += result.procesadas;
    metrics.posFacturacionDb.errores += result.errores;
    await logCronRun({
      servicio: 'POS_FACTURACION_DB',
      operacion: 'CRON',
      status: result.success && result.errores === 0 ? 'SUCCESS' : 'ERROR',
      request_summary: { job: 'pos-facturacion-db' },
      response_summary: result,
    });
    logger.log(result.success ? 'info' : 'error', `[Cron] POS facturación finalizada: ${result.procesadas} procesadas, ${result.errores} errores`);
  } catch (error) {
    metrics.posFacturacionDb.errores += 1;
    await logCronRun({
      servicio: 'POS_FACTURACION_DB',
      operacion: 'CRON',
      status: 'ERROR',
      error_message: error instanceof Error ? error.message : `${error}`,
      request_summary: { job: 'pos-facturacion-db' },
    });
    logger.error('❌ [Cron] POS pending invoicing job failed:', error);
  }
});

logger.info('📅 [Worker] Scheduled jobs configured:');
logger.info('   - Certificate validation: Daily at 2:00 AM');
logger.info('   - Configuration check: Daily at 3:00 AM');
logger.info('   - POS CPE retry: Every 10 minutes');
logger.info('   - POS pending invoicing: Every 10 minutes');

// Worker is ready and waiting for real tasks

// Servidor de salud/metrics ligero
import http from 'http';

const server = http.createServer((req, res) => {
  if (req.url === '/metrics') {
    // Require METRICS_TOKEN or HEALTH_TOKEN for metrics endpoint
    const metricsToken = process.env.METRICS_TOKEN || runtimeConfig.healthToken;
    if (metricsToken) {
      const token = req.headers['x-metrics-token'] || req.headers['authorization'];
      const cleaned = Array.isArray(token) ? token[0] : (token || '').toString().replace(/^Bearer\s+/i, '');
      if (cleaned !== metricsToken) {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Unauthorized');
        return;
      }
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
    res.end(renderPrometheusMetrics());
    return;
  }

  if (req.url === '/health' || req.url === '/healthz') {
    // Protección opcional con HEALTH_TOKEN
    if (runtimeConfig.healthToken) {
      const token = req.headers['x-health-token'] || req.headers['authorization'];
      const cleaned = Array.isArray(token) ? token[0] : (token || '').toString().replace(/^Bearer\s+/i, '');
      if (cleaned !== runtimeConfig.healthToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'unauthorized' }));
        return;
      }
    }

    const body = JSON.stringify(healthCheck());
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'not_found' }));
});

server.listen(healthPort, () => {
  logger.info(`🩺 [Health] Worker health endpoint listening on :${healthPort}`);
});

// MANEJO DE SEÑALES (SIGTERM ya registrado arriba con graceful BullMQ shutdown)
process.on('SIGINT', async () => {
  console.log('🛑 [Worker] Recibida señal SIGINT, cerrando worker...');
  worker.stop();
  try {
    await cpeWorker.close();
    await sireWorker.close();
  } catch (err) {
    console.error('Error during SIGINT shutdown:', err);
  }
  process.exit(0);
});

console.log('🎯 [Worker] Worker de Background configurado y ejecutándose');
console.log('🎯 [Worker] Presiona Ctrl+C para detener el worker');

// Mantener el proceso vivo
process.on('uncaughtException', (error) => {
  console.error('❌ [Worker] Error no capturado:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ [Worker] Promesa rechazada no manejada:', reason);
});
