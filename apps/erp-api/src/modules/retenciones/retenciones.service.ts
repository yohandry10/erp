import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import {
  CalcularAjusteFiscalDto,
  DepositarDetraccionDto,
  ListarAjustesFiscalesQueryDto,
  ListarAnticiposQueryDto,
  OrigenAjusteFiscal,
  RegistrarAjusteFiscalDto,
  RegistrarAnticipoDto,
  RevertirAjusteFiscalCxcDto,
  TipoAjusteFiscal,
} from './dto/retenciones-input.dto';

@Injectable()
export class RetencionesService {
  constructor(private readonly supabase: SupabaseService) {}

  calcularAjuste(data: CalcularAjusteFiscalDto) {
    const base = new Decimal(data.base_calculo);
    const monto = base.times(data.tasa).dividedBy(100).toDecimalPlaces(2);
    const saldoResultante = data.tipo === TipoAjusteFiscal.PERCEPCION
      ? base.plus(monto)
      : base.minus(monto);

    return {
      tipo: data.tipo,
      base_calculo: base.toDecimalPlaces(2).toNumber(),
      tasa: new Decimal(data.tasa).toDecimalPlaces(6).toNumber(),
      monto: monto.toNumber(),
      efecto_saldo: data.tipo === TipoAjusteFiscal.PERCEPCION ? 'AUMENTA' : 'REDUCE',
      saldo_resultante: saldoResultante.toDecimalPlaces(2).toNumber(),
    };
  }

