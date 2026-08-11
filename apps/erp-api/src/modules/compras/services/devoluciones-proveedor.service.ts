import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { AuditService } from '../../audit/audit.service';
import { CreateDevolucionProveedorDto } from '../dto/create-devolucion-proveedor.dto';
import { DevolucionesProveedorRepository } from '../repositories/devoluciones-proveedor.repository';

@Injectable()
export class DevolucionesProveedorService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly devolucionesRepository: DevolucionesProveedorRepository,
    private readonly auditService: AuditService,
  ) {}

  async crearDevolucion(
    tenantId: string,
    createDto: CreateDevolucionProveedorDto,
    userId?: string,
  ): Promise<any> {
    this.assertActor(userId);
    const { idempotency_key, ...payload } = createDto;
    const { data, error } = await this.supabase.getClient().rpc(
      'crear_devolucion_proveedor_tx',
      {
        p_tenant_id: tenantId,
        p_payload: payload,
        p_actor_id: userId,
        p_idempotency_key: idempotency_key,
      },
    );
    if (error || !data) {
      throw this.toDomainError(error, 'No se pudo crear la devolución a proveedor');
    }

    await this.auditBestEffort({
      table: 'devoluciones_proveedor',
      action: 'INSERT',
      userId: userId!,
      tenantId,
      recordId: data.id,
      changes: { new: data },
      metadata: {
        accion: 'CREAR_DEVOLUCION_PROVEEDOR',
        orden_id: data.orden_id,
        recepcion_id: data.recepcion_id,
        proveedor_id: data.proveedor_id,
        idempotent: Boolean(data.idempotent),
      },
    });
    return data;
  }

  async obtenerDevoluciones(tenantId: string, filtros?: any): Promise<any[]> {
    return this.devolucionesRepository.listar(tenantId, filtros);
  }

  async obtenerDevolucionPorId(devolucionId: string, tenantId: string): Promise<any> {
    try {
      const devolucion = await this.devolucionesRepository.obtenerPorId(devolucionId, tenantId);
      if (!devolucion) throw new NotFoundException('Devolución no encontrada');
      return devolucion;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw this.toDomainError(error, 'No se pudo obtener la devolución');
    }
  }

  async emitirDevolucion(
    devolucionId: string,
    tenantId: string,
    userId?: string,
  ): Promise<any> {
    this.assertActor(userId);
    const { data, error } = await this.supabase.getClient().rpc(
      'emitir_devolucion_proveedor_tx',
      {
        p_devolucion_id: devolucionId,
        p_tenant_id: tenantId,
        p_actor_id: userId,
      },
    );
    if (error || !data) {
      throw this.toDomainError(error, 'No se pudo emitir la devolución a proveedor');
    }

    await this.auditBestEffort({
      table: 'devoluciones_proveedor',
      action: 'UPDATE',
      userId: userId!,
      tenantId,
      recordId: devolucionId,
      changes: { old: { estado: 'PENDIENTE' }, new: { estado: 'EMITIDA' } },
      metadata: {
        accion: 'EMITIR_DEVOLUCION_PROVEEDOR',
        emit_event_id: data.emit_event_id,
        cuenta_por_pagar_id: data.cuenta_por_pagar_id,
        ajuste_cxp_total: data.ajuste_cxp_total,
        idempotent: Boolean(data.idempotent),
      },
    });

    try {
      return await this.devolucionesRepository.obtenerPorId(devolucionId, tenantId);
    } catch {
      // La RPC ya confirmó inventario, CxP, estado y outbox. Una lectura de
      // hidratación posterior no debe convertir ese commit en un falso error.
      return data;
    }
  }

  async anularDevolucionPendiente(
    devolucionId: string,
    tenantId: string,
    userId?: string,
    motivo?: string,
  ): Promise<any> {
    this.assertActor(userId);
    const { data, error } = await this.supabase.getClient().rpc(
      'anular_devolucion_proveedor_pendiente_tx',
      {
        p_devolucion_id: devolucionId,
        p_tenant_id: tenantId,
        p_actor_id: userId,
        p_motivo: motivo ?? null,
      },
    );
    if (error || !data) {
      throw this.toDomainError(error, 'No se pudo anular la devolución pendiente');
    }
    await this.auditBestEffort({
      table: 'devoluciones_proveedor',
      action: 'UPDATE',
      userId: userId!,
      tenantId,
      recordId: devolucionId,
      changes: { old: { estado: 'PENDIENTE' }, new: { estado: 'ANULADA' } },
      metadata: {
        accion: 'ANULAR_DEVOLUCION_PROVEEDOR_PENDIENTE',
        motivo: motivo ?? null,
        idempotent: Boolean(data.idempotent),
      },
    });
    return data;
  }

  private assertActor(userId?: string): asserts userId is string {
    if (!userId) {
      throw new BadRequestException('Se requiere un usuario autenticado para esta operación');
    }
  }

  private toDomainError(error: any, fallback: string): Error {
    const message = error?.message ?? error?.details ?? fallback;
    if (/no encontrada|not found/i.test(message)) return new NotFoundException(message);
    return new BadRequestException(message);
  }

  private async auditBestEffort(input: {
    table: string;
    action: 'INSERT' | 'UPDATE';
    userId: string;
    tenantId: string;
    recordId: string;
    changes: any;
    metadata: Record<string, any>;
  }): Promise<void> {
    try {
      await this.auditService.registrarCambio(
        input.table,
        input.action,
        input.userId,
        input.changes,
        input.tenantId,
        input.recordId,
        input.metadata,
      );
    } catch {
      // Auditoría operativa complementaria: la evidencia financiera durable
      // permanece dentro de la RPC (movimiento, ajuste CxP y outbox).
    }
  }
}
