import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EstadoPeriodo, PeriodosService } from './periodos.service';

describe('PeriodosService — frontera atómica 458', () => {
  let service: PeriodosService;
  const client: any = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
    rpc: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    for (const method of ['from', 'select', 'insert', 'upsert', 'update', 'eq', 'gte', 'lte', 'is', 'order']) {
      client[method].mockReturnValue(client);
    }
    const module = await Test.createTestingModule({
      providers: [
        PeriodosService,
        { provide: SupabaseService, useValue: { getClient: () => client } },
        { provide: 'EstadosFinancierosService', useValue: {} },
      ],
    }).compile();
    service = module.get(PeriodosService);
  });

  it('crea un período abierto si todavía no existe', async () => {
    client.rpc.mockResolvedValueOnce({data:{record:{id:'period-1',tenant_id:'tenant-1',anio:2026,mes:8,estado:'ABIERTO'}},error:null});

    await expect(service.crearPeriodo('tenant-1',2026,8,'user-1','period-create-test')).resolves.toEqual(
      expect.objectContaining({ id: 'period-1', estado: EstadoPeriodo.ABIERTO }),
    );
    expect(client.rpc).toHaveBeenCalledWith('gestionar_maestro_contable_tx',expect.objectContaining({
      p_entity:'PERIOD',p_action:'CREATE',p_actor_id:'user-1',p_idempotency_key:'period-create-test',
    }));
    expect(client.insert).not.toHaveBeenCalled();
  });

  it('falla cerrado si el período no fue creado explícitamente', async () => {
    client.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    await expect(
      service.validarPeriodoAbierto('tenant-1', new Date(2026, 7, 9)),
    ).rejects.toThrow('Debe crearse explícitamente');
    expect(client.upsert).not.toHaveBeenCalled();
  });

  it('rechaza una escritura en período cerrado', async () => {
    client.single.mockResolvedValueOnce({
      data: { id: 'period-1', tenant_id: 'tenant-1', anio: 2026, mes: 8, estado: 'CERRADO' },
      error: null,
    });

    await expect(
      service.validarPeriodoAbierto('tenant-1', new Date(2026, 7, 9)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('limita la inspección de eventos pendientes al tenant solicitado', async () => {
    client.lte.mockResolvedValueOnce({ count: 2, error: null });

    await expect(service.validarEventosPendientes('tenant-1', 2026, 8)).resolves.toEqual({
      valido: false,
      eventosPendientes: 2,
    });
    expect(client.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
  });

  it('delega el cierre completo a una sola RPC con actor', async () => {
    client.rpc.mockResolvedValueOnce({
      data: {
        periodo: {
          id: 'period-1', tenant_id: 'tenant-1', anio: 2026, mes: 8,
          estado: 'CERRADO', cerrado_por: 'user-1',
        },
        idempotent: false,
      },
      error: null,
    });

    await expect(service.cerrarPeriodo('tenant-1', 2026, 8, 'user-1')).resolves.toEqual(
      expect.objectContaining({ estado: EstadoPeriodo.CERRADO, cerrado_por: 'user-1' }),
    );
    expect(client.rpc).toHaveBeenCalledWith('cerrar_periodo_contable_tx', {
      p_tenant_id: 'tenant-1', p_anio: 2026, p_mes: 8, p_actor_id: 'user-1',
    });
    expect(client.update).not.toHaveBeenCalled();
  });

  it('propaga como conflicto un cierre rechazado por pendientes o borradores', async () => {
    client.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'ACCOUNTING_PERIOD_HAS_PENDING_EVENTS:1' },
    });

    await expect(service.cerrarPeriodo('tenant-1', 2026, 8, 'user-1')).rejects.toThrow(
      'ACCOUNTING_PERIOD_HAS_PENDING_EVENTS:1',
    );
  });

  it('reabre y bloquea sólo mediante RPCs con trazabilidad del actor', async () => {
    client.rpc
      .mockResolvedValueOnce({
        data: { periodo: { id: 'period-1', estado: 'ABIERTO' }, idempotent: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { periodo: { id: 'period-1', estado: 'BLOQUEADO' }, idempotent: false },
        error: null,
      });

    await expect(service.reabrirPeriodo('tenant-1', 2026, 8, 'user-1')).resolves.toEqual(
      expect.objectContaining({ estado: EstadoPeriodo.ABIERTO }),
    );
    await expect(service.bloquearPeriodo('tenant-1', 2026, 8, 'user-1')).resolves.toEqual(
      expect.objectContaining({ estado: EstadoPeriodo.BLOQUEADO }),
    );

    expect(client.rpc).toHaveBeenNthCalledWith(1, 'reabrir_periodo_contable_tx', {
      p_tenant_id: 'tenant-1', p_anio: 2026, p_mes: 8, p_actor_id: 'user-1',
    });
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'bloquear_periodo_contable_tx', {
      p_tenant_id: 'tenant-1', p_anio: 2026, p_mes: 8, p_actor_id: 'user-1',
    });
  });
});
