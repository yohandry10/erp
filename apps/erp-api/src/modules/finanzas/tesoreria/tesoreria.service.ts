import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { v4 as uuidv4 } from 'uuid';
import { RegistrarPagoDto, RegistrarPagoLoteDto, ListarPagosQueryDto, ProgramacionPagosQueryDto, FlujoCajaQueryDto } from './dto';

const BANCARIZACION_PEN_MIN = 2000;
const BANCARIZACION_USD_MIN = 500;

@Injectable()
export class TesoreriaService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService,
  ) { }

  async registrarPago(
    tenantId: string,
    dto: RegistrarPagoDto,
    userId?: string,
  ): Promise<{ success: boolean; data: any }> {
    dto = {
      ...dto,
      monto: this.normalizarMontoPago(dto.monto),
      fecha_pago: this.normalizarFechaPago(dto.fecha_pago),
      idempotency_key: dto.idempotency_key?.trim() || undefined,
    };

    if (dto.monto <= 0) {
      throw new BadRequestException('El monto del pago debe ser mayor a 0');
    }

    const client = this.supabase.getClient();
    const submittedIdempotencyKey = dto.idempotency_key ?? null;
    const pagoId = uuidv4();
    const eventId = uuidv4();
    const idempotencyKey = submittedIdempotencyKey
      ?? `tesoreria:pago:${tenantId}:${dto.cxp_id}:${pagoId}`;
    const { data: resultadoPago, error: errorPago } = await client.rpc(
      'aplicar_pago_cxp_tx',
      {
        p_tenant_id: tenantId,
        p_cxp_id: dto.cxp_id,
        p_pago: {
          ...dto,
          pago_id: pagoId,
          event_id: eventId,
          idempotency_key: idempotencyKey,
        },
        p_usuario_id: userId || null,
      },
    );

    if (errorPago || !resultadoPago?.cxp?.id) {
      const message = errorPago?.message || 'No se pudo aplicar el pago a la cuenta por pagar';
      if (/no encontrada/i.test(message)) throw new NotFoundException(message);
      throw new BadRequestException(message);
    }

    return {
      success: true,
      data: {
        ...resultadoPago,
        pago: {
          ...resultadoPago.pago,
          pago_id: resultadoPago.pago?.id ?? pagoId,
          monto: dto.monto,
          fecha_pago: dto.fecha_pago,
          metodo_pago: dto.metodo_pago,
          referencia: dto.referencia ?? null,
          cuenta_bancaria_id: dto.cuenta_bancaria_id ?? null,
          idempotent_replay: Boolean(resultadoPago.idempotent),
        },
      },
    };

    /* istanbul ignore next -- implementación pre-RPC conservada temporalmente para trazabilidad */
    if (submittedIdempotencyKey) {
      const { data: pagoExistente, error: errorPagoExistente } = await client
        .from('movimientos_bancarios')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('idempotency_key', submittedIdempotencyKey)
        .maybeSingle();

      if (errorPagoExistente) {
        throw new BadRequestException('No se pudo verificar la idempotencia del pago');
      }

      if (pagoExistente) {
        const { data: cxpActual, error: errorCxpActual } = await client
          .from('cuentas_por_pagar')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('id', dto.cxp_id)
          .maybeSingle();

        if (errorCxpActual || !cxpActual) {
          throw new NotFoundException('Cuenta por pagar no encontrada');
        }

        return {
          success: true,
          data: {
            cxp: cxpActual,
            pago: {
              monto: this.round2(Number(pagoExistente.monto ?? 0)),
              fecha_pago: pagoExistente.fecha,
              metodo_pago: pagoExistente.metodo_pago,
              referencia: pagoExistente.referencia,
              cuenta_bancaria_id: pagoExistente.cuenta_bancaria_id,
              pago_id: pagoExistente.id,
              idempotent_replay: true,
            },
            movimiento_bancario: pagoExistente,
          },
        };
      }
    }

    // Validar que el monto sea positivo
    if (dto.monto <= 0) {
      throw new BadRequestException('El monto del pago debe ser mayor a 0');
    }

    // Obtener la CxP actual
    const { data: cxp, error: errorCxp } = await client
      .from('cuentas_por_pagar')
      .select(`
        id,
        estado,
        saldo,
        total,
        moneda,
        proveedor_id,
        numero_documento,
        proveedor:proveedores!cuentas_por_pagar_proveedor_id_fkey(
          id,
          razon_social,
          ruc
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('id', dto.cxp_id)
      .maybeSingle();

    if (errorCxp || !cxp) {
      throw new NotFoundException('Cuenta por pagar no encontrada');
    }

    const proveedorNombre: string | null =
      (cxp as any)?.proveedor?.razon_social ?? null;

    // Validar que no esté anulada
    if (cxp.estado === 'ANULADA') {
      throw new BadRequestException('No se puede aplicar pago a una cuenta por pagar anulada');
    }

    // Validar que no esté completamente pagada
    if (cxp.estado === 'PAGADA' || cxp.saldo <= 0) {
      throw new BadRequestException('La cuenta por pagar ya está completamente pagada');
    }

    // Validar que el monto no exceda el saldo pendiente
    if (dto.monto > cxp.saldo) {
      throw new BadRequestException(
        `El monto del pago (${dto.monto}) no puede ser mayor al saldo pendiente (${cxp.saldo})`,
      );
    }

    const requiereBancarizacion = this.validarBancarizacionPago({
      moneda: cxp.moneda,
      montoPago: dto.monto,
      totalOperacion: cxp.total,
      metodoPago: dto.metodo_pago,
      cuentaBancariaId: dto.cuenta_bancaria_id,
      referencia: dto.referencia,
    });

    // Si se especificó cuenta bancaria, validar que existe y tiene saldo suficiente
    let cuentaBancaria: any = null;
    let saldoCuentaAnterior: number | null = null;
    let saldoCuentaNuevo: number | null = null;
    if (dto.cuenta_bancaria_id) {
      const { data: cuenta, error: errorCuenta } = await client
        .from('cuentas_bancarias')
        .select('id, nombre, saldo, moneda, permite_sobregiro')
        .eq('tenant_id', tenantId)
        .eq('id', dto.cuenta_bancaria_id)
        .maybeSingle();

      if (errorCuenta || !cuenta) {
        throw new BadRequestException('Cuenta bancaria no encontrada');
      }

      cuentaBancaria = cuenta;

      // Validar que la moneda coincida
      if (cuenta.moneda !== cxp.moneda) {
        throw new BadRequestException(
          `La moneda de la cuenta bancaria (${cuenta.moneda}) no coincide con la moneda de la CxP (${cxp.moneda})`,
        );
      }

      // ✅ VALIDACIÓN DE SALDO NEGATIVO (CONFIGURABLE)
      // Si la cuenta NO permite sobregiro, validar saldo suficiente antes del pago
      if (!cuenta.permite_sobregiro && cuenta.saldo < dto.monto) {
        throw new BadRequestException(
          `Saldo insuficiente en la cuenta bancaria. Saldo disponible: ${cuenta.saldo}, Monto requerido: ${dto.monto}`,
        );
      }
    }

    // Iniciar transacción: actualizar CxP, crear movimiento bancario, actualizar saldo cuenta
    try {
      // 1. Calcular nuevo saldo de la CxP
      const nuevoSaldo = this.round2(cxp.saldo - dto.monto);

      // 2. Determinar nuevo estado de la CxP
      let nuevoEstado: string;
      if (nuevoSaldo === 0) {
        nuevoEstado = 'PAGADA';
      } else if (nuevoSaldo < cxp.total) {
        nuevoEstado = 'PARCIAL';
      } else {
        nuevoEstado = cxp.estado;
      }

      // 3. HARDENING: Optimistic concurrency — si otro pago ya cambio el saldo, falla
      const saldoAnterior = cxp.saldo;
      const updateCxpData: Record<string, any> = {
        saldo: nuevoSaldo,
        estado: nuevoEstado,
        ultimo_pago: dto.fecha_pago,
        updated_at: new Date().toISOString(),
      };

      if (requiereBancarizacion) {
        updateCxpData.bancarizacion_requerida = true;
        updateCxpData.bancarizacion_validada = true;
        updateCxpData.bancarizacion_medio_pago = dto.metodo_pago;
        updateCxpData.bancarizacion_referencia = dto.referencia?.trim() ?? null;
      }

      const { data: cxpActualizada, error: errorActualizar } = await client
        .from('cuentas_por_pagar')
        .update(updateCxpData)
        .eq('tenant_id', tenantId)
        .eq('id', dto.cxp_id)
        .eq('saldo', saldoAnterior)
        .select()
        .single();

      if (errorActualizar) {
        // PGRST116 = no rows returned — means another payment already changed the saldo
        if (errorActualizar.code === 'PGRST116') {
          throw new BadRequestException(
            'Conflicto de concurrencia: el saldo de la CxP fue modificado por otro pago simultáneo. Intente de nuevo.'
          );
        }
        console.error('Error actualizando cuenta por pagar:', errorActualizar);
        throw new BadRequestException('No se pudo aplicar el pago a la cuenta por pagar');
      }

      // 4. Si hay cuenta bancaria, crear movimiento bancario y actualizar saldo
      let movimientoBancario: any = null;
      const descripcionPago = `Pago a proveedor ${proveedorNombre ?? cxp.proveedor_id} - Doc: ${cxp.numero_documento}`;

      if (dto.cuenta_bancaria_id && cuentaBancaria) {
        const saldoActualCuenta = this.round2(Number(cuentaBancaria.saldo ?? 0));
        saldoCuentaAnterior = saldoActualCuenta;
        const nuevoSaldoBanco = this.round2(saldoActualCuenta - dto.monto);
        saldoCuentaNuevo = nuevoSaldoBanco;

        const { data: movimiento, error: errorMovimiento } = await client
          .from('movimientos_bancarios')
          .insert({
            tenant_id: tenantId,
            cuenta_bancaria_id: dto.cuenta_bancaria_id,
            tipo: 'CARGO',
            monto: this.round2(dto.monto),
            fecha: dto.fecha_pago,
            descripcion: descripcionPago,
            referencia: dto.referencia || null,
            metodo_pago: dto.metodo_pago,
            cxp_id: dto.cxp_id,
            proveedor_id: cxp.proveedor_id,
            idempotency_key: submittedIdempotencyKey,
            conciliado: false,
            saldo_anterior: saldoCuentaAnterior,
            saldo_nuevo: saldoCuentaNuevo,
            created_by: userId || null,
            created_at: new Date().toISOString(),
          })
          .select(
            `*,
             proveedores:proveedores!movimientos_bancarios_proveedor_id_fkey(id, razon_social, ruc)`
          )
          .single();

        if (errorMovimiento) {
          console.error('Error creando movimiento bancario:', errorMovimiento);
          await client
            .from('cuentas_por_pagar')
            .update({
              saldo: cxp.saldo,
              estado: cxp.estado,
              updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', tenantId)
            .eq('id', dto.cxp_id);
          throw new BadRequestException('No se pudo crear el movimiento bancario');
        }

        movimientoBancario = movimiento;

        const { error: errorSaldoBanco } = await client
          .from('cuentas_bancarias')
          .update({
            saldo: nuevoSaldoBanco,
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenantId)
          .eq('id', dto.cuenta_bancaria_id);

        if (errorSaldoBanco) {
          console.error('Error actualizando saldo de cuenta bancaria:', errorSaldoBanco);
          await client.from('movimientos_bancarios').delete().eq('id', movimiento.id);
          await client
            .from('cuentas_por_pagar')
            .update({
              saldo: cxp.saldo,
              estado: cxp.estado,
              updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', tenantId)
            .eq('id', dto.cxp_id);

          throw new BadRequestException('No se pudo actualizar el saldo de la cuenta bancaria');
        }

        try {
          this.eventBus.emitMovimientoBancarioRegistrado({
            tenantId,
            movimientoId: movimiento.id,
            cuentaBancariaId: dto.cuenta_bancaria_id,
            cuentaBancariaNombre: cuentaBancaria.nombre,
            tipo: 'CARGO',
            monto: this.round2(dto.monto),
            moneda: cuentaBancaria.moneda,
            fecha: dto.fecha_pago,
            descripcion: descripcionPago,
            referencia: dto.referencia || null,
            metodoPago: dto.metodo_pago,
            proveedorId: cxp.proveedor_id,
            proveedorNombre: proveedorNombre ?? movimiento.proveedores?.razon_social ?? null,
            cxpId: dto.cxp_id,
            saldoAnterior: saldoCuentaAnterior,
            saldoNuevo: saldoCuentaNuevo,
            createdBy: userId || undefined,
          });
        } catch (errorMovimientoEvento) {
          console.error('❌ Error emitiendo evento MovimientoBancarioRegistrado:', errorMovimientoEvento);
        }
      }

      // 5. Emitir evento PagoProveedorRegistrado endurecido
      try {
        const pagoId = movimientoBancario?.id ?? uuidv4();
        const eventId = uuidv4();
        const idempotencyKey =
          dto.idempotency_key ??
          `tesoreria:pago:${tenantId}:${dto.cxp_id}:${pagoId}`;

        this.eventBus.emitPagoProveedorRegistrado({
          tenantId,
          eventId,
          idempotencyKey,
          cxpId: dto.cxp_id,
          pagoId,
          proveedorId: cxp.proveedor_id,
          proveedorNombre: proveedorNombre ?? cxp.proveedor_id,
          numeroDocumento: cxp.numero_documento,
          monto: this.round2(dto.monto),
          moneda: cxp.moneda,
          fecha: dto.fecha_pago,
          metodoPago: dto.metodo_pago,
          cuentaBancariaId: dto.cuenta_bancaria_id ?? null,
          cuentaBancariaNombre: cuentaBancaria?.nombre ?? null,
          referencia: dto.referencia ?? null,
          observaciones: dto.observaciones ?? null,
          saldoAnterior: cxp.saldo,
          saldoNuevo: nuevoSaldo,
          estadoAnterior: cxp.estado,
          estadoNuevo: nuevoEstado,
          createdBy: userId ?? null,
          movimientoBancarioId: movimientoBancario?.id ?? null,
          cuentaSaldoAnterior: saldoCuentaAnterior,
          cuentaSaldoNuevo: saldoCuentaNuevo,
          source: 'tesoreria.registrarPago',
        });
        console.log('✅ Evento PagoProveedorRegistrado emitido exitosamente');
      } catch (errorEvento) {
        console.error('❌ Error emitiendo evento PagoProveedorRegistrado:', errorEvento);
        // No fallar la operación si el evento no se pudo emitir
      }

      return {
        success: true,
        data: {
          cxp: cxpActualizada,
          pago: {
            monto: this.round2(dto.monto),
            fecha_pago: dto.fecha_pago,
            metodo_pago: dto.metodo_pago,
            referencia: dto.referencia,
            cuenta_bancaria_id: dto.cuenta_bancaria_id,
            saldo_anterior: cxp.saldo,
            saldo_nuevo: nuevoSaldo,
            estado_anterior: cxp.estado,
            estado_nuevo: nuevoEstado,
            pago_id: movimientoBancario?.id ?? null,
            cuenta_saldo_anterior: saldoCuentaAnterior,
            cuenta_saldo_nuevo: saldoCuentaNuevo,
          },
          movimiento_bancario: movimientoBancario,
        },
      };
    } catch (error) {
      console.error('Error en transacción de pago:', error);
      throw error;
    }
  }

  async listarPagos(
    tenantId: string,
    query: ListarPagosQueryDto,
  ): Promise<{ success: boolean; data: any[]; total: number; page: number; limit: number }> {
    const client = this.supabase.getClient();

    // Configurar paginación
    const page = query.page || 1;
    const limit = Math.min(query.limit || 50, 100);
    const offset = (page - 1) * limit;

    // Construir query base - obtener pagos (movimientos tipo CARGO vinculados a CxP)
    let queryBuilder = client
      .from('movimientos_bancarios')
      .select(`
        id,
        fecha,
        monto,
        metodo_pago,
        referencia,
        descripcion,
        conciliado,
        created_at,
        cuenta_bancaria:cuentas_bancarias!movimientos_bancarios_cuenta_bancaria_id_fkey(
          id,
          nombre,
          banco,
          numero_cuenta
        ),
        proveedor:proveedores!movimientos_bancarios_proveedor_id_fkey(
          id,
          razon_social,
          ruc
        ),
        cxp:cuentas_por_pagar!movimientos_bancarios_cxp_id_fkey(
          id,
          numero_documento,
          total,
          saldo,
          estado
        )
      `, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('tipo', 'CARGO')
      .not('cxp_id', 'is', null); // Solo movimientos vinculados a CxP (pagos a proveedores)

    // Aplicar filtros opcionales
    if (query.fecha_desde) {
      queryBuilder = queryBuilder.gte('fecha', query.fecha_desde);
    }

    if (query.fecha_hasta) {
      queryBuilder = queryBuilder.lte('fecha', query.fecha_hasta);
    }

    if (query.proveedor_id) {
      queryBuilder = queryBuilder.eq('proveedor_id', query.proveedor_id);
    }

    if (query.cuenta_bancaria_id) {
      queryBuilder = queryBuilder.eq('cuenta_bancaria_id', query.cuenta_bancaria_id);
    }

    if (query.metodo_pago) {
      queryBuilder = queryBuilder.eq('metodo_pago', query.metodo_pago);
    }

    if (query.conciliado !== undefined) {
      queryBuilder = queryBuilder.eq('conciliado', query.conciliado);
    }

    // Ordenar por fecha descendente (más recientes primero)
    queryBuilder = queryBuilder.order('fecha', { ascending: false });

    // Aplicar paginación
    queryBuilder = queryBuilder.range(offset, offset + limit - 1);

    // Ejecutar query
    const { data, error, count } = await queryBuilder;

    if (error) {
      console.error('Error obteniendo pagos:', error);
      throw new BadRequestException('No se pudo obtener la lista de pagos');
    }

    return {
      success: true,
      data: data || [],
      total: count || 0,
      page,
      limit,
    };
  }

  async obtenerProgramacionPagos(
    tenantId: string,
    query: ProgramacionPagosQueryDto,
  ): Promise<{ success: boolean; data: any[]; total: number; page: number; limit: number }> {
    const client = this.supabase.getClient();

    // Configurar paginación
    const page = query.page || 1;
    const limit = Math.min(query.limit || 50, 100);
    const offset = (page - 1) * limit;

    // Construir query base - obtener CxP pendientes de pago
    let queryBuilder = client
      .from('cuentas_por_pagar')
      .select(`
        id,
        numero_documento,
        fecha_emision,
        fecha_vencimiento,
        total,
        saldo,
        estado,
        moneda,
        condiciones_pago,
        dias_credito,
        observaciones,
        proveedor:proveedores!cuentas_por_pagar_proveedor_id_fkey(
          id,
          razon_social,
          ruc,
          nombre_comercial
        ),
        recepcion:recepciones!cuentas_por_pagar_recepcion_id_fkey(
          id,
          numero,
          fecha_recepcion
        )
      `, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .in('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA']) // Solo CxP con saldo pendiente
      .gt('saldo', 0); // Solo las que tienen saldo pendiente

    // Aplicar filtros opcionales
    if (query.fecha_desde) {
      queryBuilder = queryBuilder.gte('fecha_vencimiento', query.fecha_desde);
    }

    if (query.fecha_hasta) {
      queryBuilder = queryBuilder.lte('fecha_vencimiento', query.fecha_hasta);
    }

    if (query.proveedor_id) {
      queryBuilder = queryBuilder.eq('proveedor_id', query.proveedor_id);
    }

    if (query.estado) {
      queryBuilder = queryBuilder.eq('estado', query.estado);
    }

    // Ordenar por fecha de vencimiento ascendente (próximos vencimientos primero)
    queryBuilder = queryBuilder.order('fecha_vencimiento', { ascending: true });

    // Aplicar paginación
    queryBuilder = queryBuilder.range(offset, offset + limit - 1);

    // Ejecutar query
    const { data, error, count } = await queryBuilder;

    if (error) {
      console.error('Error obteniendo programación de pagos:', error);
      throw new BadRequestException('No se pudo obtener la programación de pagos');
    }

    // Calcular días hasta vencimiento y clasificar por urgencia
    const hoy = new Date();
    const hoyISO = hoy.toISOString().split('T')[0];
    const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    const dataEnriquecida = (data || []).map((cxp) => {
      const fechaStr: string = (cxp as any).fecha_vencimiento;
      const [year, month, day] = fechaStr.split('-').map(Number);
      const fechaVencimientoUTC = Date.UTC(year, month - 1, day);

      let diasHastaVencimiento = Math.floor(
        (fechaVencimientoUTC - hoyUTC) / (1000 * 60 * 60 * 24)
      );

      let urgencia: string;
      const comparacionHoy = fechaStr.localeCompare(hoyISO);
      if (comparacionHoy < 0) {
        urgencia = 'VENCIDA';
        // Asegurar que el valor sea negativo para consistencia en reportes/tests
        if (diasHastaVencimiento >= 0) {
          diasHastaVencimiento = -1;
        }
      } else if (comparacionHoy === 0) {
        urgencia = 'HOY';
      } else if (diasHastaVencimiento <= 7) {
        urgencia = 'URGENTE';
      } else if (diasHastaVencimiento <= 15) {
        urgencia = 'PROXIMA';
      } else {
        urgencia = 'NORMAL';
      }

      return {
        ...cxp,
        dias_hasta_vencimiento: diasHastaVencimiento,
        urgencia,
      };
    });

    return {
      success: true,
      data: dataEnriquecida,
      total: count || 0,
      page,
      limit,
    };
  }

  async registrarPagoLote(
    tenantId: string,
    dto: RegistrarPagoLoteDto,
    userId?: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Validar que hay al menos un pago
    if (!dto.pagos || dto.pagos.length === 0) {
      throw new BadRequestException('Debe incluir al menos un pago en el lote');
    }

    // Generar ID de lote si no se proporciona referencia
    const loteId = dto.referencia_lote || dto.idempotency_key || `LOTE-${new Date().getTime()}`;
    if (String(dto.metodo_pago || '').trim().toUpperCase() === 'EFECTIVO') {
      throw new BadRequestException('Los pagos en lote a proveedores deben registrarse con medio de pago bancarizado');
    }

    // Preparar array de pagos para la función de base de datos
    const pagosArray = dto.pagos.map(p => ({
      cxp_id: p.cxp_id,
      monto: p.monto !== undefined ? p.monto : null, // null = pagar saldo completo
    }));

    try {
      const { data: movimientosExistentes, error: existingError } = await client
        .from('movimientos_bancarios')
        .select('id, cxp_id, monto, saldo_anterior, saldo_nuevo, referencia, fecha')
        .eq('tenant_id', tenantId)
        .eq('cuenta_bancaria_id', dto.cuenta_bancaria_id)
        .eq('referencia', loteId)
        .eq('tipo', 'CARGO');

      if (existingError) {
        console.error('Error verificando idempotencia de lote de pagos:', existingError);
        throw new BadRequestException(existingError.message || 'Error verificando lote de pagos existente');
      }

      if (Array.isArray(movimientosExistentes) && movimientosExistentes.length > 0) {
        return {
          success: true,
          data: {
            success: true,
            idempotent_replay: true,
            referencia_lote: loteId,
            total_procesado: movimientosExistentes.reduce(
              (sum: number, movimiento: any) => sum + Number(movimiento.monto || 0),
              0,
            ),
            cantidad_pagos: movimientosExistentes.length,
            pagos: movimientosExistentes.map((movimiento: any) => ({
              cxp_id: movimiento.cxp_id,
              movimiento_bancario_id: movimiento.id,
              monto: Number(movimiento.monto || 0),
              saldo_anterior: movimiento.saldo_anterior,
              saldo_nuevo: movimiento.saldo_nuevo,
              referencia: movimiento.referencia,
              fecha: movimiento.fecha,
            })),
          },
        };
      }

      // Llamar a la función de PostgreSQL que procesa el lote en una transacción atómica
      const { data, error } = await client.rpc('procesar_pago_lote', {
        p_tenant_id: tenantId,
        p_cuenta_bancaria_id: dto.cuenta_bancaria_id,
        p_fecha_pago: dto.fecha_pago,
        p_metodo_pago: dto.metodo_pago,
        p_referencia_lote: loteId,
        p_observaciones: dto.observaciones || null,
        p_pagos: pagosArray,
        p_created_by: userId || null,
      });

      if (error) {
        console.error('Error procesando lote de pagos:', error);
        throw new BadRequestException(error.message || 'Error procesando lote de pagos');
      }

      if (!data || !data.success) {
        throw new BadRequestException('Error procesando lote de pagos');
      }

      // Emitir eventos para cada pago procesado
      if (data.pagos && Array.isArray(data.pagos) && data.pagos.length > 0) {
        const cxpIds = Array.from(new Set(data.pagos.map((p: any) => p.cxp_id)));
        const cxpDetallesMap = new Map<string, any>();

        if (cxpIds.length > 0) {
          const { data: cxpDetalles, error: errorDetalles } = await client
            .from('cuentas_por_pagar')
            .select(`
              id,
              proveedor_id,
              numero_documento,
              moneda,
              proveedor:proveedores!cuentas_por_pagar_proveedor_id_fkey(
                id,
                razon_social
              )
            `)
            .eq('tenant_id', tenantId)
            .in('id', cxpIds);

          if (errorDetalles) {
            console.error('❌ Error obteniendo detalles de CxP para eventos de lote:', errorDetalles);
          } else if (cxpDetalles) {
            for (const detalle of cxpDetalles) {
              cxpDetallesMap.set(detalle.id, detalle);
            }
          }
        }

        let cuentaSaldoCursor =
          data?.cuenta_bancaria?.saldo_anterior !== undefined
            ? this.round2(Number(data.cuenta_bancaria.saldo_anterior))
            : null;

        for (const pago of data.pagos) {
          const cxpDetalle = cxpDetallesMap.get(pago.cxp_id) || {};
          const proveedorId = cxpDetalle.proveedor_id ?? null;
          const proveedorNombrePago =
            pago.proveedor ??
            cxpDetalle?.proveedor?.razon_social ??
            proveedorId;
          const numeroDocumento = cxpDetalle.numero_documento ?? pago.numero_documento ?? null;
          const monedaPago = cxpDetalle.moneda ?? 'PEN';

          const movimientoId = pago.movimiento_bancario_id ?? null;
          const pagoId = movimientoId ?? uuidv4();
          const eventId = uuidv4();
          const idempotencyKey = `tesoreria:pago-lote:${tenantId}:${loteId}:${pago.cxp_id}:${pagoId}`;

          const cuentaSaldoAnteriorPago = cuentaSaldoCursor;
          const cuentaSaldoNuevoPago =
            cuentaSaldoAnteriorPago !== null
              ? this.round2(cuentaSaldoAnteriorPago - pago.monto)
              : null;

          if (cuentaSaldoCursor !== null && cuentaSaldoNuevoPago !== null) {
            cuentaSaldoCursor = cuentaSaldoNuevoPago;
          }

          try {
            this.eventBus.emitPagoProveedorRegistrado({
              tenantId,
              eventId,
              idempotencyKey,
              cxpId: pago.cxp_id,
              pagoId,
              proveedorId,
              proveedorNombre: proveedorNombrePago ?? proveedorId ?? null,
              numeroDocumento: numeroDocumento ?? undefined,
              monto: this.round2(pago.monto),
              moneda: monedaPago,
              fecha: dto.fecha_pago,
              metodoPago: dto.metodo_pago,
              cuentaBancariaId: dto.cuenta_bancaria_id,
              cuentaBancariaNombre: data?.cuenta_bancaria?.nombre ?? null,
              referencia: loteId,
              observaciones: dto.observaciones ?? null,
              saldoAnterior: pago.saldo_anterior,
              saldoNuevo: pago.saldo_nuevo,
              estadoAnterior: pago.estado_anterior,
              estadoNuevo: pago.estado_nuevo,
              createdBy: userId ?? null,
              movimientoBancarioId: movimientoId,
              cuentaSaldoAnterior: cuentaSaldoAnteriorPago,
              cuentaSaldoNuevo: cuentaSaldoNuevoPago,
              loteId,
              source: 'tesoreria.registrarPagoLote',
            });
          } catch (errorEvento) {
            console.error('❌ Error emitiendo evento PagoProveedorRegistrado:', errorEvento);
          }

          if (movimientoId) {
            try {
              const descripcionMovimiento =
                `${loteId} - Pago a ${proveedorNombrePago ?? proveedorId ?? pago.cxp_id}`;

              this.eventBus.emitMovimientoBancarioRegistrado({
                tenantId,
                movimientoId,
                cuentaBancariaId: dto.cuenta_bancaria_id,
                cuentaBancariaNombre: data?.cuenta_bancaria?.nombre ?? null,
                tipo: 'CARGO',
                monto: this.round2(pago.monto),
                moneda: monedaPago,
                fecha: dto.fecha_pago,
                descripcion: descripcionMovimiento,
                referencia: loteId,
                metodoPago: dto.metodo_pago,
                proveedorId,
                proveedorNombre: proveedorNombrePago ?? null,
                cxpId: pago.cxp_id,
                saldoAnterior: cuentaSaldoAnteriorPago ?? this.round2(pago.saldo_anterior ?? 0),
                saldoNuevo: cuentaSaldoNuevoPago ?? this.round2(pago.saldo_nuevo ?? 0),
                createdBy: userId ?? undefined,
              });
            } catch (errorMovimientoEvento) {
              console.error('❌ Error emitiendo evento MovimientoBancarioRegistrado (lote):', errorMovimientoEvento);
            }
          }
        }
      }

      return {
        success: true,
        data: data,
      };
    } catch (error) {
      console.error('Error en transacción de pago en lote:', error);

      // Si es un error de BadRequestException, re-lanzarlo
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Para otros errores, lanzar un BadRequestException genérico
      throw new BadRequestException(
        error.message || 'Error procesando lote de pagos. La transacción ha sido revertida.'
      );
    }
  }

  async obtenerFlujoCaja(
    tenantId: string,
    query: FlujoCajaQueryDto,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Configurar fechas de proyección
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const fechaDesde = query.fecha_desde ? new Date(query.fecha_desde) : hoy;
    fechaDesde.setHours(0, 0, 0, 0);

    let fechaHasta: Date;
    if (query.fecha_hasta) {
      fechaHasta = new Date(query.fecha_hasta);
    } else {
      const diasProyeccion = query.dias_proyeccion || 90;
      fechaHasta = new Date(fechaDesde);
      fechaHasta.setDate(fechaHasta.getDate() + diasProyeccion);
    }
    fechaHasta.setHours(23, 59, 59, 999);

    // 1. Obtener saldos actuales de cuentas bancarias
    let queryCuentas = client
      .from('cuentas_bancarias')
      .select('id, nombre, banco, numero_cuenta, moneda, saldo, activa')
      .eq('tenant_id', tenantId)
      .eq('activa', true);

    if (query.cuenta_bancaria_id) {
      queryCuentas = queryCuentas.eq('id', query.cuenta_bancaria_id);
    }

    const { data: cuentas, error: errorCuentas } = await queryCuentas;

    if (errorCuentas) {
      console.error('Error obteniendo cuentas bancarias:', errorCuentas);
      throw new BadRequestException('No se pudo obtener las cuentas bancarias');
    }

    if (!cuentas || cuentas.length === 0) {
      return {
        success: true,
        data: {
          periodo: {
            fecha_desde: fechaDesde.toISOString().split('T')[0],
            fecha_hasta: fechaHasta.toISOString().split('T')[0],
            dias: Math.ceil((fechaHasta.getTime() - fechaDesde.getTime()) / (1000 * 60 * 60 * 24)),
          },
          cuentas_bancarias: [],
          resumen: [],
          proyeccion: [],
          estadisticas: {
            total_cxp_pendientes: 0,
            total_cxc_pendientes: 0,
            total_movimientos: 0,
          },
        },
      };
    }

    // 2. Obtener CxP pendientes (egresos proyectados)
    let queryCxP = client
      .from('cuentas_por_pagar')
      .select(`
        id,
        fecha_vencimiento,
        saldo,
        moneda,
        numero_documento,
        proveedor:proveedores!cuentas_por_pagar_proveedor_id_fkey(
          razon_social
        )
      `)
      .eq('tenant_id', tenantId)
      .in('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA'])
      .gt('saldo', 0)
      .gte('fecha_vencimiento', fechaDesde.toISOString().split('T')[0])
      .lte('fecha_vencimiento', fechaHasta.toISOString().split('T')[0])
      .order('fecha_vencimiento', { ascending: true });

    const { data: cxpPendientes, error: errorCxP } = await queryCxP;

    if (errorCxP) {
      console.error('Error obteniendo CxP pendientes:', errorCxP);
      throw new BadRequestException('No se pudo obtener las cuentas por pagar');
    }

    // 3. Obtener CxC pendientes (ingresos proyectados) si la tabla existe
    let cxcPendientes: any[] = [];
    try {
      let queryCxC = client
        .from('cuentas_por_cobrar')
        .select(`
          id,
          fecha_vencimiento,
          saldo,
          moneda,
          numero_documento,
          cliente:clientes!cuentas_por_cobrar_cliente_id_fkey(
            razon_social
          )
        `)
        .eq('tenant_id', tenantId)
        .in('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA'])
        .gt('saldo', 0)
        .gte('fecha_vencimiento', fechaDesde.toISOString().split('T')[0])
        .lte('fecha_vencimiento', fechaHasta.toISOString().split('T')[0])
        .order('fecha_vencimiento', { ascending: true });

      const { data: cxc, error: errorCxC } = await queryCxC;

      if (!errorCxC && cxc) {
        cxcPendientes = cxc;
      }
    } catch (error) {
      // Si la tabla no existe o hay error, continuar sin CxC
      console.log('CxC no disponible para proyección de flujo de caja');
    }

    // 4. Agrupar movimientos por fecha y moneda
    const movimientosPorFecha: Map<string, Map<string, { ingresos: number; egresos: number; items: any[] }>> = new Map();

    // Procesar CxP (egresos)
    (cxpPendientes || []).forEach((cxp) => {
      const fecha = cxp.fecha_vencimiento;
      const moneda = cxp.moneda || 'PEN';

      if (!movimientosPorFecha.has(fecha)) {
        movimientosPorFecha.set(fecha, new Map());
      }

      const movimientosFecha = movimientosPorFecha.get(fecha)!;
      if (!movimientosFecha.has(moneda)) {
        movimientosFecha.set(moneda, { ingresos: 0, egresos: 0, items: [] });
      }

      const movimientosMoneda = movimientosFecha.get(moneda)!;
      movimientosMoneda.egresos += cxp.saldo;
      movimientosMoneda.items.push({
        tipo: 'EGRESO',
        concepto: 'Pago a proveedor',
        descripcion: `${(cxp.proveedor as any)?.razon_social || 'Proveedor'} - ${cxp.numero_documento}`,
        monto: cxp.saldo,
        referencia_id: cxp.id,
      });
    });

    // Procesar CxC (ingresos)
    cxcPendientes.forEach((cxc) => {
      const fecha = cxc.fecha_vencimiento;
      const moneda = cxc.moneda || 'PEN';

      if (!movimientosPorFecha.has(fecha)) {
        movimientosPorFecha.set(fecha, new Map());
      }

      const movimientosFecha = movimientosPorFecha.get(fecha)!;
      if (!movimientosFecha.has(moneda)) {
        movimientosFecha.set(moneda, { ingresos: 0, egresos: 0, items: [] });
      }

      const movimientosMoneda = movimientosFecha.get(moneda)!;
      movimientosMoneda.ingresos += cxc.saldo;
      movimientosMoneda.items.push({
        tipo: 'INGRESO',
        concepto: 'Cobro a cliente',
        descripcion: `${cxc.cliente?.razon_social || 'Cliente'} - ${cxc.numero_documento}`,
        monto: cxc.saldo,
        referencia_id: cxc.id,
      });
    });

    // 5. Construir proyección día por día
    const proyeccion: any[] = [];
    const saldosPorMoneda: Map<string, number> = new Map();

    // Inicializar saldos actuales por moneda
    cuentas.forEach((cuenta) => {
      const moneda = cuenta.moneda || 'PEN';
      const saldoActual = saldosPorMoneda.get(moneda) || 0;
      saldosPorMoneda.set(moneda, saldoActual + cuenta.saldo);
    });

    // Ordenar fechas
    const fechasOrdenadas = Array.from(movimientosPorFecha.keys()).sort();

    fechasOrdenadas.forEach((fecha) => {
      const movimientosFecha = movimientosPorFecha.get(fecha)!;

      movimientosFecha.forEach((movimientos, moneda) => {
        const saldoInicial = saldosPorMoneda.get(moneda) || 0;
        const ingresos = this.round2(movimientos.ingresos);
        const egresos = this.round2(movimientos.egresos);
        const flujoNeto = this.round2(ingresos - egresos);
        const saldoFinal = this.round2(saldoInicial + flujoNeto);

        // Actualizar saldo para próximas fechas
        saldosPorMoneda.set(moneda, saldoFinal);

        proyeccion.push({
          fecha,
          moneda,
          saldo_inicial: saldoInicial,
          ingresos,
          egresos,
          flujo_neto: flujoNeto,
          saldo_final: saldoFinal,
          items: movimientos.items,
        });
      });
    });

    // 6. Calcular resumen por moneda
    const resumenPorMoneda: any[] = [];
    const monedasUnicas = new Set<string>();

    cuentas.forEach((c) => monedasUnicas.add(c.moneda || 'PEN'));
    proyeccion.forEach((p) => monedasUnicas.add(p.moneda));

    monedasUnicas.forEach((moneda) => {
      const saldoActual = cuentas
        .filter((c) => (c.moneda || 'PEN') === moneda)
        .reduce((sum, c) => sum + c.saldo, 0);

      const totalIngresos = proyeccion
        .filter((p) => p.moneda === moneda)
        .reduce((sum, p) => sum + p.ingresos, 0);

      const totalEgresos = proyeccion
        .filter((p) => p.moneda === moneda)
        .reduce((sum, p) => sum + p.egresos, 0);

      const saldoProyectado = this.round2(saldoActual + totalIngresos - totalEgresos);

      resumenPorMoneda.push({
        moneda,
        saldo_actual: this.round2(saldoActual),
        total_ingresos: this.round2(totalIngresos),
        total_egresos: this.round2(totalEgresos),
        flujo_neto: this.round2(totalIngresos - totalEgresos),
        saldo_proyectado: saldoProyectado,
        alerta: saldoProyectado < 0 ? 'SALDO_NEGATIVO' : saldoProyectado < saldoActual * 0.2 ? 'SALDO_BAJO' : null,
      });
    });

    return {
      success: true,
      data: {
        periodo: {
          fecha_desde: fechaDesde.toISOString().split('T')[0],
          fecha_hasta: fechaHasta.toISOString().split('T')[0],
          dias: Math.ceil((fechaHasta.getTime() - fechaDesde.getTime()) / (1000 * 60 * 60 * 24)),
        },
        cuentas_bancarias: cuentas.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          banco: c.banco,
          numero_cuenta: c.numero_cuenta,
          moneda: c.moneda,
          saldo_actual: this.round2(c.saldo),
        })),
        resumen: resumenPorMoneda,
        proyeccion: proyeccion,
        estadisticas: {
          total_cxp_pendientes: (cxpPendientes || []).length,
          total_cxc_pendientes: cxcPendientes.length,
          total_movimientos: proyeccion.length,
        },
      },
    };
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private validarBancarizacionPago(input: {
    moneda: string;
    montoPago: number;
    totalOperacion?: number | null;
    metodoPago?: string | null;
    cuentaBancariaId?: string | null;
    referencia?: string | null;
  }): boolean {
    const moneda = String(input.moneda || 'PEN').trim().toUpperCase();
    const montoBase = Math.max(
      Number(input.montoPago || 0),
      Number(input.totalOperacion || 0),
    );
    const umbral =
      moneda === 'PEN'
        ? BANCARIZACION_PEN_MIN
        : moneda === 'USD'
          ? BANCARIZACION_USD_MIN
          : null;

    if (umbral === null || montoBase < umbral) {
      return false;
    }

    const metodoPago = String(input.metodoPago || '').trim().toUpperCase();
    if (metodoPago === 'EFECTIVO') {
      throw new BadRequestException(
        `La operación ${moneda} ${montoBase.toFixed(2)} supera el umbral de bancarización (${moneda} ${umbral.toFixed(2)}); no puede pagarse en efectivo`,
      );
    }

    if (!input.cuentaBancariaId) {
      throw new BadRequestException(
        `La operación ${moneda} ${montoBase.toFixed(2)} requiere cuenta bancaria por bancarización`,
      );
    }

    if (!input.referencia?.trim()) {
      throw new BadRequestException(
        `La operación ${moneda} ${montoBase.toFixed(2)} requiere referencia bancaria por bancarización`,
      );
    }

    return true;
  }

  private normalizarMontoPago(value: number): number {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      throw new BadRequestException('El monto del pago debe ser un número válido');
    }

    const cents = amount * 100;
    if (Math.abs(cents - Math.round(cents)) > 1e-9) {
      throw new BadRequestException('El monto del pago debe tener máximo 2 decimales');
    }

    return this.round2(amount);
  }

  private normalizarFechaPago(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('La fecha de pago debe tener formato YYYY-MM-DD');
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException('La fecha de pago debe ser una fecha válida');
    }

    return value;
  }
}