  async listarAjustes(tenantId: string, filtros: ListarAjustesFiscalesQueryDto) {
    const client = this.supabase.getClient();
    const page = filtros.page || 1;
    const limit = filtros.limit || 50;
    const offset = (page - 1) * limit;
    let query = client
      .from('operaciones_fiscales_financieras')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (filtros.origen) query = query.eq('origen', filtros.origen);
    if (filtros.tipo) query = query.eq('tipo', filtros.tipo);
    if (filtros.estado) query = query.eq('estado', filtros.estado);
    if (filtros.fecha_desde) query = query.gte('fecha', filtros.fecha_desde);
    if (filtros.fecha_hasta) query = query.lte('fecha', filtros.fecha_hasta);

    const { data, error, count } = await query
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) this.throwDatabaseError(error, 'No se pudieron listar los ajustes fiscales');
    return {
      success: true,
      data: data || [],
      pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
    };
  }

  async obtenerAjuste(tenantId: string, id: string) {
    const { data, error } = await this.supabase.getClient()
      .from('operaciones_fiscales_financieras')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) this.throwDatabaseError(error, 'No se pudo obtener el ajuste fiscal');
    if (!data) throw new NotFoundException('Ajuste fiscal no encontrado');
    return { success: true, data };
  }

  async registrarAjuste(
    tenantId: string,
    actorId: string | undefined,
    dto: RegistrarAjusteFiscalDto,
  ) {
    this.assertActor(actorId);
    this.assertAdjustmentShape(dto);
    const { cuenta_id, idempotency_key, ...payload } = dto;
    const { data, error } = await this.supabase.getClient().rpc(
      'registrar_ajuste_fiscal_financiero_tx',
      {
        p_tenant_id: tenantId,
        p_cuenta_id: cuenta_id,
        p_payload: this.normalizePayload(payload),
        p_actor_id: actorId,
        p_idempotency_key: idempotency_key.trim(),
      },
    );
    if (error) this.throwDatabaseError(error, 'No se pudo registrar el ajuste fiscal');
    return { success: true, data };
  }

  async listarAnticipos(tenantId: string, filtros: ListarAnticiposQueryDto) {
    const client = this.supabase.getClient();
    const page = filtros.page || 1;
    const limit = filtros.limit || 50;
    const offset = (page - 1) * limit;
    let query = client
      .from('anticipos_terceros')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (filtros.origen) query = query.eq('origen', filtros.origen);
    if (filtros.tercero_id && filtros.origen === OrigenAjusteFiscal.CLIENTE) {
      query = query.eq('cliente_id', filtros.tercero_id);
    } else if (filtros.tercero_id && filtros.origen === OrigenAjusteFiscal.PROVEEDOR) {
      query = query.eq('proveedor_id', filtros.tercero_id);
    }
    if (filtros.disponibles !== 'false') {
      query = query.in('estado', ['DISPONIBLE', 'PARCIAL']).gt('monto_disponible', 0);
    }

    const { data, error, count } = await query
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) this.throwDatabaseError(error, 'No se pudieron listar los anticipos');
    return {
      success: true,
      data: data || [],
      pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
    };
  }

  async registrarAnticipo(
    tenantId: string,
    actorId: string | undefined,
    dto: RegistrarAnticipoDto,
  ) {
    this.assertActor(actorId);
    this.assertAdvanceShape(dto);
    const { idempotency_key, ...payload } = dto;
    const { data, error } = await this.supabase.getClient().rpc(
      'registrar_anticipo_tercero_tx',
      {
        p_tenant_id: tenantId,
        p_payload: this.normalizePayload(payload),
        p_actor_id: actorId,
        p_idempotency_key: idempotency_key.trim(),
      },
    );
    if (error) this.throwDatabaseError(error, 'No se pudo registrar el anticipo');
    return { success: true, data };
  }

  async depositarDetraccion(
    tenantId: string,
    operacionId: string,
    actorId: string | undefined,
    dto: DepositarDetraccionDto,
  ) {
    this.assertActor(actorId);
    const { idempotency_key, ...payload } = dto;
    const { data, error } = await this.supabase.getClient().rpc(
      'depositar_detraccion_proveedor_tx',
      {
        p_tenant_id: tenantId,
        p_operacion_id: operacionId,
        p_payload: this.normalizePayload(payload),
        p_actor_id: actorId,
        p_idempotency_key: idempotency_key.trim(),
      },
    );
    if (error) this.throwDatabaseError(error, 'No se pudo depositar la detracción');
    return { success: true, data };
  }

  async revertirAjusteCxc(
    tenantId: string,
    operacionId: string,
    actorId: string | undefined,
    dto: RevertirAjusteFiscalCxcDto,
  ) {
    this.assertActor(actorId);
    const { idempotency_key, ...payload } = dto;
    const { data, error } = await this.supabase.getClient().rpc(
      'revertir_ajuste_fiscal_cxc_tx',
      {
        p_tenant_id: tenantId,
        p_operacion_id: operacionId,
        p_payload: { motivo: payload.motivo.trim() },
        p_actor_id: actorId,
        p_idempotency_key: idempotency_key.trim(),
      },
    );
    if (error) this.throwDatabaseError(error, 'No se pudo revertir el ajuste fiscal CxC');
    return { success: true, data };
  }

  private assertActor(actorId?: string): asserts actorId is string {
    if (!actorId) throw new BadRequestException('El actor autenticado es obligatorio');
  }

  private assertAdjustmentShape(dto: RegistrarAjusteFiscalDto): void {
    if (dto.tipo === TipoAjusteFiscal.ANTICIPO && !dto.anticipo_id) {
      throw new BadRequestException('La aplicación de un anticipo exige anticipo_id');
    }
    if (dto.tipo !== TipoAjusteFiscal.ANTICIPO && dto.anticipo_id) {
      throw new BadRequestException('anticipo_id sólo corresponde al tipo ANTICIPO');
    }
    if ((dto.base_calculo === undefined) !== (dto.tasa === undefined)) {
      throw new BadRequestException('base_calculo y tasa deben enviarse juntos');
    }
    if (dto.base_calculo !== undefined && dto.tasa !== undefined) {
      const esperado = new Decimal(dto.base_calculo).times(dto.tasa).dividedBy(100).toDecimalPlaces(2);
      if (!esperado.equals(new Decimal(dto.monto).toDecimalPlaces(2))) {
        throw new BadRequestException('El monto no coincide con base_calculo × tasa');
      }
    }
  }

  private assertAdvanceShape(dto: RegistrarAnticipoDto): void {
    const clienteValido = dto.origen === OrigenAjusteFiscal.CLIENTE
      && Boolean(dto.cliente_id) && !dto.proveedor_id;
    const proveedorValido = dto.origen === OrigenAjusteFiscal.PROVEEDOR
      && Boolean(dto.proveedor_id) && !dto.cliente_id;
    if (!clienteValido && !proveedorValido) {
      throw new BadRequestException('El anticipo exige exactamente el tercero correspondiente a su origen');
    }
  }

  private normalizePayload<T extends Record<string, unknown>>(payload: T): T {
    return {
      ...payload,
      moneda: String(payload.moneda || '').trim().toUpperCase(),
      referencia: typeof payload.referencia === 'string' ? payload.referencia.trim() : payload.referencia,
      notas: typeof payload.notas === 'string' ? payload.notas.trim() : payload.notas,
    };
  }

  private throwDatabaseError(error: any, fallback: string): never {
    const message = String(error?.message || fallback);
    if (error?.code === '23505' || message.includes('IDEMPOTENCY')) {
      throw new ConflictException(message);
    }
    if (error?.code === '42501' || message.includes('ACTOR_NOT_ACTIVE')) {
      throw new ForbiddenException(message);
    }
    if (error?.code === 'P0002' || message.includes('NOT_FOUND')) {
      throw new NotFoundException(message);
    }
    throw new BadRequestException(message || fallback);
  }
}
