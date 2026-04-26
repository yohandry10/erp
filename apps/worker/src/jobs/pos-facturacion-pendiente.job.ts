import winston from 'winston';
import { createClient } from '@supabase/supabase-js';
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

const apiBase = process.env.ERP_API_URL || 'http://localhost:3002/api';

/**
 * 🔄 JOB: Procesar ventas POS pendientes de facturación (CPE)
 * - Busca ventas_pos en PENDIENTE_FACTURACION con intentos < 5
 * - Respeta backoff simple de 5,10,20,40 minutos
 * - Marca errores y registra logs de procesamiento, con desglose por tenant
 */
export async function runPosFacturaPendienteJob(): Promise<{
  success: boolean;
  procesadas: number;
  errores: number;
  omitidas: number;
  tenantStats: Record<string, { procesadas: number; errores: number; omitidas: number }>;
}> {
  logger.info('🧾 [POS Facturación] Iniciando job de ventas pendientes');

  let procesadas = 0;
  let errores = 0;
  let omitidas = 0;
  const tenantStats: Record<string, { procesadas: number; errores: number; omitidas: number }> = {};

  const ensureTenantStats = (tenantId: string | null | undefined) => {
    const key = tenantId || 'unknown';
    if (!tenantStats[key]) {
      tenantStats[key] = { procesadas: 0, errores: 0, omitidas: 0 };
    }
    return key;
  };

  try {
    const workerSecret = process.env.POS_WORKER_JWT_SECRET || '';
    if (!workerSecret || workerSecret.length < 24) {
      logger.error('❌ [POS Facturación] POS_WORKER_JWT_SECRET no configurado o demasiado corto');
      return { success: false, procesadas: 0, errores: 1, tenantStats, omitidas: 0 };
    }
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && workerSecret === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      logger.error('❌ [POS Facturación] POS_WORKER_JWT_SECRET no debe ser igual a SUPABASE_SERVICE_ROLE_KEY');
      return { success: false, procesadas: 0, errores: 1, tenantStats, omitidas: 0 };
    }

    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, activo')
      .eq('activo', true);

    if (tenantsError) {
      logger.error('❌ [POS Facturación] No se pudieron obtener tenants:', tenantsError);
      return { success: false, procesadas: 0, errores: 1, tenantStats, omitidas: 0 };
    }

    for (const tenant of tenants || []) {
      const tKey = ensureTenantStats(tenant.id);
      const stats = tenantStats[tKey]!;
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
        const proc = Number(data.procesadas || 0);
        const err = Number(data.errores || 0);

        procesadas += proc;
        errores += err;
        stats.procesadas += proc;
        stats.errores += err;
      } catch (error: any) {
        errores += 1;
        stats.errores += 1;
        logger.error(`❌ [POS Facturación] Error procesando tenant ${tenant.id}:`, error?.message || error);
      }
    }

    logger.info(`🧾 [POS Facturación] Finalizado vía API: ${procesadas} ok, ${errores} con error, ${omitidas} omitidas`);
    return { success: true, procesadas, errores, omitidas, tenantStats };
  } catch (error) {
    logger.error('❌ [POS Facturación] Error general:', error);
    return { success: false, procesadas, errores: errores + 1, omitidas, tenantStats };
  }
}
