import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

/**
 * Q40: Servicio de auditoría forense para POS
 * 
 * Registra TODAS las acciones del cajero para auditoría:
 * - Apertura de cajón sin venta
 * - Anulación de ítems
 * - Descuentos manuales
 * - Cambios de precio
 * - Búsquedas manuales de productos
 * - Ventas anuladas
 * - Devoluciones
 */

export enum TipoEventoPOS {
  // Eventos de caja
  APERTURA_CAJON_SIN_VENTA = 'APERTURA_CAJON_SIN_VENTA',
  APERTURA_CAJON_CON_VENTA = 'APERTURA_CAJON_CON_VENTA',
  
  // Eventos de venta
  INICIO_VENTA = 'INICIO_VENTA',
  AGREGAR_ITEM = 'AGREGAR_ITEM',
  ANULACION_ITEM = 'ANULACION_ITEM',
  MODIFICAR_CANTIDAD = 'MODIFICAR_CANTIDAD',
  DESCUENTO_MANUAL = 'DESCUENTO_MANUAL',
  CAMBIO_PRECIO = 'CAMBIO_PRECIO',
  VENTA_COMPLETADA = 'VENTA_COMPLETADA',
  VENTA_ANULADA = 'VENTA_ANULADA',
  VENTA_SUSPENDIDA = 'VENTA_SUSPENDIDA',
  VENTA_RECUPERADA = 'VENTA_RECUPERADA',
  
  // Eventos de búsqueda
  BUSQUEDA_PRODUCTO = 'BUSQUEDA_PRODUCTO',
  ESCANEO_CODIGO = 'ESCANEO_CODIGO',
  
  // Eventos de pago
  SELECCION_METODO_PAGO = 'SELECCION_METODO_PAGO',
  CAMBIO_CALCULADO = 'CAMBIO_CALCULADO',
  
  // Eventos de devolución
  DEVOLUCION = 'DEVOLUCION',
  
  // Eventos de impresión
  REIMPRESION_TICKET = 'REIMPRESION_TICKET',
  IMPRESION_COPIA = 'IMPRESION_COPIA',
}

export interface EventoPOSDto {
  tipo_evento: TipoEventoPOS;
  subtipo?: string;
  venta_id?: string;
  producto_id?: string;
  item_index?: number;
  datos?: Record<string, any>;
  ip_address?: string;
  dispositivo?: string;
  requiere_supervisor?: boolean;
  supervisor_id?: string;
  justificacion?: string;
}

