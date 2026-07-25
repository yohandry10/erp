import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { OutboxEventBuilder } from '../../shared/outbox/outbox-event.interface';
import { AuditService } from '../audit/audit.service';

/**
 * Orquesta la anulación fiscal y sus reversos contables/operativos.
 * Mantiene un único límite transaccional lógico para evitar anulaciones parciales.
 */
export class CpeCancellationService {
  private readonly logger = new Logger(CpeCancellationService.name);
  private readonly estadosAnulables = new Set(['FIRMADO', 'ACEPTADO', 'ENVIADO']);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
  ) {}

async anularComprobante(
    cpeId: string,
    motivo: string,
    tenantId: string,
    userId?: string,
    tipoNota: string = '01' // 01 = Anulación de la operación
  ): Promise<any> {
    const client = this.supabaseService.getClient();

    // 1. Obtener el CPE a anular
    const { data: cpe, error: cpeError } = await client
      .from('comprobantes_electronicos')
      .select('*')
      .eq('id', cpeId)
      .eq('tenant_id', tenantId)
      .single();

    if (cpeError || !cpe) {
      throw new NotFoundException('Comprobante electrónico no encontrado');
    }

    const estadoCpe = String(cpe.estado || '').toUpperCase();

    // 2. Validar que el CPE puede ser anulado
    if (estadoCpe === 'ANULADO') {
      throw new BadRequestException('El comprobante ya está anulado');
    }

    if (cpe.nota_credito_id) {
      throw new BadRequestException('El comprobante ya tiene una nota de crédito asociada');
    }

    if (!this.estadosAnulables.has(estadoCpe)) {
      throw new BadRequestException(
        `No se puede anular un comprobante en estado ${cpe.estado}. ` +
        `Solo se pueden anular comprobantes FIRMADOS, ACEPTADOS o ENVIADOS.`
      );
    }

    await this.assertCpeOriginalAccountingReady(client, tenantId, cpe, userId, motivo);

    const contextoOperacion = await this.resolveOperacionReversaContext(client, tenantId, cpe);

    // 3. Generar nota de crédito
    console.log(`📝 [CPE] Generando nota de crédito para CPE ${cpeId}...`);
    const serieNotaCredito = this.resolveSerieNotaCredito(cpe.serie);
    
    const notaCreditoData = {
      tipo_documento: '07',
      serie: serieNotaCredito,
      numero: await this.obtenerSiguienteNumeroNotaCredito(tenantId, serieNotaCredito),
      documento_referencia_tipo: cpe.tipo_documento,
      documento_referencia_serie: cpe.serie,
      documento_referencia_numero: cpe.numero,
      tipo_nota_credito: tipoNota,
      motivo_nota: motivo,
      ruc_emisor: cpe.ruc_emisor,
      razon_social_emisor: cpe.razon_social_emisor,
      tipo_documento_receptor: cpe.tipo_documento_receptor,
      documento_receptor: cpe.documento_receptor,
      razon_social_receptor: cpe.razon_social_receptor,
      moneda: cpe.moneda,
      total_gravadas: -cpe.total_gravadas, // Negativo para revertir
      total_igv: -cpe.total_igv,
      total_venta: -cpe.total_venta,
      tenant_id: tenantId,
      estado: 'BORRADOR',
      created_by: userId,
    };

    const { data: notaCredito, error: notaError } = await client
      .from('comprobantes_electronicos')
      .insert(notaCreditoData)
      .select()
      .single();

    if (notaError) {
      console.error('Error creando nota de crédito:', notaError);
      throw new BadRequestException('No se pudo crear la nota de crédito');
    }

    // 4. Actualizar estado del CPE original
    const { error: updateError } = await client
      .from('comprobantes_electronicos')
      .update({
        estado: 'ANULADO',
        nota_credito_id: notaCredito.id,
        motivo_anulacion: motivo,
        anulado_por: userId,
        anulado_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', cpeId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('Error actualizando estado del CPE:', updateError);
      throw new BadRequestException('No se pudo anular el comprobante');
    }

    await this.aplicarReversionOperativa(client, tenantId, cpe, notaCredito, contextoOperacion, motivo, userId);

    // 5. Emitir evento CPEAnulado para que otros módulos reviertan operaciones
    // Este evento será escuchado por:
    // - Contabilidad: Revertir asiento contable
    // - Finanzas: Liberar CxC
    // - Inventario: Restaurar stock (si aplica)
    try {
      const eventToInsert = OutboxEventBuilder.build({
        tenantId,
        eventType: 'cpe.anulado',
        aggregateType: 'cpe',
        aggregateId: cpeId,
        idempotencyKey: `cpe.anulado:${tenantId}:${cpeId}:${notaCredito.id}`,
        eventData: {
          cpe_id: cpeId,
          nota_credito_id: notaCredito.id,
          serie: cpe.serie,
          numero: cpe.numero,
          total: cpe.total_venta,
          motivo: motivo,
          anulado_por: userId,
          anulado_at: new Date().toISOString(),
          source: contextoOperacion.source,
          venta_pos_id: contextoOperacion.ventaPos?.id,
          pedido_id: contextoOperacion.pedido?.id,
          documento_id: contextoOperacion.documento?.id,
          cxc_id: contextoOperacion.cxc?.id,
          items: contextoOperacion.items.map((item) => ({
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
          })),
        },
      });

      await client
        .from('outbox_events')
        .insert(eventToInsert);

      console.log(`✅ [CPE] Evento CPEAnulado emitido para CPE ${cpeId}`);
    } catch (error) {
      console.error('Error emitiendo evento CPEAnulado:', error);
      // No fallar la anulación si el evento no se puede emitir
    }

    console.log(`✅ [CPE] Comprobante ${cpe.serie}-${cpe.numero} anulado exitosamente`);

    return {
      success: true,
      message: 'Comprobante anulado exitosamente',
      cpe_anulado: {
        id: cpeId,
        serie: cpe.serie,
        numero: cpe.numero,
        estado: 'ANULADO',
      },
      nota_credito: {
        id: notaCredito.id,
        serie: notaCredito.serie,
        numero: notaCredito.numero,
        estado: notaCredito.estado,
      },
    };
  }

private resolveSerieNotaCredito(serie: string): string {
    const normalized = String(serie || '').trim().toUpperCase();
    if (normalized.startsWith('F')) return normalized.replace(/^F/, 'FC');
    if (normalized.startsWith('B')) return normalized.replace(/^B/, 'BC');
    return `NC${normalized}`.slice(0, 4);
  }

private formatCpeNumero(cpe: any): string {
    return `${cpe.serie}-${String(cpe.numero).padStart(8, '0')}`;
  }

async assertCpeOriginalAccountingReady(
    client: any,
    tenantId: string,
    cpe: any,
    userId: string | undefined,
    motivo: string,
  ): Promise<void> {
    const sourceEventId = await this.resolveCpeOriginalSourceEventId(client, tenantId, cpe);

    const block = async (reason: string): Promise<never> => {
      await this.registrarIntentoAnulacionCpeBloqueado(client, tenantId, cpe, userId, motivo, reason);
      throw new ConflictException(reason);
    };

    if (!sourceEventId) {
      return block(
        'No se puede anular el CPE porque no conserva el evento contable original. Revise la trazabilidad antes de emitir una nota de crédito.',
      );
    }

    const { data: sourceEventAsientos, error: asientosError } = await client
      .from('asientos_contables')
      .select('id, source_event_id, referencia')
      .eq('tenant_id', tenantId)
      .eq('source_event_id', sourceEventId)
      .limit(2);

    if (asientosError) {
      throw new BadRequestException(`No se pudo validar el asiento contable original: ${asientosError.message}`);
    }

    let asientos = sourceEventAsientos;

    // En POS, venta.procesada crea primero el asiento y factura.emitida conserva
    // el event_id fiscal del CPE. El listener evita el duplicado por referencia,
    // por lo que ambos UUID son legítimamente distintos. Si el evento fiscal no
    // encuentra asiento, resolver por la misma referencia canónica usada por el
    // listener, siempre dentro del tenant y exigiendo unicidad.
    if ((asientos?.length ?? 0) === 0) {
      const referencia = this.formatCpeNumero(cpe);
      const referenciaVariants = this.variantesReferenciaComprobante(referencia);
      const fallback = await client
        .from('asientos_contables')
        .select('id, source_event_id, referencia')
        .eq('tenant_id', tenantId)
        .in('referencia', referenciaVariants)
        .limit(2);

      if (fallback.error) {
        throw new BadRequestException(
          `No se pudo validar el asiento contable original por referencia: ${fallback.error.message}`,
        );
      }

      asientos = fallback.data;
    }

    if ((asientos?.length ?? 0) !== 1) {
      return block(
        `No se puede anular el CPE porque se esperaban 1 asiento contable original y se encontraron ${asientos?.length ?? 0}.`,
      );
    }

    const { data: detalles, error: detallesError } = await client
      .from('detalle_asientos')
      .select('id')
      .eq('asiento_id', asientos[0].id)
      .limit(1);

    if (detallesError) {
      throw new BadRequestException(`No se pudo validar el detalle del asiento contable original: ${detallesError.message}`);
    }

    if (!detalles?.length) {
      return block('No se puede anular el CPE porque el asiento contable original no tiene detalle.');
    }
  }

private variantesReferenciaComprobante(referencia: string): string[] {
    const match = /^([A-Za-z0-9]+)-(\d{1,8})$/.exec(String(referencia).trim());
    if (!match) return [referencia];
    const serie = match[1].toUpperCase();
    return [...new Set([
      referencia,
      `${serie}-${String(Number(match[2]))}`,
      `${serie}-${match[2].padStart(8, '0')}`,
    ])];
  }

private async registrarIntentoAnulacionCpeBloqueado(
    _client: any,
    tenantId: string,
    cpe: any,
    userId: string | undefined,
    motivo: string,
    reason: string,
  ): Promise<void> {
    try {
      await this.auditService.registrarCambio(
        'comprobantes_electronicos',
        'UPDATE',
        userId ?? 'system',
        {
          old: { id: cpe.id, estado: cpe.estado, nota_credito_id: cpe.nota_credito_id ?? null },
          new: { anulacion_bloqueada: true, motivo_anulacion: motivo, motivo_bloqueo: reason },
        },
        tenantId,
        cpe.id,
        {
          accion: 'ANULACION_CPE_BLOQUEADA',
          source_event_id: cpe.event_id || cpe.source_event_id || null,
        },
      );
    } catch (auditError) {
      this.logger.warn(`No se pudo auditar intento bloqueado de anulación CPE ${cpe.id}: ${(auditError as Error).message}`);
    }
  }

private async resolveCpeOriginalSourceEventId(client: any, tenantId: string, cpe: any): Promise<string | null> {
    const direct = cpe.event_id || cpe.source_event_id;
    if (direct) return direct;

    const { data, error } = await client
      .from('cpe')
      .select('event_id')
      .eq('tenant_id', tenantId)
      .eq('id', cpe.id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(`No se pudo resolver el evento contable original del CPE: ${error.message}`);
    }

    return data?.event_id || null;
  }

private async resolveOperacionReversaContext(client: any, tenantId: string, cpe: any): Promise<any> {
    const numeroDocumento = this.formatCpeNumero(cpe);
    const numeroVariants = Array.from(new Set([
      String(cpe.numero),
      String(cpe.numero).padStart(8, '0'),
    ]));

    const { data: ventaPos } = await client
      .from('ventas_pos')
      .select('id, numero_ticket, total, estado, sesion_caja_id')
      .eq('tenant_id', tenantId)
      .eq('cpe_id', cpe.id)
      .maybeSingle();

    const { data: pedido } = await client
      .from('pedidos_venta')
      .select('id, numero, estado, factura_id')
      .eq('tenant_id', tenantId)
      .eq('factura_id', cpe.id)
      .maybeSingle();

    let documento: any = null;
    const { data: documentos } = await client
      .from('documentos')
      .select('id, serie, numero, estado, total, created_at')
      .eq('tenant_id', tenantId)
      .eq('serie', cpe.serie)
      .in('numero', numeroVariants)
      .limit(20);
    documento = this.pickOperationalDocument(documentos ?? [], cpe);

    let cxc: any = null;
    if (documento?.id) {
      const { data } = await client
        .from('cuentas_por_cobrar')
        .select('id, documento_id, numero_documento, monto_total, monto_pendiente, estado')
        .eq('tenant_id', tenantId)
        .eq('documento_id', documento.id)
        .maybeSingle();
      cxc = data ?? null;
    }
    if (!cxc) {
      const { data } = await client
        .from('cuentas_por_cobrar')
        .select('id, documento_id, numero_documento, monto_total, monto_pendiente, estado')
        .eq('tenant_id', tenantId)
        .eq('numero_documento', numeroDocumento)
        .limit(20);
      cxc = this.pickCuentaPorCobrar(data ?? [], cpe);
    }

    let items: Array<{ producto_id: string; cantidad: number; precio_unitario?: number }> = [];
    if (ventaPos?.id) {
      const { data } = await client
        .from('detalle_ventas_pos')
        .select('producto_id, cantidad, precio_unitario')
        .eq('tenant_id', tenantId)
        .eq('venta_pos_id', ventaPos.id);
      items = (data ?? []).map((item: any) => ({
        producto_id: item.producto_id,
        cantidad: Number(item.cantidad ?? 0),
        precio_unitario: Number(item.precio_unitario ?? 0),
      }));
    } else if (pedido?.id) {
      const { data } = await client
        .from('pedidos_venta_detalle')
        .select('producto_id, cantidad_despachada, cantidad, precio_unitario')
        .eq('tenant_id', tenantId)
        .eq('pedido_id', pedido.id);
      items = (data ?? []).map((item: any) => ({
        producto_id: item.producto_id,
        cantidad: Number(item.cantidad_despachada ?? item.cantidad ?? 0),
        precio_unitario: Number(item.precio_unitario ?? 0),
      }));
    }

    return {
      source: ventaPos?.id ? 'POS' : pedido?.id ? 'PEDIDO' : 'CPE',
      ventaPos,
      pedido,
      documento,
      cxc,
      items: items.filter((item) => item.producto_id && item.cantidad > 0),
    };
  }

private pickOperationalDocument(documentos: any[], cpe: any): any | null {
    if (!documentos.length) return null;
    const totalCpe = Number(cpe.total_venta ?? 0);
    return documentos
      .map((documento) => ({
        documento,
        totalDiff: Math.abs(Number(documento.total ?? 0) - totalCpe),
        createdAt: new Date(documento.created_at ?? 0).getTime(),
      }))
      .sort((a, b) => a.totalDiff - b.totalDiff || b.createdAt - a.createdAt)[0]?.documento ?? null;
  }

private pickCuentaPorCobrar(cuentas: any[], cpe: any): any | null {
    if (!cuentas.length) return null;
    const totalCpe = Number(cpe.total_venta ?? 0);
    return cuentas
      .map((cuenta) => ({
        cuenta,
        totalDiff: Math.abs(Number(cuenta.monto_total ?? 0) - totalCpe),
      }))
      .sort((a, b) => a.totalDiff - b.totalDiff)[0]?.cuenta ?? null;
  }

private async aplicarReversionOperativa(
    client: any,
    tenantId: string,
    cpe: any,
    notaCredito: any,
    contexto: any,
    motivo: string,
    userId?: string,
  ): Promise<void> {
    if (contexto.documento?.id) {
      const { error } = await client
        .from('documentos')
        .update({
          estado: 'ANULADO',
          motivo_anulacion: motivo,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('id', contexto.documento.id);
      if (error) throw new BadRequestException(`No se pudo anular el documento operativo: ${error.message}`);
    }

    if (contexto.cxc?.id && !['ANULADA', 'REVERTIDA'].includes(String(contexto.cxc.estado || '').toUpperCase())) {
      const { error } = await client
        .from('cuentas_por_cobrar')
        .update({
          estado: 'ANULADA',
          monto_pendiente: 0,
          observaciones: `REVERTIDA: CPE ${cpe.serie}-${cpe.numero} anulado con NC ${notaCredito.serie}-${notaCredito.numero}. Motivo: ${motivo}`,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('id', contexto.cxc.id);
      if (error) throw new BadRequestException(`No se pudo revertir CxC: ${error.message}`);
    }

    if (contexto.pedido?.id) {
      const { error } = await client
        .from('pedidos_venta')
        .update({
          estado: 'ANULADO',
          updated_at: new Date().toISOString(),
          metadata: {
            ...(contexto.pedido.metadata ?? {}),
            reverso_cpe_id: cpe.id,
            nota_credito_id: notaCredito.id,
            motivo_anulacion: motivo,
          },
        })
        .eq('tenant_id', tenantId)
        .eq('id', contexto.pedido.id);
      if (error) throw new BadRequestException(`No se pudo marcar el pedido como anulado: ${error.message}`);
    }

    if (contexto.ventaPos?.id) {
      const { error } = await client
        .from('ventas_pos')
        .update({
          estado: 'ANULADA',
          updated_at: new Date().toISOString(),
          metadata: {
            reverso_cpe_id: cpe.id,
            nota_credito_id: notaCredito.id,
            motivo_anulacion: motivo,
          },
        })
        .eq('tenant_id', tenantId)
        .eq('id', contexto.ventaPos.id);
      if (error) throw new BadRequestException(`No se pudo marcar la venta POS como anulada: ${error.message}`);

      await this.registrarReversionCajaPos(client, tenantId, contexto.ventaPos, cpe, notaCredito, motivo, userId);
    }

    await this.revertirStockVenta(client, tenantId, contexto, cpe, notaCredito, motivo, userId);
  }

private async revertirStockVenta(
    client: any,
    tenantId: string,
    contexto: any,
    cpe: any,
    notaCredito: any,
    motivo: string,
    userId?: string,
  ): Promise<void> {
    for (const item of contexto.items) {
      const { data: movimientoExistente, error: lookupError } = await client
        .from('movimientos_inventario')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('producto_id', item.producto_id)
        .eq('referencia_id', notaCredito.id)
        .eq('referencia_tipo', 'REVERSO_VENTA')
        .maybeSingle();
      if (lookupError && lookupError.code !== 'PGRST116') {
        throw new BadRequestException(`No se pudo verificar reverso de inventario: ${lookupError.message}`);
      }
      if (movimientoExistente) continue;

      const { data: producto, error: productoError } = await client
        .from('productos')
        .select('id, controla_stock, es_servicio')
        .eq('tenant_id', tenantId)
        .eq('id', item.producto_id)
        .single();
      if (productoError || !producto) {
        throw new BadRequestException(`Producto ${item.producto_id} no encontrado para reverso`);
      }

      if (producto.es_servicio === true || producto.controla_stock === false) continue;

      const referenciaOrigenId = contexto.ventaPos?.id ?? contexto.pedido?.id;
      if (!referenciaOrigenId) {
        throw new BadRequestException('No se pudo identificar la venta origen del reverso de inventario');
      }

      const { data: salidaOrigen, error: salidaOrigenError } = await client
        .from('movimientos_inventario')
        .select('almacen_id')
        .eq('tenant_id', tenantId)
        .eq('producto_id', item.producto_id)
        .eq('tipo', 'SALIDA')
        .eq('referencia_id', referenciaOrigenId)
        .not('almacen_id', 'is', null)
        .limit(1)
        .maybeSingle();
      if (salidaOrigenError || !salidaOrigen?.almacen_id) {
        throw new BadRequestException(
          `No se pudo resolver el almacén de la salida original: ${salidaOrigenError?.message || 'sin movimiento físico'}`,
        );
      }

      const { error: movimientoError } = await client.rpc('aplicar_movimiento_inventario_tx', {
        p_tenant_id: tenantId,
        p_producto_id: item.producto_id,
        p_almacen_id: salidaOrigen.almacen_id,
        p_tipo: 'ENTRADA',
        p_cantidad: item.cantidad,
        p_referencia_tipo: 'REVERSO_VENTA',
        p_referencia_id: notaCredito.id,
        p_notas: `Entrada por nota de crédito ${notaCredito.serie}-${notaCredito.numero}. Motivo: ${motivo}`,
        p_created_by: userId ?? null,
        p_metadata: {
          source: contexto.source,
          cpe_id: cpe.id,
          nota_credito_id: notaCredito.id,
          venta_origen_id: referenciaOrigenId,
        },
      });
      if (movimientoError) throw new BadRequestException(`No se pudo registrar Kardex de reverso: ${movimientoError.message}`);
    }
  }

private async registrarReversionCajaPos(
    client: any,
    tenantId: string,
    ventaPos: any,
    cpe: any,
    notaCredito: any,
    motivo: string,
    userId?: string,
  ): Promise<void> {
    const { data: efectivo } = await client
      .from('movimientos_caja')
      .select('id, monto, sesion_caja_id')
      .eq('tenant_id', tenantId)
      .eq('referencia_tipo', 'venta_pos')
      .eq('referencia_documento', ventaPos.id)
      .eq('tipo_movimiento', 'VENTA')
      .maybeSingle();

    if (!efectivo?.id || Number(efectivo.monto ?? 0) <= 0) return;

    const { data: reversoExistente } = await client
      .from('movimientos_caja')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('referencia_tipo', 'reverso_venta_pos')
      .eq('referencia_documento', notaCredito.id)
      .maybeSingle();
    if (reversoExistente) return;

    const { error } = await client.rpc('registrar_movimiento_caja', {
      p_sesion_caja_id: efectivo.sesion_caja_id,
      p_tipo_movimiento: 'AJUSTE',
      p_monto: -Math.abs(Number(efectivo.monto)),
      p_referencia_documento: notaCredito.id,
      p_referencia_tipo: 'reverso_venta_pos',
      p_motivo: `Reverso POS ${cpe.serie}-${cpe.numero}: ${motivo}`,
      p_usuario_id: userId ?? null,
      p_metadata: {
        cpe_id: cpe.id,
        nota_credito_id: notaCredito.id,
        venta_pos_id: ventaPos.id,
      },
    });
    if (error) throw new BadRequestException(`No se pudo registrar reverso de caja POS: ${error.message}`);
  }

private async obtenerSiguienteNumeroNotaCredito(tenantId: string, serie: string): Promise<number> {
    const client = this.supabaseService.getClient();
    
    const { data, error } = await client
      .from('comprobantes_electronicos')
      .select('numero')
      .eq('tenant_id', tenantId)
      .eq('serie', serie)
      .in('tipo_documento', ['07', 'NOTA_CREDITO'])
      .order('numero', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error obteniendo último número de nota de crédito:', error);
      return 1;
    }

    return data && data.length > 0 ? data[0].numero + 1 : 1;
  }
}
