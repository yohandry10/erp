import { Test } from '@nestjs/testing';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EstadosFinancierosService } from './estados-financieros.service';

describe('EstadosFinancierosService — reportes live 458', () => {
  let service: EstadosFinancierosService;
  const rpc = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        EstadosFinancierosService,
        {
          provide: SupabaseService,
          useValue: { getClient: () => ({ rpc }) },
        },
      ],
    }).compile();
    service = module.get(EstadosFinancierosService);
  });

  it('lee el balance de comprobación acumulado desde la RPC live', async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        cuenta: '12', nombre: 'Clientes', saldo_inicial: '118.00',
        debe: '0', haber: '118', saldo_final: '0',
      }],
      error: null,
    });

    await expect(service.getBalanceComprobacion('tenant-1', 2026, 2)).resolves.toEqual([
      {
        cuenta: '12', nombre: 'Clientes', saldo_inicial: 118,
        debe: 0, haber: 118, saldo_final: 0,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('balance_comprobacion_live', {
      p_tenant_id: 'tenant-1', p_anio: 2026, p_mes: 2,
    });
  });

  it('no conserva una hora de datos viejos: cada lectura consulta el libro', async () => {
    rpc
      .mockResolvedValueOnce({
        data: [{ cuenta: '10', nombre: 'Banco', saldo_inicial: 0, debe: 10, haber: 0, saldo_final: 10 }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ cuenta: '10', nombre: 'Banco', saldo_inicial: 0, debe: 20, haber: 0, saldo_final: 20 }],
        error: null,
      });

    const first = await service.getBalanceComprobacion('tenant-1', 2026, 3);
    const second = await service.getBalanceComprobacion('tenant-1', 2026, 3);

    expect(first[0].saldo_final).toBe(10);
    expect(second[0].saldo_final).toBe(20);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('mapea el estado de resultados YTD sin depender de una vista materializada', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ventas: 100, otros_ingresos: 5, total_ingresos: 105,
        costo_ventas: 40, utilidad_bruta: 65,
        gastos_administrativos: 20, gastos_ventas: 3, gastos_financieros: 2,
        total_gastos: 25, utilidad_neta: 40,
      },
      error: null,
    });

    const result = await service.getEstadoResultados('tenant-1', 2026, 8);

    expect(result).toEqual({
      ingresos: { ventas: 100, otros_ingresos: 5, total_ingresos: 105 },
      costos: { costo_ventas: 40, utilidad_bruta: 65 },
      gastos: {
        gastos_administrativos: 20,
        gastos_ventas: 3,
        gastos_financieros: 2,
        total_gastos: 25,
      },
      utilidad_neta: 40,
    });
    expect(rpc).toHaveBeenCalledWith('estado_resultados_live', {
      p_tenant_id: 'tenant-1', p_anio: 2026, p_mes: 8,
    });
  });

  it('clasifica el saldo a favor del cliente dentro de otros pasivos', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        efectivo: 100, cuentas_por_cobrar: 20, inventarios: 30,
        otros_activos_corrientes: 0, activos_fijos: 50,
        depreciacion_acumulada: 10, otros_activos_no_corrientes: 0,
        cuentas_por_pagar: 15, tributos_por_pagar: 5,
        remuneraciones_por_pagar: 0, otros_pasivos_corrientes: 10,
        deudas_largo_plazo: 20, otros_pasivos_no_corrientes: 0,
        capital: 100, resultados_acumulados: 0, resultado_ejercicio: 20,
      },
      error: null,
    });

    const result = await service.getBalanceGeneral('tenant-1', 2026, 8);

    expect(result.activos.total_activos).toBe(190);
    expect(result.pasivos.corrientes.otros_pasivos).toBe(10);
    expect(result.pasivos.total_pasivos).toBe(50);
    expect(result.patrimonio.total_patrimonio).toBe(120);
    expect((result as any).advertencia_balance).toEqual(expect.objectContaining({
      desbalanceado: true,
      diferencia: 20,
    }));
    expect(rpc).toHaveBeenCalledWith('balance_general_live', {
      p_tenant_id: 'tenant-1', p_anio: 2026, p_mes: 8,
    });
  });

  it('propaga un error de la fuente live en vez de devolver ceros engañosos', async () => {
    const error = { message: 'live report failed' };
    rpc.mockResolvedValueOnce({ data: null, error });

    await expect(service.getEstadoResultados('tenant-1', 2026, 8)).rejects.toBe(error);
  });

  it('mantiene el refresh sólo como operación de compatibilidad', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });

    await service.refrescarEstadosFinancieros('tenant-1', 2026, 8);

    expect(rpc).toHaveBeenCalledWith('refrescar_estados_financieros', {
      p_tenant_id: 'tenant-1', p_anio: 2026, p_mes: 8,
    });
  });
});
