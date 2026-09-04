import { resolveArcaPrintedFiscalInfo } from './arca-print.util';

describe('resolveArcaPrintedFiscalInfo', () => {
  const accepted = {
    tipo_documento: '01', serie: '00012', numero: 25, hash: '12345678901234',
    metadata: {
      fiscal_country: 'AR',
      arca_cae: '12345678901234', arca_cae_vencimiento: '20260910',
      arca_punto_venta: 12, arca_cbte_tipo: 1, arca_cbte_numero: 25,
      tipoCodAut: 'E',
    },
  };

  it('usa identidad y CAE autorizados, no aliases PE', () => {
    expect(resolveArcaPrintedFiscalInfo(accepted, {}, false)).toEqual({
      documentType: '001', isDemo: false, authorizationCode: '12345678901234', authorizationLabel: 'CAE',
      authorizationExpiry: '20260910', pointOfSale: 12, documentNumber: 25, specialLegend: null,
    });
  });

  it('una demo nunca presenta el hash técnico ni aliases como CAE', () => {
    expect(resolveArcaPrintedFiscalInfo({
      ...accepted,
      hash: 'a'.repeat(64),
      metadata: {
        ...accepted.metadata,
        arca_cae: '70417054367476',
        arca_cae_vencimiento: '20260910',
      },
    }, {}, true)).toMatchObject({
      isDemo: true,
      authorizationCode: 'MUESTRA-SIN-CAE',
      authorizationExpiry: 'No aplica en muestra',
    });
  });

  it('representa 051 como A sujeta a retención, no como M', () => {
    expect(resolveArcaPrintedFiscalInfo({
      ...accepted, metadata: { ...accepted.metadata, arca_cbte_tipo: 51 },
    }, {}, false)).toMatchObject({
      documentType: '051', specialLegend: 'OPERACIÓN SUJETA A RETENCIÓN',
    });
  });

  it.each([
    [{ ...accepted, hash: '123', metadata: { ...accepted.metadata, arca_cae: '123' } }, 'CAE'],
    [{ ...accepted, metadata: { ...accepted.metadata, tipoCodAut: 'A' } }, 'CAEA'],
    [{ ...accepted, serie: '00013' }, 'punto autorizado'],
    [{ ...accepted, metadata: { ...accepted.metadata, fiscal_country: 'PE' } }, 'evidencia fiscal 524'],
    [{ ...accepted, hash: '99999999999999' }, 'hash autorizado'],
    [{ ...accepted, metadata: { ...accepted.metadata, arca_cbte_tipo: null } }, 'tipo de comprobante'],
    [{ ...accepted, metadata: { ...accepted.metadata, arca_punto_venta: null } }, 'punto o número autorizado'],
    [{ ...accepted, metadata: { ...accepted.metadata, arca_cbte_numero: null } }, 'punto o número autorizado'],
  ])('falla cerrado cuando la evidencia es inconsistente', (cpe, message) => {
    expect(() => resolveArcaPrintedFiscalInfo(cpe, {}, false)).toThrow(message);
  });
});
