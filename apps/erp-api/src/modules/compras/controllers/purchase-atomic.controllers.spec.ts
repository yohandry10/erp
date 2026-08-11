import { CotizacionesCompraController } from './cotizaciones-compra.controller';
import { OrdenesCompraController } from './ordenes-compra.controller';

describe('Controladores de compras RPC 453', () => {
  const tenantId = 'tenant-1';
  const user = { id: 'actor-1' };

  it('cotizaciones propaga tenant y actor en alta y conversión', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'quote-1' }),
      convertirAOrdenCompra: jest.fn().mockResolvedValue({ id: 'order-1' }),
    };
    const controller = new CotizacionesCompraController(service as any);
    const dto = {
      idempotency_key: 'attempt-1',
      numero: 'COT-1',
      proveedor_id: '550e8400-e29b-41d4-a716-446655440001',
      detalles: [],
    };

    await controller.create(dto, tenantId, user);
    await controller.convertirAOrdenCompra('quote-1', {}, tenantId, user);

    expect(service.create).toHaveBeenCalledWith(dto, tenantId, user.id);
    expect(service.convertirAOrdenCompra).toHaveBeenCalledWith(
      'quote-1',
      tenantId,
      undefined,
      user.id,
    );
  });

  it('cotizaciones no acepta identidad desde el body de rechazo', async () => {
    const service = { rechazar: jest.fn().mockResolvedValue({ id: 'quote-1' }) };
    const controller = new CotizacionesCompraController(service as any);

    await controller.rechazar(
      'quote-1',
      { motivo: 'Sin presupuesto' },
      tenantId,
      user,
    );

    expect(service.rechazar).toHaveBeenCalledWith(
      'quote-1',
      tenantId,
      'Sin presupuesto',
      user.id,
    );
  });

  it('órdenes propaga tenant y actor en alta', async () => {
    const service = { create: jest.fn().mockResolvedValue({ id: 'order-1' }) };
    const controller = new OrdenesCompraController(service as any, {} as any);
    const dto = {
      idempotency_key: 'attempt-1',
      numero: 'OC-1',
      proveedor_id: '550e8400-e29b-41d4-a716-446655440001',
      detalles: [],
    };

    await controller.create(dto, tenantId, user);

    expect(service.create).toHaveBeenCalledWith(dto, tenantId, user.id);
  });

  it('órdenes propaga sólo motivo y actor autenticado al cancelar', async () => {
    const service = { cancelar: jest.fn().mockResolvedValue({ id: 'order-1' }) };
    const controller = new OrdenesCompraController(service as any, {} as any);

    await controller.cancelar(
      'order-1',
      { motivo_cancelacion: 'Ya no se requiere' },
      tenantId,
      user,
    );

    expect(service.cancelar).toHaveBeenCalledWith(
      'order-1',
      { motivo_cancelacion: 'Ya no se requiere' },
      tenantId,
      user.id,
    );
  });
});
