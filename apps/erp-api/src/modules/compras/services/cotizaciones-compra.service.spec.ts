import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CotizacionesCompraRepository } from '../repositories/cotizaciones-compra.repository';
import { CotizacionesCompraService } from './cotizaciones-compra.service';

describe('CotizacionesCompraService RPC 453', () => {
  const tenantId = 'tenant-1';
  const actorId = 'actor-1';
  const quoteId = 'quote-1';
  const rpc = jest.fn();
  const repository = {
    findById: jest.fn(),
    findAll: jest.fn(),
  };
  let service: CotizacionesCompraService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CotizacionesCompraService,
        { provide: CotizacionesCompraRepository, useValue: repository },
        {
          provide: SupabaseService,
          useValue: { getClient: () => ({ rpc }) },
        },
      ],
    }).compile();
    service = module.get(CotizacionesCompraService);
  });

  it('create envía una única RPC, separa la clave idempotente y normaliza fechas', async () => {
    const result = { id: quoteId, estado: 'BORRADOR' };
    rpc.mockResolvedValue({ data: result, error: null });

    await expect(
      service.create(
        {
          idempotency_key: ' quote-attempt-1 ',
          numero: 'COT-2026-001',
          proveedor_id: '550e8400-e29b-41d4-a716-446655440001',
          fecha_cotizacion: new Date('2026-08-09T15:00:00.000Z'),
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
    expect(rpc).toHaveBeenCalledWith('crear_cotizacion_compra_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_idempotency_key: 'quote-attempt-1',
      p_payload: expect.objectContaining({
        numero: 'COT-2026-001',
        fecha_cotizacion: '2026-08-09',
      }),
    });
    expect(rpc.mock.calls[0][1].p_payload).not.toHaveProperty('idempotency_key');
  });

  it.each([
    ['update', () => service.update(quoteId, { observaciones: 'Editada' }, tenantId, actorId), 'actualizar_cotizacion_compra_tx'],
    ['enviar', () => service.enviar(quoteId, tenantId, actorId), 'cambiar_estado_cotizacion_compra_tx'],
    ['aprobar', () => service.aprobar(quoteId, tenantId, actorId), 'cambiar_estado_cotizacion_compra_tx'],
    ['rechazar', () => service.rechazar(quoteId, tenantId, 'No conviene', actorId), 'cambiar_estado_cotizacion_compra_tx'],
    ['convertir', () => service.convertirAOrdenCompra(quoteId, tenantId, undefined, actorId), 'convertir_cotizacion_compra_a_oc_tx'],
  ])('%s delega toda la escritura a una sola RPC', async (_name, invoke, rpcName) => {
    rpc.mockResolvedValue({ data: { id: quoteId }, error: null });
    await invoke();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(rpcName, expect.any(Object));
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('rechazar exige un motivo antes de invocar PostgreSQL', async () => {
    await expect(service.rechazar(quoteId, tenantId, '  ', actorId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('toda escritura exige actor autenticado', async () => {
    await expect(
      service.update(quoteId, { observaciones: 'x' }, tenantId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['23505', ConflictException],
    ['42501', ForbiddenException],
  ])('traduce el error PostgreSQL %s', async (code, expected) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: 'falló' } });
    await expect(service.enviar(quoteId, tenantId, actorId)).rejects.toBeInstanceOf(expected);
  });

  it('traduce no encontrada a 404', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Cotizacion no encontrada' } });
    await expect(service.enviar(quoteId, tenantId, actorId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('findById y findAll conservan repositorios sólo para lectura', async () => {
    const quote = { id: quoteId };
    repository.findById.mockResolvedValue(quote);
    repository.findAll.mockResolvedValue({ data: [quote], count: 1 });

    await expect(service.findById(quoteId, tenantId)).resolves.toEqual(quote);
    await expect(service.findAll(tenantId, { estado: 'APROBADA' })).resolves.toEqual({
      data: [quote],
      count: 1,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('findById responde 404 cuando no existe', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.findById(quoteId, tenantId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
