import { BadRequestException } from '@nestjs/common';
import { PedidosService } from './pedidos.service';
import { EstadoPedido } from './entities';
import { DecisionAprobacion } from './dto';

// La aprobación existe para que alguien distinto revise un pedido que excede el
// límite de crédito o el monto sin aprobación. Si el creador puede aprobarse a sí
// mismo, el control no controla nada. Compras ya aplicaba esta regla; Ventas no.
describe('PedidosService — segregación de funciones en la aprobación', () => {
  const CREADOR = 'usuario-que-creo';
  const OTRO = 'usuario-aprobador';

  const construirServicio = (pedido: any, pedidoActualizado: any = pedido) => {
    const service = Object.create(PedidosService.prototype) as any;
    const client = {
      rpc: jest.fn().mockResolvedValue({ data: { success: true }, error: null }),
    };
    service.supabase = { getClient: jest.fn(() => client) };
    service.findOne = jest.fn()
      .mockResolvedValueOnce(pedido)
      .mockResolvedValueOnce(pedidoActualizado);
    service.registrarAuditoriaAccion = jest.fn().mockResolvedValue(undefined);
    service.enviarNotificacion = jest.fn().mockResolvedValue(undefined);
    service.logger = { warn: jest.fn() };
    return { service, client };
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
    const { service, client } = construirServicio(pedidoPendiente);

    await expect(
      service.decidirAprobacion('pedido-1', 't1', DecisionAprobacion.APROBADO, [], CREADOR),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(client.rpc).not.toHaveBeenCalled();
    expect(service.registrarAuditoriaAccion).not.toHaveBeenCalled();
  });

  it('tampoco deja que el creador rechace su propio pedido', async () => {
    const { service, client } = construirServicio(pedidoPendiente);

    await expect(
      service.decidirAprobacion('pedido-1', 't1', DecisionAprobacion.RECHAZADO, [], CREADOR),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('exige identificar al aprobador', async () => {
    const { service, client } = construirServicio(pedidoPendiente);

    await expect(
      service.decidirAprobacion('pedido-1', 't1', DecisionAprobacion.APROBADO, [], undefined),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('no permite decidir comercialmente un bloqueo crediticio histórico', async () => {
    const { service, client } = construirServicio({
      ...pedidoPendiente,
      estado_credito: 'BLOQUEADO',
    });

    await expect(
      service.decidirAprobacion('pedido-1', 't1', DecisionAprobacion.APROBADO, [], OTRO),
    ).rejects.toThrow('no admite aprobación comercial');

    expect(client.rpc).not.toHaveBeenCalled();
    expect(service.registrarAuditoriaAccion).not.toHaveBeenCalled();
  });

  it('permite que otro usuario decida mediante la RPC atómica con actor y motivos', async () => {
    const pedidoActualizado = {
      ...pedidoPendiente,
      estado: EstadoPedido.PENDIENTE,
      requiere_aprobacion: false,
      estado_credito: 'APROBADO',
    };
    const { service, client } = construirServicio(pedidoPendiente, pedidoActualizado);

    const result = await service.decidirAprobacion(
      'pedido-1',
      't1',
      DecisionAprobacion.APROBADO,
      ['Monto revisado'],
      OTRO,
      'Aprobación independiente',
    );

    expect(client.rpc).toHaveBeenCalledWith('decidir_aprobacion_pedido_tx', {
      p_pedido_id: 'pedido-1',
      p_tenant_id: 't1',
      p_decision: DecisionAprobacion.APROBADO,
      p_motivos: 'Monto revisado',
      p_aprobado_por: OTRO,
      p_observaciones: 'Aprobación independiente',
    });
    expect(service.registrarAuditoriaAccion).toHaveBeenCalled();
    expect(service.enviarNotificacion).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      decision: DecisionAprobacion.APROBADO,
      pedido: pedidoActualizado,
    });
  });

  it('propaga el error transaccional y no ejecuta efectos post-commit', async () => {
    const { service, client } = construirServicio(pedidoPendiente);
    client.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'La aprobación ya fue resuelta por otro usuario' },
    });

    await expect(
      service.decidirAprobacion('pedido-1', 't1', DecisionAprobacion.APROBADO, [], OTRO),
    ).rejects.toThrow('La aprobación ya fue resuelta por otro usuario');

    expect(service.findOne).toHaveBeenCalledTimes(1);
    expect(service.registrarAuditoriaAccion).not.toHaveBeenCalled();
    expect(service.enviarNotificacion).not.toHaveBeenCalled();
  });

  it('no reporta fallo si la decisión hizo commit y sólo falla la hidratación posterior', async () => {
    const { service, client } = construirServicio(pedidoPendiente);
    client.rpc.mockResolvedValueOnce({
      data: {
        decision: DecisionAprobacion.APROBADO,
        pedido: {
          id: 'pedido-1',
          estado: EstadoPedido.PENDIENTE,
          requiere_aprobacion: false,
          estado_credito: 'APROBADO',
        },
      },
      error: null,
    });
    service.findOne = jest.fn()
      .mockResolvedValueOnce(pedidoPendiente)
      .mockRejectedValueOnce(new Error('timeout de lectura post-commit'));

    const result = await service.decidirAprobacion(
      'pedido-1',
      't1',
      DecisionAprobacion.APROBADO,
      ['Monto revisado'],
      OTRO,
    );

    expect(result).toEqual(expect.objectContaining({
      success: true,
      decision: DecisionAprobacion.APROBADO,
      pedido: expect.objectContaining({
        id: 'pedido-1',
        estado: EstadoPedido.PENDIENTE,
        requiere_aprobacion: false,
        estado_credito: 'APROBADO',
      }),
    }));
    expect(service.registrarAuditoriaAccion).toHaveBeenCalled();
    expect(service.enviarNotificacion).toHaveBeenCalled();
  });
});
