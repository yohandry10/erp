import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  PdfGeneratorService,
} from '../../apps/erp-api/src/modules/cpe/pdf-generator.service';
import { PdfFormatHelperService } from '../../apps/erp-api/src/modules/cpe/pdf-format-helper.service';

const artifactDirectory = dirname(__filename);
const repositoryRoot = resolve(artifactDirectory, '..', '..');
const outputPath = resolve(artifactDirectory, 'factura-demo-a4-multipagina.pdf');
const logoPath = resolve(repositoryRoot, 'apps', 'web', 'public', 'logo.png');

const lineCount = 55;
const cpeData = {
  tipo_documento: '01',
  ruc_emisor: '20600000013',
  serie: 'F001',
  numero: 523,
  fecha_emision: '2026-08-29T00:00:00Z',
  fecha_vencimiento: '2026-09-28T00:00:00Z',
  moneda: 'PEN',
  razon_social_receptor: 'COMERCIAL ANDINA DEMOSTRACIÓN S.A.C.',
  tipo_documento_receptor: '6',
  documento_receptor: '20600000021',
  direccion_receptor: 'Av. Ejemplo 456, Miraflores, Lima',
  total_gravadas: 550,
  total_exoneradas: 0,
  total_inafectas: 0,
  total_igv: 99,
  total_venta: 649,
  tasa_igv: 18,
  estado: 'FIRMADO',
  valor_resumen: 'QA523DIGESTVALUE',
  items: Array.from({ length: lineCount }, (_, index) => ({
    cantidad: 1,
    unidad_medida: 'NIU',
    codigo_producto: `QA-${String(index + 1).padStart(3, '0')}`,
    descripcion: `Producto de demostración ${index + 1}: descripción extensa para verificar saltos de línea, columnas y continuidad entre páginas A4 sin superposición.`,
    precio_unitario: 10,
    precio_venta: 11.8,
    valor_venta: 10,
    total_item: 11.8,
  })),
};

async function main(): Promise<void> {
  const logo = await readFile(logoPath);
  const logoDataUrl = `data:image/png;base64,${logo.toString('base64')}`;
  const helper = new PdfFormatHelperService();
  const service = new PdfGeneratorService({} as never, helper) as unknown as {
    generateQRCode(data: unknown, country: string, demo: boolean): Promise<string>;
    buildPdfDocument(
      data: unknown,
      company: unknown,
      qr: string,
      country: string,
    ): Promise<Buffer>;
  };
  const qr = await service.generateQRCode(cpeData, 'PE', true);
  const pdf = await service.buildPdfDocument(
    cpeData,
    {
      razon_social: 'NEON ERP DEMO S.A.C.',
      nombre_comercial: 'NEON ERP SUITE',
      ruc: '20600000013',
      direccion_fiscal: 'Av. Demo 123, Miraflores, Lima',
      telefono: '(01) 555-0523',
      email: 'facturacion@example.invalid',
      logo_url: logoDataUrl,
      is_demo: true,
    },
    qr,
    'PE',
  );

  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(outputPath, pdf);
  process.stdout.write(`${outputPath}\n${pdf.length} bytes\n`);
}

void main();
