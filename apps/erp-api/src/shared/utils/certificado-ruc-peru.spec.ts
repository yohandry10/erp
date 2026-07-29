import {
  extraerRucsDeSubject,
  verificarTitularidadCertificado,
} from './certificado-ruc-peru.util';

describe('certificado-ruc-peru', () => {
  // RUCs con digito verificador correcto.
  const RUC_EMPRESA = '20601234565';
  const RUC_OTRA_EMPRESA = '20600900006';

  describe('extraerRucsDeSubject', () => {
    it('lo encuentra en serialNumber, que es donde suele venir', () => {
      const subject = `commonName=EMPRESA DEMO S.A.C., serialNumber=${RUC_EMPRESA}, countryName=PE`;

      expect(extraerRucsDeSubject(subject)).toEqual([RUC_EMPRESA]);
    });

    it('lo encuentra en organizationIdentifier con el prefijo ETSI', () => {
      const subject = `commonName=EMPRESA DEMO S.A.C., organizationIdentifier=PENIF-${RUC_EMPRESA}`;

      expect(extraerRucsDeSubject(subject)).toEqual([RUC_EMPRESA]);
    });

    it('lo encuentra incrustado en el commonName', () => {
      const subject = `commonName=EMPRESA DEMO S.A.C. RUC ${RUC_EMPRESA}, countryName=PE`;

      expect(extraerRucsDeSubject(subject)).toEqual([RUC_EMPRESA]);
    });

    it('no confunde once digitos sueltos dentro de un numero mas largo', () => {
      // El numero de serie del certificado no es un RUC aunque contenga once digitos.
      const subject = 'commonName=EMPRESA DEMO, serialNumber=9920601234565123';

      expect(extraerRucsDeSubject(subject)).toEqual([]);
    });

    it('descarta secuencias de once digitos que no son un RUC valido', () => {
      // Prefijo inexistente y digito verificador incorrecto.
      const subject = 'commonName=EMPRESA DEMO, serialNumber=99912345678';

      expect(extraerRucsDeSubject(subject)).toEqual([]);
    });

    it('no revienta con un subject vacio', () => {
      expect(extraerRucsDeSubject(null)).toEqual([]);
      expect(extraerRucsDeSubject('')).toEqual([]);
    });
  });

  describe('verificarTitularidadCertificado', () => {
    it('acepta el certificado emitido al RUC que factura', () => {
      const subject = `commonName=EMPRESA DEMO S.A.C., serialNumber=${RUC_EMPRESA}`;

      expect(verificarTitularidadCertificado(subject, RUC_EMPRESA)).toEqual({
        coincide: true,
        rucsEnCertificado: [RUC_EMPRESA],
      });
    });

    it('rechaza el certificado de otro contribuyente y nombra ambos RUC', () => {
      const subject = `commonName=OTRA EMPRESA S.A.C., serialNumber=${RUC_OTRA_EMPRESA}`;

      const resultado = verificarTitularidadCertificado(subject, RUC_EMPRESA);

      expect(resultado.coincide).toBe(false);
      expect(resultado.error).toContain(RUC_OTRA_EMPRESA);
      expect(resultado.error).toContain(RUC_EMPRESA);
    });

    it('rechaza el certificado de persona natural sin RUC', () => {
      // Es el caso que hoy tiene cargado el entorno: firma valida, titular sin RUC.
      const subject = 'commonName=PEREZ GARCIA JUAN, serialNumber=12345678, countryName=PE';

      const resultado = verificarTitularidadCertificado(subject, RUC_EMPRESA);

      expect(resultado.coincide).toBe(false);
      expect(resultado.rucsEnCertificado).toEqual([]);
      expect(resultado.error).toContain('no declara ningun RUC');
    });

    it('no da por bueno el certificado cuando la empresa aun no tiene RUC', () => {
      const subject = `commonName=EMPRESA DEMO S.A.C., serialNumber=${RUC_EMPRESA}`;

      const resultado = verificarTitularidadCertificado(subject, '');

      expect(resultado.coincide).toBe(false);
      expect(resultado.error).toContain('RUC de la empresa');
    });

    it('no da por bueno el certificado cuando el RUC de la empresa es invalido', () => {
      const subject = `commonName=EMPRESA DEMO S.A.C., serialNumber=${RUC_EMPRESA}`;

      const resultado = verificarTitularidadCertificado(subject, '20601234569');

      expect(resultado.coincide).toBe(false);
      expect(resultado.error).toContain('no es valido');
    });
  });
});
