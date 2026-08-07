import { calcularLiquidacionColombia } from './liquidacion-colombia.util';

describe('liquidación Colombia', () => {
  it('calcula cesantías, intereses, prima y vacaciones proporcionales', () => {
    const result = calcularLiquidacionColombia({
      fechaIngreso: '2026-01-01',
      fechaTerminacion: '2026-06-29',
      sueldoMensual: 1_750_905,
      auxilioTransporteMensual: 249_095,
      motivoTerminacion: 'renuncia',
    });
    expect(result.diasPrestaciones).toBe(180);
    expect(result.cesantias).toBe(1_000_000);
    expect(result.interesesCesantias).toBe(60_000);
    expect(result.primaServicios).toBe(1_000_000);
    expect(result.indemnizacion).toBe(0);
  });

  it('calcula indemnización de contrato indefinido sin justa causa', () => {
    const result = calcularLiquidacionColombia({
      fechaIngreso: '2025-01-01',
      fechaTerminacion: '2026-01-01',
      sueldoMensual: 3_000_000,
      motivoTerminacion: 'despido_sin_justa_causa',
      tipoContrato: 'indefinido',
      salarioMinimo: 1_750_905,
    });
    expect(result.indemnizacion).toBeGreaterThanOrEqual(3_000_000);
  });
});
