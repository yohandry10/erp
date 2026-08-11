import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { AprobarOrdenCompraDto } from '../dto/aprobar-orden-compra.dto';
import { CancelarOrdenCompraDto } from '../dto/cancelar-orden-compra.dto';
import { CreateOrdenCompraDto } from '../dto/create-orden-compra.dto';
import { RechazarOrdenCompraDto } from '../dto/rechazar-orden-compra.dto';
import { UpdateOrdenCompraDto } from '../dto/update-orden-compra.dto';
import { OcAprobacionesRepository } from '../repositories/oc-aprobaciones.repository';
import { OrdenesCompraRepository } from '../repositories/ordenes-compra.repository';

@Injectable()
export class OrdenesCompraService {
  constructor(
    private readonly ordenesRepository: OrdenesCompraRepository,
    private readonly ocAprobacionesRepository: OcAprobacionesRepository,
    private readonly supabaseService: SupabaseService,
  ) {}

  async create(createDto: CreateOrdenCompraDto, tenantId: string, userId?: string) {
    const { idempotency_key: idempotencyKey, ...payload } = createDto;
    return this.rpcPurchase('crear_orden_compra_tx', {
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_idempotency_key: idempotencyKey.trim(),
      p_payload: this.normalizePurchasePayload(payload),
    });
  }

  async findById(id: string, tenantId: string) {
    const orden = await this.ordenesRepository.findById(id, tenantId);
    if (!orden) {
      throw new NotFoundException(`Orden de compra con ID ${id} no encontrada`);
    }
    return orden;
  }

  async findAll(
    tenantId: string,
    filters?: {
      estado?: string;
      proveedor_id?: string;
      fecha_desde?: string;
      fecha_hasta?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    return this.ordenesRepository.findAll(tenantId, filters);
  }

  async update(
    id: string,
    updateDto: UpdateOrdenCompraDto,
    tenantId: string,
    userId?: string,
  ) {
    return this.rpcPurchase('actualizar_orden_compra_tx', {
      p_orden_id: id,
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_payload: this.normalizePurchasePayload(updateDto),
    });
  }

  async aprobar(
    id: string,
    aprobarDto: AprobarOrdenCompraDto,
    tenantId: string,
    userId?: string,
  ) {
    return this.rpcPurchase('decidir_orden_compra_tx', {
      p_orden_id: id,
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_accion: 'APROBAR',
      p_comentarios: aprobarDto.comentarios?.trim() || null,
    });
  }

  async rechazar(
    id: string,
    rechazarDto: RechazarOrdenCompraDto,
    tenantId: string,
    userId?: string,
  ) {
    return this.rpcPurchase('decidir_orden_compra_tx', {
      p_orden_id: id,
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_accion: 'RECHAZAR',
      p_comentarios: rechazarDto.motivo_rechazo.trim(),
    });
  }

  async cancelar(
    id: string,
    cancelarDto: CancelarOrdenCompraDto,
    tenantId: string,
    userId?: string,
  ) {
    return this.rpcPurchase('decidir_orden_compra_tx', {
      p_orden_id: id,
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_accion: 'CANCELAR',
      p_comentarios: cancelarDto.motivo_cancelacion.trim(),
    });
  }

  async findRecepcionesByOrdenId(id: string, tenantId: string) {
    await this.assertOrderExists(id, tenantId);
    return this.ordenesRepository.findRecepcionesByOrdenId(id, tenantId);
  }

  async findAprobacionesByOrdenId(id: string, tenantId: string) {
    await this.assertOrderExists(id, tenantId);
    return this.ocAprobacionesRepository.findByOrdenId(id, tenantId);
  }

  private async assertOrderExists(id: string, tenantId: string) {
    const orden = await this.ordenesRepository.findById(id, tenantId);
    if (!orden) {
      throw new NotFoundException(`Orden de compra con ID ${id} no encontrada`);
    }
  }

  private normalizePurchasePayload(value: object) {
    const payload: Record<string, unknown> = {};
    for (const [key, rawValue] of Object.entries(value ?? {})) {
      if (rawValue === undefined) continue;
      payload[key] =
        rawValue instanceof Date ? rawValue.toISOString().slice(0, 10) : rawValue;
    }
    return payload;
  }

  private requireActor(userId?: string) {
    if (!userId) {
      throw new BadRequestException(
        'Se requiere un usuario autenticado para operar compras',
      );
    }
    return userId;
  }

  private async rpcPurchase(name: string, params: Record<string, unknown>) {
    const { data, error } = await this.supabaseService.getClient().rpc(name, params);
    if (error) {
      const message = error.message || `No se pudo ejecutar ${name}`;
      if (error.code === '23505') throw new ConflictException(message);
      if (error.code === '42501') throw new ForbiddenException(message);
      if (/no encontrad[ao]/i.test(message)) throw new NotFoundException(message);
      throw new BadRequestException(message);
    }
    if (!data) {
      throw new BadRequestException(`La operación ${name} no devolvió resultado`);
    }
    return data;
  }
}
