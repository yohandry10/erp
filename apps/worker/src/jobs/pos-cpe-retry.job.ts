import { createClient } from '@supabase/supabase-js';
import winston from 'winston';

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
  logger.info('🔄 [POS CPE Retry] Iniciando job de retry de facturación POS');

  let procesadas = 0;
  let errores = 0;
  let omitidas = 0;

  try {
    // 1. Obtener ventas POS pendientes de facturación
    const { data: ventasPendientes, error: queryError } = await supabase
      .from('ventas_pos')
      .select('id, tenant_id, numero_venta, numero_ticket, total, cpe_data, intentos_facturacion, ultimo_intento_facturacion, error_facturacion')
      .eq('cpe_pendiente', true)
      .lt('intentos_facturacion', 5) // Solo ventas con menos de 5 intentos
      .order('ultimo_intento_facturacion', { ascending: true })
      .limit(50); // Procesar máximo 50 ventas por ejecución

    if (queryError) {
      logger.error('❌ [POS CPE Retry] Error consultando ventas pendientes:', queryError);
      return { success: false, procesadas: 0, errores: 1, omitidas: 0 };
    }

    if (!ventasPendientes || ventasPendientes.length === 0) {
      logger.info('ℹ️ [POS CPE Retry] No hay ventas pendientes de facturación');
      return { success: true, procesadas: 0, errores: 0, omitidas: 0 };
    }

    logger.info(`📋 [POS CPE Retry] Encontradas ${ventasPendientes.length} ventas pendientes`);

    // 2. Procesar cada venta pendiente
    for (const venta of ventasPendientes) {
      const intentoActual = (venta.intentos_facturacion || 0) + 1;
      
      logger.info(`🔄 [POS CPE Retry] Procesando venta ${venta.numero_ticket} (intento ${intentoActual}/5)`);

      // Verificar si debe esperar por backoff exponencial
      if (venta.ultimo_intento_facturacion) {
        const ultimoIntento = new Date(venta.ultimo_intento_facturacion);
        const ahora = new Date();
        const minutosDesdeUltimoIntento = (ahora.getTime() - ultimoIntento.getTime()) / (1000 * 60);
        
        // Backoff exponencial: 5, 10, 20, 40 minutos
        const minutosEspera = Math.pow(2, venta.intentos_facturacion || 0) * 5;
        
        if (minutosDesdeUltimoIntento < minutosEspera) {
          logger.info(`⏳ [POS CPE Retry] Venta ${venta.numero_ticket} debe esperar ${minutosEspera - minutosDesdeUltimoIntento} minutos más`);
          omitidas++;
          continue;
        }
      }

      // Validar que tenga datos del CPE
      if (!venta.cpe_data) {
        logger.warn(`⚠️ [POS CPE Retry] Venta ${venta.numero_ticket} no tiene datos CPE guardados, omitiendo`);
        
        // Marcar como error permanente
        await supabase
          .from('ventas_pos')
          .update({
            cpe_pendiente: false,
            error_facturacion: 'No se encontraron datos del CPE para reintentar',
            intentos_facturacion: 5, // Marcar como máximo de intentos
            ultimo_intento_facturacion: new Date().toISOString()
          })
          .eq('id', venta.id);
        
        omitidas++;
        continue;
      }

      let logId: string | null = null;

      try {
        // Registrar inicio del procesamiento en event_processing_log
        const { data: logEntry } = await supabase
          .from('event_processing_log')
          .insert({
            tenant_id: venta.tenant_id,
            event_id: venta.id,
            processor_name: 'PosCpeRetryWorker',
            started_at: new Date().toISOString(),
            status: 'PROCESSING',
          })
          .select('id')
          .single();

        logId = logEntry?.id || null;

        // 3. Intentar crear el CPE llamando directamente a la tabla cpe
        // Esto simula lo que hace el CpeService.create()
        const cpeData = venta.cpe_data;
        
        // Insertar en la tabla cpe
        const { data: cpeCreado, error: cpeError } = await supabase
          .from('cpe')
          .insert({
            tenant_id: venta.tenant_id,
            tipo_documento: cpeData.tipo_documento,
            serie: cpeData.serie,
            numero: cpeData.numero,
            ruc_emisor: cpeData.ruc_emisor,
            razon_social_emisor: cpeData.razon_social_emisor,
            tipo_documento_receptor: cpeData.tipo_documento_receptor,
            documento_receptor: cpeData.documento_receptor,
            razon_social_receptor: cpeData.razon_social_receptor,
            direccion_receptor: cpeData.direccion_receptor || '',
            moneda: cpeData.moneda,
            total_gravadas: cpeData.total_gravadas,
            total_igv: cpeData.total_igv,
            total_venta: cpeData.total_venta,
            items: cpeData.items,
            fecha_emision: new Date().toISOString(),
            estado: 'GENERADO',
            sunat_status: 'PENDIENTE',
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (cpeError) {
          throw new Error(`Error creando CPE: ${cpeError.message}`);
        }
          
        logger.info(`✅ [POS CPE Retry] CPE creado exitosamente para venta ${venta.numero_ticket}: ${cpeCreado.id}`);
        
        // Marcar venta como facturada
        await supabase
          .from('ventas_pos')
          .update({
            cpe_pendiente: false,
            error_facturacion: null,
            ultimo_intento_facturacion: new Date().toISOString()
          })
          .eq('id', venta.id);
        
        // Registrar finalización exitosa en event_processing_log
        if (logId) {
          await supabase
            .from('event_processing_log')
            .update({
              completed_at: new Date().toISOString(),
              status: 'COMPLETED',
            })
            .eq('id', logId);
        }
        
        procesadas++;
      } catch (error: any) {
        const errorMessage = error.message || 'Error desconocido al crear CPE';
        
        logger.error(`❌ [POS CPE Retry] Error procesando venta ${venta.numero_ticket} (intento ${intentoActual}):`, errorMessage);
        
        // Registrar error en event_processing_log
        if (logId) {
          await supabase
            .from('event_processing_log')
            .update({
              completed_at: new Date().toISOString(),
              status: 'FAILED',
              error_details: {
                message: errorMessage,
                intento: intentoActual,
                max_intentos: 5,
              },
            })
            .eq('id', logId);
        }
        
        // Actualizar contador de intentos y error
        await supabase
          .from('ventas_pos')
          .update({
            intentos_facturacion: intentoActual,
            ultimo_intento_facturacion: new Date().toISOString(),
            error_facturacion: errorMessage.substring(0, 500) // Limitar tamaño
          })
          .eq('id', venta.id);
        
        errores++;
        
        // Si alcanzó el máximo de intentos, marcar como no pendiente
        if (intentoActual >= 5) {
          logger.error(`🚫 [POS CPE Retry] Venta ${venta.numero_ticket} alcanzó el máximo de intentos (5)`);
          
          await supabase
            .from('ventas_pos')
            .update({
              cpe_pendiente: false, // Ya no reintentar automáticamente
            })
            .eq('id', venta.id);
        }
      }

      // Pequeña pausa entre ventas para no saturar el sistema
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info(`✅ [POS CPE Retry] Job completado: ${procesadas} procesadas, ${errores} errores, ${omitidas} omitidas`);
    
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
