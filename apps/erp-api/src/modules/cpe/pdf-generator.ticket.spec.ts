import PDFDocument from 'pdfkit';
import { CPE_PDF_TICKET_FORMATS, PdfGeneratorService } from './pdf-generator.service';
import { PdfFormatHelperService } from './pdf-format-helper.service';

// PNG 1×1 válido: el QR real se prueba en sus propias specs.
const QR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const cpe = (extra: Record<string, unknown> = {}) => ({
  id: 'cpe-1', pais: 'PE', tipo_documento: '03', serie: 'B001', numero: '00000002',
  fecha_emision: '2026-11-24', moneda: 'PEN', simulated_origin: true,
  fiscal_authority_evidence: { status: 'SIMULATED' },
  razon_social_receptor: 'Paciente Ficticio', tipo_documento_receptor: '1', documento_receptor: '12345678',
  total_gravadas: 67.8, total_igv: 12.2, total_venta: 80, hash_firma: 'HASHDEPRUEBA123',
  items: [{ cantidad: 1, unidad_medida: 'ZZ', descripcion: 'Consulta médica', precio_unitario: 67.8, total_item: 80 }],
  ...extra,
});
const empresa = { ruc: '20123456786', razon_social: 'Clínica Ficticia de Pruebas SAC', direccion_fiscal: 'Av. Ficticia 123, Lima' };

const pdfInfo = (buffer: Buffer) => {
  const raw = buffer.toString('latin1');
  const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(raw)!;
  return { width: Number(box[1]), height: Number(box[2]), pages: (raw.match(/\/Type \/Page\b/g) || []).length };
};

describe('PDF del CPE en ticket térmico', () => {
  const service = new PdfGeneratorService({} as any, new PdfFormatHelperService()) as any;
  let textos: string[];
  beforeEach(() => {
    textos = [];
    const original = (PDFDocument.prototype as any).text;
    jest.spyOn(PDFDocument.prototype as any, 'text').mockImplementation(function (this: any, ...args: any[]) {
      textos.push(String(args[0]));
      return original.apply(this, args);
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['ticket80', 80],
    ['ticket58', 58],
  ] as const)('%s: ancho fijo de %i mm, una página y alto según el contenido', async (formato, mm) => {
    const corto = pdfInfo(await service.buildTicketPdf(cpe(), empresa, QR, 'PE', CPE_PDF_TICKET_FORMATS[formato]));
    const largo = pdfInfo(await service.buildTicketPdf(
      cpe({ items: Array.from({ length: 12 }, (_, i) => ({ cantidad: 1, descripcion: `Servicio ${i}`, precio_unitario: 1, total_item: 1.18 })) }),
      empresa, QR, 'PE', CPE_PDF_TICKET_FORMATS[formato],
    ));

    expect(corto.width).toBeCloseTo(mm * 72 / 25.4, 1);
    expect(corto.pages).toBe(1);
    expect(largo.pages).toBe(1);
    expect(largo.height).toBeGreaterThan(corto.height + 100);
    expect(corto.height).toBeLessThan(1500);
  });

  it('lleva los mismos datos fiscales que el A4 y la marca de muestra', async () => {
    await service.buildTicketPdf(cpe(), empresa, QR, 'PE', CPE_PDF_TICKET_FORMATS.ticket80);
    const texto = textos.join('\n');

    for (const esperado of [
      'Clínica Ficticia de Pruebas SAC', 'RUC: 20123456786', 'B001-00000002', 'Paciente Ficticio',
      '12345678', 'Consulta médica', 'Op. Gravadas:', 'PEN 67.80', 'PEN 12.20', 'TOTAL:', 'PEN 80.00',
      'SON: OCHENTA', 'Hash: HASHDEPRUEBA123', 'Consulte su comprobante en: www.sunat.gob.pe',
      'MUESTRA DEMO', 'SIN ENVÍO NI VALIDEZ SUNAT',
    ]) {
      expect(texto).toContain(esperado);
    }
    expect(texto).toMatch(/BOLETA DE VENTA ELECTR[ÓO]NICA/);
    expect(texto).toMatch(/[Rr]epresentaci[óo]n impresa/);
  });

  it('sin origen simulado no imprime la marca de muestra', async () => {
    await service.buildTicketPdf(cpe({ simulated_origin: false, estado: 'ACEPTADO', sunat_status: 'ACCEPTED', cdr_sunat: '<CDR/>' }),
      empresa, QR, 'PE', CPE_PDF_TICKET_FORMATS.ticket58);
    expect(textos.join('\n')).not.toContain('MUESTRA DEMO');
  });

  it('rechaza un formato desconocido antes de leer el CPE', async () => {
    const getCpeData = jest.spyOn(service, 'getCpeData');
    await expect(service.generateSunatCompliantPdf('cpe-1', 'tenant-1', 'carta' as any))
      .rejects.toMatchObject({ status: 400, message: 'CPE_PDF_FORMATO_INVALIDO' });
    expect(getCpeData).not.toHaveBeenCalled();
  });

  it('el ticket sólo se ofrece para comprobantes de Perú, antes de preparar datos de otro país', async () => {
    jest.spyOn(service, 'getCpeData').mockResolvedValue(cpe({ pais: 'AR' }));
    jest.spyOn(service, 'getCountryCode').mockResolvedValue('AR');
    jest.spyOn(service, 'getEmpresaConfig').mockResolvedValue(empresa);
    const qr = jest.spyOn(service, 'generateQRCode');
    const ticket = jest.spyOn(service, 'buildTicketPdf');

    await expect(service.generateSunatCompliantPdf('cpe-1', 'tenant-1', 'ticket80'))
      .rejects.toMatchObject({ status: 400, message: 'CPE_PDF_FORMATO_NO_DISPONIBLE_PAIS' });
    expect(qr).not.toHaveBeenCalled();
    expect(ticket).not.toHaveBeenCalled();
  });

  it('a4 sigue siendo el formato por defecto', async () => {
    jest.spyOn(service, 'getCpeData').mockResolvedValue(cpe());
    jest.spyOn(service, 'getCountryCode').mockResolvedValue('PE');
    jest.spyOn(service, 'getEmpresaConfig').mockResolvedValue(empresa);
    jest.spyOn(service, 'generateQRCode').mockResolvedValue(QR);
    const a4 = jest.spyOn(service, 'buildPdfDocument').mockResolvedValue(Buffer.from('%PDF-a4'));
    const ticket = jest.spyOn(service, 'buildTicketPdf');

    await expect(service.generateSunatCompliantPdf('cpe-1', 'tenant-1')).resolves.toEqual(Buffer.from('%PDF-a4'));
    expect(a4).toHaveBeenCalled();
    expect(ticket).not.toHaveBeenCalled();
  });
});
