import * as QRCode from 'qrcode';
import { buildSunatQrContent, buildSunatQrDataUrl } from './sunat-qr.util';

jest.mock('qrcode', () => ({
  __esModule: true,
  toDataURL: jest.fn(async () => 'data:image/png;base64,QR'),
}));

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

  it('usa el hash firmado cuando valor_resumen existe pero está vacío', () => {
    const content = buildSunatQrContent({
      ruc_emisor: '20616053575', tipo_documento: '03', serie: 'B001', numero: 9,
      total_igv: 0, total_venta: 20, fecha_emision: '2026-06-17',
      valor_resumen: '   ', hash_firma: 'HASH_FIRMADO',
    });
    expect(content.endsWith('|||HASH_FIRMADO')).toBe(true);
  });

  it('conserva vacío el valor resumen cuando todavía no existe', () => {
    const content = buildSunatQrContent({
      ruc_emisor: '20616053575', tipo_documento: '03', serie: 'B001', numero: 10,
      total_igv: 0, total_venta: 20, fecha_emision: '2026-06-17',
    });
    expect(content).toBe('20616053575|03|B001|10|0.00|20.00|2026-06-17|||');
  });

  it('genera un QR negro con corrección de errores Q', async () => {
    await buildSunatQrDataUrl({
      ruc_emisor: '20616053575',
      tipo_documento: '01',
      serie: 'F001',
      numero: '42',
      total_igv: 18,
      total_venta: 118,
      fecha_emision: '2026-06-17',
      tipo_documento_receptor: '6',
      documento_receptor: '20123456789',
      valor_resumen: 'VALOR_RESUMEN',
    });

    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      '20616053575|01|F001|42|18.00|118.00|2026-06-17|6|20123456789|VALOR_RESUMEN',
      expect.objectContaining({
        errorCorrectionLevel: 'Q',
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      }),
    );
  });

  it.each([
    [{ tipo_documento: '01' }, 'RUC del emisor'],
    [{ ruc_emisor: '123', tipo_documento: '01' }, 'RUC del emisor inválido'],
    [{
      ruc_emisor: '20616053575', tipo_documento: '01', serie: 'F001', numero: 1,
      tipo_documento_receptor: '6', documento_receptor: '20123456789', valor_resumen: 'HASH',
    }, 'IGV'],
    [{
      ruc_emisor: '20616053575', tipo_documento: '01', serie: 'F001', numero: 1,
      total_igv: 18, total_venta: 118, fecha_emision: '2026-06-17',
      tipo_documento_receptor: '1', documento_receptor: '12345678', valor_resumen: 'HASH',
    }, 'serie F requiere RUC'],
  ])('falla cerrado cuando falta un dato crítico: %s', (overrides, expectedMessage) => {
    expect(() => buildSunatQrContent(overrides)).toThrow(expectedMessage);
  });
});
