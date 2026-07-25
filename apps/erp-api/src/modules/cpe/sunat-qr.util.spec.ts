import { buildSunatQrContent } from './sunat-qr.util';

describe('sunat-qr.util', () => {
  it('construye el contenido QR SUNAT en el orden oficial', () => {
    const content = buildSunatQrContent({
      ruc_emisor: '20616053575',
      tipo_documento: '03',
      serie: 'B001',
      numero: 123,
      total_igv: 18,
      total_venta: 118,
      fecha_emision: '2026-06-17T12:30:00-05:00',
      tipo_documento_receptor: '1',
      documento_receptor: '12345678',
      hash_firma: 'ABC123HASH',
    });

    expect(content).toBe('20616053575|03|B001|123|18.00|118.00|2026-06-17|1|12345678|ABC123HASH');
  });

  it('usa valor_resumen antes que hashes alternos cuando existe', () => {
    const content = buildSunatQrContent({
      ruc_emisor: '20616053575',
      tipo_documento: '01',
      serie: 'F001',
      numero: '00000042',
      total_igv: '1.8',
      total_venta: '11.8',
      fecha_emision: '2026-06-17',
      tipo_documento_receptor: '6',
      documento_receptor: '20123456789',
      valor_resumen: 'VALOR_RESUMEN',
      hash_firma: 'HASH_FIRMA',
      hash: 'HASH',
    });

    expect(content.endsWith('|VALOR_RESUMEN')).toBe(true);
  });
});
