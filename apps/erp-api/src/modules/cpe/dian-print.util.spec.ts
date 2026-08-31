import { resolveDianPrintedFiscalInfo } from './dian-print.util';

describe('resolveDianPrintedFiscalInfo', () => {
  const config = {
    dian_resolucion_numero: '18760000001',
    dian_resolucion_prefijo: 'FE',
    dian_resolucion_desde: 1,
    dian_resolucion_hasta: 50000,
    dian_resolucion_fecha_inicio: '2026-01-01',
    dian_resolucion_fecha_fin: '2027-12-31',
    dian_software_id: 'SOFTWARE-DIAN-01',
    dian_tipo_contribuyente: 'Persona jurídica',
    dian_regimen_fiscal: 'Responsable de IVA',
  };
  const evidence = {
    simulated_origin: false,
    fiscal_authority_evidence: {
      status: 'ACCEPTED', authority: 'DIAN', country_code: 'CO',
      authorization: {
        number: '18760000001', prefix: 'FE', range_from: 1, range_to: 50000,
        valid_from: '2026-01-01', valid_to: '2027-12-31', software_id: 'SOFTWARE-DIAN-01',
      },
      issuer_tax_profile: {
        contributor_type: 'Persona jurídica', fiscal_regime: 'Responsable de IVA',
      },
    },
  };

  it('congela autorización, generación y pago de una factura real', () => {
    expect(resolveDianPrintedFiscalInfo({
      ...evidence,
      serie: 'FE', numero: 25, fecha_emision: '2026-08-29T14:35:12-05:00',
      condicion_pago: 'CREDITO', plazo_pago_dias: 30, medio_pago: 'TRANSFERENCIA',
      metadata: { gran_contribuyente: true },
    }, config)).toEqual(expect.objectContaining({
      authorizationNumber: '18760000001',
      consecutive: 'FE25',
      generatedAt: '2026-08-29T14:35:12-05:00',
      paymentForm: 'CREDITO',
      paymentTerm: '30 días',
      paymentMethod: 'TRANSFERENCIA',
      taxQualities: expect.arrayContaining(['Persona jurídica', 'Responsable de IVA', 'Gran contribuyente']),
    }));
  });

  it('imprime el consecutivo exacto cuando la resolución no asigna prefijo', () => {
    const withoutPrefix = {
      ...evidence,
      fiscal_authority_evidence: {
        ...evidence.fiscal_authority_evidence,
        authorization: {
          ...evidence.fiscal_authority_evidence.authorization,
          prefix: '',
        },
      },
    };
    expect(resolveDianPrintedFiscalInfo({
      ...withoutPrefix,
      serie: '', numero: 25, fecha_emision: '2026-08-29T14:35:12-05:00',
      condicion_pago: 'CONTADO', medio_pago: '10',
    }, { ...config, dian_resolucion_prefijo: '' })).toEqual(expect.objectContaining({
      authorizationPrefix: '',
      consecutive: '25',
    }));
  });

  it('presenta en Bogotá un instante UTC que cruza de día y valida esa fecha local', () => {
    const evidenceForLocalDay = {
      ...evidence,
      fiscal_authority_evidence: {
        ...evidence.fiscal_authority_evidence,
        authorization: {
          ...evidence.fiscal_authority_evidence.authorization,
          valid_from: '2026-08-29',
          valid_to: '2026-08-29',
        },
      },
    };

    expect(resolveDianPrintedFiscalInfo({
      ...evidenceForLocalDay,
      serie: 'FE', numero: 25, fecha_emision: '2026-08-30T02:30:00.000Z',
      condicion_pago: 'CONTADO', medio_pago: 'EFECTIVO',
    }, config)).toEqual(expect.objectContaining({
      generatedAt: '2026-08-29T21:30:00-05:00',
    }));
  });

  it.each([
    '2026-08-29',
    '2026-08-29T00:00:00.000Z',
  ])('conserva el día civil %s y expresa su hora en Bogotá', (fechaEmision) => {
    expect(resolveDianPrintedFiscalInfo({
      ...evidence,
      serie: 'FE', numero: 25, fecha_emision: fechaEmision,
      hora_emision: '23:45:12',
      condicion_pago: 'CONTADO', medio_pago: 'EFECTIVO',
    }, config)).toEqual(expect.objectContaining({
      generatedAt: '2026-08-29T23:45:12-05:00',
    }));
  });

  it.each([
    [{ ...evidence, fiscal_authority_evidence: {
      ...evidence.fiscal_authority_evidence,
      authorization: { ...evidence.fiscal_authority_evidence.authorization, number: null },
    } }, '2026-08-29T10:00:00-05:00', 'autorización'],
    [evidence, '2026-08-29', 'fecha y hora'],
  ])('falla cerrado en CPE real sin información mínima', (fiscalEvidence, issueDate, expected) => {
    expect(() => resolveDianPrintedFiscalInfo({
      ...fiscalEvidence,
      serie: 'FE', numero: 25, fecha_emision: issueDate,
      condicion_pago: 'CONTADO', medio_pago: 'EFECTIVO',
    }, config)).toThrow(expected);
  });

  it('permite una muestra sólo con marcas inequívocas', () => {
    const sample = resolveDianPrintedFiscalInfo(
      { serie: 'FE', numero: 1, fecha_emision: '2026-08-29' }, {}, true,
    );
    expect(sample.authorizationNumber).toContain('MUESTRA');
    expect(sample.paymentForm).toBe('MUESTRA');
  });
});
