import { BadRequestException } from '@nestjs/common';
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
  // Medido sobre produccion el 2026-08-24: para el mismo mes el Registro de
  // Ventas daba S/ 1 566,05 de IGV y la declaracion S/ 1 570,55, porque la
  // declaracion no aplicaba las reglas del libro.
  const venta = (over: Record<string, any> = {}) => ({
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
