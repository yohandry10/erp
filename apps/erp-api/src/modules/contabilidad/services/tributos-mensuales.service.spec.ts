import { BadRequestException } from '@nestjs/common';
import { TributosMensualesService } from './tributos-mensuales.service';
import {
  calcularTributoMensualPeru,
  consolidarFuentesMensuales,
  FuentesTributariasMensuales,
  normalizarRegimenPeru,
} from './tributos-mensuales.service';

const fuentes = (overrides: Partial<FuentesTributariasMensuales> = {}): FuentesTributariasMensuales => ({
  ventas_gravadas: 10000,
  ventas_exoneradas: 0,
  ventas_inafectas: 0,
  exportaciones: 0,
  igv_ventas: 1800,
  compras_gravadas: 5000,
  igv_compras: 900,
  igv_compras_gravadas: 900,
  igv_compras_no_gravadas: 0,
  igv_compras_comunes: 0,
  operaciones_gravadas_12m: 100000,
  operaciones_no_gravadas_12m: 0,
  ingresos_netos_acumulados: 100000,
  compras_totales_mes: 5900,
  cantidad_ventas: 2,
  cantidad_compras: 2,
  ...overrides,
});

describe('calcularTributoMensualPeru', () => {
  it('calcula IGV descontando crédito fiscal, saldo, retenciones y percepciones', () => {
    const result = calcularTributoMensualPeru('GENERAL', fuentes(), {
      saldo_favor_anterior: 100,
      retenciones_igv: 50,
      percepciones_igv: 25,
      otros_creditos_igv: 25,
      coeficiente_renta: 0.02,
    });
    expect(result.igv_resultante).toBe(700);
    expect(result.saldo_favor_siguiente).toBe(0);
    expect(result.pago_cuenta_renta).toBe(200);
  });

  it('arrastra saldo a favor cuando los créditos superan el débito fiscal', () => {
    const result = calcularTributoMensualPeru('GENERAL', fuentes(), {
      saldo_favor_anterior: 1200,
      coeficiente_renta: 0.015,
    });
    expect(result.igv_resultante).toBe(0);
    expect(result.saldo_favor_siguiente).toBe(300);
  });

  it('aplica 1% al RMT mientras el acumulado no supere 300 UIT', () => {
    const result = calcularTributoMensualPeru('MYPE', fuentes({ ingresos_netos_acumulados: 1_650_000 }), {
      coeficiente_renta: 0.03,
    });
    expect(result.pago_cuenta_renta).toBe(100);
  });

  it('aplica el mayor entre coeficiente y 1.5% al RMT sobre 300 UIT', () => {
    const result = calcularTributoMensualPeru('MYPE', fuentes({ ingresos_netos_acumulados: 1_650_001 }), {
      coeficiente_renta: 0.02,
    });
    expect(result.pago_cuenta_renta).toBe(200);
  });

  it('usa el ejercicio para el límite RMT: el mismo acumulado supera 2025 y no 2026', () => {
    const acumulado = fuentes({ ingresos_netos_acumulados: 1_620_000 });
    const anterior = calcularTributoMensualPeru('MYPE', acumulado, {}, 2025);
    const vigente = calcularTributoMensualPeru('MYPE', acumulado, {}, 2026);
    expect(anterior).toMatchObject({ uit: 5350, limite_rmt_300_uit: 1_605_000, pago_cuenta_renta: 150 });
    expect(vigente).toMatchObject({ uit: 5500, limite_rmt_300_uit: 1_650_000, pago_cuenta_renta: 100 });
  });

  it('permite rectificar 2024 con su UIT y rechaza ejercicios sin parámetro verificado', () => {
    expect(calcularTributoMensualPeru('MYPE', fuentes(), {}, 2024)).toMatchObject({
      uit: 5150, limite_rmt_300_uit: 1_545_000,
    });
    expect(() => calcularTributoMensualPeru('MYPE', fuentes(), {}, 2027)).toThrow(BadRequestException);
  });

  it('calcula 1.5% de renta en RER', () => {
    const result = calcularTributoMensualPeru('RER', fuentes());
    expect(result.pago_cuenta_renta).toBe(150);
  });

  it.each([
    [5000, 1, 20],
    [5000.01, 2, 50],
    [8000, 2, 50],
  ])('clasifica NRUS con referencia %s', (referencia, categoria, cuota) => {
    const result = calcularTributoMensualPeru('NRUS', fuentes({
      ventas_gravadas: referencia,
      igv_ventas: 0,
      compras_totales_mes: referencia,
    }));
    expect(result.nrus_categoria).toBe(categoria);
    expect(result.nrus_cuota).toBe(cuota);
    expect(result.igv_resultante).toBe(0);
  });

  it('bloquea la constancia NRUS cuando se exceden S/ 8,000', () => {
    const result = calcularTributoMensualPeru('NRUS', fuentes({
      ventas_gravadas: 8000.01,
      compras_totales_mes: 100,
      igv_ventas: 0,
    }));
    expect(result.nrus_categoria).toBeNull();
    expect(result.warnings).toContainEqual(expect.objectContaining({
      codigo: 'NRUS_LIMITE_EXCEDIDO',
      bloquea_presentacion: true,
    }));
  });

  it('rechaza coeficientes fuera del rango decimal 0..1', () => {
    expect(() => calcularTributoMensualPeru('GENERAL', fuentes(), { coeficiente_renta: 1.5 }))
      .toThrow(BadRequestException);
  });

  it('normaliza el valor legado RUS y rechaza regímenes ajenos', () => {
    expect(normalizarRegimenPeru('RUS')).toBe('NRUS');
    expect(() => normalizarRegimenPeru('MONOTRIBUTO')).toThrow(BadRequestException);
  });
});

