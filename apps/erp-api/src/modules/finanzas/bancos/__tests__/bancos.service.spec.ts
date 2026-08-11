import { BadRequestException } from '@nestjs/common';
import { BancosService } from '../bancos.service';

describe('BancosService - contrato atómico 457', () => {
  const rpc = jest.fn();
  const from = jest.fn();
  const supabase = { getClient: () => ({ rpc, from }) } as any;
  let service: BancosService;

  beforeEach(() => {
    jest.clearAllMocks();
    rpc.mockResolvedValue({ data: { movimiento_id: 'mov-1' }, error: null });
    service = new BancosService(supabase);
  });

  it('rechaza movimiento sin actor antes de tocar la base', async () => {
    await expect(service.registrarMovimientoBancarioAtomico('tenant', {
      cuenta_bancaria_id: '11111111-1111-4111-8111-111111111111',
      cuenta_contrapartida_id: '22222222-2222-4222-8222-222222222222',
      tipo: 'ABONO',
      monto: 10,
      moneda: 'PEN',
      fecha: '2026-08-09',
      descripcion: 'Aporte',
      categoria: 'APORTE_CAPITAL',
      idempotency_key: 'bank-movement-1',
    })).rejects.toThrow('El actor autenticado es obligatorio');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('separa clave/actor y envía todo el payload a una sola RPC', async () => {
    const dto = {
      cuenta_bancaria_id: '11111111-1111-4111-8111-111111111111',
      cuenta_contrapartida_id: '22222222-2222-4222-8222-222222222222',
      tipo: 'CARGO' as const,
      monto: 10,
      moneda: 'PEN',
      fecha: '2026-08-09',
      descripcion: 'Comisión',
      categoria: 'COMISION_BANCARIA' as const,
      idempotency_key: 'bank-movement-1',
    };
    await service.crearMovimientoBancario('tenant', dto, 'actor');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('registrar_movimiento_bancario_tx', {
      p_tenant_id: 'tenant',
      p_payload: {
        cuenta_bancaria_id: dto.cuenta_bancaria_id,
        cuenta_contrapartida_id: dto.cuenta_contrapartida_id,
        tipo: 'CARGO',
        monto: 10,
        moneda: 'PEN',
        fecha: '2026-08-09',
        descripcion: 'Comisión',
        categoria: 'COMISION_BANCARIA',
      },
      p_actor_id: 'actor',
      p_idempotency_key: 'bank-movement-1',
    });
  });

  it('registra una transferencia como una sola intención', async () => {
    await service.transferirEntreCuentas('tenant', {
      cuenta_origen_id: '11111111-1111-4111-8111-111111111111',
      cuenta_destino_id: '22222222-2222-4222-8222-222222222222',
      monto: 25,
      moneda: 'PEN',
      fecha: '2026-08-09',
      descripcion: 'Fondeo interno',
      idempotency_key: 'bank-transfer-1',
    }, 'actor');
    expect(rpc).toHaveBeenCalledWith('transferir_entre_cuentas_bancarias_tx', {
      p_tenant_id: 'tenant',
      p_payload: {
        cuenta_origen_id: '11111111-1111-4111-8111-111111111111',
        cuenta_destino_id: '22222222-2222-4222-8222-222222222222',
        monto: 25,
        moneda: 'PEN',
        fecha: '2026-08-09',
        descripcion: 'Fondeo interno',
      },
      p_actor_id: 'actor',
      p_idempotency_key: 'bank-transfer-1',
    });
  });

  it('falla cerrado cuando la RPC no está disponible', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'RPC unavailable' } });
    await expect(service.transferirEntreCuentas('tenant', {
      cuenta_origen_id: '11111111-1111-4111-8111-111111111111',
      cuenta_destino_id: '22222222-2222-4222-8222-222222222222',
      monto: 25,
      moneda: 'PEN',
      fecha: '2026-08-09',
      descripcion: 'Fondeo interno',
      idempotency_key: 'bank-transfer-1',
    }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fuerza saldo inicial cero y delega el alta al writer 477', async () => {
    const dto = {
      cuenta_contable_id: '11111111-1111-4111-8111-111111111111',
      nombre: 'Operaciones',
      banco: 'BCP',
      numero_cuenta: '123',
      saldo: 0,
    };
    rpc.mockResolvedValue({ data: { cuenta: { id: 'bank-1' } }, error: null });
    await service.crearCuentaBancaria('tenant', dto, 'actor', 'bank-create-test');
    expect(rpc).toHaveBeenCalledWith('gestionar_cuenta_bancaria_tx', {
      p_tenant_id: 'tenant',
      p_actor_id: 'actor',
      p_cuenta_id: null,
      p_payload: dto,
      p_idempotency_key: 'bank-create-test',
    });

    await expect(service.crearCuentaBancaria('tenant', { ...dto, saldo: 1 }, 'actor'))
      .rejects.toThrow('flujo contable de apertura');
  });
});
