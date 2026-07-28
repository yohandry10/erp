import {
  digitoVerificadorRuc,
  validarDocumentoIdentidad,
  validarRucPeru,
} from './documento-identidad-peru.util';

// El documento del cliente termina en el comprobante. Un RUC con dígito
// verificador incorrecto o un DNI de once dígitos se aceptaban en el alta y
// hacían que SUNAT rechazara la factura emitida a ese cliente.
describe('validación de documentos peruanos', () => {
  describe('RUC', () => {
    it('acepta un RUC con dígito verificador correcto', () => {
      // 20100066603 es el RUC usado en los smoke de SUNAT beta
      expect(validarRucPeru('20100066603').valido).toBe(true);
    });

    it('rechaza un RUC que no tiene once dígitos', () => {
      expect(validarRucPeru('12345678').valido).toBe(false);
      expect(validarRucPeru('201000666031').valido).toBe(false);
    });

    it('rechaza prefijos que SUNAT no asigna', () => {
      const r = validarRucPeru('99999999999');
      expect(r.valido).toBe(false);
      expect(r.error).toMatch(/[Pp]refijo/);
    });

    it('rechaza un dígito verificador que no cuadra', () => {
      const r = validarRucPeru('20123456780');
      expect(r.valido).toBe(false);
      expect(r.error).toMatch(/verificador/);
    });

    it('calcula el dígito verificador por módulo 11', () => {
      expect(digitoVerificadorRuc('20100066603')).toBe(3);
      expect(digitoVerificadorRuc('no-es-un-ruc')).toBeNull();
    });
  });

  describe('por tipo de documento', () => {
    it('el DNI debe tener exactamente ocho dígitos', () => {
      expect(validarDocumentoIdentidad('DNI', '12345678').valido).toBe(true);
      expect(validarDocumentoIdentidad('DNI', '20123456789').valido).toBe(false);
      expect(validarDocumentoIdentidad('DNI', '1234567').valido).toBe(false);
    });

    it('no acepta un RUC bajo el tipo DNI ni al revés', () => {
      expect(validarDocumentoIdentidad('DNI', '20100066603').valido).toBe(false);
      expect(validarDocumentoIdentidad('RUC', '12345678').valido).toBe(false);
    });

    it('admite carné de extranjería y pasaporte alfanuméricos', () => {
      expect(validarDocumentoIdentidad('CE', '003581663').valido).toBe(true);
      expect(validarDocumentoIdentidad('PASAPORTE', 'AB123456').valido).toBe(true);
    });

    it('exige el número y rechaza tipos desconocidos', () => {
      expect(validarDocumentoIdentidad('RUC', '').valido).toBe(false);
      expect(validarDocumentoIdentidad('CARNET', '12345678').valido).toBe(false);
    });
  });
});