describe('consolidarFuentesMensuales', () => {
  it('convierte las compras originales a PEN sin usar el cambio de liquidación ni mutar el documento', () => {
    const documento = { tipo_documento: 'FACTURA', estado: 'PAGADO', moneda: 'USD',
      subtotal: 0, igv: 0, total: 0, tipo_cambio_origen: 3.75,
      original_fiscal_amounts: { subtotal: 10, igv: 1.8, total: 11.8 },
      fiscal_metadata: { tipo_cambio: 3.75 }, metadata: { tipo_cambio_pago: 3.780001 } };
    const result = consolidarFuentesMensuales([], [], [documento,
      { ...documento, tipo_documento: 'NOTA_CREDITO', original_fiscal_amounts: { subtotal: 2, igv: 0.36, total: 2.36 } }]);
    expect(result.fuentes).toMatchObject({ compras_gravadas: 30, igv_compras: 5.4,
      igv_compras_gravadas: 5.4, compras_totales_mes: 35.4, cantidad_compras: 2 });
    expect(documento).toMatchObject({ subtotal: 0, igv: 0, total: 0 });
  });

  it('convierte ventas mensuales, renta acumulada y prorrata con signos y redondeo por documento', () => {
    const ventaUsd = { tipo_documento: 'FACTURA', estado: 'ACEPTADO', documento_id: '00000000-0000-4000-8000-000000000001', moneda: 'USD', documento: { tipo_cambio: 3.75 },
      total_gravadas: 10, total_igv: 1.8, total_exoneradas: 0, total_inafectas: 0, total_exportacion: 0 };
    const nc = { ...ventaUsd, tipo_documento: 'NOTA_CREDITO', total_gravadas: 2, total_igv: 0.36 };
    const result = consolidarFuentesMensuales([ventaUsd, nc], [ventaUsd, nc], [],
      [ventaUsd, nc, { ...ventaUsd, total_gravadas: 0, total_igv: 0, total_exoneradas: 8 }]);
    expect(result.fuentes).toMatchObject({ ventas_gravadas: 30, igv_ventas: 5.4,
      ingresos_netos_acumulados: 30, operaciones_gravadas_12m: 30, operaciones_no_gravadas_12m: 30 });
    expect(consolidarFuentesMensuales([{ ...ventaUsd, total_gravadas: 0.01, documento: { tipo_cambio: 3.5 } }], [], []).fuentes.ventas_gravadas).toBe(0.04);
  });

  it('rechaza fuentes extranjeras sin cotización válida y excluye anuladas antes de convertir', () => {
    const documento = { tipo_documento: 'FACTURA', estado: 'ACEPTADO', moneda: 'USD', total_gravadas: 10 };
    expect(() => consolidarFuentesMensuales([documento], [], [])).toThrow(BadRequestException);
    expect(() => consolidarFuentesMensuales([], [], [{ ...documento, tipo_cambio_origen: 0 }])).toThrow(BadRequestException);
    expect(consolidarFuentesMensuales([{ ...documento, estado: 'ANULADO' }], [], []).fuentes.cantidad_ventas).toBe(0);
  });

  // Medido sobre produccion el 2026-08-24: para el mismo mes el Registro de
  // Ventas daba S/ 1 566,05 de IGV y la declaracion S/ 1 570,55, porque la
  // declaracion no aplicaba las reglas del libro.
  const venta = (over: Record<string, any> = {}) => ({
    documento_id: '00000000-0000-4000-8000-000000000001',
    tipo_documento: 'FACTURA',
    estado: 'ACEPTADO',
    total_gravadas: 1000,
    total_exoneradas: 0,
    total_inafectas: 0,
    total_exportacion: 0,
    total_igv: 180,
    ...over,
  });
  const compra = (over: Record<string, any> = {}) => ({
    tipo_documento: 'FACTURA',
    estado: 'REGISTRADO',
    subtotal: 500,
    igv: 90,
    total: 590,
    ...over,
  });

  it('la nota de credito de venta resta en vez de sumar', () => {
    const { fuentes } = consolidarFuentesMensuales(
      [venta(), venta({ tipo_documento: 'NOTA_CREDITO', total_gravadas: 200, total_igv: 36 })],
      [],
      [],
    );

    expect(fuentes.igv_ventas).toBe(144);
    expect(fuentes.ventas_gravadas).toBe(800);
  });

  it('la nota de credito de compra reduce el credito fiscal', () => {
    // Es la direccion peligrosa: sumarla rebaja el IGV a pagar.
    const { fuentes } = consolidarFuentesMensuales(
      [],
      [],
      [compra(), compra({ tipo_documento: 'NOTA_CREDITO', subtotal: 100, igv: 18, total: 118 })],
    );

    expect(fuentes.igv_compras).toBe(72);
    expect(fuentes.compras_gravadas).toBe(400);
  });

  it('deja fuera el ticket interno de POS, que no es comprobante fiscal', () => {
    const { fuentes } = consolidarFuentesMensuales(
      [venta(), venta({ tipo_documento: 'TICKET', total_igv: 50, total_gravadas: 278 })],
      [],
      [],
    );

    expect(fuentes.igv_ventas).toBe(180);
    expect(fuentes.cantidad_ventas).toBe(1);
  });

  it('deja fuera los documentos anulados', () => {
    const { fuentes } = consolidarFuentesMensuales(
      [venta(), venta({ estado: 'ANULADO', total_igv: 999 })],
      [],
      [],
    );

    expect(fuentes.igv_ventas).toBe(180);
  });

  it('entiende el codigo 01 igual que el nombre FACTURA', () => {
    // En produccion `cpe.tipo_documento` guarda las dos formas a la vez.
    const { fuentes } = consolidarFuentesMensuales(
      [venta({ tipo_documento: '01' }), venta({ tipo_documento: 'FACTURA' })],
      [],
      [],
    );

    expect(fuentes.cantidad_ventas).toBe(2);
    expect(fuentes.igv_ventas).toBe(360);
  });

  it('el acumulado del anio usa las mismas reglas', () => {
    const { fuentes } = consolidarFuentesMensuales(
      [],
      [
        venta({ total_gravadas: 1000 }),
        venta({ tipo_documento: 'TICKET', total_gravadas: 500 }),
        venta({ tipo_documento: 'NOTA_CREDITO', total_gravadas: 200 }),
      ],
      [],
    );

    expect(fuentes.ingresos_netos_acumulados).toBe(800);
  });
});

