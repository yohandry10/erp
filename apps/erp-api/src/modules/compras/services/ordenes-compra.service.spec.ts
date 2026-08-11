import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { OcAprobacionesRepository } from '../repositories/oc-aprobaciones.repository';
import { OrdenesCompraRepository } from '../repositories/ordenes-compra.repository';
import { OrdenesCompraService } from './ordenes-compra.service';

describe('OrdenesCompraService RPC 453', () => {
  const tenantId = 'tenant-1';
  const actorId = 'actor-1';
  const orderId = 'order-1';
  const rpc = jest.fn();
  const ordenesRepository = {
    findById: jest.fn(),
    findAll: jest.fn(),
    findRecepcionesByOrdenId: jest.fn(),
  };
  const aprobacionesRepository = { findByOrdenId: jest.fn() };
  let service: OrdenesCompraService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        OrdenesCompraService,
        { provide: OrdenesCompraRepository, useValue: ordenesRepository },
        { provide: OcAprobacionesRepository, useValue: aprobacionesRepository },
        {
          provide: SupabaseService,
          useValue: { getClient: () => ({ rpc }) },
        },
      ],
    }).compile();
    service = module.get(OrdenesCompraService);
  });

  it('create ejecuta una sola RPC, separa idempotencia y no escribe desde JS', async () => {
    const result = { id: orderId, estado: 'BORRADOR' };
    rpc.mockResolvedValue({ data: result, error: null });

    await expect(
      service.create(
        {
          idempotency_key: ' order-attempt-1 ',
          numero: 'OC-2026-001',
          proveedor_id: '550e8400-e29b-41d4-a716-446655440001',
          fecha_orden: new Date('2026-08-09T12:00:00.000Z'),
          detalles: [
            {
              producto_id: '550e8400-e29b-41d4-a716-446655440002',
              descripcion: 'Producto',
              cantidad: 2,
              precio_unitario: 10,
            },
          ],
        },
        tenantId,
        actorId,
      ),
    ).resolves.toEqual(result);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('crear_orden_compra_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_idempotency_key: 'order-attempt-1',
      p_payload: expect.objectContaining({
        numero: 'OC-2026-001',
        fecha_orden: '2026-08-09',
      }),
    });
    expect(rpc.mock.calls[0][1].p_payload).not.toHaveProperty('idempotency_key');
    expect(ordenesRepository.findById).not.toHaveBeenCalled();
  });

  it.each([
    ['update', () => service.update(orderId, { observaciones: 'Editada' }, tenantId, actorId), 'actualizar_orden_compra_tx', undefined],
    ['aprobar', () => service.aprobar(orderId, { comentarios: 'OK' }, tenantId, actorId), 'decidir_orden_compra_tx', 'APROBAR'],
    ['rechazar', () => service.rechazar(orderId, { motivo_rechazo: 'Sin presupuesto' }, tenantId, actorId), 'decidir_orden_compra_tx', 'RECHAZAR'],
    ['cancelar', () => service.cancelar(orderId, { motivo_cancelacion: 'Ya no se requiere' }, tenantId, actorId), 'decidir_orden_compra_tx', 'CANCELAR'],
  ])('%s delega la mutación en una sola RPC', async (_name, invoke, rpcName, action) => {
    rpc.mockResolvedValue({ data: { id: orderId }, error: null });
    await invoke();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      rpcName,
      action ? expect.objectContaining({ p_accion: action, p_actor_id: actorId }) : expect.any(Object),
    );
    expect(ordenesRepository.findById).not.toHaveBeenCalled();
    expect(aprobacionesRepository.findByOrdenId).not.toHaveBeenCalled();
  });

  it('toda mutación exige actor y no llega a PostgreSQL si falta', async () => {
    await expect(
      service.aprobar(orderId, {}, tenantId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['23505', 'duplicado', ConflictException],
    ['42501', 'actor ajeno', ForbiddenException],
    ['P0001', 'Orden de compra no encontrada', NotFoundException],
    ['P0001', 'Estado inválido', BadRequestException],
  ])('mapea %s/%s a la excepción HTTP correcta', async (code, message, expected) => {
    rpc.mockResolvedValue({ data: null, error: { code, message } });
    await expect(
      service.cancelar(orderId, { motivo_cancelacion: 'x' }, tenantId, actorId),
    ).rejects.toBeInstanceOf(expected);
  });

  it('rechaza una respuesta RPC vacía', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(
      service.update(orderId, { observaciones: 'x' }, tenantId, actorId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('findById/findAll usan el repositorio de lectura', async () => {
    const order = { id: orderId };
    ordenesRepository.findById.mockResolvedValue(order);
    ordenesRepository.findAll.mockResolvedValue({ data: [order], count: 1 });

    await expect(service.findById(orderId, tenantId)).resolves.toEqual(order);
    await expect(service.findAll(tenantId, { estado: 'APROBADA' })).resolves.toEqual({
      data: [order],
      count: 1,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('findById responde 404 cuando no existe', async () => {
    ordenesRepository.findById.mockResolvedValue(null);
    await expect(service.findById(orderId, tenantId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('recepciones y aprobaciones validan la OC y sólo leen', async () => {
    ordenesRepository.findById.mockResolvedValue({ id: orderId });
    ordenesRepository.findRecepcionesByOrdenId.mockResolvedValue([{ id: 'receipt-1' }]);
    aprobacionesRepository.findByOrdenId.mockResolvedValue([{ id: 'approval-1' }]);

    await expect(service.findRecepcionesByOrdenId(orderId, tenantId)).resolves.toEqual([
      { id: 'receipt-1' },
    ]);
    await expect(service.findAprobacionesByOrdenId(orderId, tenantId)).resolves.toEqual([
      { id: 'approval-1' },
    ]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
