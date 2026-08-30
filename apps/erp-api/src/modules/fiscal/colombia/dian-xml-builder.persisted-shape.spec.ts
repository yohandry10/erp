import { normalizePersistedFiscalItems, normalizePersistedFiscalTotals } from '../../cpe/cpe-delivery.service';
import { DianXmlBuilderService } from './dian-xml-builder.service';

describe('DianXmlBuilderService · shape persistido real', () => {
  it('transporta base e IVA snake_case a UBL sin undefined ni ceros ficticios', async () => {
    const persisted = {
      total_gravadas: '200.00', total_igv: '38.00', total_venta: '238.00',
      items: [{
        descripcion: 'Servicio persistido', cantidad: '2', precio_unitario: '100.00',
        valor_venta: '200.00', impuesto_igv: '38.00', tasa_igv: '19',
        unidad_medida: 'NIU', codigo_producto: 'SRV-CO-01',
      }],
    };
    const totals = normalizePersistedFiscalTotals(persisted);
    const items = normalizePersistedFiscalItems(persisted.items, 0.19);
    const xml = await new DianXmlBuilderService().generarFacturaElectronica({
      id: 'cpe-co', tipoDocumento: '01', serie: 'FE', numero: '9',
      fechaEmision: '2026-08-29T10:15:00-05:00', moneda: 'COP',
      emisor: {
        tipoDocumento: '31', numeroDocumento: '9001234568', razonSocial: 'Emisor CO',
        direccion: 'Carrera 7 # 72-41', codigoUbigeo: '11001',
        ciudad: 'Bogotá D.C.', departamento: 'Bogotá D.C.', codigoDepartamento: '11',
        regimenFiscal: 'O-13', tipoContribuyente: '1',
      },
      receptor: { tipoDocumento: '13', numeroDocumento: '1020304050', razonSocial: 'Cliente CO', dianTaxProfile: { profile: 'CONSUMIDOR_FINAL', taxLevelCode: 'R-99-PN', taxLevelListName: '49', taxSchemeId: 'ZY', taxSchemeName: 'No causa' } },
      subtotal: totals.subtotal, totalImpuestos: totals.totalImpuestos,
      importeTotal: totals.importeTotal, tasaImpuesto: 0.19,
      formaPago: 'CONTADO', medioPago: '10', items,
      dianContext: {
        environmentId: '2', software: { id: 'software-id', pin: 'software-pin' },
        authorization: {
          number: '18760000001', prefix: 'FE', rangeFrom: 1, rangeTo: 5000,
          validFrom: '2026-01-01', validTo: '2027-01-01', technicalKey: 'technical-key',
        },
        taxes: { iva: 38, inc: 0, ica: 0 },
      },
    });

    expect(xml).toContain('<cbc:LineExtensionAmount currencyID="COP">200.00</cbc:LineExtensionAmount>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="COP">38.00</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:PriceAmount currencyID="COP">100.00</cbc:PriceAmount>');
    expect(xml).toContain('<cbc:Percent>19.00</cbc:Percent>');
    expect(xml).toContain('schemeID="8" schemeName="31" schemeAgencyID="195">900123456</cbc:CompanyID>');
    expect(xml).not.toContain('Cundinamarca');
    expect(xml).not.toContain('technical-key');
    expect(xml).not.toContain('software-pin');
    expect(xml).not.toMatch(/undefined|NaN/);
  });

  it('no fabrica geografía, responsabilidad ni pago para un tenant real', async () => {
    const document: any = {
      id: 'real-incomplete', tipoDocumento: '01', serie: 'FE', numero: '1',
      fechaEmision: '2026-08-29T10:15:00-05:00', moneda: 'COP',
      emisor: { tipoDocumento: '31', numeroDocumento: '9001234568', razonSocial: 'Real SAS' },
      receptor: { tipoDocumento: '13', numeroDocumento: '1020304050', razonSocial: 'Cliente', dianTaxProfile: { profile: 'CONSUMIDOR_FINAL', taxLevelCode: 'R-99-PN', taxLevelListName: '49', taxSchemeId: 'ZY', taxSchemeName: 'No causa' } },
      subtotal: 100, totalImpuestos: 19, importeTotal: 119, tasaImpuesto: 0.19,
      items: [{ descripcion: 'Item', cantidad: 1, precioUnitario: 100, valorVenta: 100, igv: 19 }],
    };
    await expect(new DianXmlBuilderService().generarFacturaElectronica(document))
      .rejects.toThrow('DIAN: falta');
  });
});