describe('arrastre del saldo a favor del IGV', () => {
  // El saldo con el que arranca el mes es el que dejo el mes anterior. Vivia
  // solo como campo del cuerpo de la peticion: habia que reteclearlo, y un
  // numero mal copiado ahi produce un IGV a pagar plausible y falso.
  const construir = (saldoPrevio: number | null, vigente?: Record<string, unknown>, rentaPrevia?: Record<string, unknown>) => {
    const declaracionesPorPeriodo: Record<string, any> = {};
    if (vigente) declaracionesPorPeriodo['2026-08'] = vigente;
    if (saldoPrevio !== null) {
      declaracionesPorPeriodo['2026-07'] = { saldo_favor_siguiente: saldoPrevio, source_snapshot: { ajustes_renta: rentaPrevia } };
      declaracionesPorPeriodo['2025-12'] = declaracionesPorPeriodo['2026-07'];
    }

    const cadena = (tabla: string) => {
      const filtros: Record<string, any> = {};
      const chain: any = {
        select: jest.fn(() => chain),
        eq: jest.fn((campo: string, valor: any) => {
          filtros[campo] = valor;
          return chain;
        }),
        gte: jest.fn(() => chain),
        lt: jest.fn(() => chain),
        not: jest.fn(() => chain),
        order: jest.fn(() => chain),
        range: jest.fn(() => chain),
        maybeSingle: jest.fn(async () => {
          if (tabla === 'empresa_config') {
            return { data: { pais: 'PE', regimen_tributario: 'GENERAL' }, error: null };
          }
          return { data: declaracionesPorPeriodo[filtros.periodo] ?? null, error: null };
        }),
      };
      chain.then = (resolve: any) => resolve({ data: [], error: null });
      return chain;
    };

    const supabase: any = {
      getClient: jest.fn(() => ({ from: jest.fn((tabla: string) => cadena(tabla)) })),
    };
    return new TributosMensualesService(supabase);
  };

  it('toma el saldo a favor que dejo el mes anterior', async () => {
    const service = construir(450);

    const resultado: any = await service.calcular('tenant-1', '2026-08');

    expect(resultado.saldo_favor_anterior).toBe(450);
    expect(resultado.source_snapshot.saldo_favor_arrastrado).toBe(450);
    expect(resultado.source_snapshot.saldo_favor_origen).toBe('periodo_anterior');
  });

  it('respeta el valor declarado a mano, que tras una rectificacion puede diferir', async () => {
    const service = construir(450);

    const resultado: any = await service.calcular('tenant-1', '2026-08', {
      saldo_favor_anterior: 100,
    });

    expect(resultado.saldo_favor_anterior).toBe(100);
    expect(resultado.source_snapshot.saldo_favor_origen).toBe('declarado');
  });

  it('arranca en cero cuando no hay declaracion previa', async () => {
    const service = construir(null);

    const resultado: any = await service.calcular('tenant-1', '2026-08');

    expect(resultado.saldo_favor_anterior).toBe(0);
  });

  it('restaura coeficiente y créditos de la versión vigente al recargar', async () => {
    const resultado = await construir(450, {
      saldo_favor_anterior: 80, retenciones_igv: 25, percepciones_igv: 12,
      otros_creditos_igv: 5, coeficiente_renta: 0.02,
    }).calcular('tenant-1', '2026-08');
    expect(resultado).toMatchObject({
      saldo_favor_anterior: 80, retenciones_igv: 25, percepciones_igv: 12,
      otros_creditos_igv: 5, coeficiente_renta: 0.02,
    });
    expect(resultado.source_snapshot.saldo_favor_origen).toBe('declaracion_vigente');
  });

  it('permite retirar ajustes guardados con cero y coeficiente null explícitos', async () => {
    const resultado = await construir(450, {
      saldo_favor_anterior: 80, retenciones_igv: 25, coeficiente_renta: 0.02,
    }).calcular('tenant-1', '2026-08', {
      saldo_favor_anterior: 0, retenciones_igv: 0, coeficiente_renta: null,
    });
    expect(resultado).toMatchObject({ saldo_favor_anterior: 0, retenciones_igv: 0, coeficiente_renta: null });
    expect(resultado.source_snapshot.saldo_favor_origen).toBe('declarado');
  });

  it('una nota firmada sin documento no rectifica mensual, anual ni prorrata; las notas emitidas sí mantienen su signo', () => {
    const factura = { tipo_documento: '01', estado: 'FIRMADO', documento_id: '00000000-0000-4000-8000-000000000001', total_gravadas: 1000, total_igv: 180 };
    const sinDocumento = [
      { ...factura, tipo_documento: '07', documento_id: null, total_gravadas: 200, total_igv: 36 },
      { ...factura, tipo_documento: 'NOTA_DEBITO', documento_id: null, total_gravadas: 50, total_igv: 9 },
    ];
    const rows = [factura, ...sinDocumento,
      { ...factura, tipo_documento: '07', total_gravadas: 100, total_igv: 18 },
      { ...factura, tipo_documento: '08', total_gravadas: 20, total_igv: 3.6 },
    ];
    const result = consolidarFuentesMensuales(rows, rows,
      [{ tipo_documento: 'FACTURA', estado: 'BORRADOR', subtotal: 500, igv: 90, total: 590 }], rows);
    expect(result.fuentes).toMatchObject({ ventas_gravadas: 920, igv_ventas: 165.6,
      ingresos_netos_acumulados: 920, operaciones_gravadas_12m: 920, cantidad_ventas: 3, cantidad_compras: 1 });
    expect(result.ventasMes).toHaveLength(3);
    expect(sinDocumento.map(row => row.documento_id)).toEqual([null, null]);
  });

  it('una solicitud de nota en borrador no reduce ventas mensuales, anuales ni prorrata', () => {
    const emitida = { tipo_documento: '01', estado: 'FIRMADO', total_gravadas: 1000, total_igv: 180 };
    const rows = [emitida, { ...emitida, tipo_documento: '07', estado: ' borrador ' }, { ...emitida, estado: 'BORRADOR' }];
    const { fuentes, ventasMes, comprasMes } = consolidarFuentesMensuales(rows, rows,
      [{ tipo_documento: 'FACTURA', estado: 'BORRADOR', subtotal: 500, igv: 90, total: 590 }], rows);
    expect(ventasMes).toHaveLength(1);
    expect(comprasMes).toHaveLength(1);
    expect(fuentes).toMatchObject({ ventas_gravadas: 1000, igv_ventas: 180,
      ingresos_netos_acumulados: 1000, operaciones_gravadas_12m: 1000,
      cantidad_ventas: 1, compras_gravadas: 500, igv_compras: 90 });
  });

  it('incluye los ingresos revisados fuera de CPE en renta sin alterar ventas ni IGV', () => {
    const result = calcularTributoMensualPeru('GENERAL', fuentes({
      ventas_gravadas: 220.17, ventas_exoneradas: 0.39, igv_ventas: 39.63,
      igv_compras: 51.12, igv_compras_gravadas: 51.12, ingresos_netos_acumulados: 220.56,
    }), {
      coeficiente_renta: 0.02, otros_ingresos_renta_mes: 100,
      otros_ingresos_renta_acumulados: 100, sustento_renta: 'NC FC57-2; asiento 11, cuenta 75: descuento financiero revisado.',
    });
    expect(result).toMatchObject({ ingresos_netos_mes: 320.56, ingresos_netos_acumulados: 320.56,
      pago_cuenta_renta: 6.41, ventas_gravadas: 220.17, ventas_exoneradas: 0.39,
      igv_ventas: 39.63, igv_compras: 51.12, saldo_favor_siguiente: 11.49 });
  });

  it('rechaza otros ingresos sin sustento o con acumulado inferior al mes', () => {
    expect(() => calcularTributoMensualPeru('GENERAL', fuentes(), {
      otros_ingresos_renta_mes: 100, otros_ingresos_renta_acumulados: 100, sustento_renta: '   ',
    })).toThrow(BadRequestException);
    expect(() => calcularTributoMensualPeru('GENERAL', fuentes(), {
      otros_ingresos_renta_mes: 100, otros_ingresos_renta_acumulados: 99, sustento_renta: 'Revisión tributaria',
    })).toThrow(BadRequestException);
  });

  it('restaura ingresos fuera de CPE con su sustento del snapshot vigente', async () => {
    const ajustes_renta = { otros_ingresos_renta_mes: 100, otros_ingresos_renta_acumulados: 100,
      sustento_renta: 'NC proveedor FC57-2; asiento11 Cr75 revisado' };
    const resultado = await construir(0, { coeficiente_renta: 0.02, source_snapshot: { ajustes_renta } })
      .calcular('tenant-1', '2026-08');
    expect(resultado).toMatchObject({ ingresos_netos_mes: 100, ingresos_netos_acumulados: 100, pago_cuenta_renta: 2 });
    expect(resultado.source_snapshot.ajustes_renta).toMatchObject(ajustes_renta);
  });

  it('arrastra el acumulado dentro del año y lo reinicia en enero sin perder saldo IGV', async () => {
    const service = construir(11.49, undefined, { otros_ingresos_renta_mes: 100,
      otros_ingresos_renta_acumulados: 100, sustento_renta: 'FC57-2 revisión julio' });
    const agosto = await service.calcular('tenant-1', '2026-08');
    expect(agosto).toMatchObject({ otros_ingresos_renta_mes: 0, otros_ingresos_renta_acumulados: 100, saldo_favor_anterior: 11.49 });
    const enero = await service.calcular('tenant-1', '2026-01');
    expect(enero).toMatchObject({ otros_ingresos_renta_mes: 0, otros_ingresos_renta_acumulados: 0, saldo_favor_anterior: 11.49 });
  });

  it('cruza el anio: enero toma el saldo de diciembre', async () => {
    const service = construir(0);
    const supabaseSpy = (service as any).supabase.getClient;

    await service.calcular('tenant-1', '2026-01');

    const periodosConsultados = supabaseSpy.mock.results
      .flatMap((r: any) => (r.value.from as jest.Mock).mock.results)
      .flatMap((r: any) => (r.value.eq as jest.Mock).mock.calls)
      .filter(([campo]: [string]) => campo === 'periodo')
      .map(([, valor]: [string, string]) => valor);

    expect(periodosConsultados).toContain('2025-12');
  });
});

