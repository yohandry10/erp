import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { AuditService } from '../../audit/audit.service';
import { CreateDevolucionProveedorDto } from '../dto/create-devolucion-proveedor.dto';
import { DevolucionesProveedorRepository } from '../repositories/devoluciones-proveedor.repository';
import { DevolucionesProveedorService } from './devoluciones-proveedor.service';

describe('DevolucionesProveedorService frontera atómica 450', () => {
  let service: DevolucionesProveedorService;
  let rpc: jest.Mock;
  let repository: jest.Mocked<DevolucionesProveedorRepository>;
  let audit: jest.Mocked<AuditService>;

  const dto: CreateDevolucionProveedorDto = {
    idempotency_key: 'return:create:tenant-1:attempt-1',
    recepcion_id: '11111111-1111-4111-8111-111111111111',
    orden_id: '22222222-2222-4222-8222-222222222222',
    proveedor_id: '33333333-3333-4333-8333-333333333333',
    motivo: 'DEFECTO',
    observaciones: 'Empaque dañado',
    items: [{
      recepcion_item_id: '44444444-4444-4444-8444-444444444444',
      producto_id: '55555555-5555-4555-8555-555555555555',
      descripcion: 'Producto',
      cantidad: 2,
      precio_unitario: 50,
      almacen_id: '66666666-6666-4666-8666-666666666666',
    }],
  };

  beforeEach(async () => {
    rpc = jest.fn();
    repository = {
      listar: jest.fn(),
      obtenerPorId: jest.fn(),
    } as any;
    audit = { registrarCambio: jest.fn().mockResolvedValue(undefined) } as any;
    const module = await Test.createTestingModule({
      providers: [
        DevolucionesProveedorService,
        { provide: SupabaseService, useValue: { getClient: () => ({ rpc }) } },
        { provide: DevolucionesProveedorRepository, useValue: repository },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(DevolucionesProveedorService);
  });

  it('crea cabecera e items con una sola RPC, actor y clave estable', async () => {
    rpc.mockResolvedValue({
      data: { id: 'return-1', estado: 'PENDIENTE', items: [{ id: 'item-1' }], idempotent: false },
      error: null,
    });

    const result = await service.crearDevolucion('tenant-1', dto, 'user-1');

    expect(result.id).toBe('return-1');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('crear_devolucion_proveedor_tx', {
      p_tenant_id: 'tenant-1',
      p_payload: {
        recepcion_id: dto.recepcion_id,
        orden_id: dto.orden_id,
        proveedor_id: dto.proveedor_id,
        motivo: dto.motivo,
        observaciones: dto.observaciones,
        items: dto.items,
      },
      p_actor_id: 'user-1',
      p_idempotency_key: dto.idempotency_key,
    });
    expect(repository.obtenerPorId).not.toHaveBeenCalled();
  });

  it('rechaza creación sin actor antes de tocar la base', async () => {
    await expect(service.crearDevolucion('tenant-1', dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('propaga un mismatch idempotente como error de dominio', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'IDEMPOTENCY_PAYLOAD_MISMATCH' } });
    await expect(service.crearDevolucion('tenant-1', dto, 'user-1'))
      .rejects.toThrow('IDEMPOTENCY_PAYLOAD_MISMATCH');
  });

  it('emite stock, CxP y outbox únicamente mediante la RPC 450', async () => {
    rpc.mockResolvedValue({
      data: {
        id: 'return-1', estado: 'EMITIDA', emit_event_id: 'event-1',
        cuenta_por_pagar_id: 'cxp-1', ajuste_cxp_total: 118, movimientos: [{ movimiento_id: 'mov-1' }],
      },
      error: null,
    });
    repository.obtenerPorId.mockResolvedValue({ id: 'return-1', estado: 'EMITIDA', items: [] });

    const result = await service.emitirDevolucion('return-1', 'tenant-1', 'user-1');

    expect(result.estado).toBe('EMITIDA');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('emitir_devolucion_proveedor_tx', {
      p_devolucion_id: 'return-1', p_tenant_id: 'tenant-1', p_actor_id: 'user-1',
    });
    expect(repository.obtenerPorId).toHaveBeenCalledTimes(1);
  });

  it('no reporta falso error si falla la hidratación después del commit', async () => {
    const committed = { id: 'return-1', estado: 'EMITIDA', emit_event_id: 'event-1', idempotent: false };
    rpc.mockResolvedValue({ data: committed, error: null });
    repository.obtenerPorId.mockRejectedValue(new Error('timeout post-commit'));

    await expect(service.emitirDevolucion('return-1', 'tenant-1', 'user-1'))
      .resolves.toEqual(committed);
  });

  it('anula sólo mediante la RPC transaccional de borrador', async () => {
    rpc.mockResolvedValue({ data: { id: 'return-1', estado: 'ANULADA', idempotent: false }, error: null });
    await service.anularDevolucionPendiente('return-1', 'tenant-1', 'user-1', 'Error de captura');
    expect(rpc).toHaveBeenCalledWith('anular_devolucion_proveedor_pendiente_tx', {
      p_devolucion_id: 'return-1', p_tenant_id: 'tenant-1', p_actor_id: 'user-1',
      p_motivo: 'Error de captura',
    });
  });

  it('mantiene lecturas tenant-scoped en el repositorio', async () => {
    repository.listar.mockResolvedValue([{ id: 'return-1' }] as any);
    repository.obtenerPorId.mockResolvedValue({ id: 'return-1' } as any);
    await expect(service.obtenerDevoluciones('tenant-1', { estado: 'EMITIDA' }))
      .resolves.toHaveLength(1);
    await expect(service.obtenerDevolucionPorId('return-1', 'tenant-1'))
      .resolves.toEqual({ id: 'return-1' });
    expect(repository.listar).toHaveBeenCalledWith('tenant-1', { estado: 'EMITIDA' });
    expect(repository.obtenerPorId).toHaveBeenCalledWith('return-1', 'tenant-1');
  });
});
