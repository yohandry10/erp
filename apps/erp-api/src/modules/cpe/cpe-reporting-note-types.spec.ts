import { CpeReportingService } from './cpe-reporting.service';
import { isColombiaDemoRepresentation } from './historical-cpe-country.util';

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

  it('presenta todo CPE Colombia simulado o sin procedencia como muestra local', () => {
    expect(isColombiaDemoRepresentation({
      simulated_origin: true,
      issuer_snapshot: { country_code: 'CO' },
    })).toBe(true);
    expect(isColombiaDemoRepresentation({
      simulated_origin: null,
      metadata: { pais: 'CO' },
    })).toBe(true);
    expect(isColombiaDemoRepresentation({
      simulated_origin: false,
      issuer_snapshot: { country_code: 'CO' },
    })).toBe(false);
    expect(isColombiaDemoRepresentation({
      simulated_origin: true,
      issuer_snapshot: { country_code: 'PE' },
    })).toBe(false);
  });

  it('exporta una muestra Colombia sin afirmar que está firmada o transmitida', async () => {
    const service = new CpeReportingService({} as any);
    jest.spyOn(service, 'getComprobantesFromDatabase').mockResolvedValue({
      success: true,
      data: [{
        tipoComprobante: 'Factura',
        serie: 'FE',
        numero: 1,
        fechaEmision: '2026-09-04',
        cliente: 'Cliente Demo Colombia SAS',
        clienteRuc: '9001234568',
        moneda: 'COP',
        total: 119000,
        estado: 'FIRMADO',
        estadoSunat: 'NO_TRANSMITIDO',
        isDemoRepresentation: true,
      }],
      message: 'ok',
    } as any);

    const result = await service.exportComprobantesCsv({}, 'tenant-demo-co');

    expect(result.success).toBe(true);
    expect(result.content).toContain('MUESTRA_LOCAL,NO_TRANSMITIDO');
    expect(result.content).not.toContain('FIRMADO');
  });
});
