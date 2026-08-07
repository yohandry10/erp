import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AlcanceFechaReporte,
  NaturalezaLineaReporte,
  TipoLineaReporte,
  TipoTasaConsolidacion,
} from '@erp-suite/dtos';
import { ConsolidacionReportesService } from './consolidacion-reportes.service';

describe('ConsolidacionReportesService', () => {
  const rpc = jest.fn();
  const from = jest.fn();
  const supabase = { getClient: () => ({ rpc, from }) } as any;
  let service: ConsolidacionReportesService;

  const cuenta = (codigo: string, orden: number) => ({
    codigo,
    nombre: codigo,
    orden,
    tipo: TipoLineaReporte.CUENTAS,
    patrones_cuenta: [codigo],
    naturaleza: NaturalezaLineaReporte.SALDO,
    alcance_fecha: AlcanceFechaReporte.PERIODO,
    tipo_tasa: TipoTasaConsolidacion.CIERRE,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConsolidacionReportesService(supabase);
  });

  it('acepta cuentas y fórmulas estructuradas sin SQL arbitrario', () => {
    expect(() =>
      ConsolidacionReportesService.validarDefinicion([
        cuenta('INGRESOS', 1),
        cuenta('GASTOS', 2),
        {
          codigo: 'RESULTADO',
          nombre: 'Resultado',
          orden: 3,
          tipo: TipoLineaReporte.FORMULA,
          formula: [
            { codigo: 'INGRESOS', coeficiente: 1 },
            { codigo: 'GASTOS', coeficiente: -1 },
          ],
        },
      ]),
    ).not.toThrow();
  });

  it('rechaza códigos y órdenes duplicados', () => {
    expect(() =>
      ConsolidacionReportesService.validarDefinicion([cuenta('A', 1), cuenta('A', 2)]),
    ).toThrow('códigos');
    expect(() =>
      ConsolidacionReportesService.validarDefinicion([cuenta('A', 1), cuenta('B', 1)]),
    ).toThrow('orden');
  });

  it('rechaza referencias inexistentes y dependencias circulares', () => {
    expect(() =>
      ConsolidacionReportesService.validarDefinicion([
        {
          codigo: 'TOTAL', nombre: 'Total', orden: 1, tipo: TipoLineaReporte.FORMULA,
          formula: [{ codigo: 'NO_EXISTE', coeficiente: 1 }],
        },
      ]),
    ).toThrow('inexistente');

    expect(() =>
      ConsolidacionReportesService.validarDefinicion([
        {
          codigo: 'A', nombre: 'A', orden: 1, tipo: TipoLineaReporte.FORMULA,
          formula: [{ codigo: 'B', coeficiente: 1 }],
        },
        {
          codigo: 'B', nombre: 'B', orden: 2, tipo: TipoLineaReporte.FORMULA,
          formula: [{ codigo: 'A', coeficiente: 1 }],
        },
      ]),
    ).toThrow('circular');
  });

  it('rechaza líneas híbridas que mezclan cuentas y fórmula', () => {
    expect(() =>
      ConsolidacionReportesService.validarDefinicion([
        {
          ...cuenta('A', 1),
          formula: [{ codigo: 'A', coeficiente: 1 }],
        },
      ]),
    ).toThrow('cuentas y no una fórmula');
  });

  it('crea grupo y membresía controladora mediante una sola RPC', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'grupo-1' }], error: null });
    jest.spyOn(service, 'obtenerGrupo').mockResolvedValue({ id: 'grupo-1' } as any);

    await expect(service.crearGrupo('tenant-1', 'user-1', {
      codigo: 'G1', nombre: 'Grupo 1', moneda_presentacion: 'PEN',
    })).resolves.toEqual({ id: 'grupo-1' });
    expect(rpc).toHaveBeenCalledWith('crear_grupo_consolidacion_tx', expect.objectContaining({
      p_tenant_id: 'tenant-1',
      p_moneda_presentacion: 'PEN',
    }));
  });

  it('no invita un RUC que no corresponde exactamente a una empresa', async () => {
    jest.spyOn(service as any, 'exigirControladora').mockResolvedValue({ id: 'grupo-1' });
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    from.mockReturnValue(query);

    await expect(
      service.invitarMiembro('tenant-1', 'user-1', 'grupo-1', { ruc: '20123456789' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('guarda cabecera y líneas del reporte en una sola RPC', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'reporte-1' }], error: null });
    jest.spyOn(service, 'listarReportes').mockResolvedValue([{ id: 'reporte-1' }] as any);
    const dto = {
      codigo: 'ER', nombre: 'Estado de resultados', lineas: [cuenta('70', 1)],
    };

    await expect(service.guardarReporte('tenant-1', 'user-1', dto)).resolves.toEqual({
      id: 'reporte-1',
    });
    expect(rpc).toHaveBeenCalledWith('guardar_reporte_configurable_tx', expect.objectContaining({
      p_tenant_id: 'tenant-1',
      p_lineas: expect.arrayContaining([expect.objectContaining({ codigo: '70' })]),
    }));
  });

  it('impide ajustes con debe y haber simultáneos o ambos en cero', async () => {
    jest.spyOn(service as any, 'exigirControladora').mockResolvedValue({ id: 'grupo-1' });
    const base = {
      fecha: '2026-12-31', tipo: 'ELIMINACION' as any,
      cuenta_codigo: '1212', descripcion: 'Eliminar saldo intragrupo',
    };
    await expect(
      service.crearAjuste('tenant-1', 'user-1', 'grupo-1', { ...base, debe: 10, haber: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.crearAjuste('tenant-1', 'user-1', 'grupo-1', { ...base, debe: 0, haber: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(from).not.toHaveBeenCalled();
  });

  it('no guarda un mapeo si la cuenta origen no existe en la empresa miembro', async () => {
    jest.spyOn(service as any, 'exigirControladora').mockResolvedValue({ id: 'grupo-1' });
    jest.spyOn(service as any, 'exigirMiembroActivo').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'buscarCuenta')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'destino' });

    await expect(service.registrarMapeoCuenta('tenant-1', 'user-1', 'grupo-1', {
      tenant_miembro_id: 'tenant-2',
      cuenta_codigo_origen: '4100',
      cuenta_codigo_destino: '7011',
    })).rejects.toThrow('cuenta origen 4100');
    expect(from).not.toHaveBeenCalled();
  });

  it('homologa solo la cuenta exacta de la empresa indicada', () => {
    const movimientos = [
      { tenant_id: 'miembro', fecha: '2026-01-01', codigo: '4100', nombre: 'Ventas', debe: 0, haber: 10 },
      { tenant_id: 'otra', fecha: '2026-01-01', codigo: '4100', nombre: 'Ventas', debe: 0, haber: 20 },
      { tenant_id: 'miembro', fecha: '2026-01-01', codigo: '41001', nombre: 'Otra', debe: 0, haber: 30 },
    ];
    const resultado = ConsolidacionReportesService.aplicarMapeos(movimientos, [{
      miembro_tenant_id: 'miembro',
      cuenta_codigo_origen: '4100',
      cuenta_codigo_destino: '7011',
    }]);

    expect(resultado.map((m) => m.codigo)).toEqual(['7011', '4100', '41001']);
    expect(movimientos[0].codigo).toBe('4100');
  });

  it('incluye los movimientos ocurridos durante todo el día de fecha hasta', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    from.mockReturnValue(query);

    await (service as any).cargarMovimientos('tenant-1', '2026-08-07');

    expect(query.lte).toHaveBeenCalledWith(
      'asientos_contables.fecha',
      '2026-08-07T23:59:59.999Z',
    );
  });
});
