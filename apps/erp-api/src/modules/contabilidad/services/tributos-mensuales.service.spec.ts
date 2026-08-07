import { BadRequestException } from '@nestjs/common';
import {
  calcularTributoMensualPeru,
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
