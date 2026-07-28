import { BadRequestException } from '@nestjs/common';
import { PedidosService } from './pedidos.service';
import { EstadoPedido } from './entities';

// La aprobación existe para que alguien distinto revise un pedido que excede el
// límite de crédito o el monto sin aprobación. Si el creador puede aprobarse a sí
// mismo, el control no controla nada. Compras ya aplicaba esta regla; Ventas no.
describe('PedidosService — segregación de funciones en la aprobación', () => {
  const CREADOR = 'usuario-que-creo';
  const OTRO = 'usuario-aprobador';

  const construirServicio = (pedido: any) => {
    const service = Object.create(PedidosService.prototype) as any;
    service.supabase = { getClient: jest.fn() };
    service.findOne = jest.fn().mockResolvedValue(pedido);
    service.registrarDecisionAprobacion = jest.fn().mockResolvedValue(undefined);
    service.updateEstado = jest.fn().mockResolvedValue(undefined);
    return service;
  };

  const pedidoPendiente = {
    id: 'pedido-1',
    estado: EstadoPedido.PENDIENTE_APROBACION,
    requiere_aprobacion: true,
    created_by: CREADOR,
    observaciones: null,
    motivo_requiere_aprobacion: 'Monto supera el límite sin aprobación',
  };

  it('rechaza que el creador apruebe su propio pedido', async () => {
    const service = construirServicio(pedidoPendiente);

    await expect(
      service.decidirAprobacion('pedido-1', 't1', 'APROBADO', [], CREADOR),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(service.registrarDecisionAprobacion).not.toHaveBeenCalled();
    expect(service.updateEstado).not.toHaveBeenCalled();
  });

  it('tampoco deja que el creador rechace su propio pedido', async () => {
    const service = construirServicio(pedidoPendiente);

    await expect(
      service.decidirAprobacion('pedido-1', 't1', 'RECHAZADO', [], CREADOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exige identificar al aprobador', async () => {
    const service = construirServicio(pedidoPendiente);

    await expect(
      service.decidirAprobacion('pedido-1', 't1', 'APROBADO', [], undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('permite que otro usuario decida', async () => {
    const service = construirServicio(pedidoPendiente);
    // Falla más adelante al escribir en Supabase, pero ya pasó el control de
    // segregación: lo que se comprueba es que registró la decisión.
    await service.decidirAprobacion('pedido-1', 't1', 'APROBADO', [], OTRO).catch(() => undefined);

    expect(service.registrarDecisionAprobacion).toHaveBeenCalled();
  });
});
