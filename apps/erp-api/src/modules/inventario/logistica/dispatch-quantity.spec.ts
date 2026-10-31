import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ConfirmarDespachoDto } from './dto';
import { LogisticaService } from './logistica.service';

describe('Cantidades e idempotencia de despacho', () => {
  const detail = '44444444-4444-4444-8444-444444444444';
  const dto = (cantidad: unknown) => plainToInstance(ConfirmarDespachoDto, {
    idempotency_key: 'dispatch-quantity-570', items_despachados: [{ detalle_id: detail, cantidad }],
  });
  it.each([null, '1', 0, -1, 0.001, 1.001, NaN, Infinity])('rechaza una cantidad inválida %s antes del writer', cantidad => {
    expect(validateSync(dto(cantidad)).length).toBeGreaterThan(0);
  });
  it.each([undefined, 0.01, 1, 1.23])('admite una cantidad comercial válida %s', cantidad => {
    expect(validateSync(dto(cantidad))).toHaveLength(0);
  });
  it('recupera el resultado sin duplicar auditoría ni notificación de un despacho ya confirmado', async () => {
    const query = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 'pedido', numero: 'P-570' }, error: null }) };
    const result = { success: true, pedido_id: 'pedido', estado: 'DESPACHO_PARCIAL', idempotent: true };
    const rpc = jest.fn().mockResolvedValue({ data: result, error: null });
    const audit = { logAction: jest.fn() };
    const notifications = { createNotification: jest.fn() };
    const lock = { runWithLock: async (_tenant: string, _pedido: string, operation: () => Promise<unknown>) => operation() };
    const service = new LogisticaService({ getClient: () => ({ from: () => query, rpc }) } as any, notifications as any, audit as any, lock as any);
    expect(await service.confirmarDespacho('pedido', 'tenant', dto(1), 'actor')).toEqual({ success: true, data: result });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(audit.logAction).not.toHaveBeenCalled();
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
  it.each([
    ['23514', 'Cantidad de despacho inválida para detalle linea: solicitada 1.00, pendiente 0.50', true],
    ['23514', 'El actor del despacho no pertenece al tenant o está inactivo', false],
    ['PGRST003', 'Cantidad de despacho inválida para detalle linea', false],
    ['23505', 'DISPATCH_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD', false],
  ])('sólo acredita un rechazo de cantidad no aplicado con el error transaccional correcto (%s)', async (code, message, rejected) => {
    const query = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 'pedido', numero: 'P-570' }, error: null }) };
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code, message } });
    const audit = { logAction: jest.fn() };
    const notifications = { createNotification: jest.fn() };
    const lock = { runWithLock: async (_tenant: string, _pedido: string, operation: () => Promise<unknown>) => operation() };
    const service = new LogisticaService({ getClient: () => ({ from: () => query, rpc }) } as any, notifications as any, audit as any, lock as any);
    const error = await service.confirmarDespacho('pedido', 'tenant', dto(1), 'actor').catch(cause => cause);
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse().error === 'DISPATCH_NOT_APPLIED').toBe(rejected);
    expect(audit.logAction).not.toHaveBeenCalled();
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
});
