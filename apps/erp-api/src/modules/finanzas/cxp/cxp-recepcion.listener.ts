import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBusService, RecepcionRegistradaEvent, ERPEvent } from '../../../shared/events/event-bus.service';
import { CxpService } from './cxp.service';
import { CrearCxpDto } from './dto';

/**
 * Listener que escucha el evento RecepcionRegistrada y crea automáticamente
 * una Cuenta por Pagar (CxP) cuando se registra una recepción de mercancía.
 */
@Injectable()
export class CxpRecepcionListener implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly cxpService: CxpService,
  ) {}

  onModuleInit() {
    console.log('🎧 [CxpRecepcionListener] Registrando listener para recepcion.registrada');
    this.eventBus.onRecepcionRegistrada(this.handleRecepcionRegistrada.bind(this));
  }

  /**
   * Maneja el evento RecepcionRegistrada y crea una CxP automáticamente
   */
  private async handleRecepcionRegistrada(event: ERPEvent): Promise<void> {
    const data = event.data as RecepcionRegistradaEvent;

    console.log('📦 [CxpRecepcionListener] Recibido evento RecepcionRegistrada:', {
      recepcionId: data.recepcionId,
      numeroRecepcion: data.numeroRecepcion,
      proveedorId: data.proveedorId,
      total: data.total,
    });

    try {
      // Verificar si ya existe una CxP para esta recepción
      const { data: cxpExistente } = await this.cxpService['supabase']
        .getClient()
        .from('cuentas_por_pagar')
        .select('id')
        .eq('tenant_id', data.tenantId)
        .eq('recepcion_id', data.recepcionId)
        .maybeSingle();

      if (cxpExistente) {
        console.log('⚠️ [CxpRecepcionListener] Ya existe una CxP para esta recepción, omitiendo creación');
        return;
      }

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
        observaciones: `CxP generada automáticamente desde recepción ${data.numeroRecepcion}`,
      };

      // Crear la CxP
      const resultado = await this.cxpService.crearCuentaPorPagar(
        data.tenantId,
        crearCxpDto,
        undefined, // No hay usuario específico en eventos automáticos
      );

      console.log('✅ [CxpRecepcionListener] CxP creada exitosamente:', {
        cxpId: resultado.data.id,
        recepcionId: data.recepcionId,
        proveedor: data.proveedorNombre,
        total: data.total,
      });
    } catch (error) {
      console.error('❌ [CxpRecepcionListener] Error creando CxP desde recepción:', error);
      // No lanzar el error para no afectar el flujo principal
      // El error se registra para análisis posterior
    }
  }
}