@Injectable()
export class PosAuditService {
  private readonly logger = new Logger(PosAuditService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Registra un evento de auditoría POS
   */
  async registrarEvento(
    tenantId: string,
    sesionCajaId: string | null,
    usuarioId: string,
    evento: EventoPOSDto,
  ): Promise<string> {
    try {
      const { data, error } = await this.supabase
        .getClient()
        .rpc('registrar_evento_pos', {
          p_tenant_id: tenantId,
          p_sesion_caja_id: sesionCajaId,
          p_usuario_id: usuarioId,
          p_tipo_evento: evento.tipo_evento,
          p_subtipo: evento.subtipo || null,
          p_venta_id: evento.venta_id || null,
          p_producto_id: evento.producto_id || null,
          p_item_index: evento.item_index || null,
          p_datos: evento.datos || {},
          p_ip_address: evento.ip_address || null,
          p_dispositivo: evento.dispositivo || null,
          p_requiere_supervisor: evento.requiere_supervisor || false,
          p_supervisor_id: evento.supervisor_id || null,
          p_justificacion: evento.justificacion || null,
        });

      if (error) {
        this.logger.error(`Error registrando evento POS: ${error.message}`);
        throw error;
      }

      // Log eventos de alto riesgo
      if (evento.requiere_supervisor || this.esEventoDeAltoRiesgo(evento.tipo_evento)) {
        this.logger.warn(
          `⚠️ Evento POS de alto riesgo: ${evento.tipo_evento} - ` +
          `Usuario: ${usuarioId}, Sesión: ${sesionCajaId}`,
        );
      }

      return data;
    } catch (error) {
      this.logger.error(`Error en registrarEvento: ${error.message}`);
      // No lanzamos error para no interrumpir el flujo de venta
      return null;
    }
  }

  /**
   * Registra apertura de cajón sin venta (posible robo)
   */
  async registrarAperturaCajonSinVenta(
    tenantId: string,
    sesionCajaId: string,
    usuarioId: string,
    motivo?: string,
    supervisorId?: string,
  ): Promise<void> {
    await this.registrarEvento(tenantId, sesionCajaId, usuarioId, {
      tipo_evento: TipoEventoPOS.APERTURA_CAJON_SIN_VENTA,
      datos: { motivo },
      requiere_supervisor: !supervisorId,
      supervisor_id: supervisorId,
      justificacion: motivo,
    });
  }

  /**
   * Registra anulación de ítem (posible fraude)
   */
  async registrarAnulacionItem(
    tenantId: string,
    sesionCajaId: string,
    usuarioId: string,
    ventaId: string,
    productoId: string,
    itemIndex: number,
    cantidad: number,
    precio: number,
    motivo?: string,
  ): Promise<void> {
    await this.registrarEvento(tenantId, sesionCajaId, usuarioId, {
      tipo_evento: TipoEventoPOS.ANULACION_ITEM,
      venta_id: ventaId,
      producto_id: productoId,
      item_index: itemIndex,
      datos: { cantidad, precio, motivo },
      requiere_supervisor: precio > 100, // Requiere supervisor si valor > 100
    });
  }

  /**
   * Registra descuento manual
   */
  async registrarDescuentoManual(
    tenantId: string,
    sesionCajaId: string,
    usuarioId: string,
    ventaId: string,
    productoId: string | null,
    montoDescuento: number,
    porcentajeDescuento: number,
    motivo: string,
    supervisorId?: string,
  ): Promise<void> {
    const requiereSupervisor = porcentajeDescuento > 10; // > 10% requiere supervisor

    await this.registrarEvento(tenantId, sesionCajaId, usuarioId, {
      tipo_evento: TipoEventoPOS.DESCUENTO_MANUAL,
      venta_id: ventaId,
      producto_id: productoId,
      datos: { 
        monto_descuento: montoDescuento, 
        porcentaje_descuento: porcentajeDescuento,
        motivo,
      },
      requiere_supervisor: requiereSupervisor && !supervisorId,
      supervisor_id: supervisorId,
      justificacion: motivo,
    });
  }

  /**
   * Registra cambio de precio (requiere supervisor)
   */
  async registrarCambioPrecio(
    tenantId: string,
    sesionCajaId: string,
    usuarioId: string,
    ventaId: string,
    productoId: string,
    precioOriginal: number,
    precioNuevo: number,
    motivo: string,
    supervisorId: string,
  ): Promise<void> {
    await this.registrarEvento(tenantId, sesionCajaId, usuarioId, {
      tipo_evento: TipoEventoPOS.CAMBIO_PRECIO,
      venta_id: ventaId,
      producto_id: productoId,
      datos: { 
        precio_original: precioOriginal, 
        precio_nuevo: precioNuevo,
        diferencia: precioNuevo - precioOriginal,
        motivo,
      },
      requiere_supervisor: true,
      supervisor_id: supervisorId,
      justificacion: motivo,
    });
  }

  /**
   * Registra búsqueda de producto (manual vs escaneo)
   */
  async registrarBusquedaProducto(
    tenantId: string,
    sesionCajaId: string,
    usuarioId: string,
    metodo: 'MANUAL' | 'ESCANEO',
    termino?: string,
    productoEncontrado?: string,
  ): Promise<void> {
    await this.registrarEvento(tenantId, sesionCajaId, usuarioId, {
      tipo_evento: metodo === 'ESCANEO' ? TipoEventoPOS.ESCANEO_CODIGO : TipoEventoPOS.BUSQUEDA_PRODUCTO,
      subtipo: metodo,
      producto_id: productoEncontrado,
      datos: { termino_busqueda: termino },
    });
  }

  /**
   * Obtiene patrones sospechosos para una sesión o tenant
   */
  async obtenerPatronesSospechosos(
    tenantId: string,
    sesionCajaId?: string,
    horasAtras: number = 24,
  ): Promise<any[]> {
    const { data, error } = await this.supabase
      .getClient()
      .rpc('detectar_patrones_sospechosos_pos', {
        p_tenant_id: tenantId,
        p_sesion_caja_id: sesionCajaId || null,
        p_horas_atras: horasAtras,
      });

    if (error) {
      this.logger.error(`Error obteniendo patrones: ${error.message}`);
      return [];
    }

    return data || [];
  }

  /**
   * Obtiene eventos sospechosos para dashboard de supervisor
   */
  async obtenerEventosSospechosos(
    tenantId: string,
    limite: number = 50,
  ): Promise<any[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('vw_eventos_pos_sospechosos')
      .select('*')
      .eq('tenant_id', tenantId)
      .limit(limite);

    if (error) {
      this.logger.error(`Error obteniendo eventos sospechosos: ${error.message}`);
      return [];
    }

    return data || [];
  }

  /**
   * Determina si un tipo de evento es de alto riesgo
   */
  private esEventoDeAltoRiesgo(tipo: TipoEventoPOS): boolean {
    const eventosAltoRiesgo = [
      TipoEventoPOS.APERTURA_CAJON_SIN_VENTA,
      TipoEventoPOS.CAMBIO_PRECIO,
      TipoEventoPOS.VENTA_ANULADA,
      TipoEventoPOS.DEVOLUCION,
    ];
    return eventosAltoRiesgo.includes(tipo);
  }
}
