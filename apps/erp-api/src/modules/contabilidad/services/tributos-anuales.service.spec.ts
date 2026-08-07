import { BadRequestException } from '@nestjs/common';
import { calcularRentaAnualItanPeru, FuentesTributariasAnuales } from './tributos-anuales.service';

const fuentes = (overrides: Partial<FuentesTributariasAnuales> = {}): FuentesTributariasAnuales => ({
  ingresos_netos: 500000,
  resultado_contable: 100000,
  activos_netos: 1500000,
  pagos_cuenta_renta: 10000,
  ejercicio_cerrado: true,
  ...overrides,
});

describe('calcularRentaAnualItanPeru', () => {
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
