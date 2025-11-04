import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { EventBusService, RecepcionRegistradaEvent, ERPEvent } from '../../../shared/events/event-bus.service';
import { CxpService } from './cxp.service';
import { CrearCxpDto, EstadoComparacionCxp, CxpDiscrepanciaDto, TipoDiscrepanciaCxp } from './dto';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

/**
 * Listener que escucha el evento RecepcionRegistrada y crea automáticamente
 * una Cuenta por Pagar (CxP) cuando se registra una recepción de mercancía.
 */
@Injectable()
export class CxpRecepcionListener implements OnModuleInit {
  private readonly logger = new Logger(CxpRecepcionListener.name);

  constructor(
    private readonly eventBus: EventBusService,
    private readonly cxpService: CxpService,
    private readonly supabase: SupabaseService,
  ) {}

  onModuleInit() {
    this.logger.log('🎧 [CxpRecepcionListener] Registrando listener para recepcion.registrada');
    this.eventBus.onRecepcionRegistrada(this.handleRecepcionRegistrada.bind(this));
  }

  /**
   * Maneja el evento RecepcionRegistrada y crea una CxP automáticamente
   */
  private async handleRecepcionRegistrada(event: ERPEvent): Promise<void> {
    const data = event.data as RecepcionRegistradaEvent;

    this.logger.log(
      `📦 [CxpRecepcionListener] Recepción ${data.numeroRecepcion} (${data.recepcionId}) recibida para tenant ${data.tenantId}`,
    );
    this.logger.debug(`Payload RecepcionRegistrada: ${JSON.stringify(data)}`);

    try {
      // Verificar si ya existe una CxP para esta recepción
      const { data: cxpExistente, error: cxpExistenteError } = await this.supabase
        .getClient()
        .from('cuentas_por_pagar')
        .select('id')
        .eq('tenant_id', data.tenantId)
        .eq('recepcion_id', data.recepcionId)
        .maybeSingle();

      if (cxpExistenteError) {
        this.logger.error(
          '❌ [CxpRecepcionListener] Error verificando existencia de CxP:',
          cxpExistenteError,
        );
      }

      if (cxpExistente) {
        this.logger.warn(
          `⚠️ [CxpRecepcionListener] Ya existe una CxP para la recepción ${data.numeroRecepcion}, omitiendo creación`,
        );
        return;
      }

      const comparacion = await this.calcularDiscrepanciasRecepcion(data);
      const idempotencyKey =
        data.idempotencyKey ?? `recepcion:${data.tenantId}:${data.recepcionId}`;

      // Preparar DTO para crear CxP
      const crearCxpDto: CrearCxpDto = {
        proveedor_id: data.proveedorId,
        orden_id: data.ordenId,
        recepcion_id: data.recepcionId,
        numero_documento: data.numeroRecepcion, // Usar número de recepción como documento temporal
        fecha_emision: data.fechaRecepcion,
        condiciones_pago: data.condicionesPago as any,
        dias_credito: data.diasCredito,
        subtotal: data.subtotal,
        igv: data.igv,
        total: data.total,
        moneda: data.moneda,
        observaciones:
          comparacion.estado === EstadoComparacionCxp.OK
            ? `CxP generada automáticamente desde recepción ${data.numeroRecepcion}`
            : `CxP con discrepancias desde recepción ${data.numeroRecepcion}`,
        tipo_documento: 'RECEPCION',
        referencia_tipo: 'RECEPCION',
        referencia_id: data.recepcionId,
        numero: data.numeroRecepcion,
        idempotency_key: idempotencyKey,
        estado_comparacion: comparacion.estado,
        discrepancias: comparacion.discrepancias,
      };

      // Crear la CxP
      const resultado = await this.cxpService.crearCuentaPorPagar(
        data.tenantId,
        crearCxpDto,
        undefined, // No hay usuario específico en eventos automáticos
      );

      this.logger.log(
        `✅ [CxpRecepcionListener] CxP ${resultado.data?.id ?? 'desconocida'} creada para recepción ${data.numeroRecepcion}`,
      );
    } catch (error) {
      this.logger.error('❌ [CxpRecepcionListener] Error creando CxP desde recepción:', error as Error);
      // No lanzar el error para no afectar el flujo principal
      // El error se registra para análisis posterior
    }
  }

