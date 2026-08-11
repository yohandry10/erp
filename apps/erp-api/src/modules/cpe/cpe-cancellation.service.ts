import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { AuditService } from '../audit/audit.service';

/**
 * Puerta de aplicación para el cierre fiscal de una anulación CPE.
 *
 * Las escrituras viven en dos RPC SECURITY DEFINER y nunca se reparten entre
 * llamadas Supabase: solicitar crea/vincula la nota 07; finalizar aplica todos
 * los reversos sólo después del CDR aceptado.
 */
export class CpeCancellationService {
  private readonly logger = new Logger(CpeCancellationService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
  ) {}

  async anularComprobante(
    cpeId: string,
    motivo: string,
    tenantId: string,
    userId?: string,
    tipoNota: string = '01',
    requestIdempotencyKey?: string,
  ): Promise<any> {
    if (!userId) {
      throw new BadRequestException(
        'La solicitud de anulación requiere un actor autenticado',
      );
    }

    const client = this.supabaseService.getClient();
    const idempotencyKey = String(
      requestIdempotencyKey ?? `cpe.cancel.request:${tenantId}:${cpeId}`,
    ).trim();
    const { data, error } = await client.rpc('solicitar_anulacion_cpe_tx', {
      p_cpe_id: cpeId,
      p_tenant_id: tenantId,
      p_actor_id: userId,
      p_motivo: motivo,
      p_tipo_nota: tipoNota,
      p_idempotency_key: idempotencyKey,
    });

    if (error) this.throwAtomicCancellationError(error, 'solicitar');

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.nota_credito?.id || !result?.cpe_anulado?.id) {
      throw new BadRequestException(
        'La solicitud atómica no devolvió la nota de crédito vinculada',
      );
    }
    return result;
  }

  async finalizarAnulacionAceptada(
    notaCreditoId: string,
    tenantId: string,
    userId?: string,
    finalizationIdempotencyKey?: string,
  ): Promise<any | null> {
    const client = this.supabaseService.getClient();
    const idempotencyKey = String(
      finalizationIdempotencyKey ??
        `cpe.cancel.final:${tenantId}:${notaCreditoId}`,
    ).trim();
    const { data, error } = await client.rpc('finalizar_anulacion_cpe_tx', {
      p_nota_credito_id: notaCreditoId,
      p_tenant_id: tenantId,
      p_actor_id: userId ?? null,
      p_idempotency_key: idempotencyKey,
    });

    if (error) this.throwAtomicCancellationError(error, 'finalizar');

    const result = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result !== 'object') {
      throw new BadRequestException(
        'La finalización atómica no devolvió un resultado válido',
      );
    }
    return result?.participa === false ? null : result;
  }

  async obtenerEstadoFinanciero(
    cpeId: string,
    tenantId: string,
    userId?: string,
  ): Promise<any> {
    if (!userId) {
      throw new BadRequestException(
        'La consulta financiera requiere un actor autenticado',
      );
    }
    const client = this.supabaseService.getClient();
    const { data: cpe, error: cpeError } = await client
      .from('cpe')
      .select(
        'id, tenant_id, documento_id, nota_credito_id, tipo_documento, serie, numero, estado, moneda, total, total_venta, metadata',
      )
      .eq('tenant_id', tenantId)
      .eq('id', cpeId)
      .maybeSingle();
    if (cpeError) this.throwAtomicCancellationError(cpeError, 'finalizar');
    if (!cpe) throw new NotFoundException('Comprobante no encontrado en el tenant');

    let notaCredito: any = null;
    if (cpe.nota_credito_id) {
      const noteResponse = await client
        .from('cpe')
        .select('id, tipo_documento, serie, numero, estado, estado_sunat, sunat_status, cdr_sunat, motivo_nota, metadata')
        .eq('tenant_id', tenantId)
        .eq('id', cpe.nota_credito_id)
        .maybeSingle();
      if (noteResponse.error) {
        this.throwAtomicCancellationError(noteResponse.error, 'finalizar');
      }
      notaCredito = noteResponse.data;
    }

    let cxc: any = null;
    if (cpe.documento_id) {
      const cxcResponse = await client
        .from('cuentas_por_cobrar')
        .select('id, cliente_id, documento_id, numero_documento, moneda, monto_total, monto_pendiente, saldo_pendiente, saldo, estado')
        .eq('tenant_id', tenantId)
        .eq('documento_id', cpe.documento_id)
        .limit(2);
      if (cxcResponse.error) {
        this.throwAtomicCancellationError(cxcResponse.error, 'finalizar');
      }
      if ((cxcResponse.data?.length ?? 0) > 1) {
        throw new ConflictException(
          'El CPE tiene más de una cuenta por cobrar y requiere saneamiento previo',
        );
      }
      cxc = cxcResponse.data?.[0] ?? null;
    }
    if (!cxc) {
      const posResponse = await client
        .from('ventas_pos')
        .select('id, cuenta_por_cobrar_id')
        .eq('tenant_id', tenantId)
        .eq('cpe_id', cpeId)
        .maybeSingle();
      if (posResponse.error) {
        this.throwAtomicCancellationError(posResponse.error, 'finalizar');
      }
      if (posResponse.data?.cuenta_por_cobrar_id) {
        const cxcResponse = await client
          .from('cuentas_por_cobrar')
          .select('id, cliente_id, documento_id, numero_documento, moneda, monto_total, monto_pendiente, saldo_pendiente, saldo, estado')
          .eq('tenant_id', tenantId)
          .eq('id', posResponse.data.cuenta_por_cobrar_id)
          .maybeSingle();
        if (cxcResponse.error) {
          this.throwAtomicCancellationError(cxcResponse.error, 'finalizar');
        }
        cxc = cxcResponse.data;
      }
    }

    let cobros: any[] = [];
    let ajustesFinancieros: any[] = [];
    if (cxc?.id) {
      const [paymentsResponse, reversalsResponse, fiscalOperationsResponse] = await Promise.all([
        client
          .from('cxc_pagos')
          .select('id, cuenta_id, tipo, monto, moneda, fecha_pago, metodo_pago, referencia, cuenta_bancaria_id, event_id, idempotency_key, estado, activo, metadata, created_at')
          .eq('tenant_id', tenantId)
          .eq('cuenta_id', cxc.id)
          .order('created_at', { ascending: true }),
        client
          .from('cxc_cobro_reversas')
          .select('id, pago_id, medio, monto, moneda, motivo, event_id, resultado, created_at')
          .eq('tenant_id', tenantId)
          .eq('cpe_id', cpeId),
        client
          .from('operaciones_fiscales_financieras')
          .select('id, tipo, monto, monto_contabilizado, moneda, estado, source_event_id, idempotency_key, referencia, created_at')
          .eq('tenant_id', tenantId)
          .eq('origen', 'CLIENTE')
          .eq('cxc_id', cxc.id),
      ]);
      if (paymentsResponse.error) {
        this.throwAtomicCancellationError(paymentsResponse.error, 'finalizar');
      }
      if (reversalsResponse.error) {
        this.throwAtomicCancellationError(reversalsResponse.error, 'finalizar');
      }
      if (fiscalOperationsResponse.error) {
        this.throwAtomicCancellationError(fiscalOperationsResponse.error, 'finalizar');
      }
      const reversalByPayment = new Map(
        (reversalsResponse.data ?? []).map((row: any) => [row.pago_id, row]),
      );
      const fiscalByEvent = new Map(
        (fiscalOperationsResponse.data ?? []).map((row: any) => [row.source_event_id, row]),
      );
      const movements = paymentsResponse.data ?? [];
      cobros = movements.filter(
        (movement: any) => String(movement.tipo ?? 'PAGO').toUpperCase() === 'PAGO',
      ).map((payment: any) => ({
        ...payment,
        reversa: reversalByPayment.get(payment.id) ?? null,
      }));
      ajustesFinancieros = movements.filter(
        (movement: any) => String(movement.tipo ?? 'PAGO').toUpperCase() !== 'PAGO',
      ).map((movement: any) => ({
        ...movement,
        operacion_fiscal: fiscalByEvent.get(movement.event_id) ?? null,
      }));
    }

    const { data: sesiones, error: sesionesError } = await client
      .from('sesiones_caja')
      .select('id, caja_id, moneda, estado, hora_apertura, cajas:caja_id(id, codigo, nombre)')
      .eq('tenant_id', tenantId)
      .eq('estado', 'ABIERTA')
      .or(
        `cajero_id.eq.${userId},usuario_id.eq.${userId},abierto_por.eq.${userId},usuario_apertura.eq.${userId}`,
      )
      .order('hora_apertura', { ascending: false });
    if (sesionesError) {
      this.throwAtomicCancellationError(sesionesError, 'finalizar');
    }

    const notaAceptada = Boolean(
      notaCredito &&
        String(notaCredito.estado).toUpperCase() === 'ACEPTADO' &&
        String(notaCredito.cdr_sunat ?? '').trim(),
    );
    const activos = cobros.filter(
      (payment) =>
        payment.activo !== false &&
        String(payment.estado ?? 'ACTIVO').toUpperCase() === 'ACTIVO' &&
        !payment.reversa,
    );
    const ajustesActivos = ajustesFinancieros.filter(
      (movement) =>
        movement.activo !== false &&
        !['ANULADO', 'REVERTIDO', 'INACTIVO'].includes(
          String(movement.estado ?? 'ACTIVO').toUpperCase(),
        ),
    );
    return {
      cpe,
      nota_credito: notaCredito,
      cxc,
      cobros,
      ajustes_financieros: ajustesFinancieros,
      ajustes_activos: ajustesActivos,
      sesiones_caja: sesiones ?? [],
      nota_aceptada: notaAceptada,
      cobros_activos: activos.length,
      estado_flujo:
        String(cpe.estado).toUpperCase() === 'ANULADO'
          ? 'ANULADO'
          : !notaCredito
            ? 'REQUIERE_NOTA_CREDITO'
            : !notaAceptada
              ? 'PENDIENTE_CDR'
              : ajustesActivos.length > 0
                ? 'BLOQUEADO_AJUSTE_REQUIERE_REVERSA'
                : activos.length > 0
                ? 'REQUIERE_REEMBOLSOS'
                : 'LISTO_PARA_FINALIZAR',
    };
  }

  async revertirCobroAplicado(
    cpeId: string,
    pagoId: string,
    payload: { motivo: string; sesion_caja_id?: string },
    tenantId: string,
    userId?: string,
    idempotencyKey?: string,
  ): Promise<any> {
    if (!userId) {
      throw new BadRequestException('La reversa requiere un actor autenticado');
    }
    const key = String(idempotencyKey ?? '').trim().toLowerCase();
    if (key.length < 8 || key.length > 200) {
      throw new BadRequestException(
        'Idempotency-Key es obligatorio y debe tener entre 8 y 200 caracteres',
      );
    }
    const { data, error } = await this.supabaseService
      .getClient()
      .rpc('revertir_cobro_cxc_anulacion_tx', {
        p_tenant_id: tenantId,
        p_actor_id: userId,
        p_cpe_id: cpeId,
        p_pago_id: pagoId,
        p_payload: {
          motivo: payload.motivo.trim(),
          ...(payload.sesion_caja_id
            ? { sesion_caja_id: payload.sesion_caja_id }
            : {}),
        },
        p_idempotency_key: key,
      });
    if (error) this.throwAtomicCancellationError(error, 'revertir');
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result !== 'object') {
      throw new BadRequestException('La reversa atómica no devolvió resultado');
    }
    return result;
  }

  async revertirAjusteAplicado(
    cpeId: string,
    operacionId: string,
    payload: { motivo: string },
    tenantId: string,
    userId?: string,
    idempotencyKey?: string,
  ): Promise<any> {
    if (!userId) {
      throw new BadRequestException('La reversa requiere un actor autenticado');
    }
    const key = String(idempotencyKey ?? '').trim().toLowerCase();
    if (key.length < 8 || key.length > 200) {
      throw new BadRequestException(
        'Idempotency-Key es obligatorio y debe tener entre 8 y 200 caracteres',
      );
    }
    const { data, error } = await this.supabaseService
      .getClient()
      .rpc('revertir_ajuste_cxc_anulacion_tx', {
        p_tenant_id: tenantId,
        p_actor_id: userId,
        p_cpe_id: cpeId,
        p_operacion_id: operacionId,
        p_payload: { motivo: payload.motivo.trim() },
        p_idempotency_key: key,
      });
    if (error) this.throwAtomicCancellationError(error, 'revertir');
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result !== 'object') {
      throw new BadRequestException('La reversa atómica del ajuste no devolvió resultado');
    }
    return result;
  }

  private throwAtomicCancellationError(
    error: any,
    operation: 'solicitar' | 'finalizar' | 'revertir',
  ): never {
    const message = String(error?.message ?? error ?? 'error desconocido');
    if (error?.code === '42501') {
      throw new ForbiddenException(message);
    }
    if (error?.code === 'P0002' || message.includes('NOT_FOUND')) {
      throw new NotFoundException(
        'Comprobante electrónico no encontrado en el tenant',
      );
    }
    if (
      error?.code === '23505' ||
      error?.code === '40001' ||
      message.includes('CONFLICT')
    ) {
      throw new ConflictException(
        `Conflicto idempotente al ${operation} la anulación: ${message}`,
      );
    }
    throw new BadRequestException(
      `No se pudo ${operation} la anulación de forma transaccional: ${message}`,
    );
  }

  private resolveSerieNotaCredito(serie: string): string {
    const normalized = String(serie || '').trim().toUpperCase();
    const correlativoSerie = normalized
      .replace(/\D/g, '')
      .slice(-2)
      .padStart(2, '0');
    if (normalized.startsWith('F')) return `FC${correlativoSerie}`;
    if (normalized.startsWith('B')) return `BC${correlativoSerie}`;
    return `NC${correlativoSerie}`;
  }

  private formatCpeNumero(cpe: any): string {
    return `${cpe.serie}-${String(cpe.numero).padStart(8, '0')}`;
  }

  /**
   * Compatibilidad de lectura para diagnósticos previos. La RPC 448 vuelve a
   * ejecutar esta garantía bajo lock antes de cualquier escritura.
   */
  async assertCpeOriginalAccountingReady(
    client: any,
    tenantId: string,
    cpe: any,
    userId: string | undefined,
    motivo: string,
  ): Promise<void> {
    const sourceEventId = await this.resolveCpeOriginalSourceEventId(
      client,
      tenantId,
      cpe,
    );

    const block = async (reason: string): Promise<never> => {
      await this.registrarIntentoAnulacionCpeBloqueado(
        client,
        tenantId,
        cpe,
        userId,
        motivo,
        reason,
      );
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
      throw new BadRequestException(
        `No se pudo validar el asiento contable original: ${asientosError.message}`,
      );
    }

    let asientos = sourceEventAsientos;
    if ((asientos?.length ?? 0) === 0) {
      const referencia = this.formatCpeNumero(cpe);
      const fallback = await client
        .from('asientos_contables')
        .select('id, source_event_id, referencia')
        .eq('tenant_id', tenantId)
        .in('referencia', this.variantesReferenciaComprobante(referencia))
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
      throw new BadRequestException(
        `No se pudo validar el detalle del asiento contable original: ${detallesError.message}`,
      );
    }
    if (!detalles?.length) {
      return block(
        'No se puede anular el CPE porque el asiento contable original no tiene detalle.',
      );
    }
  }

  private variantesReferenciaComprobante(referencia: string): string[] {
    const match = /^([A-Za-z0-9]+)-(\d{1,8})$/.exec(
      String(referencia).trim(),
    );
    if (!match) return [referencia];
    const serie = match[1].toUpperCase();
    return [
      ...new Set([
        referencia,
        `${serie}-${String(Number(match[2]))}`,
        `${serie}-${match[2].padStart(8, '0')}`,
      ]),
    ];
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
        'cpe',
        'UPDATE',
        userId ?? 'system',
        {
          old: {
            id: cpe.id,
            estado: cpe.estado,
            nota_credito_id: cpe.nota_credito_id ?? null,
          },
          new: {
            anulacion_bloqueada: true,
            motivo_anulacion: motivo,
            motivo_bloqueo: reason,
          },
        },
        tenantId,
        cpe.id,
        {
          accion: 'ANULACION_CPE_BLOQUEADA',
          source_event_id: cpe.event_id || cpe.source_event_id || null,
        },
      );
    } catch (auditError) {
      this.logger.warn(
        `No se pudo auditar intento bloqueado de anulación CPE ${cpe.id}: ${(auditError as Error).message}`,
      );
    }
  }

  private async resolveCpeOriginalSourceEventId(
    client: any,
    tenantId: string,
    cpe: any,
  ): Promise<string | null> {
    const direct = cpe.event_id || cpe.source_event_id;
    if (direct) return direct;

    const { data, error } = await client
      .from('cpe')
      .select('event_id')
      .eq('tenant_id', tenantId)
      .eq('id', cpe.id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(
        `No se pudo resolver el evento contable original del CPE: ${error.message}`,
      );
    }
    return data?.event_id || null;
  }

}
