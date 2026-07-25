import { CpeXmlBuilder } from './cpe-xml.builder';
import { CreateFacturaDto } from '@erp-suite/dtos';
import { AFECTACION_IGV } from '../../shared/utils/igv-afectacion.util';

/**
 * Verifica la estructura tributaria del XML que se envía a SUNAT.
 * No sustituye la validación contra el servicio real de SUNAT, pero sí impide
 * que una operación exonerada viaje declarada como gravada.
 */
describe('CpeXmlBuilder — afectación del IGV en el XML', () => {
  const builder = new CpeXmlBuilder();

  const facturaBase = (overrides: Record<string, any> = {}): CreateFacturaDto =>
    ({
      tipo_documento: '01',
      serie: 'F001',
      numero: 1,
      ruc_emisor: '20123456786',
      razon_social_emisor: 'DEMO COMERCIAL SAC',
      tipo_documento_receptor: '6',
      documento_receptor: '20600000013',
      razon_social_receptor: 'CLIENTE SAC',
      moneda: 'PEN',
      total_gravadas: 100,
      total_igv: 18,
      total_venta: 118,
      items: [
        {
          cantidad: 1,
          descripcion: 'Producto gravado',
          unidad_medida: 'NIU',
          valor_unitario: 100,
          valor_venta: 100,
          precio_venta: 118,
          igv: 18,
          total: 118,
          tipo_afectacion_igv: AFECTACION_IGV.GRAVADO,
        },
      ],
      ...overrides,
    }) as unknown as CreateFacturaDto;

  it('emite el subtotal gravado con el esquema 1000 (IGV)', () => {
    const xml = builder.generateXmlContent(facturaBase());

    expect(xml).toContain('>1000<');
    expect(xml).toContain('<cbc:Name>IGV</cbc:Name>');
    expect(xml).not.toContain('>9997<');
    expect(xml).not.toContain('>9998<');
  });

  it('agrega el subtotal exonerado (9997) cuando hay base exonerada', () => {
    const xml = builder.generateXmlContent(
      facturaBase({
        total_gravadas: 100,
        total_exoneradas: 50,
        total_igv: 18,
        total_venta: 168,
      }),
    );

    expect(xml).toContain('>9997<');
    expect(xml).toContain('<cbc:Name>EXO</cbc:Name>');
  });

  it('agrega el subtotal inafecto (9998) cuando hay base inafecta', () => {
    const xml = builder.generateXmlContent(
      facturaBase({
        total_gravadas: 100,
        total_inafectas: 25,
        total_igv: 18,
        total_venta: 143,
      }),
    );

    expect(xml).toContain('>9998<');
    expect(xml).toContain('<cbc:Name>INA</cbc:Name>');
  });

  it('suma todas las bases en LineExtensionAmount, no solo la gravada', () => {
    const xml = builder.generateXmlContent(
      facturaBase({
        total_gravadas: 100,
        total_exoneradas: 50,
        total_inafectas: 25,
        total_igv: 18,
        total_venta: 193,
      }),
    );

    const lineExtension = /<cac:LegalMonetaryTotal>[\s\S]*?<cbc:LineExtensionAmount[^>]*>([\d.]+)</.exec(xml);
    expect(lineExtension?.[1]).toBe('175.00');
  });

  it('marca la línea exonerada con categoría E y esquema 9997', () => {
    const xml = builder.generateXmlContent(
      facturaBase({
        total_gravadas: 0,
        total_exoneradas: 100,
        total_igv: 0,
        total_venta: 100,
        items: [
          {
            cantidad: 1,
            descripcion: 'Producto exonerado',
            unidad_medida: 'NIU',
            valor_unitario: 100,
            valor_venta: 100,
            precio_venta: 100,
            igv: 0,
            total: 100,
            tipo_afectacion_igv: AFECTACION_IGV.EXONERADO,
          },
        ],
      }),
    );

    const lineaXml = /<cac:InvoiceLine>[\s\S]*?<\/cac:InvoiceLine>/.exec(xml)?.[0] ?? '';
    expect(lineaXml).toContain('>E</cbc:ID>');
    expect(lineaXml).toContain('>9997<');
    expect(lineaXml).toContain(`>${AFECTACION_IGV.EXONERADO}</cbc:TaxExemptionReasonCode>`);
  });

  it('mantiene categoría S y esquema 1000 en una línea gravada', () => {
    const xml = builder.generateXmlContent(facturaBase());
    const lineaXml = /<cac:InvoiceLine>[\s\S]*?<\/cac:InvoiceLine>/.exec(xml)?.[0] ?? '';

    expect(lineaXml).toContain('>S</cbc:ID>');
    expect(lineaXml).toContain('>1000<');
  });
});
