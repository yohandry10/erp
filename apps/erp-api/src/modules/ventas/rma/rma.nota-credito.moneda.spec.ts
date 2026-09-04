import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { RmaService } from './rma.service';

describe('RmaService - fronteras atómicas 456', () => {
  let service: RmaService;
  let rpc: jest.Mock;
  let maybeSingle: jest.Mock;

  beforeEach(async () => {
    rpc = jest.fn().mockResolvedValue({
      data: { success: true, rma_id: 'rma-1', idempotent: false },
      error: null,
    });
    maybeSingle = jest.fn().mockResolvedValue({ data: { pais: 'PE', is_demo: false }, error: null });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RmaService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: () => ({
              rpc,
              from: jest.fn(() => ({
                select: jest.fn(() => ({
                  eq: jest.fn(() => ({ maybeSingle })),
                })),
              })),
            }),
          },
        },
      ],
    }).compile();
    service = module.get(RmaService);
  });

  it('crea mediante una sola RPC con actor, tenant e idempotencia', async () => {
    await service.crear(
      'tenant-1',
      'actor-1',
      {
        pedido_id: 'd065a90f-d2dc-45f4-b300-faea78c17b46',
        documento_origen_id: 'b349e3c1-7f4f-49b8-9925-0209890b2f2e',
        motivo_general: 'Producto defectuoso',
        items: [
          {
            detalle_id: '60ed55a2-8e6e-47e8-aac4-b848b1c2bded',
            cantidad: 1,
          },
        ],
      },
      'RMA:CREATE:001',
    );

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('crear_rma_tx', {
      p_tenant_id: 'tenant-1',
      p_actor_id: 'actor-1',
      p_payload: expect.objectContaining({ motivo_general: 'Producto defectuoso' }),
      p_idempotency_key: 'rma:create:001',
    });
  });

  it('emite NC/CPE/CxC/saldo sólo mediante emitir_nota_credito_rma_tx', async () => {
    await service.generarNotaCredito(
      'tenant-1',
      'actor-2',
      'rma-1',
      { motivo: 'Devolución por ítems', serie: 'FC01', tipo_nota_credito: '07' },
      'rma:nc:001',
    );

    expect(rpc).toHaveBeenCalledWith('emitir_nota_credito_rma_tx', {
      p_tenant_id: 'tenant-1',
      p_actor_id: 'actor-2',
      p_rma_id: 'rma-1',
      p_payload: {
        motivo: 'Devolución por ítems',
        serie: 'FC01',
        tipo_nota_credito: '07',
      },
      p_idempotency_key: 'rma:nc:001',
    });
  });

  it('en Colombia real deriva la RMA al writer atómico DIAN 91', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { pais: 'CO', is_demo: false }, error: null });

    await service.generarNotaCredito(
      'tenant-co',
      'actor-2',
      'rma-1',
      { motivo: 'Devolución por ítems', tipo_nota_credito: '07' },
      'rma:nc:co:001',
    );

    expect(rpc).toHaveBeenCalledWith('emitir_nota_credito_rma_tx', {
      p_tenant_id: 'tenant-co',
      p_actor_id: 'actor-2',
      p_rma_id: 'rma-1',
      p_payload: { motivo: 'Devolución por ítems' },
      p_idempotency_key: 'rma:nc:co:001',
    });
  });

  it('bloquea en demo Colombia cualquier apariencia de aceptación DIAN real', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { pais: 'CO', is_demo: true }, error: null });

    await expect(
      service.generarNotaCredito(
        'tenant-co',
        'actor-2',
        'rma-1',
        { motivo: 'Devolución por ítems', tipo_nota_credito: '07' },
        'rma:nc:co:001',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'RMA_DIAN_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW',
      }),
    });

    expect(rpc).not.toHaveBeenCalled();
  });

  it('bloquea en Argentina la RPC SUNAT 07 hasta usar la nota referenciada ARCA con CAE', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { pais: 'AR', is_demo: false }, error: null });

    await expect(
      service.generarNotaCredito(
        'tenant-ar',
        'actor-2',
        'rma-1',
        { motivo: 'Devolución por ítems', tipo_nota_credito: '07' },
        'rma:nc:ar:001',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'RMA_ARCA_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW',
      }),
    });

    expect(rpc).not.toHaveBeenCalled();
  });

  it('aplica, reembolsa y revierte el pasivo sin simular un cobro', async () => {
    await service.aplicarSaldoFavor(
      'tenant-1',
      'actor-2',
      'saldo-1',
      { cxc_id: '24292b6e-8995-41e1-851f-681791e7c3c4', monto: 20 },
      'saldo:apply:001',
    );
    await service.reembolsarSaldoFavor(
      'tenant-1',
      'actor-2',
      'saldo-1',
      {
        monto: 10,
        medio: 'BANCO',
        cuenta_bancaria_id: '3532e8e4-18de-4736-a406-2fd2ea0fcdd8',
        referencia: 'OP-001',
      },
      'saldo:refund:001',
    );
    await service.revertirReembolsoSaldoFavor(
      'tenant-1',
      'actor-2',
      'saldo-1',
      'movimiento-reembolso-1',
      {
        motivo: 'Transferencia bancaria rechazada',
      },
      'saldo:refund:reversal:466:001',
    );

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'aplicar_saldo_favor_cxc_tx',
      'reembolsar_saldo_favor_tx',
      'revertir_reembolso_saldo_favor_tx',
    ]);
    expect(rpc).toHaveBeenLastCalledWith('revertir_reembolso_saldo_favor_tx', {
      p_tenant_id: 'tenant-1',
      p_actor_id: 'actor-2',
      p_saldo_id: 'saldo-1',
      p_movimiento_id: 'movimiento-reembolso-1',
      p_payload: { motivo: 'Transferencia bancaria rechazada' },
      p_idempotency_key: 'saldo:refund:reversal:466:001',
    });
  });
});
