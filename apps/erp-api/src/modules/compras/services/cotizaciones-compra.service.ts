import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CreateCotizacionCompraDto } from '../dto/create-cotizacion-compra.dto';
import { UpdateCotizacionCompraDto } from '../dto/update-cotizacion-compra.dto';
import { CotizacionesCompraRepository } from '../repositories/cotizaciones-compra.repository';

@Injectable()
export class CotizacionesCompraService {
  constructor(
    private readonly cotizacionesRepository: CotizacionesCompraRepository,
    private readonly supabaseService: SupabaseService,
  ) {}

  async create(createDto: CreateCotizacionCompraDto, tenantId: string, userId?: string) {
    const { idempotency_key: idempotencyKey, ...payload } = createDto;
    return this.rpc('crear_cotizacion_compra_tx', {
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_idempotency_key: idempotencyKey.trim(),
      p_payload: this.normalizePayload(payload),
    });
  }

  async findById(id: string, tenantId: string) {
    const cotizacion = await this.cotizacionesRepository.findById(id, tenantId);
    if (!cotizacion) {
      throw new NotFoundException(`Cotización con ID ${id} no encontrada`);
    }
    return cotizacion;
  }

  async findAll(tenantId: string, filters?: {
    estado?: string;
    proveedor_id?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    limit?: number;
    offset?: number;
  }) {
    return this.cotizacionesRepository.findAll(tenantId, filters);
  }

  async update(
    id: string,
    updateDto: UpdateCotizacionCompraDto,
    tenantId: string,
    userId?: string,
  ) {
    return this.rpc('actualizar_cotizacion_compra_tx', {
      p_cotizacion_id: id,
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_payload: this.normalizePayload(updateDto),
    });
  }

  async enviar(id: string, tenantId: string, userId?: string) {
    return this.changeState(id, tenantId, userId, 'ENVIAR');
  }

  async aprobar(id: string, tenantId: string, userId?: string) {
    return this.changeState(id, tenantId, userId, 'APROBAR');
  }

  async rechazar(id: string, tenantId: string, motivo?: string, userId?: string) {
    if (!motivo?.trim()) {
      throw new BadRequestException('El motivo de rechazo es obligatorio');
    }
    return this.changeState(id, tenantId, userId, 'RECHAZAR', motivo);
  }

  async convertirAOrdenCompra(
    cotizacionId: string,
    tenantId: string,
    numeroOC?: string,
    userId?: string,
  ) {
    return this.rpc('convertir_cotizacion_compra_a_oc_tx', {
      p_cotizacion_id: cotizacionId,
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_idempotency_key: `compras:cotizacion:convertir:${cotizacionId}`,
      p_numero_oc: numeroOC?.trim() || null,
      p_fecha_entrega: null,
    });
  }

  private changeState(
    id: string,
    tenantId: string,
    userId: string | undefined,
    action: 'ENVIAR' | 'APROBAR' | 'RECHAZAR',
    reason?: string,
  ) {
    return this.rpc('cambiar_estado_cotizacion_compra_tx', {
      p_cotizacion_id: id,
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_accion: action,
      p_motivo: reason?.trim() || null,
    });
  }

  private normalizePayload(value: Record<string, any>) {
    const payload: Record<string, any> = {};
    for (const [key, rawValue] of Object.entries(value ?? {})) {
      if (rawValue === undefined) continue;
      if (rawValue instanceof Date) {
        payload[key] = rawValue.toISOString().slice(0, 10);
      } else {
        payload[key] = rawValue;
      }
    }
    return payload;
  }

  private requireActor(userId?: string) {
    if (!userId) {
      throw new BadRequestException('Se requiere un usuario autenticado para operar compras');
    }
    return userId;
  }

  private async rpc(name: string, params: Record<string, any>) {
    const { data, error } = await this.supabaseService.getClient().rpc(name, params);
    if (error) {
      const message = error.message || `No se pudo ejecutar ${name}`;
      if (error.code === '23505') throw new ConflictException(message);
      if (error.code === '42501') throw new ForbiddenException(message);
      if (/no encontrad[ao]/i.test(message)) throw new NotFoundException(message);
      throw new BadRequestException(message);
    }
    if (!data) throw new BadRequestException(`La operación ${name} no devolvió resultado`);
    return data;
  }
}
