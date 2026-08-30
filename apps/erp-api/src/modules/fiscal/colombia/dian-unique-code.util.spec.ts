import {
  formatDianAmount,
  generarApplicationResponseCude,
  generarCude,
  generarCufe,
  generarDianQrPayload,
  generarDianQrUrl,
  generarSoftwareSecurityCode,
} from './dian-unique-code.util';

describe('DIAN unique codes - Anexo FEV 1.9', () => {
  it('reproduce el vector oficial CUFE de factura de venta', () => {
    expect(generarCufe({
      numeroDocumento: '323200000129',
      fechaEmision: '2019-01-16',
      horaEmision: '10:53:10-05:00',
      valorSinImpuestos: '1500000.00',
      iva: '285000.00',
      inc: '0.00',
      ica: '0.00',
      total: '1785000.00',
      nitEmisor: '700085371',
      numeroAdquirente: '800199436',
      claveTecnica: '693ff6f2a553c3646a063436fd4dd9ded0311471',
      ambiente: '1',
    })).toBe(
      '8bb918b19ba22a694f1da11c643b5e9de39adf60311cf179179e9b33381030bcd4c3c3f156c506ed5908f9276f5bd9b4',
    );
  });

  it('reproduce el vector oficial CUDE de nota crédito', () => {
    expect(generarCude({
      numeroDocumento: '8110007871',
      fechaEmision: '2019-01-12',
      horaEmision: '07:00:00-05:00',
      valorSinImpuestos: '5000.00',
      iva: '950.00',
      inc: '0.00',
      ica: '0.00',
      total: '5950.00',
      nitEmisor: '900373076',
      numeroAdquirente: '8355990',
      softwarePin: '12301',
      ambiente: '1',
    })).toBe(
      '907e4444decc9e59c160a2fb3b6659b33dc5b632a5008922b9a62f83f757b1c448e47f5867f2b50dbdb96f48c7681168',
    );
  });

  it('aplica literalmente la composición oficial CUDE de nota débito', () => {
    expect(generarCude({
      numeroDocumento: 'ND1001',
      fechaEmision: '2019-01-18',
      horaEmision: '10:58:00-05:00',
      valorSinImpuestos: '30000.00',
      iva: '0.00',
      inc: '2400.00',
      ica: '0.00',
      total: '32400.00',
      nitEmisor: '900197264',
      numeroAdquirente: '10254102',
      softwarePin: '10201',
      ambiente: '2',
    // El digest b948... impreso junto a este ejemplo en el PDF 1.9 no
    // corresponde a la semilla que el propio anexo publica. Este valor es el
    // SHA-384 reproducible de esa semilla; no se deforma la regla para imitar
    // una errata editorial del ejemplo.
    })).toBe(
      '3fa73a86d57d9341c536afde1f85c4efd9d4591c2c22bce4dfb0e6b0d2e83b8f047a8bde7098292e9d2493e60d1c31da',
    );
  });

  it('reproduce el vector oficial CUDE de ApplicationResponse', () => {
    expect(generarApplicationResponseCude({
      numeroDocumento: '1',
      fechaEmision: '2019-04-30',
      horaEmision: '19:48:50-05:00',
      documentoEmisor: '99998888',
      documentoReceptor: '800197268',
      codigoRespuesta: '030',
      documentoReferenciado: 'FE123',
      tipoDocumentoReferenciado: '01',
      softwarePin: '11111',
    })).toBe(
      '0d91ba25b01f5e7dbda870a11b274501d3a62a73e91932c473c86c93f12a142a2ac45876efcde3e679024a01c0be41f9',
    );
  });

  it('trunca importes y no los redondea', () => {
    expect(formatDianAmount('12.999')).toBe('12.99');
    expect(formatDianAmount('0')).toBe('0.00');
    expect(() => formatDianAmount('-0.01')).toThrow('DIAN_AMOUNT_INVALID');
  });

  it('genera la huella del software con el orden reservado oficial', () => {
    expect(generarSoftwareSecurityCode('abc', '12345', 'SETP990000001')).toBe(
      'ef061d791ea17f22a34df2d5d18726509bcbe69139a7527a7e3d94c5d534899d5ff886f5a360c0fe87a71d600b67e3eb',
    );
  });

  it('separa las URLs QR de habilitación y producción y conserva el payload fiscal', () => {
    const cufe = '8bb918b19ba22a694f1da11c643b5e9de39adf60311cf179179e9b33381030bcd4c3c3f156c506ed5908f9276f5bd9b4';
    expect(generarDianQrUrl(cufe, '1')).toBe(
      `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`,
    );
    expect(generarDianQrUrl(cufe, '2')).toBe(
      `https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=${cufe}`,
    );
    const payload = generarDianQrPayload({
      numeroDocumento: '323200000129', fechaEmision: '2019-01-16',
      horaEmision: '10:53:10-05:00', valorSinImpuestos: '1500000',
      iva: '285000', inc: 0, ica: 0, total: '1785000', nitEmisor: '700085371',
      numeroAdquirente: '800199436', ambiente: '1', codigoUnico: cufe,
    });
    expect(payload).toContain('ValOtroIm: 0.00');
    expect(payload).toContain(`CUFE/CUDE: ${cufe}`);
    expect(payload).toContain(`QRCode: https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`);
  });

  it('rechaza hora sin GMT, CUFE de longitud incorrecta y secretos vacíos', () => {
    expect(() => generarCufe({
      numeroDocumento: 'F1', fechaEmision: '2026-08-29', horaEmision: '12:00:00',
      valorSinImpuestos: 1, total: 1, nitEmisor: '900123456', numeroAdquirente: '222222222222',
      claveTecnica: 'x', ambiente: '2',
    })).toThrow('DIAN_HORA_EMISION_REQUIERE_GMT');
    expect(() => generarDianQrUrl('abc', '1')).toThrow('DIAN_CUFE_CUDE_INVALID');
    expect(() => generarSoftwareSecurityCode('', '123', 'F1')).toThrow('DIAN_SOFTWARE_ID_REQUIRED');
  });
});
