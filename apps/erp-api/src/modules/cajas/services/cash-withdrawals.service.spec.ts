import { CashWithdrawalsService } from './cash-withdrawals.service';

describe('CashWithdrawalsService 474', () => {
  const rpc = jest.fn();
  const from = jest.fn();
  const service = new CashWithdrawalsService({
    getClient: () => ({ rpc, from }),
  } as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('envía depósito, destino bancario, actor y key a una única RPC', async () => {
    rpc.mockResolvedValue({
      data: { retiro: { id: 'retiro-474', movimiento_bancario_id: 'banco-457' } },
      error: null,
    });

    const result = await service.solicitarRetiro(
      'tenant-474',
      'sesion-474',
      {
        monto: 75,
        motivo: 'DEPOSITO_BANCARIO',
        foto_comprobante: 'https://evidence.invalid/deposito.jpg',
        cuenta_bancaria_id: '47400000-0000-4000-8000-000000000041',
      },
      'actor-474',
      'cash-withdraw-bank-474-0001',
    );

    expect(result).toEqual({ id: 'retiro-474', movimiento_bancario_id: 'banco-457' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('solicitar_retiro_caja_tx', {
      p_tenant_id: 'tenant-474',
      p_session_id: 'sesion-474',
      p_payload: expect.objectContaining({
        motivo: 'DEPOSITO_BANCARIO',
        cuenta_bancaria_id: '47400000-0000-4000-8000-000000000041',
      }),
      p_actor_id: 'actor-474',
      p_idempotency_key: 'cash-withdraw-bank-474-0001',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('propaga rollback SQL sin intentar compensaciones parciales en Node', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'ACCOUNTING_PERIOD_NOT_OPEN:2026-08' } });

    await expect(service.solicitarRetiro(
      'tenant-474',
      'sesion-474',
      {
        monto: 50,
        motivo: 'BOVEDA',
        cuenta_contrapartida_id: '47400000-0000-4000-8000-000000000033',
      },
      'actor-474',
      'cash-withdraw-vault-474-0001',
    )).rejects.toThrow('ACCOUNTING_PERIOD_NOT_OPEN');

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it('concilia mediante una sola transición idempotente', async () => {
    rpc.mockResolvedValue({ data: { retiro: { id: 'retiro-474', estado_conciliacion: 'CONCILIADO' } }, error: null });

    await service.conciliarRetiro(
      'tenant-474',
      'retiro-474',
      { numero_operacion: 'OP-474', fecha_conciliacion: '2026-08-10T12:00:00Z' },
      'actor-474',
      'cash-reconcile-bank-474-0001',
    );

    expect(rpc).toHaveBeenCalledWith('conciliar_retiro_caja_tx', {
      p_tenant_id: 'tenant-474',
      p_retiro_id: 'retiro-474',
      p_payload: expect.objectContaining({ numero_operacion: 'OP-474' }),
      p_actor_id: 'actor-474',
      p_idempotency_key: 'cash-reconcile-bank-474-0001',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('mantiene el rechazo bloqueado hasta existir una reversa financiera explícita', async () => {
    await expect(service.rechazarConciliacion()).rejects.toThrow(
      'transición atómica explícita',
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
