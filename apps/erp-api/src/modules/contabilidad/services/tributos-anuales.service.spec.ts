import { BadRequestException } from '@nestjs/common';
import { calcularRentaAnualItanPeru, FuentesTributariasAnuales, TributosAnualesService } from './tributos-anuales.service';

const fuentes = (overrides: Partial<FuentesTributariasAnuales> = {}): FuentesTributariasAnuales => ({
  ingresos_netos: 500000,
  resultado_contable: 100000,
  activos_netos: 1500000,
  pagos_cuenta_renta: 10000,
  ejercicio_cerrado: true,
  ...overrides,
});

describe('fuente documental de renta anual', () => {
  it('suma incrementos revisados mensuales sin repetir acumulados y sólo acredita pagos presentados', async () => {
    const meses = [
      { periodo: '2026-07', estado: 'PRESENTADA', pago_cuenta_renta: 2,
        source_snapshot: { ajustes_renta: { otros_ingresos_renta_mes: 50, otros_ingresos_renta_acumulados: 50 } } },
      { periodo: '2026-10', estado: 'BORRADOR', pago_cuenta_renta: 6.41,
        source_snapshot: { ajustes_renta: { otros_ingresos_renta_mes: 100, otros_ingresos_renta_acumulados: 150 } } },
      { periodo: '2026-11', estado: 'BORRADOR', pago_cuenta_renta: 0,
        source_snapshot: { ajustes_renta: { otros_ingresos_renta_mes: 0, otros_ingresos_renta_acumulados: 150 } } },
    ];
    const queries: Record<string, any> = {};
    const from = (table: string) => {
      const data = table === 'tributos_declaraciones_mensuales' ? meses : table === 'empresa_config' ? { pais: 'PE', regimen_tributario: 'GENERAL' }
        : table === 'periodos_contables' ? { estado: 'CERRADO' } : table === 'tributos_declaraciones_anuales' ? null : [];
      const chain: any = { then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) };
      for (const method of ['select', 'eq', 'gte', 'lt', 'lte', 'not', 'maybeSingle', 'order', 'range']) chain[method] = jest.fn(() => chain);
      queries[table] = chain;
      return chain;
    };
    const service = new TributosAnualesService({ getClient: () => ({ from }) } as any, {
      getEstadoResultados: async () => ({ utilidad_neta: 500 }),
      getBalanceGeneral: async () => ({ activos: { total_activos: 1000 } }),
    } as any);
    const result = await service.calcular('tenant-1', 2026);
    expect(result).toMatchObject({ ingresos_netos: 150, otros_ingresos_revisados: 150, pagos_cuenta_renta: 2,
      resultado_contable: 500, renta_neta_imponible: 500, impuesto_renta_calculado: 147.5 });
    expect(queries.tributos_declaraciones_mensuales.eq).toHaveBeenCalledWith('vigente', true);
    expect(queries.tributos_declaraciones_mensuales.eq).not.toHaveBeenCalledWith('estado', 'PRESENTADA');
  });

  it('netea NC, excluye tickets y anulados y conserva el ejercicio siguiente para ITAN', async () => {
    const documentos = [
      { id: 'f-1', tipo_documento: 'FACTURA', estado: 'FIRMADO', total_gravadas: 200 },
      { id: 'n-1', documento_id: 'doc-n-1', tipo_documento: 'NOTA_CREDITO', estado: 'FIRMADO', total_gravadas: 80 },
      { id: 'n-2', documento_id: 'doc-n-2', tipo_documento: '07', estado: 'FIRMADO', total_gravadas: 80 },
      { id: 'n-pending', documento_id: null, tipo_documento: '07', estado: 'FIRMADO', total_gravadas: 50 },
      { id: 'nd-pending', documento_id: null, tipo_documento: '08', estado: 'FIRMADO', total_gravadas: 25 },
      { id: 'b-1', tipo_documento: 'BOLETA', estado: 'FIRMADO', total_gravadas: 180.17, total_exoneradas: 0.39 },
      { id: 't-1', tipo_documento: 'TICKET', estado: 'FIRMADO', total_gravadas: 1000 },
      { id: 'a-1', tipo_documento: 'FACTURA', estado: 'ANULADA', total_gravadas: 1000 },
    ];
    const queries: Record<string, any> = {};
    const from = jest.fn((table: string) => {
      const data = table === 'cpe' ? documentos : table === 'empresa_config' ? { pais: 'PE', regimen_tributario: 'GENERAL' }
        : table === 'periodos_contables' ? { estado: 'EN_PROCESO' } : table === 'tributos_declaraciones_anuales' ? null : [];
      const chain: any = { then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) };
      for (const method of ['select', 'eq', 'gte', 'lt', 'lte', 'not', 'maybeSingle', 'order', 'range']) chain[method] = jest.fn(() => chain);
      queries[table] = chain;
      return chain;
    });
    const states = {
      getEstadoResultados: jest.fn().mockResolvedValue({ utilidad_neta: -7765.8 }),
      getBalanceGeneral: jest.fn().mockResolvedValue({ activos: { total_activos: 43499.2 } }),
    };
    const service = new TributosAnualesService({ getClient: () => ({ from }) } as any, states as any);
    const result = await service.calcular('tenant-1', 2026);
    expect(result.ingresos_netos).toBe(220.56);
    expect(result.source_snapshot.cantidad_ventas).toBe(4);
    expect(result.source_snapshot.itan_ejercicio).toBe(2027);
    expect(result.source_snapshot.ejercicio_cerrado).toBe(false);
    expect(queries.cpe.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(queries.cpe.select).toHaveBeenCalledWith(expect.stringContaining('documento_id, tipo_documento, estado'));
  });

  it('recupera ajustes de la versión guardada y permite sobreescribirlos con cero', async () => {
    const service = new TributosAnualesService({ getClient: () => ({ from: () => {
      const chain: any = { maybeSingle: () => Promise.resolve({ data: {
        adiciones_tributarias: 10000, deducciones_tributarias: 1000,
        perdidas_compensables: 500, pagos_cuenta_renta: 200,
        credito_itan_renta: 50, otros_creditos_renta: 25, deducciones_itan: 100,
      }, error: null }) };
      for (const method of ['select', 'eq']) chain[method] = () => chain;
      return chain;
    } }) } as any, {} as any);
    jest.spyOn(service as any, 'configuracion').mockResolvedValue('GENERAL');
    jest.spyOn(service as any, 'fuentes').mockResolvedValue({ fuentes: fuentes(), snapshot: { corte: '2026-10-08' } });
    const restored = await service.calcular('tenant-1', 2026);
    expect(restored).toMatchObject({ adiciones_tributarias: 10000, deducciones_tributarias: 1000,
      perdidas_compensables: 500, pagos_cuenta_renta: 200, credito_itan_renta: 50,
      otros_creditos_renta: 25, deducciones_itan: 100, renta_neta_imponible: 108500 });
    const changed = await service.calcular('tenant-1', 2026, { adiciones_tributarias: 0, pagos_cuenta_renta: 0 });
    expect(changed).toMatchObject({ adiciones_tributarias: 0, pagos_cuenta_renta: 0,
      deducciones_tributarias: 1000, renta_neta_imponible: 98500 });
  });
});

