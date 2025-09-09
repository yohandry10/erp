"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const supabase_js_1 = require("@supabase/supabase-js");
const bullmq_1 = require("bullmq");
const node_cron_1 = __importDefault(require("node-cron"));
const winston_1 = __importDefault(require("winston"));
const events_1 = require("events");
// Logger setup
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.simple()
        }),
    ],
});
// Supabase client
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// Redis connection
const redisConnection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
};
// Job queues
const cpeQueue = new bullmq_1.Queue('cpe-processing', { connection: redisConnection });
const greQueue = new bullmq_1.Queue('gre-processing', { connection: redisConnection });
const sireQueue = new bullmq_1.Queue('sire-processing', { connection: redisConnection });
// CPE Processing Worker
const cpeWorker = new bullmq_1.Worker('cpe-processing', async (job) => {
    logger.info(`Processing CPE job: ${job.id}`);
    const { cpeId, action } = job.data;
    try {
        switch (action) {
            case 'SEND_TO_OSE':
                await processCpeSendToOse(cpeId);
                break;
            case 'CHECK_STATUS':
                await processCpeCheckStatus(cpeId);
                break;
            case 'GENERATE_PDF':
                await processCpeGeneratePdf(cpeId);
                break;
            default:
                throw new Error(`Unknown CPE action: ${action}`);
        }
        logger.info(`CPE job ${job.id} completed successfully`);
    }
    catch (error) {
        logger.error(`CPE job ${job.id} failed:`, error);
        throw error;
    }
}, { connection: redisConnection });
// SIRE Processing Worker
const sireWorker = new bullmq_1.Worker('sire-processing', async (job) => {
    logger.info(`Processing SIRE job: ${job.id}`);
    const { tenantId, period } = job.data;
    try {
        await processSireGeneration(tenantId, period);
        logger.info(`SIRE job ${job.id} completed successfully`);
    }
    catch (error) {
        logger.error(`SIRE job ${job.id} failed:`, error);
        throw error;
    }
}, { connection: redisConnection });
// CPE Processing Functions
async function processCpeSendToOse(cpeId) {
    const { data: cpe } = await supabase
        .from('cpe')
        .select('*')
        .eq('id', cpeId)
        .single();
    if (!cpe) {
        throw new Error(`CPE not found: ${cpeId}`);
    }
    // Update status to SENDING
    await supabase
        .from('cpe')
        .update({ estado: 'SENDING' })
        .eq('id', cpeId);
    // Mock OSE send (replace with real implementation)
    await new Promise(resolve => setTimeout(resolve, 2000));
    // Mock success response
    const success = Math.random() > 0.1; // 90% success rate
    if (success) {
        await supabase
            .from('cpe')
            .update({
            estado: 'SENT',
            numero_ticket: `TICKET-${Date.now()}`,
            fecha_envio: new Date().toISOString()
        })
            .eq('id', cpeId);
        // Schedule status check in 30 seconds
        await cpeQueue.add('CHECK_STATUS', { cpeId }, { delay: 30000 });
    }
    else {
        await supabase
            .from('cpe')
            .update({
            estado: 'REJECTED',
            observaciones: 'Error en el envío al OSE'
        })
            .eq('id', cpeId);
    }
}
async function processCpeCheckStatus(cpeId) {
    const { data: cpe } = await supabase
        .from('cpe')
        .select('*')
        .eq('id', cpeId)
        .single();
    if (!cpe) {
        throw new Error(`CPE not found: ${cpeId}`);
    }
    // Mock status check (replace with real OSE API)
    await new Promise(resolve => setTimeout(resolve, 1000));
    const accepted = Math.random() > 0.05; // 95% acceptance rate
    if (accepted) {
        await supabase
            .from('cpe')
            .update({
            estado: 'ACCEPTED',
            cdr_xml: '<cdr>Mock CDR Response</cdr>',
            fecha_aceptacion: new Date().toISOString()
        })
            .eq('id', cpeId);
        // Generate PDF after acceptance
        await cpeQueue.add('GENERATE_PDF', { cpeId });
    }
    else {
        await supabase
            .from('cpe')
            .update({
            estado: 'REJECTED',
            observaciones: 'Documento rechazado por SUNAT'
        })
            .eq('id', cpeId);
    }
}
async function processCpeGeneratePdf(cpeId) {
    const { data: cpe } = await supabase
        .from('cpe')
        .select('*')
        .eq('id', cpeId)
        .single();
    if (!cpe) {
        throw new Error(`CPE not found: ${cpeId}`);
    }
    // Mock PDF generation
    const pdfContent = `PDF content for ${cpe.tipo_comprobante} ${cpe.serie}-${cpe.numero}`;
    await supabase
        .from('cpe')
        .update({
        pdf_content: pdfContent,
        pdf_generated_at: new Date().toISOString()
    })
        .eq('id', cpeId);
}
// SIRE Processing Function
async function processSireGeneration(tenantId, period) {
    // Update status to RUNNING
    const { data: sireFile } = await supabase
        .from('sire_files')
        .insert({
        tenant_id: tenantId,
        period,
        status: 'RUNNING',
        created_at: new Date().toISOString()
    })
        .select()
        .single();
    try {
        // Mock SIRE file generation
        await new Promise(resolve => setTimeout(resolve, 5000));
        const mockData = `${period}|VENTAS|SAMPLE DATA\n`;
        await supabase
            .from('sire_files')
            .update({
            status: 'COMPLETED',
            file_content: mockData,
            completed_at: new Date().toISOString()
        })
            .eq('id', sireFile.id);
    }
    catch (error) {
        await supabase
            .from('sire_files')
            .update({
            status: 'ERROR',
            error_message: error.message,
            completed_at: new Date().toISOString()
        })
            .eq('id', sireFile.id);
        throw error;
    }
}
// Scheduled Jobs
node_cron_1.default.schedule('0 */6 * * *', async () => {
    logger.info('Running scheduled CPE status check');
    // Check pending CPE documents
    const { data: pendingCpes } = await supabase
        .from('cpe')
        .select('id')
        .eq('estado', 'SENT')
        .lt('fecha_envio', new Date(Date.now() - 30 * 60 * 1000).toISOString()); // 30 minutes old
    for (const cpe of pendingCpes || []) {
        await cpeQueue.add('CHECK_STATUS', { cpeId: cpe.id });
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
        }
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
// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await cpeWorker.close();
    await sireWorker.close();
    process.exit(0);
});
logger.info('Worker started successfully');
logger.info('Health check available:', healthCheck());
// 🚀 WORKER DE BACKGROUND PARA AUTOMATIZACIÓN ERP
console.log('🤖 [Worker] Iniciando Worker de Background para Sistema ERP...');
// Event Bus para comunicación
const eventBus = new events_1.EventEmitter();
eventBus.setMaxListeners(100);
class BackgroundWorker {
    constructor() {
        this.tasks = new Map();
        this.processingQueue = [];
        this.isRunning = false;
        this.registerTasks();
        this.startProcessing();
        console.log('✅ [Worker] Background Worker inicializado correctamente');
    }
    registerTasks() {
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
        // 📊 TAREA: Actualización de métricas del dashboard
        this.tasks.set('dashboard.update_metrics', {
            id: 'dashboard.update_metrics',
            type: 'METRICS_UPDATE',
            priority: 'MEDIUM',
            maxRetries: 3,
            retryDelay: 2 * 60 * 1000, // 2 minutos
            processor: this.updateDashboardMetrics.bind(this)
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
        // 🧹 TAREA: Limpieza de logs antiguos
        this.tasks.set('system.cleanup_logs', {
            id: 'system.cleanup_logs',
            type: 'MAINTENANCE',
            priority: 'LOW',
            maxRetries: 1,
            retryDelay: 60 * 60 * 1000, // 1 hora
            processor: this.cleanupOldLogs.bind(this)
        });
        console.log(`📋 [Worker] ${this.tasks.size} tareas registradas`);
    }
    // 📨 PROCESADOR: Reintento de envío CPE a SUNAT
    async processCpeRetry(data) {
        try {
            console.log(`📨 [Worker] Reintentando envío CPE ${data.cpeId} a SUNAT...`);
            // Obtener CPE pendiente
            const { data: cpe, error } = await supabase
                .from('cpe')
                .select('*')
                .eq('id', data.cpeId)
                .eq('estado', 'PENDIENTE_ENVIO')
                .single();
            if (error || !cpe) {
                console.log(`ℹ️ [Worker] CPE ${data.cpeId} ya no está pendiente o no existe`);
                return true; // Marcar como completado
            }
            // Simular envío a SUNAT (aquí iría la lógica real)
            console.log(`🚀 [Worker] Enviando CPE ${cpe.serie}-${cpe.numero} a SUNAT...`);
            // Simular éxito o fallo aleatorio para testing
            const exito = Math.random() > 0.3; // 70% de éxito
            if (exito) {
                // Actualizar estado a ENVIADO
                await supabase
                    .from('cpe')
                    .update({
                    estado: 'ENVIADO',
                    fecha_envio: new Date().toISOString(),
                    envio_automatico: true,
                    error_envio: null
                })
                    .eq('id', data.cpeId);
                console.log(`✅ [Worker] CPE ${data.cpeId} enviado exitosamente a SUNAT`);
                return true;
            }
            else {
                // Actualizar fecha de último intento
                await supabase
                    .from('cpe')
                    .update({
                    fecha_ultimo_intento: new Date().toISOString(),
                    error_envio: `Intento ${data.intentoAnterior + 1} fallido`
                })
                    .eq('id', data.cpeId);
                console.log(`❌ [Worker] Fallo en envío CPE ${data.cpeId}, se reintentará`);
                return false; // Reintentar
            }
        }
        catch (error) {
            console.error(`❌ [Worker] Error procesando reintento CPE:`, error);
            return false;
        }
    }
    // 📨 PROCESADOR: Reintento de envío GRE a SUNAT
    async processGreRetry(data) {
        try {
            console.log(`📨 [Worker] Reintentando envío GRE ${data.greId} a SUNAT...`);
            // Similar lógica para GRE
            const { data: gre, error } = await supabase
                .from('gre')
                .select('*')
                .eq('id', data.greId)
                .eq('estado', 'PENDIENTE_ENVIO')
                .single();
            if (error || !gre) {
                console.log(`ℹ️ [Worker] GRE ${data.greId} ya no está pendiente`);
                return true;
            }
            // Simular envío exitoso
            const exito = Math.random() > 0.2; // 80% de éxito para GRE
            if (exito) {
                await supabase
                    .from('gre')
                    .update({
                    estado: 'ENVIADO',
                    fecha_envio: new Date().toISOString(),
                    envio_automatico: true
                })
                    .eq('id', data.greId);
                console.log(`✅ [Worker] GRE ${data.greId} enviado exitosamente`);
                return true;
            }
            else {
                console.log(`❌ [Worker] Fallo en envío GRE ${data.greId}`);
                return false;
            }
        }
        catch (error) {
            console.error(`❌ [Worker] Error procesando reintento GRE:`, error);
            return false;
        }
    }
    // 📊 PROCESADOR: Actualización de métricas dashboard
    async updateDashboardMetrics(data) {
        try {
            console.log('📊 [Worker] Actualizando métricas del dashboard...');
            // Obtener métricas actuales del sistema
            const metrics = {
                totalCpe: await this.getTotalRecords('cpe'),
                totalGre: await this.getTotalRecords('gre'),
                totalInventario: await this.getTotalRecords('productos'),
                ventasHoy: await this.getVentasHoy(),
                productosStockBajo: await this.getProductosStockBajo(),
                ultimaActualizacion: new Date().toISOString()
            };
            console.log('📊 [Worker] Métricas calculadas:', metrics);
            // Emitir evento de actualización (simular)
            console.log('✅ [Worker] Métricas del dashboard actualizadas');
            return true;
        }
        catch (error) {
            console.error('❌ [Worker] Error actualizando métricas:', error);
            return false;
        }
    }
    // 📦 PROCESADOR: Verificación de stock crítico
    async checkCriticalStock(data) {
        try {
            console.log('📦 [Worker] Verificando stock crítico...');
            const { data: productos, error } = await supabase
                .from('productos')
                .select('codigo, nombre, stock, stock_minimo')
                .lt('stock', supabase.rpc('stock_minimo')); // Productos con stock menor al mínimo
            if (error) {
                console.error('❌ [Worker] Error consultando stock crítico:', error);
                return false;
            }
            if (productos && productos.length > 0) {
                console.log(`⚠️ [Worker] ${productos.length} productos con stock crítico detectados`);
                // Aquí se podría enviar notificaciones, emails, etc.
                for (const producto of productos) {
                    console.log(`⚠️ [Worker] Stock crítico: ${producto.codigo} - ${producto.nombre} (Stock: ${producto.stock}, Mínimo: ${producto.stock_minimo})`);
                }
            }
            else {
                console.log('✅ [Worker] Todos los productos tienen stock adecuado');
            }
            return true;
        }
        catch (error) {
            console.error('❌ [Worker] Error verificando stock:', error);
            return false;
        }
    }
    // 🧹 PROCESADOR: Limpieza de logs antiguos
    async cleanupOldLogs(data) {
        try {
            console.log('🧹 [Worker] Limpiando logs antiguos...');
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 30); // 30 días atrás
            // Simular limpieza
            console.log(`🧹 [Worker] Limpiando logs anteriores a ${cutoffDate.toISOString()}`);
            console.log('✅ [Worker] Limpieza de logs completada');
            return true;
        }
        catch (error) {
            console.error('❌ [Worker] Error en limpieza:', error);
            return false;
        }
    }
    // UTILIDADES
    async getTotalRecords(table) {
        try {
            const { count } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });
            return count || 0;
        }
        catch {
            return 0;
        }
    }
    async getVentasHoy() {
        try {
            const hoy = new Date().toISOString().split('T')[0];
            const { count } = await supabase
                .from('ventas_pos')
                .select('*', { count: 'exact', head: true })
                .gte('fecha', hoy + 'T00:00:00.000Z')
                .lt('fecha', hoy + 'T23:59:59.999Z');
            return count || 0;
        }
        catch {
            return 0;
        }
    }
    async getProductosStockBajo() {
        try {
            const { count } = await supabase
                .from('productos')
                .select('*', { count: 'exact', head: true })
                .lt('stock', 10); // Stock menor a 10
            return count || 0;
        }
        catch {
            return 0;
        }
    }
    // MOTOR DE PROCESAMIENTO
    addTask(taskId, data, attempt = 1) {
        if (!this.tasks.has(taskId)) {
            console.error(`❌ [Worker] Tarea desconocida: ${taskId}`);
            return;
        }
        this.processingQueue.push({ taskId, data, attempt });
        console.log(`📝 [Worker] Tarea ${taskId} agregada a la cola (intento ${attempt})`);
    }
    async startProcessing() {
        this.isRunning = true;
        console.log('🔄 [Worker] Motor de procesamiento iniciado');
        while (this.isRunning) {
            if (this.processingQueue.length > 0) {
                const { taskId, data, attempt } = this.processingQueue.shift();
                const taskConfig = this.tasks.get(taskId);
                try {
                    console.log(`⚡ [Worker] Procesando tarea: ${taskId} (intento ${attempt}/${taskConfig.maxRetries})`);
                    const success = await taskConfig.processor(data);
                    if (success) {
                        console.log(`✅ [Worker] Tarea ${taskId} completada exitosamente`);
                    }
                    else if (attempt < taskConfig.maxRetries) {
                        // Programar reintento
                        console.log(`🔄 [Worker] Reintentando tarea ${taskId} en ${taskConfig.retryDelay / 1000} segundos...`);
                        setTimeout(() => {
                            this.addTask(taskId, data, attempt + 1);
                        }, taskConfig.retryDelay);
                    }
                    else {
                        console.error(`❌ [Worker] Tarea ${taskId} falló después de ${taskConfig.maxRetries} intentos`);
                    }
                }
                catch (error) {
                    console.error(`❌ [Worker] Error ejecutando tarea ${taskId}:`, error);
                }
            }
            // Esperar 1 segundo antes del siguiente ciclo
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    stop() {
        this.isRunning = false;
        console.log('🛑 [Worker] Motor de procesamiento detenido');
    }
}
// INICIALIZAR WORKER
const worker = new BackgroundWorker();
// TAREAS PROGRAMADAS
setInterval(() => {
    worker.addTask('dashboard.update_metrics', {});
}, 5 * 60 * 1000); // Cada 5 minutos
setInterval(() => {
    worker.addTask('inventory.check_critical_stock', {});
}, 15 * 60 * 1000); // Cada 15 minutos
setInterval(() => {
    worker.addTask('system.cleanup_logs', {});
}, 24 * 60 * 60 * 1000); // Cada 24 horas
// SIMULACIÓN: Agregar tareas de prueba
setTimeout(() => {
    console.log('🧪 [Worker] Iniciando tareas de prueba...');
    // Simular CPE pendiente
    worker.addTask('cpe.retry_envio', {
        cpeId: 'test-cpe-001',
        intentoAnterior: 1
    });
    // Simular GRE pendiente
    worker.addTask('gre.retry_envio', {
        greId: 'test-gre-001',
        intentoAnterior: 1
    });
}, 10000); // Después de 10 segundos
// MANEJO DE SEÑALES
process.on('SIGINT', () => {
    console.log('🛑 [Worker] Recibida señal SIGINT, cerrando worker...');
    worker.stop();
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.log('🛑 [Worker] Recibida señal SIGTERM, cerrando worker...');
    worker.stop();
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
