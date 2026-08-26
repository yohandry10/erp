import {
  CPE_PDF_PRINT_FORMAT,
  PdfGeneratorService,
  getCpeDemoPdfNotice,
  resolveCpePrintedLineTotal,
  resolveCpePrintedUnitPrice,
} from './pdf-generator.service';

describe('representación impresa CPE', () => {
  it('usa la hoja A4 normalizada de 210 por 297 milímetros', () => {
    expect(CPE_PDF_PRINT_FORMAT).toEqual({
      size: 'A4',
      widthMm: 210,
      heightMm: 297,
    });
  });

  it('genera físicamente una página PDF A4 de 210 por 297 milímetros', async () => {
    const service = new PdfGeneratorService({} as any, {} as any) as any;
    const onePixelPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const pdf = await service.buildPdfDocument(
      {
        tipo_documento: '01',
        ruc_emisor: '20600000013',
        serie: 'F001',
        numero: 1,
        fecha_emision: '2026-08-25',
        fecha_vencimiento: '2026-08-25',
        moneda: 'PEN',
        razon_social_receptor: 'Cliente Demo S.A.C.',
        tipo_documento_receptor: '6',
        documento_receptor: '20600000021',
        direccion_receptor: 'Lima',
        total_gravadas: 152.37,
        total_igv: 27.43,
        total_venta: 179.8,
        estado: 'FIRMADO',
        items: [{
          cantidad: 2,
          descripcion: 'Audífonos Bluetooth',
          precio_unitario: 76.185,
          precio_venta: 89.9,
          valor_venta: 152.37,
          total_item: 179.8,
        }],
      },
      {
        razon_social: 'Comercial Andina Demo S.A.C.',
        ruc: '20600000013',
        direccion_fiscal: 'Lima',
        is_demo: true,
      },
      onePixelPng,
      'PE',
    );

    const mediaBox = pdf
      .toString('latin1')
      .match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    expect(mediaBox).not.toBeNull();

    const pointsToMillimeters = (points: string) => Number(points) * 25.4 / 72;
    expect(pointsToMillimeters(mediaBox![1])).toBeCloseTo(210, 0);
    expect(pointsToMillimeters(mediaBox![2])).toBeCloseTo(297, 0);
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).toHaveLength(1);
  });

  it('imprime el importe persistido de la línea y conserva descuentos y redondeos', () => {
    const demoLine = {
      cantidad: 2,
      precio_unitario: 76.185,
      precio_venta: 89.9,
      valor_venta: 152.37,
      total_item: 179.8,
    };
    expect(resolveCpePrintedUnitPrice(demoLine)).toBeCloseTo(89.9, 2);
    expect(resolveCpePrintedLineTotal(demoLine)).toBe(179.8);
    expect(resolveCpePrintedLineTotal({
      cantidad: 2,
      precio_unitario: 100,
      valor_venta: 175.55,
      subtotal: 180,
    })).toBe(175.55);
    expect(resolveCpePrintedLineTotal({
      cantidad: 2,
      precio_unitario: 100,
      subtotal: 180,
    })).toBe(180);
    expect(resolveCpePrintedLineTotal({
      cantidad: 2,
      precio_unitario: 100,
    })).toBe(200);
  });

  it('declara de forma inequívoca que el PDF demo peruano no tiene validez SUNAT', () => {
    expect(getCpeDemoPdfNotice('PE')).toBe('MUESTRA DEMO · SIN ENVÍO NI VALIDEZ SUNAT');
  });

  it('recupera el detalle normalizado del documento cuando el JSON legado del CPE está vacío', async () => {
    const cpeChain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'cpe-1', tenant_id: 'tenant-1', documento_id: 'doc-1', items: [] },
        error: null,
      }),
    };
    const detailRows = [{ orden: 1, descripcion: 'Audífonos Bluetooth', cantidad: 2, valor_venta: 152.37 }];
    const detailsChain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: detailRows, error: null }),
    };
    const client = {
      from: jest.fn((table: string) => table === 'cpe' ? cpeChain : detailsChain),
    };
    const service = new PdfGeneratorService(
      { getClient: () => client } as any,
      {} as any,
    ) as any;

    await expect(service.getCpeData('cpe-1', 'tenant-1')).resolves.toMatchObject({
      items: detailRows,
    });
    expect(client.from).toHaveBeenCalledWith('documento_detalles');
    expect(detailsChain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(detailsChain.eq).toHaveBeenCalledWith('documento_id', 'doc-1');
  });

  it('repite los encabezados de detalle al continuar la factura en una segunda hoja A4', () => {
    const textCalls: string[] = [];
    const doc: any = {
      y: 40,
      fontSize: jest.fn().mockReturnThis(),
      font: jest.fn().mockReturnThis(),
      text: jest.fn((value: unknown) => {
        textCalls.push(String(value));
        return doc;
      }),
      moveTo: jest.fn().mockReturnThis(),
      lineTo: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      addPage: jest.fn().mockReturnThis(),
    };
    const service = new PdfGeneratorService({} as any, {} as any) as any;
    const items = Array.from({ length: 34 }, (_, index) => ({
      cantidad: 1,
      descripcion: `Producto ${index + 1}`,
      precio_unitario: 10,
      valor_venta: 10,
    }));

    service.addItemsTable(doc, { items });

    expect(doc.addPage).toHaveBeenCalledTimes(1);
    expect(textCalls.filter((value) => value === 'DESCRIPCIÓN')).toHaveLength(2);
    expect(textCalls).toContain('Producto 34');
  });
});
