import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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

  it('convierte saldo acreedor y movimientos al medio céntimo sin asimetría ni alteración de fuentes', async () => {
    const saldo = cuenta('SALDO', 1);
    saldo.patrones_cuenta = ['10'];
    const haber = { ...cuenta('HABER', 2), naturaleza: NaturalezaLineaReporte.HABER, patrones_cuenta: ['10'] };
    jest.spyOn(service as any, 'obtenerReporte').mockResolvedValue({ id: 'report', codigo: 'CONTROL', nombre: 'Control', lineas: [saldo, haber] });
    jest.spyOn(service as any, 'obtenerMonedaTenant').mockResolvedValue('PEN');
    jest.spyOn(service as any, 'exigirControladora').mockResolvedValue({ id: 'group', moneda_presentacion: 'USD' });
    const movimientos = [
      { tenant_id: 'tenant', fecha: '2026-10-08', codigo: '1041', nombre: 'Banco', debe: 0, haber: .03 },
      { tenant_id: 'tenant', fecha: '2026-10-08', codigo: '1041', nombre: 'Banco', debe: 0, haber: .03 },
    ];
    jest.spyOn(service as any, 'cargarMovimientos').mockResolvedValue(movimientos);
    jest.spyOn(service as any, 'resolverFactores').mockResolvedValue(new Map([['tenant:CIERRE', { factor: .25 }]]));
    from.mockImplementation((table: string) => {
      const data=table==='grupos_consolidacion_miembros' ? [{id:'member',grupo_id:'group',tenant_id:'tenant',estado:'ACTIVO'}] : [];
      const query: any = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), range: jest.fn().mockReturnThis(), then: (resolve: any) => Promise.resolve({ data, count:data.length, error: null }).then(resolve) };
      return query;
    });
    const result = await service.generarReporte('tenant', 'report', '2026-10-01', '2026-10-08', 'group');
    expect(result.lineas.map(line => line.valor)).toEqual([-.02, .02]);
    expect(movimientos.map(row => row.haber)).toEqual([.03, .03]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([0.019, -1, Number.POSITIVE_INFINITY])('rechaza importe %s antes del writer y de cualquier recibo', async value => {
    await expect(service.crearAjuste('tenant', 'actor', 'group', {
      fecha: '2026-10-08', tipo: 'ELIMINACION', cuenta_codigo: '75', descripcion: 'Sustento', haber: value,
    } as any)).rejects.toThrow(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([0.12345678901, 0, -1, Number.POSITIVE_INFINITY, 10000000000])('rechaza tasa %s que no puede persistir exactamente', async factor => {
    await expect(service.registrarTasa('tenant', 'actor', 'group', {
      tenant_miembro_id: 'member', fecha: '2026-10-08', tipo: TipoTasaConsolidacion.PROMEDIO, factor_conversion: factor,
    })).rejects.toThrow(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['same', 'different-actor', 'different-name', 'different-currency'])('recuperación de grupo tras ACK perdido: %s', async conflict => {
    rpc.mockResolvedValue({ data: null, error: { code: '23505' } });
    const chain: any = { select: jest.fn(() => chain), eq: jest.fn(() => chain), maybeSingle: jest.fn().mockResolvedValue({
      data: { id: 'group-ack', created_by: conflict === 'different-actor' ? 'otro' : 'actor',
        nombre: conflict === 'different-name' ? 'Otro' : 'Grupo', moneda_presentacion: conflict === 'different-currency' ? 'PEN' : 'USD' }, error: null }) };
    from.mockReturnValue(chain);
    jest.spyOn(service, 'obtenerGrupo').mockResolvedValue({ id: 'group-ack' } as any);
    const result = service.crearGrupo('tenant', 'actor', { codigo: ' GRUPO ', nombre: 'Grupo', moneda_presentacion: 'USD' });
    if (conflict === 'same') await expect(result).resolves.toEqual({ id: 'group-ack' });
    else await expect(result).rejects.toThrow(ConflictException);
    expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant');
    expect(chain.eq).toHaveBeenCalledWith('codigo', 'GRUPO');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('recupera alta con ACK perdido únicamente con definición idéntica y mismo actor', async () => {
    const dto = { codigo: ' RECUPERABLE ', nombre: 'Reporte', lineas: [cuenta('A', 1)] };
    const previo = { id: 'report-ack', codigo: 'RECUPERABLE', nombre: 'Reporte', descripcion: null,
      created_by: 'actor-ack', lineas: [{ ...cuenta('A', 1), id: 'line-a', tenant_id: 'tenant-ack', signo: 1, formula: [] }] };
    rpc.mockResolvedValue({ data: null, error: { code: '23505' } });
    jest.spyOn(service, 'listarReportes').mockResolvedValue([previo] as any);
    await expect(service.guardarReporte('tenant-ack', 'actor-ack', dto)).resolves.toEqual({ ...previo, idempotent: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(service.listarReportes).toHaveBeenCalledWith('tenant-ack');
  });

  it.each(['different-actor', 'different-definition', 'different-name'])('conserva el conflicto de alta %s sin sobrescribir', async conflict => {
    const dto = { codigo: 'RECUPERABLE', nombre: 'Reporte', lineas: [cuenta('A', 1)] };
    const previo = { id: 'report-ack', codigo: 'RECUPERABLE', nombre: conflict === 'different-name' ? 'Otro' : 'Reporte',
      created_by: conflict === 'different-actor' ? 'another-actor' : 'actor-ack',
      lineas: [conflict === 'different-definition' ? cuenta('B', 1) : cuenta('A', 1)] };
    rpc.mockResolvedValue({ data: null, error: { code: '23505' } });
    jest.spyOn(service, 'listarReportes').mockResolvedValue([previo] as any);
    await expect(service.guardarReporte('tenant-ack', 'actor-ack', dto)).rejects.toThrow(ConflictException);
    expect(rpc).toHaveBeenCalledTimes(1);
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

  it('incluye el día civil Perú completo sin asumir el fin del día UTC', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      then: (resolve: any)=>Promise.resolve({data:[],count:0,error:null}).then(resolve),
      maybeSingle: jest.fn().mockResolvedValue({data:{tenant_id:'tenant-1',pais:'PE'},error:null}),
    };
    from.mockReturnValue(query);

    await (service as any).cargarMovimientos('tenant-1', '2026-08-07');

    expect(query.lt).toHaveBeenCalledWith(
      'asientos_contables.fecha',
      '2026-08-08T05:00:00.000Z',
    );
  });
});
