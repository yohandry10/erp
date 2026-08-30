import {
  resolveArgentinaExplicitWsfeCode,
  resolveArgentinaFiscalDocument,
} from './argentina-fiscal-document.util';

describe('resolveArgentinaFiscalDocument', () => {
  it.each([
    ['01', 'RESPONSABLE_INSCRIPTO', 'RESPONSABLE_INSCRIPTO', 1, 1],
    ['03', 'RESPONSABLE_INSCRIPTO', 'CONSUMIDOR_FINAL', 6, 5],
    ['07', 'RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 3, 6],
    ['08', 'RESPONSABLE_INSCRIPTO', 'EXENTO', 7, 4],
    ['01', 'MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO', 11, 1],
    ['07', 'EXENTO', 'CONSUMIDOR_FINAL', 13, 5],
  ])(
    'resuelve %s de emisor %s y receptor %s como WSFE %s',
    (documentType, issuerVatCondition, receiverVatCondition, wsfeCode, receiverVatConditionId) => {
      expect(resolveArgentinaFiscalDocument({
        documentType, issuerVatCondition, receiverVatCondition,
      })).toMatchObject({ wsfeCode, receiverVatConditionId });
    },
  );

  it('falla cerrado si un legacy no trae ambas condiciones IVA', () => {
    expect(() => resolveArgentinaFiscalDocument({
      documentType: '01', issuerVatCondition: 'RESPONSABLE_INSCRIPTO', receiverVatCondition: null,
    })).toThrow('condición IVA válida del receptor');
  });

  it('rechaza un código explícito cuya clase contradice las condiciones IVA', () => {
    expect(() => resolveArgentinaFiscalDocument({
      documentType: '001', issuerVatCondition: 'RESPONSABLE_INSCRIPTO', receiverVatCondition: 'CONSUMIDOR_FINAL',
    })).toThrow('exige clase B');
  });

  it.each(['019', '020', '021'])('bloquea %s porque requiere WSFEXv1', (documentType) => {
    expect(() => resolveArgentinaFiscalDocument({
      documentType,
      issuerVatCondition: 'RESPONSABLE_INSCRIPTO',
      receiverVatCondition: 'CLIENTE_EXTERIOR',
    })).toThrow('WSFEXv1');
    expect(() => resolveArgentinaExplicitWsfeCode(documentType)).toThrow('WSFEXv1');
  });

  it.each([
    ['051', 51], ['052', 52], ['053', 53],
  ])('reconoce %s pero bloquea su emisión sin habilitación autoritativa', (documentType, wsfeCode) => {
    expect(() => resolveArgentinaFiscalDocument({
      documentType,
      issuerVatCondition: 'RESPONSABLE_INSCRIPTO',
      receiverVatCondition: 'RESPONSABLE_INSCRIPTO',
    })).toThrow('habilitación A-retención');
    expect(() => resolveArgentinaFiscalDocument({
      documentType,
      issuerVatCondition: 'RESPONSABLE_INSCRIPTO',
      receiverVatCondition: 'RESPONSABLE_INSCRIPTO',
      authorizationVariant: 'A_RETENCION',
    })).toThrow('no habilitada');
    expect(resolveArgentinaExplicitWsfeCode(documentType)).toBe(wsfeCode);
  });

  it('no infiere modalidad A-retención sólo por condición IVA', () => {
    expect(resolveArgentinaFiscalDocument({
      documentType: '01',
      issuerVatCondition: 'RESPONSABLE_INSCRIPTO',
      receiverVatCondition: 'RESPONSABLE_INSCRIPTO',
    })).toMatchObject({ documentClass: 'A', authorizationVariant: 'NORMAL' });
  });
});
