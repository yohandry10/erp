import { createClient } from '@supabase/supabase-js';
import winston from 'winston';
import axios from 'axios';
import jwt from 'jsonwebtoken';

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

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * 🔄 JOB: Retry de Facturación Electrónica (CPE) para Ventas POS Pendientes
 * 
 * Este job procesa automáticamente las ventas POS que tienen facturación pendiente
 * debido a errores temporales en la emisión del CPE (certificado, conexión SUNAT, etc.)
 * 
 * Características:
 * - Procesa ventas con cpe_pendiente = true
 * - Respeta el límite de 5 intentos máximo
 * - Implementa backoff exponencial entre reintentos
 * - Registra logs detallados de cada intento
 * - Actualiza contadores y timestamps
 */
export async function runPosCpeRetryJob(): Promise<{
  success: boolean;
  procesadas: number;
  errores: number;
  omitidas: number;
}> {
  logger.info('🔄 [POS CPE Retry] Iniciando job vía API POS');

  let procesadas = 0;
  let errores = 0;
  let omitidas = 0;

  try {
    const workerSecret = process.env.POS_WORKER_JWT_SECRET || '';
    if (!workerSecret || workerSecret.length < 24) {
      logger.error('❌ [POS CPE Retry] POS_WORKER_JWT_SECRET no configurado o demasiado corto');
      return { success: false, procesadas: 0, errores: 1, omitidas: 0 };
    }
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && workerSecret === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      logger.error('❌ [POS CPE Retry] POS_WORKER_JWT_SECRET no debe ser igual a SUPABASE_SERVICE_ROLE_KEY');
      return { success: false, procesadas: 0, errores: 1, omitidas: 0 };
    }

    const apiBase = process.env.ERP_API_URL || 'http://localhost:3002/api';

    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, estado')
      .eq('estado', 'ACTIVO');

    if (tenantsError) {
      logger.error('❌ [POS CPE Retry] No se pudieron obtener tenants:', tenantsError);
      return { success: false, procesadas: 0, errores: 1, omitidas: 0 };
    }

    for (const tenant of tenants || []) {
      try {
        const token = jwt.sign(
          {
            scope: 'pos.worker',
            tenant_id: tenant.id,
            tenant_ids: [tenant.id],
          },
          workerSecret,
          { expiresIn: '10m' },
        );

        const resp = await axios.post(
          `${apiBase}/pos/worker/procesar-pendientes`,
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Tenant-Id': tenant.id,
            },
            timeout: 45000,
          },
        );

        const data = resp?.data || {};
        procesadas += Number(data.procesadas || 0);
        errores += Number(data.errores || 0);
      } catch (err: any) {
        errores += 1;
        logger.error(`❌ [POS CPE Retry] Error procesando tenant ${tenant.id}:`, err?.message || err);
      }
    }

    logger.info(`✅ [POS CPE Retry] Job completado vía API: ${procesadas} procesadas, ${errores} errores`);

    return {
      success: true,
      procesadas,
      errores,
      omitidas
    };
  } catch (error) {
    logger.error('❌ [POS CPE Retry] Error crítico en el job:', error);
    return {
      success: false,
      procesadas,
      errores: errores + 1,
      omitidas
    };
  }
}
