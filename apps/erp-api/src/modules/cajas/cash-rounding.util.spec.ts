import {
  esRedondeoLegalEfectivoPeru,
  requiereSupervisorParaDiferenciaCaja,
} from './cash-rounding.util';

describe('redondeo legal de efectivo Perú', () => {
  it.each([-0.01, -0.04, -0.13])(
    'clasifica %s PEN sólo cuando coincide con el acumulado documentado',
    (diferencia) => {
      const documentado = Math.abs(diferencia);
      expect(esRedondeoLegalEfectivoPeru(diferencia, 'PE', 'PEN', documentado)).toBe(true);
      expect(
        requiereSupervisorParaDiferenciaCaja(diferencia, 0, 'PE', 'PEN', documentado),
      ).toBe(false);
    },
  );

  it('no convierte una diferencia casual de S/ 0.04 en redondeo', () => {
    expect(esRedondeoLegalEfectivoPeru(-0.04, 'PE', 'PEN', 0)).toBe(false);
    expect(requiereSupervisorParaDiferenciaCaja(-0.04, 0, 'PE', 'PEN', 0)).toBe(true);
    expect(requiereSupervisorParaDiferenciaCaja(-0.04, 0, 'PE', 'PEN', 0.03)).toBe(true);
  });

  it.each([
    { diferencia: 0.01, pais: 'PE', moneda: 'PEN', documentado: 0.01 },
    { diferencia: -0.1, pais: 'PE', moneda: 'PEN', documentado: 0.09 },
    { diferencia: -0.04, pais: 'AR', moneda: 'ARS', documentado: 0.04 },
    { diferencia: -0.04, pais: 'CO', moneda: 'COP', documentado: 0.04 },
    { diferencia: -0.04, pais: 'PE', moneda: 'USD', documentado: 0.04 },
  ])('no amplía la excepción a $diferencia/$pais/$moneda', (caso) => {
    expect(
      requiereSupervisorParaDiferenciaCaja(
        caso.diferencia,
        0,
        caso.pais,
        caso.moneda,
        caso.documentado,
      ),
    ).toBe(true);
  });

  it('conserva la tolerancia configurada para ambos signos', () => {
    expect(requiereSupervisorParaDiferenciaCaja(2, 2, 'AR', 'ARS')).toBe(false);
    expect(requiereSupervisorParaDiferenciaCaja(-2, 2, 'CO', 'COP')).toBe(false);
    expect(requiereSupervisorParaDiferenciaCaja(2.01, 2, 'PE', 'PEN')).toBe(true);
  });

  it('no clasifica Decimal -0 como una diferencia legal', () => {
    expect(esRedondeoLegalEfectivoPeru('-0', 'PE', 'PEN', 0.04)).toBe(false);
    expect(esRedondeoLegalEfectivoPeru('-0.00', 'PER', 'PEN', 0.04)).toBe(false);
  });
});
