import winston from 'winston';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

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
const apiToken = process.env.WORKER_API_TOKEN || process.env.API_SERVICE_TOKEN || '';

/**
 * 🔄 JOB: Procesar ventas POS pendientes de facturación (CPE)
 * - Busca ventas_pos en PENDIENTE_FACTURACION con intentos < 5
 * - Respeta backoff simple de 5,10,20,40 minutos
 * - Marca errores y registra logs de procesamiento
 */
export async function runPosFacturaPendienteJob(): Promise<{
  success: boolean;
  procesadas: number;
  errores: number;
}> {
  logger.info('🧾 [POS Facturación] Iniciando job de ventas pendientes');

  let procesadas = 0;
  let errores = 0;

  try {
    const { data: ventasPendientes, error: queryError } = await supabase
      .from('ventas_pos')
      .select('id, tenant_id, numero_venta, numero_ticket, total, intentos_facturacion, ultimo_intento_facturacion, error_facturacion, cpe_data')
      .eq('estado', 'PENDIENTE_FACTURACION')
      .lt('intentos_facturacion', 5)
      .order('ultimo_intento_facturacion', { ascending: true })
      .limit(50);

    if (queryError) {
      logger.error('❌ [POS Facturación] Error consultando ventas pendientes:', queryError);
      return { success: false, procesadas: 0, errores: 1 };
    }

    if (!ventasPendientes || ventasPendientes.length === 0) {
      logger.info('ℹ️ [POS Facturación] No hay ventas pendientes');
      return { success: true, procesadas: 0, errores: 0 };
    }

    for (const venta of ventasPendientes) {
      const intentoActual = (venta.intentos_facturacion || 0) + 1;

      // Backoff simple
      if (venta.ultimo_intento_facturacion) {
        const ultimo = new Date(venta.ultimo_intento_facturacion);
        const minutos = (Date.now() - ultimo.getTime()) / 60000;
        const espera = Math.pow(2, venta.intentos_facturacion || 0) * 5;
        if (minutos < espera) {
          logger.info(`⏳ [POS Facturación] Venta ${venta.numero_ticket} espera ${Math.max(0, espera - minutos).toFixed(1)} min`);
          continue;
        }
      }

      if (!venta.cpe_data) {
        await supabase
          .from('ventas_pos')
          .update({
            estado: 'ERROR_FACTURACION',
            intentos_facturacion: 5,
            ultimo_intento_facturacion: new Date().toISOString(),
            error_facturacion: 'Sin datos CPE para facturar'
          })
          .eq('id', venta.id);
        errores++;
        continue;
      }

      try {
        // 1) Crear o reutilizar CPE
        let cpeId: string | null = (venta as any).cpe_id || null;
        if (!cpeId) {
          const { data: cpeCreado, error: cpeError } = await supabase
            .from('cpe')
            .insert({
              tenant_id: venta.tenant_id,
              tipo_documento: venta.cpe_data.tipo_documento,
              serie: venta.cpe_data.serie,
              numero: venta.cpe_data.numero,
              ruc_emisor: venta.cpe_data.ruc_emisor,
              razon_social_emisor: venta.cpe_data.razon_social_emisor,
              tipo_documento_receptor: venta.cpe_data.tipo_documento_receptor,
              documento_receptor: venta.cpe_data.documento_receptor,
              razon_social_receptor: venta.cpe_data.razon_social_receptor,
              direccion_receptor: venta.cpe_data.direccion_receptor || '',
              moneda: venta.cpe_data.moneda,
              total_gravadas: venta.cpe_data.total_gravadas,
              total_igv: venta.cpe_data.total_igv,
              total_venta: venta.cpe_data.total_venta,
              items: venta.cpe_data.items,
              fecha_emision: new Date().toISOString(),
              estado: 'GENERADO',
              sunat_status: 'PENDIENTE',
              created_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (cpeError || !cpeCreado?.id) {
            throw new Error(`Error creando CPE: ${cpeError?.message || 'sin detalle'}`);
          }
          cpeId = cpeCreado.id;
        }

        // 2) Enviar a SUNAT via API ERP
        const url = `${apiBase}/cpe/${cpeId}/enviar-sunat`;
        const resp = await axios.post(
          url,
          {},
          {
            headers: {
              Authorization: apiToken ? `Bearer ${apiToken}` : undefined,
              'X-Tenant-Id': venta.tenant_id,
            },
            timeout: 30000,
          }
        );

        const success = resp?.data?.success !== false;
        if (!success) {
          throw new Error(resp?.data?.message || 'Error enviando a SUNAT');
        }

        // 3) Marcar venta como facturada
        await supabase
          .from('ventas_pos')
          .update({
            estado: 'FACTURADA',
            cpe_pendiente: false,
            intentos_facturacion: intentoActual,
            ultimo_intento_facturacion: new Date().toISOString(),
            error_facturacion: null,
          })
          .eq('id', venta.id);

        procesadas++;
      } catch (error: any) {
        logger.error(`❌ [POS Facturación] Error facturando venta ${venta.numero_ticket}:`, error);
        await supabase
          .from('ventas_pos')
          .update({
            intentos_facturacion: intentoActual,
            ultimo_intento_facturacion: new Date().toISOString(),
            error_facturacion: error?.message || 'Error desconocido'
          })
          .eq('id', venta.id);
        errores++;
      }
    }

    logger.info(`🧾 [POS Facturación] Finalizado: ${procesadas} ok, ${errores} con error`);
    return { success: true, procesadas, errores };
  } catch (error) {
    logger.error('❌ [POS Facturación] Error general:', error);
    return { success: false, procesadas, errores: errores + 1 };
  }
}
