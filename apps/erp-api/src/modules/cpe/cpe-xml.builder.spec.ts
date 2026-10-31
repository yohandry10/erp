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

  // El establecimiento anexo del emisor. Hasta la migracion 503 este valor
  // estaba fijado a '0000' porque no habia sucursales de las que sacarlo, asi
  // que toda factura de toda sucursal declaraba la casa matriz.
  it('declara el establecimiento anexo que le pasa el emisor', () => {
    const xml = builder.generateXmlContent(
      facturaBase({ codigo_establecimiento: '0003' }),
    );

    expect(xml).toContain('<cbc:AddressTypeCode>0003</cbc:AddressTypeCode>');
    expect(xml).not.toContain('<cbc:AddressTypeCode>0000</cbc:AddressTypeCode>');
  });

  it('mantiene operación0200 desde el snapshot de una exportación firmada', () => {
    const xml = builder.generateXmlContent(facturaBase({
      metadata: { sunat_tipo_operacion: '0200' },
      tipo_documento_receptor: '7', documento_receptor: 'AB570123',
      total_gravadas: 0, total_exportacion: 20, total_igv: 0, total_venta: 20,
      items: [{ cantidad: 1, descripcion: 'Bien exportado', unidad_medida: 'NIU',
        valor_unitario: 20, valor_venta: 20, precio_venta: 20, igv: 0,
        total: 20, tipo_afectacion_igv: '40' }],
    }));
    expect(xml).toContain('>0200</cbc:ProfileID>');
    expect(xml).toContain('listID="0200"');
    expect(xml).toContain('>9995<');
    expect(xml).not.toContain('>1000<');
  });

  it('cae a la casa matriz cuando no le pasan establecimiento', () => {
    const xml = builder.generateXmlContent(facturaBase());

    expect(xml).toContain('<cbc:AddressTypeCode>0000</cbc:AddressTypeCode>');
  });

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

  // Catálogo 16 tipo 01: precio unitario con impuestos, nunca el total de la línea.
  const precioReferencia = (xml: string, tag: string) =>
    new RegExp(`<cac:${tag}>[\\s\\S]*?<cac:AlternativeConditionPrice>\\s*<cbc:PriceAmount[^>]*>([^<]+)<`)
      .exec(xml)?.[1];
  const lineaDeTreinta = (precioVenta?: number) => ({
    cantidad: 30, descripcion: 'Fierro', unidad_medida: 'NIU', valor_unitario: 45,
    precio_unitario: 45, valor_venta: 1350, igv: 243, total: 1593,
    ...(precioVenta === undefined ? {} : { precio_venta: precioVenta }),
    tipo_afectacion_igv: AFECTACION_IGV.GRAVADO,
  });
  const totalesDeTreinta = { total_gravadas: 1350, total_igv: 243, total_venta: 1593 };

  it('usa el precio unitario con IGV cuando precio_venta llega como total de línea', () => {
    const xml = builder.generateXmlContent(facturaBase({ ...totalesDeTreinta, items: [lineaDeTreinta(1593)] }));
    expect(precioReferencia(xml, 'InvoiceLine')).toBe('53.10');
  });

  it('respeta precio_venta cuando ya es unitario', () => {
    const xml = builder.generateXmlContent(facturaBase({ ...totalesDeTreinta, items: [lineaDeTreinta(53.1)] }));
    expect(precioReferencia(xml, 'InvoiceLine')).toBe('53.10');
  });

  it('deriva el precio unitario con IGV de la nota sin precio_venta', () => {
    const xml = builder.generateXmlContent(facturaBase({
      tipo_documento: '07', serie: 'FC01', ...totalesDeTreinta, items: [lineaDeTreinta()],
      documento_referencia_id: 'F001-00000001', documento_referencia_tipo: '01',
      motivo_nota: 'Devolución por ítems', codigo_motivo_nota: '07',
    }));
    expect(precioReferencia(xml, 'CreditNoteLine')).toBe('53.10');
  });

  it.each(['01', '07'])('normaliza el total de línea para cantidades fraccionarias en documento %s', (tipo) => {
    const xml = builder.generateXmlContent(facturaBase({
      tipo_documento: tipo, serie: tipo === '07' ? 'FC01' : 'F001',
      total_gravadas: 50, total_igv: 9, total_venta: 59,
      items: [{ cantidad: 0.5, descripcion: 'Medio metro', unidad: 'MTR',
        precio_unitario: 100, valor_venta: 50, igv: 9, precio_venta: 59,
        tipo_afectacion_igv: AFECTACION_IGV.GRAVADO }],
      ...(tipo === '07' ? { documento_referencia_id: 'F001-00000001', documento_referencia_tipo: '01', motivo_nota: 'Devolución', codigo_motivo_nota: '07' } : {}),
    }));
    expect(precioReferencia(xml, tipo === '07' ? 'CreditNoteLine' : 'InvoiceLine')).toBe('118.00');
  });

  it('conserva el precio unitario explícito en una cantidad fraccionaria', () => {
    const xml = builder.generateXmlContent(facturaBase({
      total_gravadas: 50, total_igv: 9, total_venta: 59,
      items: [{ cantidad: 0.5, descripcion: 'Medio metro', unidad: 'MTR',
        precio_unitario: 100, valor_venta: 50, igv: 9, precio_venta: 118,
        tipo_afectacion_igv: AFECTACION_IGV.GRAVADO }],
    }));
    expect(precioReferencia(xml, 'InvoiceLine')).toBe('118.00');
  });

  it.each(['01', '03', '07', '08'])('conserva 18%% contractual en documento %s sin derivar la tasa de importes redondeados', (tipo) => {
    const xml = builder.generateXmlContent(facturaBase({
      tipo_documento: tipo,
      serie: tipo === '03' ? 'B001' : tipo === '07' ? 'FC01' : tipo === '08' ? 'FD01' : 'F001',
      total_gravadas: 3.39, total_exoneradas: 0.13, total_igv: 0.61, total_venta: 4.13,
      items: [
        { cantidad: 1, descripcion: 'Gravado redondeado', valor_venta: 3.39, igv: 0.61,
          precio_unitario: 3.39, precio_venta: 4, tipo_afectacion_igv: '10' },
        { cantidad: 1, descripcion: 'Exonerado', valor_venta: 0.13, igv: 0,
          precio_unitario: 0.13, precio_venta: 0.13, tipo_afectacion_igv: '20' },
      ],
      ...(['07', '08'].includes(tipo) ? {
        documento_referencia_id: 'F001-00000001', documento_referencia_tipo: '01',
        motivo_nota: 'Devolución', codigo_motivo_nota: '07',
      } : {}),
    }));
    expect([...xml.matchAll(/<cbc:Percent>([^<]+)<\/cbc:Percent>/g)].map((match) => match[1]))
      .toEqual(['18.00', '0.00']);
    expect(xml).toContain('>0.61</cbc:TaxAmount>');
    expect(xml).not.toContain('>17.99</cbc:Percent>');
  });

  it.each([18, 0.18, 10])('conserva la tasa declarada %s por línea sin cambiar la afectación', (tasa) => {
    const base = facturaBase();
    const xml = builder.generateXmlContent(facturaBase({
      items: [{ ...base.items[0], tasa_igv: tasa }],
    }));
    expect(xml).toContain(`<cbc:Percent>${(tasa <= 1 ? tasa * 100 : tasa).toFixed(2)}</cbc:Percent>`);
    expect(xml).toContain('>10</cbc:TaxExemptionReasonCode>');
  });

  it('rechaza una tasa declarada inválida en lugar de firmar una tasa inventada', () => {
    const base = facturaBase();
    expect(() => builder.generateXmlContent(facturaBase({
      items: [{ ...base.items[0], tasa_igv: 'NaN' }],
    }))).toThrow('La tasa de IGV de la línea no es válida');
  });

  it('mantiene categoría S y esquema 1000 en una línea gravada', () => {
    const xml = builder.generateXmlContent(facturaBase());
    const lineaXml = /<cac:InvoiceLine>[\s\S]*?<\/cac:InvoiceLine>/.exec(xml)?.[0] ?? '';

    expect(lineaXml).toContain('>S</cbc:ID>');
    expect(lineaXml).toContain('>1000<');
  });
});