describe('calcularRentaAnualItanPeru', () => {
  it('otros ingresos mensuales revisados complementan ingresos sin duplicarse en la renta contable', () => {
    const base = calcularRentaAnualItanPeru(2026, 'GENERAL', fuentes());
    const ajustado = calcularRentaAnualItanPeru(2026, 'GENERAL', fuentes({ otros_ingresos_revisados: 100 }));
    expect(ajustado.ingresos_netos).toBe(base.ingresos_netos + 100);
    expect(ajustado.otros_ingresos_revisados).toBe(100);
    expect(ajustado.renta_neta_imponible).toBe(base.renta_neta_imponible);
    expect(ajustado.impuesto_renta_calculado).toBe(base.impuesto_renta_calculado);
  });
  it('calcula 29.5% para Régimen General y resta créditos', () => {
    const result = calcularRentaAnualItanPeru(2025, 'GENERAL', fuentes(), {
      adiciones_tributarias: 10000,
      deducciones_tributarias: 5000,
      credito_itan_renta: 1000,
      otros_creditos_renta: 500,
    });
    expect(result.renta_neta_imponible).toBe(105000);
    expect(result.impuesto_renta_calculado).toBe(30975);
    expect(result.renta_por_pagar).toBe(19475);
  });

  it('aplica escala RMT: 10% hasta 15 UIT y 29.5% al exceso', () => {
    const result = calcularRentaAnualItanPeru(2025, 'MYPE', fuentes({ resultado_contable: 100000 }), {
      pagos_cuenta_renta: 0,
    });
    expect(result.impuesto_renta_calculado).toBe(13851.25);
  });

  it('calcula ITAN 0.4% sólo sobre el exceso de S/ 1 millón', () => {
    const result = calcularRentaAnualItanPeru(2025, 'GENERAL', fuentes({ activos_netos: 1600000 }), {
      deducciones_itan: 100000,
    });
    expect(result.base_imponible_itan).toBe(500000);
    expect(result.itan_calculado).toBe(2000);
  });

  it('selecciona FV 710 Completo al superar 1,700 UIT', () => {
    const result = calcularRentaAnualItanPeru(2025, 'GENERAL', fuentes({ ingresos_netos: 9_095_000.01 }));
    expect(result.formulario).toBe('FV710_COMPLETO');
    expect(result.warnings).toContainEqual(expect.objectContaining({ codigo: 'BALANCE_FV710_COMPLETO' }));
  });

  it('bloquea constancia si diciembre no está cerrado o el balance no cuadra', () => {
    const result = calcularRentaAnualItanPeru(2025, 'GENERAL', fuentes({
      ejercicio_cerrado: false,
      balance_descuadrado: true,
      diferencia_balance: 10,
    }));
    expect(result.warnings.filter((warning) => warning.bloquea_presentacion)).toHaveLength(2);
  });

  it('rechaza ejercicios sin UIT verificada', () => {
    expect(() => calcularRentaAnualItanPeru(2023, 'GENERAL', fuentes())).toThrow(BadRequestException);
  });
});
