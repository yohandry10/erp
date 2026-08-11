import { Test } from '@nestjs/testing';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { PeriodosService } from './periodos.service';

describe('PeriodosService — cierre anual atómico', () => {
  const rpc = jest.fn();
  let service: PeriodosService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PeriodosService,
        { provide: SupabaseService, useValue: { getClient: () => ({ rpc }) } },
        { provide: 'EstadosFinancierosService', useValue: {} },
      ],
    }).compile();
    service = module.get(PeriodosService);
  });

  it('no orquesta el asiento anual en Node: una RPC posee validación, asiento y cierre', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        periodo: { id: 'dec-2026', anio: 2026, mes: 12, estado: 'CERRADO' },
        cierre_asiento_id: 'entry-1',
        idempotent: false,
      },
      error: null,
    });

    await expect(service.cerrarPeriodo('tenant-1', 2026, 12, 'user-1')).resolves.toEqual(
      expect.objectContaining({ id: 'dec-2026', estado: 'CERRADO' }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('cerrar_periodo_contable_tx', {
      p_tenant_id: 'tenant-1', p_anio: 2026, p_mes: 12, p_actor_id: 'user-1',
    });
  });

  it('si falla el asiento anual, la RPC rechaza y Node no intenta cerrar por separado', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'ACCOUNTING_YEAR_CLOSE_ACCOUNTS_89_59_REQUIRED' },
    });

    await expect(service.cerrarPeriodo('tenant-1', 2026, 12, 'user-1')).rejects.toThrow(
      'ACCOUNTING_YEAR_CLOSE_ACCOUNTS_89_59_REQUIRED',
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
