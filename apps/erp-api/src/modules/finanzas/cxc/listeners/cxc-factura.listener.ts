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

    // HARDENING E1: Suscribirse a procesamiento de eventos de outbox_events
    // El evento cpe.anulado se procesa desde outbox_events por ContabilidadEventsListener
    // pero también necesitamos procesarlo aquí para revertir CxC
    this.logger.log('📡 [CXC] Listener de CPE anulado se procesará desde outbox_events');
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

    // Si hay saldo pendiente, marcar como anulada/revertida
    if (cxc.monto_pendiente > 0) {
      const { error: updateError } = await client
        .from('cuentas_por_cobrar')
        .update({
          estado: 'ANULADA',
          monto_pendiente: 0,
          observaciones: `REVERTIDA: CPE anulado. Motivo: ${eventData.motivo || 'Sin motivo especificado'}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cxc.id)
        .eq('tenant_id', tenantId);

      if (updateError) {
        this.logger.error(`❌ [CXC] Error revirtiendo CxC ${cxc.id}:`, updateError);
        throw new Error(`Error revirtiendo CxC: ${updateError.message}`);
      }

      this.logger.log(`✅ [CXC] CxC ${cxc.id} revertida exitosamente por anulación de CPE ${cpeId}`);
    } else {
      this.logger.log(`ℹ️ [CXC] CxC ${cxc.id} ya está completamente cobrada, se marca como anulada`);
      
      const { error: updateError } = await client
        .from('cuentas_por_cobrar')
        .update({
          estado: 'ANULADA',
          observaciones: `REVERTIDA: CPE anulado (ya estaba cobrada). Motivo: ${eventData.motivo || 'Sin motivo especificado'}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cxc.id)
        .eq('tenant_id', tenantId);

      if (updateError) {
        this.logger.error(`❌ [CXC] Error actualizando CxC ${cxc.id}:`, updateError);
        throw new Error(`Error actualizando CxC: ${updateError.message}`);
      }
    }
  }
}
