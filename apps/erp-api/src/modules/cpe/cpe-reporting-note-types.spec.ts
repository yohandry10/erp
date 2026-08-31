import { CpeReportingService } from './cpe-reporting.service';

describe('CpeReportingService · nombres fiscales de notas', () => {
  it.each([
    ['07', 'Nota Crédito'],
    ['08', 'Nota Débito'],
    ['91', 'Nota Crédito DIAN'],
    ['92', 'Nota Débito DIAN'],
  ])('mapea %s sin perder el contrato de país', (tipo, nombre) => {
    const service = new CpeReportingService({} as any);

    expect((service as any).getTipoComprobanteText(tipo)).toBe(nombre);
  });
});