describe('prorrata del credito fiscal', () => {
  // Articulo 23 de la Ley del IGV. Antes no existia: todo el IGV de compras
  // entraba integro al credito, tuviera el contribuyente operaciones mixtas o no.
  const base = () => fuentes({
    igv_ventas: 1800,
    igv_compras: 900,
    igv_compras_gravadas: 500,
    igv_compras_comunes: 400,
    igv_compras_no_gravadas: 0,
    operaciones_gravadas_12m: 75000,
    operaciones_no_gravadas_12m: 25000,
  });

  it('aplica el coeficiente de doce meses solo a las compras comunes', () => {
    const result: any = calcularTributoMensualPeru('GENERAL', base(), {});

    // 75 000 / 100 000 = 75 %
    expect(result.coeficiente_prorrata).toBe(75);
    // 500 integro + 400 x 75 % = 800
    expect(result.igv_credito_fiscal).toBe(800);
    expect(result.igv_resultante).toBe(1000);
  });

  it('sin operaciones no gravadas el credito entra integro', () => {
    // Es el comportamiento anterior a la prorrata: quien no tiene operaciones
    // mixtas no debe notar ningun cambio.
    const result: any = calcularTributoMensualPeru('GENERAL', fuentes({
      igv_compras: 900,
      igv_compras_gravadas: 500,
      igv_compras_comunes: 400,
      operaciones_gravadas_12m: 100000,
      operaciones_no_gravadas_12m: 0,
    }), {});

    expect(result.coeficiente_prorrata).toBe(100);
    expect(result.igv_credito_fiscal).toBe(900);
  });

  it('el IGV de compras destinadas a no gravadas no da credito', () => {
    const result: any = calcularTributoMensualPeru('GENERAL', fuentes({
      igv_compras: 900,
      igv_compras_gravadas: 500,
      igv_compras_comunes: 0,
      igv_compras_no_gravadas: 400,
      operaciones_gravadas_12m: 75000,
      operaciones_no_gravadas_12m: 25000,
    }), {});

    expect(result.igv_credito_fiscal).toBe(500);
  });

  it('avisa cuando hay no gravadas y ninguna compra clasificada', () => {
    const result: any = calcularTributoMensualPeru('GENERAL', fuentes({
      igv_compras: 900,
      igv_compras_gravadas: 900,
      igv_compras_comunes: 0,
      igv_compras_no_gravadas: 0,
      operaciones_gravadas_12m: 75000,
      operaciones_no_gravadas_12m: 25000,
    }), {});

    expect(result.warnings.map((w: any) => w.codigo)).toContain('PRORRATA_SIN_CLASIFICAR');
  });
});

describe('consolidarFuentesMensuales reparte el IGV de compras por destino', () => {
  const compra = (destino: string, igv: number) => ({
    tipo_documento: 'FACTURA',
    estado: 'REGISTRADO',
    subtotal: igv / 0.18,
    igv,
    total: igv / 0.18 + igv,
    destino_credito_fiscal: destino,
  });

  it('separa gravadas, comunes y no gravadas', () => {
    const { fuentes: f } = consolidarFuentesMensuales(
      [], [],
      [compra('GRAVADAS', 100), compra('COMUN', 50), compra('NO_GRAVADAS', 30)],
      [],
    );

    expect(f.igv_compras_gravadas).toBe(100);
    expect(f.igv_compras_comunes).toBe(50);
    expect(f.igv_compras_no_gravadas).toBe(30);
    expect(f.igv_compras).toBe(180);
  });

  it('una compra sin clasificar cuenta como destinada a gravadas', () => {
    const sinDestino: any = compra('GRAVADAS', 100);
    delete sinDestino.destino_credito_fiscal;

    const { fuentes: f } = consolidarFuentesMensuales([], [], [sinDestino], []);

    expect(f.igv_compras_gravadas).toBe(100);
  });
});
