import { CashShiftChangesService, EstadoCambioTurno } from './cash-shift-changes.service';

describe('CashShiftChangesService 474', () => {
  const tenantId = '1c5c3371-9e4e-49ff-983c-6f29437b690a';
  const sesionId = '4c940052-3ef4-4f9a-ab8d-573644d63c1f';
  const cambioId = 'ef195255-581e-44e8-8e6c-f6918303e3c2';
  const salienteId = 'cf221dd2-28e8-41bf-966c-4407255219e2';
  const entranteId = '802478ed-80be-49f9-a3d4-cd64ac8b8c79';

  function buildService(response: any = {}) {
    const rpc = jest.fn(async () => ({ data: response, error: null }));
    const supabase = { getClient: jest.fn(() => ({ rpc })) };
    return { service: new CashShiftChangesService(supabase as any), rpc };
  }

  it('inicia congelamiento y registro mediante una sola RPC', async () => {
    const cambio = {
      id: cambioId,
      estado: EstadoCambioTurno.EN_PROCESO,
      sesion_caja_id: sesionId,
    };
    const { service, rpc } = buildService({ cambio, idempotent: false });

    await expect(service.iniciarCambioTurno(
      tenantId,
      sesionId,
      salienteId,
      entranteId,
      'shift-start-474-0001',
    )).resolves.toEqual(cambio);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('iniciar_cambio_turno_caja_tx', {
      p_tenant_id: tenantId,
      p_session_id: sesionId,
      p_incoming_user_id: entranteId,
      p_actor_id: salienteId,
      p_idempotency_key: 'shift-start-474-0001',
    });
  });

  it('envía contrapartida de diferencia y confirmaciones sólo a la RPC', async () => {
    const cambio = { id: cambioId, estado: EstadoCambioTurno.COMPLETADO, diferencia: -10 };
    const { service, rpc } = buildService({ cambio, event_id: 'event-474' });
    const dto = {
      monto_contado: 140,
      denominaciones: { billetes: { 20: 7 }, monedas: {} },
      foto_arqueo: 'https://evidence.invalid/arqueo.jpg',
      confirmacion_saliente: 'confirm-out',
      confirmacion_entrante: 'confirm-in',
      cuenta_diferencia_id: 'b1613c24-a35f-4a30-a595-102249a4df07',
    };

    await expect(service.completarCambioTurno(
      tenantId,
      cambioId,
      dto,
      entranteId,
      'shift-complete-474-0001',
    )).resolves.toEqual(cambio);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('completar_cambio_turno_caja_tx', {
      p_tenant_id: tenantId,
      p_change_id: cambioId,
      p_payload: dto,
      p_actor_id: entranteId,
      p_idempotency_key: 'shift-complete-474-0001',
    });
  });

  it('cancela y descongela mediante una sola RPC', async () => {
    const cambio = { id: cambioId, estado: EstadoCambioTurno.CANCELADO };
    const { service, rpc } = buildService({ cambio });

    await expect(service.cancelarCambioTurno(
      tenantId,
      cambioId,
      'Arqueo cancelado por evidencia incompleta',
      salienteId,
      'shift-cancel-474-0001',
    )).resolves.toEqual(cambio);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('cancelar_cambio_turno_caja_tx', {
      p_tenant_id: tenantId,
      p_change_id: cambioId,
      p_reason: 'Arqueo cancelado por evidencia incompleta',
      p_actor_id: salienteId,
      p_idempotency_key: 'shift-cancel-474-0001',
    });
  });

  it('propaga el error SQL sin intentar compensaciones parciales', async () => {
    const rpc = jest.fn(async () => ({
      data: null,
      error: { message: 'CASH_SHIFT_DIFFERENCE_ACCOUNT_REQUIRED' },
    }));
    const service = new CashShiftChangesService({
      getClient: jest.fn(() => ({ rpc })),
    } as any);

    await expect(service.completarCambioTurno(
      tenantId,
      cambioId,
      {
        monto_contado: 140,
        denominaciones: { billetes: { 20: 7 }, monedas: {} },
        foto_arqueo: 'https://evidence.invalid/arqueo.jpg',
        confirmacion_saliente: 'confirm-out',
        confirmacion_entrante: 'confirm-in',
      },
      entranteId,
      'shift-complete-474-rollback',
    )).rejects.toThrow('CASH_SHIFT_DIFFERENCE_ACCOUNT_REQUIRED');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
