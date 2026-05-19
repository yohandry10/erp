import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBusService, ERPEvent, FacturaEmitidaEvent } from '../../../../shared/events/event-bus.service';
import { CxcService } from '../cxc.service';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';

@Injectable()
export class CxcFacturaListener implements OnModuleInit {
  private readonly logger = new Logger(CxcFacturaListener.name);

  constructor(
    private readonly eventBus: EventBusService,
    private readonly cxcService: CxcService,
    private readonly supabase: SupabaseService,
  ) {}

  onModuleInit(): void {
    this.logger.log('📡 [CXC] Suscribiendo listeners de eventos CPE');

    // Listener para factura emitida (crear CxC)
    this.eventBus.onFacturaEmitidaEvent(async (event: ERPEvent) => {
      const payload = event?.data as FacturaEmitidaEvent | undefined;
      if (!payload) {
        this.logger.warn('⚠️ [CXC] Evento factura.emitida sin payload, se omite');
        return;
      }

      try {
        // HARDENING: crear CxC idempotente usando tenant del contexto del evento.
        await this.cxcService.crearCuentaPorCobrarDesdeFactura(payload);
      } catch (error) {
        this.logger.error(
          `❌ [CXC] Error procesando FacturaEmitidaEvent ${payload.eventId || 'sin-id'}:`,
          error,
        );
      }
    });

    this.eventBus.on('cpe.anulado', async (event: ERPEvent) => {
      try {
        await this.procesarEventoCpeAnulado(event?.data ?? event);
      } catch (error) {
        this.logger.error('❌ [CXC] Error procesando CPE anulado desde EventBus:', error);
      }
    });

    this.logger.log('📡 [CXC] Listener de CPE anulado conectado al EventBus');
  }

  /**
   * HARDENING E1: Método público para procesar evento cpe.anulado desde outbox_events
   * Este método será llamado por el procesador de eventos de outbox
   */
  async procesarEventoCpeAnulado(evento: any): Promise<void> {
    const eventData = evento.event_data || evento;
    await this.revertirCxcPorCpeAnulado(eventData);
  }

  /**
   * HARDENING E1: Revierte la cuenta por cobrar cuando se anula el CPE asociado
   */
  private async revertirCxcPorCpeAnulado(eventData: any): Promise<void> {
    const client = this.supabase.getClient();
    const tenantId = eventData.tenant_id;
    const cpeId = eventData.cpe_id;

    if (!tenantId || !cpeId) {
      this.logger.warn('⚠️ [CXC] Evento cpe.anulado sin tenant_id o cpe_id, se omite');
      return;
    }

    this.logger.log(`🔄 [CXC] Revirtiendo CxC para CPE anulado: ${cpeId}`);

    // Buscar la CxC asociada al CPE
    const { data: cxc, error: cxcError } = await client
      .from('cuentas_por_cobrar')
      .select('id, monto_pendiente, monto_total, estado')
      .eq('tenant_id', tenantId)
      .eq('documento_id', cpeId)
      .maybeSingle();

    if (cxcError) {
      this.logger.error(`❌ [CXC] Error buscando CxC para CPE ${cpeId}:`, cxcError);
      throw new Error(`Error buscando CxC: ${cxcError.message}`);
    }

    if (!cxc) {
      this.logger.warn(`ℹ️ [CXC] No se encontró CxC asociada al CPE ${cpeId}, puede que no haya sido creada o ya fue revertida`);
      return;
    }

    // Validar que la CxC puede ser revertida
    if (cxc.estado === 'ANULADA' || cxc.estado === 'REVERTIDA') {
      this.logger.warn(`ℹ️ [CXC] CxC ${cxc.id} ya está en estado ${cxc.estado}, no se revierte`);
      return;
    }

    // Calcular si hubo cobros aplicados
    const montoTotal = Number(cxc.monto_total || 0);
    const montoPendiente = Number(cxc.monto_pendiente || 0);
    const montoCobrado = montoTotal - montoPendiente;

    // Registrar cobro de reversa si hubo pagos parciales o totales
    if (montoCobrado > 0) {
      this.logger.warn(
        `⚠️ [CXC] CxC ${cxc.id} tiene cobros por ${montoCobrado}. Se registra pago de reversa por anulación de CPE.`,
      );

      // Crear pago de reversa (negativo) para mantener audit trail
      try {
        await client.from('cxc_pagos').insert({
          tenant_id: tenantId,
          cuenta_id: cxc.id,
          monto: -montoCobrado,
          tipo: 'REVERSA_ANULACION',
          referencia: `REVERSA-CPE-${cpeId}`,
          observaciones: `Reversa automática por anulación de CPE ${cpeId}. Motivo: ${eventData.motivo || 'Sin motivo'}`,
          fecha_pago: new Date().toISOString(),
          idempotency_key: `cxc.reversa.anulacion:${tenantId}:${cxc.id}:${cpeId}`,
        });
      } catch (pagoError) {
        this.logger.error(`❌ [CXC] Error creando pago de reversa para CxC ${cxc.id}:`, pagoError);
        // No bloquear la anulación de la CxC
      }
    }

    // Marcar CxC como anulada
    const observaciones = montoCobrado > 0
      ? `REVERTIDA: CPE anulado. Cobros revertidos: ${montoCobrado.toFixed(2)}. Motivo: ${eventData.motivo || 'Sin motivo especificado'}`
      : `REVERTIDA: CPE anulado. Sin cobros que revertir. Motivo: ${eventData.motivo || 'Sin motivo especificado'}`;

    const { error: updateError } = await client
      .from('cuentas_por_cobrar')
      .update({
        estado: 'ANULADA',
        monto_pendiente: 0,
        observaciones,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cxc.id)
      .eq('tenant_id', tenantId);

    if (updateError) {
      this.logger.error(`❌ [CXC] Error revirtiendo CxC ${cxc.id}:`, updateError);
      throw new Error(`Error revirtiendo CxC: ${updateError.message}`);
    }

    this.logger.log(
      `✅ [CXC] CxC ${cxc.id} revertida exitosamente por anulación de CPE ${cpeId}` +
        (montoCobrado > 0 ? ` (cobros revertidos: ${montoCobrado.toFixed(2)})` : ''),
    );
  }
}