  private async calcularDiscrepanciasRecepcion(
    data: RecepcionRegistradaEvent,
  ): Promise<{ estado: EstadoComparacionCxp; discrepancias: CxpDiscrepanciaDto[] }> {
    if (!data.ordenId || !data.items?.length) {
      return { estado: EstadoComparacionCxp.OK, discrepancias: [] };
    }

    const { data: detalles, error } = await this.supabase
      .getClient()
      .from('orden_compra_detalles')
      .select('producto_id, cantidad, precio_unitario')
      .eq('orden_id', data.ordenId);

    if (error || !detalles) {
      this.logger.warn(
        `⚠️ [CxpRecepcionListener] No se pudieron obtener detalles de la orden ${data.ordenId} para validar discrepancias`,
      );
      return { estado: EstadoComparacionCxp.OK, discrepancias: [] };
    }

    const itemsPorProducto = new Map<string, { cantidad: number; precio: number }>();
    for (const item of data.items) {
      if (item.calidad && item.calidad.toUpperCase() === 'RECHAZADO') {
        continue;
      }
      const entry = itemsPorProducto.get(item.productoId) ?? { cantidad: 0, precio: 0 };
      entry.cantidad += Number(item.cantidadRecibida ?? 0);
      entry.precio = Number(item.precioUnitario ?? entry.precio);
      itemsPorProducto.set(item.productoId, entry);
    }

    const discrepancias: CxpDiscrepanciaDto[] = [];
    let estado: EstadoComparacionCxp = EstadoComparacionCxp.OK;
    const toleranciaCantidad = 0.0001;
    const toleranciaPrecio = 0.01;

    for (const detalle of detalles) {
      const productoId = detalle.producto_id;
      const esperadoCantidad = Number(detalle.cantidad ?? 0);
      const esperadoPrecio = Number(detalle.precio_unitario ?? 0);
      const recibido = itemsPorProducto.get(productoId);
      const cantidadRecibida = recibido?.cantidad ?? 0;
      const precioRecibido = recibido?.precio ?? esperadoPrecio;

      if (Math.abs(cantidadRecibida - esperadoCantidad) > toleranciaCantidad) {
        discrepancias.push({
          tipo: TipoDiscrepanciaCxp.CANTIDAD,
          productoId,
          recibido: cantidadRecibida,
          facturado: cantidadRecibida,
          esperado: esperadoCantidad,
        });
        if (estado !== EstadoComparacionCxp.DESVIACION_PRECIO) {
          estado = EstadoComparacionCxp.DESVIACION_CANTIDAD;
        }
      }

      if (Math.abs(precioRecibido - esperadoPrecio) > toleranciaPrecio) {
        discrepancias.push({
          tipo: TipoDiscrepanciaCxp.PRECIO,
          productoId,
          recibido: precioRecibido,
          facturado: precioRecibido,
          esperado: esperadoPrecio,
        });
        estado = EstadoComparacionCxp.DESVIACION_PRECIO;
      }
    }

    // Detectar productos facturados que no existen en la orden
    for (const [productoId, info] of itemsPorProducto.entries()) {
      const detalleExiste = detalles.find((d) => d.producto_id === productoId);
      if (!detalleExiste) {
        discrepancias.push({
          tipo: TipoDiscrepanciaCxp.CANTIDAD,
          productoId,
          recibido: info.cantidad,
          facturado: info.cantidad,
          esperado: 0,
        });
        if (estado !== EstadoComparacionCxp.DESVIACION_PRECIO) {
          estado = EstadoComparacionCxp.DESVIACION_CANTIDAD;
        }
      }
    }

    return { estado, discrepancias };
  }
}
