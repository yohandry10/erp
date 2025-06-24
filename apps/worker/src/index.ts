import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Worker, Queue } from 'bullmq';
import cron from 'node-cron';
import winston from 'winston';
import Redis from 'redis';

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
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Redis connection
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

// Job queues
const cpeQueue = new Queue('cpe-processing', { connection: redisConnection });
const greQueue = new Queue('gre-processing', { connection: redisConnection });
const sireQueue = new Queue('sire-processing', { connection: redisConnection });

// CPE Processing Worker
const cpeWorker = new Worker('cpe-processing', async (job) => {
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
  } catch (error) {
    logger.error(`CPE job ${job.id} failed:`, error);
    throw error;
  }
}, { connection: redisConnection });

// SIRE Processing Worker
const sireWorker = new Worker('sire-processing', async (job) => {
  logger.info(`Processing SIRE job: ${job.id}`);
  
  const { tenantId, period } = job.data;
  
  try {
    await processSireGeneration(tenantId, period);
    logger.info(`SIRE job ${job.id} completed successfully`);
  } catch (error) {
    logger.error(`SIRE job ${job.id} failed:`, error);
    throw error;
  }
}, { connection: redisConnection });

// CPE Processing Functions
async function processCpeSendToOse(cpeId: string) {
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
  } else {
    await supabase
      .from('cpe')
      .update({ 
        estado: 'REJECTED',
        observaciones: 'Error en el envío al OSE'
      })
      .eq('id', cpeId);
  }
}

async function processCpeCheckStatus(cpeId: string) {
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
  } else {
    await supabase
      .from('cpe')
      .update({ 
        estado: 'REJECTED',
        observaciones: 'Documento rechazado por SUNAT'
      })
      .eq('id', cpeId);
  }
}

async function processCpeGeneratePdf(cpeId: string) {
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
async function processSireGeneration(tenantId: string, period: string) {
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
      
  } catch (error) {
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
cron.schedule('0 */6 * * *', async () => {
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