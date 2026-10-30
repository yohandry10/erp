import { PleExportService } from "./ple-export.service";
import { BadRequestException } from '@nestjs/common';
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { TenantContextService } from "../../../shared/tenant/tenant-context.service";

const createQuery = (result: any) => {
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    gte: jest.fn(() => query),
    lte: jest.fn(() => query),
    lt: jest.fn(() => query),
    range: jest.fn(() => query),
    order: jest.fn(() => query),
    single: jest.fn(async () => result),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
};

describe("PleExportService", () => {
  it("exporta Libro Diario con fechas y correlativo SUNAT PLE", async () => {
    const asientos = [
      {
        id: "asiento-1",
        numero_asiento: 7,
        fecha: "2024-10-05T15:30:00Z",
        concepto: "Venta POS",
        referencia: "B001-1",
        detalle_asientos: [
          {
            id: "detalle-1",
            cuenta_id: "cuenta-12",
            debe: 118,
            haber: 0,
            concepto: "Cliente",
            plan_cuentas: { codigo: "12", nombre: "Clientes" },
          },
        ],
      },
    ];

    const supabase = {
      getClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === "empresa_config") {
            return createQuery({
              data: { ruc: "20616053575", razon_social: "NEXTELCO", pais: "PE" },
              error: null,
            });
          }
          if (table === "asientos_contables") {
            return createQuery({ data: asientos, error: null });
          }
          return createQuery({ data: [], error: null });
        }),
      })),
    } as unknown as SupabaseService;
    const tenantContext = {
      getTenantId: jest.fn(() => "tenant-1"),
    } as unknown as TenantContextService;

    const service = new PleExportService(supabase, tenantContext);

    const result = await service.exportarLibroDiario(2024, 10);
    const fields = result.content.split("|");

    expect(result.filename).toBe("LE206160535752024100005010000111.TXT");
    expect(fields[0]).toBe("20241000");
    expect(fields[1]).toBe("M00000007");
    expect(fields[2]).toBe("M000001");
    expect(fields[12]).toBe("05/10/2024");
    expect(fields[14]).toBe("05/10/2024");
  });

  const montarServicio = (tabla: string, filas: any[], originales: any[] = []) => {
    const supabase = {
      getClient: jest.fn(() => ({
        rpc: jest.fn(() => createQuery({ data: filas, error: null })),
        from: jest.fn((nombre: string) => {
          if (nombre === "empresa_config") {
            return createQuery({
              data: { ruc: "20616053575", pais: "PE" },
              error: null,
            });
          }
          if (nombre === tabla) {
            const query = createQuery({ data: filas, error: null });
            query.select = jest.fn((campos: string) => campos.startsWith('id, tenant_id,')
              ? createQuery({ data: originales, error: null }) : query);
            return query;
          }
          return createQuery({ data: [], error: null });
        }),
      })),
    } as unknown as SupabaseService;
    const tenantContext = {
      getTenantId: jest.fn(() => "tenant-1"),
    } as unknown as TenantContextService;
    return new PleExportService(supabase, tenantContext);
  };

  const facturaCompra = {
    id: "cxp-1",
    numero_documento: "F001-00000123",
    tipo_documento: "FACTURA",
    fecha_emision: "2026-08-01",
    fecha_vencimiento: "2026-08-31",
    subtotal: 100,
    igv: 18,
    total: 118,
    moneda: "PEN",
    estado: "PENDIENTE",
    proveedores: {
      ruc: "20512345671",
      numero_documento: "20512345671",
      razon_social: "DISTRIBUIDORA ANDINA S.A.C.",
      tipo_documento: "RUC",
    },
  };

  describe("Registro de Ventas 14.1", () => {
    // Boleta mixta: S/ 25.00 gravados, S/ 3.50 exonerados, IGV solo sobre la
    // base gravada. Es el caso que obliga a separar las bases.
    const boletaMixta = {
      id: "doc-1",
      serie: "B001",
      numero: "00000001",
      tipo_documento: "BOLETA",
      fecha_emision: "2026-08-02T00:00:00+00:00",
      fecha_vencimiento: null,
      moneda: "PEN",
      tipo_cambio: 1,
      estado: "EMITIDO",
      subtotal: 25,
      impuesto_igv: 4.5,
      total: 33,
      total_gravadas: 25,
      total_exoneradas: 3.5,
      total_inafectas: 0,
      total_exportacion: 0,
      receptor_tipo_doc: "DNI",
      receptor_numero_doc: "44556677",
      receptor_razon_social: "CLIENTE GENERAL",
    };

    it("declara cada base en su casilla y no las suma", async () => {
      const service = montarServicio("documentos", [boletaMixta]);

      const result = await service.exportarRegistroVentas(2026, 8);
      const campos = result.content.split("|");

      expect(campos[0]).toBe("20260800");
      expect(campos[3]).toBe("02/08/2026");
      expect(campos[5]).toBe("03");
      expect(campos[6]).toBe("B001");
      expect(campos[8]).toBe("00000001");
      expect(campos[13]).toBe("0.00");
      expect(campos[14]).toBe("25.00");
      expect(campos[16]).toBe("4.50");
      expect(campos[18]).toBe("3.50");
      expect(campos[19]).toBe("0.00");
      expect(campos[24]).toBe("33.00");
    });

    it("emite los 41 campos del Anexo 2, ni uno menos", async () => {
      const service = montarServicio("documentos", [boletaMixta]);

      const result = await service.exportarRegistroVentas(2026, 8);
      // El separador final cierra el ultimo campo, no abre uno nuevo.
      const campos = result.content.split("|").slice(0, -1);

      expect(campos).toHaveLength(41);
    });

    it('excluye facturas y notas borrador antes de resolver referencias y conserva la venta emitida', async () => {
      const rows = [boletaMixta, { ...boletaMixta, estado: 'BORRADOR', id: 'draft-invoice' },
        { ...boletaMixta, tipo_documento: 'NOTA_CREDITO', estado: ' borrador ', id: 'draft-note', documento_origen_id: 'not-issued' }];
      const result = await montarServicio('documentos', rows).exportarRegistroVentas(2026, 8);
      expect(result.content.trim().split('\n')).toHaveLength(1);
      expect(result.content).toBe((await montarServicio('documentos', [boletaMixta]).exportarRegistroVentas(2026, 8)).content);
    });

    it('convierte cada base extranjera a soles con su cotización y redondeo documental', async () => {
      const doc = { ...boletaMixta, moneda: 'USD', tipo_cambio: 3.75, total_gravadas: 10,
        impuesto_igv: 1.8, total_exoneradas: 2, total_inafectas: 1, total_exportacion: 4, total: 18.8 };
      const fields = (await montarServicio('documentos', [doc]).exportarRegistroVentas(2026, 8)).content.split('|');
      expect([fields[13], fields[14], fields[16], fields[18], fields[19], fields[24]])
        .toEqual(['15.00','37.50','6.75','7.50','3.75','70.50']);
      expect([fields[25], fields[26]]).toEqual(['USD','3.750']);
      const rounding = (await montarServicio('documentos', [{ ...doc, tipo_cambio: 1.5, total_gravadas: .01 }])
        .exportarRegistroVentas(2026, 8)).content.split('|');
      expect(rounding[14]).toBe('0.02');
    });

    it('rechaza ventas extranjeras sin una cotización documental válida', async () => {
      await expect(montarServicio('documentos', [{ ...boletaMixta, moneda: 'USD', tipo_cambio: null }])
        .exportarRegistroVentas(2026, 8)).rejects.toThrow(BadRequestException);
    });

    it("usa el codigo de libro 140100 en el nombre del archivo", async () => {
      const service = montarServicio("documentos", [boletaMixta]);

      const result = await service.exportarRegistroVentas(2026, 8);

      expect(result.filename).toBe("LE206160535752026080014010000111.TXT");
    });

    it("marca como anulado el comprobante dado de baja", async () => {
      const service = montarServicio("documentos", [
        { ...boletaMixta, estado: "ANULADO" },
      ]);

      const result = await service.exportarRegistroVentas(2026, 8);
      const campos = result.content.split("|");

      expect(campos[35]).toBe("2");
      expect(campos[14]).toBe('0.00');
      expect(campos[16]).toBe('0.00');
      expect(campos[24]).toBe('0.00');
    });

    it('resta todas las bases y el total de NC y recupera referencia de RMA', async () => {
      const service = montarServicio('documentos', [{ ...boletaMixta,
        tipo_documento: 'NOTA_CREDITO', serie: 'BC01',
        total_exportacion: 2, total_inafectas: 1, total: 36,
        metadata: { source_document_id: 'original-1' },
      }], [{ id: 'original-1', tenant_id: 'tenant-1', tipo_documento: 'BOLETA',
        serie: 'B001', numero: '00000001', fecha_emision: '2026-08-01' }]);
      const campos = (await service.exportarRegistroVentas(2026, 8)).content.split('|');
      expect([campos[13], campos[14], campos[16], campos[18], campos[19], campos[24]])
        .toEqual(['-2.00', '-25.00', '-4.50', '-3.50', '-1.00', '-36.00']);
      expect([campos[27], campos[28], campos[29], campos[31]])
        .toEqual(['01/08/2026', '03', 'B001', '00000001']);
    });

    it('no genera una nota con referencia ajena o ausente', async () => {
      const nota = { ...boletaMixta, tipo_documento: 'NOTA_CREDITO', documento_origen_id: 'original-1' };
      for (const originales of [[], [{ id: 'original-1', tenant_id: 'otro-tenant' }]]) {
        await expect(montarServicio('documentos', [nota], originales).exportarRegistroVentas(2026, 8))
          .rejects.toThrow('Referencia del comprobante original requerida');
      }
    });

    it("reconoce el RUC como documento tipo 6 aunque el registro diga otra cosa", async () => {
      const service = montarServicio("documentos", [
        {
          ...boletaMixta,
          receptor_tipo_doc: "DNI",
          receptor_numero_doc: "20512345671",
        },
      ]);

      const result = await service.exportarRegistroVentas(2026, 8);
      const campos = result.content.split("|");

      expect(campos[10]).toBe("6");
      expect(campos[11]).toBe("20512345671");
    });
  });

  describe("Registro de Compras 8.1", () => {
    it('conserva la factura original y la NC de devolución separadas con sus importes fiscales', async () => {
      const service = montarServicio('cuentas_por_pagar', [{
        ...facturaCompra, subtotal: 80, igv: 14.4, total: 94.4,
        original_fiscal_amounts: { subtotal: 100, igv: 18, total: 118 },
        metadata: { ultima_devolucion_id: 'return-1', ultima_devolucion_total: 23.6 },
      }, { ...facturaCompra, id: 'nc-1', tipo_documento: 'NOTA_CREDITO',
        numero_documento: 'FC01-00000001', subtotal: 20, igv: 3.6, total: 23.6,
      }]);
      const result = await service.exportarRegistroCompras(2026, 8);
      const [invoice, note] = result.content.split('\r\n').map((row) => row.split('|'));
      expect(invoice[13]).toBe('100.00');
      expect(invoice[14]).toBe('18.00');
      expect(invoice[22]).toBe('118.00');
      expect(note[13]).toBe('-20.00');
      expect(note[14]).toBe('-3.60');
      expect(note[22]).toBe('-23.60');
    });
    it("separa serie y numero del comprobante del proveedor", async () => {
      const service = montarServicio("cuentas_por_pagar", [facturaCompra]);

      const result = await service.exportarRegistroCompras(2026, 8);
      const campos = result.content.split("|");

      expect(campos[5]).toBe("01");
      expect(campos[6]).toBe("F001");
      expect(campos[8]).toBe("00000123");
      expect(campos[10]).toBe("6");
      expect(campos[11]).toBe("20512345671");
    });

    it("lleva la base a la casilla gravada cuando el comprobante trae IGV", async () => {
      const service = montarServicio("cuentas_por_pagar", [facturaCompra]);

      const result = await service.exportarRegistroCompras(2026, 8);
      const campos = result.content.split("|");

      expect(campos[13]).toBe("100.00");
      expect(campos[14]).toBe("18.00");
      expect(campos[19]).toBe("0.00");
      expect(campos[22]).toBe("118.00");
    });

    it("sin IGV en el comprobante la base va como no gravada, no como credito fiscal", async () => {
      const service = montarServicio("cuentas_por_pagar", [
        { ...facturaCompra, igv: 0, total: 100 },
      ]);

      const result = await service.exportarRegistroCompras(2026, 8);
      const campos = result.content.split("|");

      expect(campos[13]).toBe("0.00");
      expect(campos[14]).toBe("0.00");
      expect(campos[19]).toBe("100.00");
    });

    it("emite los 42 campos del Anexo 2, ni uno menos", async () => {
      const service = montarServicio("cuentas_por_pagar", [facturaCompra]);

      const result = await service.exportarRegistroCompras(2026, 8);
      const campos = result.content.split("|").slice(0, -1);

      expect(campos).toHaveLength(42);
    });

    it("usa el codigo de libro 080100 en el nombre del archivo", async () => {
      const service = montarServicio("cuentas_por_pagar", [facturaCompra]);

      const result = await service.exportarRegistroCompras(2026, 8);

      expect(result.filename).toBe("LE206160535752026080008010000111.TXT");
    });
  });

  describe("Balance de Comprobación 3.17", () => {
    const movimientos = [
      {
        codigo: "10.1",
        tipo: "ACTIVO",
        inicial_debe: 100,
        inicial_haber: 0,
        movimiento_debe: 50,
        movimiento_haber: 0,
        transferencia_debe: 0,
        transferencia_haber: 0,
      },
      {
        codigo: "70",
        tipo: "INGRESO",
        inicial_debe: 0,
        inicial_haber: 0,
        movimiento_debe: 0,
        movimiento_haber: 50,
        transferencia_debe: 0,
        transferencia_haber: 0,
      },
    ];

    it("usa el código oficial 031700 y el último día del período", async () => {
      const service = montarServicio("rpc-ple-317", movimientos);

      const result = await service.exportarBalanceComprobacion(2026, 8);

      expect(result.filename).toBe("LE206160535752026083103170000111.TXT");
      expect(result.content.split("\r\n")[0].split("|")[0]).toBe("20260831");
    });

    it("emite los 19 campos de SUNAT y separa balance de resultados", async () => {
      const service = montarServicio("rpc-ple-317", movimientos);

      const result = await service.exportarBalanceComprobacion(2026, 8);
      const [caja, ventas] = result.content
        .split("\r\n")
        .map((linea) => linea.split("|").slice(0, -1));

      expect(caja).toHaveLength(19);
      expect(caja[1]).toBe("101");
      expect(caja[2]).toBe("100.00");
      expect(caja[4]).toBe("50.00");
      expect(caja[12]).toBe("150.00");
      expect(caja[14]).toBe("0.00");

      expect(ventas).toHaveLength(19);
      expect(ventas[13]).toBe("0.00");
      expect(ventas[15]).toBe("50.00");
      expect(ventas[18]).toBe("1");
    });

    it('declara una nota de credito con importes negativos y referencia SUNAT', async () => {
      const service = montarServicio('cuentas_por_pagar', [{
        ...facturaCompra,
        numero_documento: 'FC01-00000009',
        tipo_documento: 'NOTA_CREDITO',
        fiscal_metadata: {
          documento_referencia_tipo: 'FACTURA',
          documento_referencia_serie: 'F001',
          documento_referencia_numero: '00000123',
          documento_referencia_fecha: '2026-07-31',
        },
      }]);

      const result = await service.exportarRegistroCompras(2026, 8);
      const campos = result.content.split('|');

      expect(campos[5]).toBe('07');
      expect(campos[13]).toBe('-100.00');
      expect(campos[14]).toBe('-18.00');
      expect(campos[22]).toBe('-118.00');
      expect(campos[25]).toBe('31/07/2026');
      expect(campos[26]).toBe('01');
      expect(campos[27]).toBe('F001');
      expect(campos[29]).toBe('00000123');
    });

    it('exige tipo de cambio para compras en moneda extranjera', async () => {
      const service = montarServicio('cuentas_por_pagar', [{
        ...facturaCompra,
        moneda: 'USD',
        fiscal_metadata: {},
      }]);

      await expect(service.exportarRegistroCompras(2026, 8)).rejects.toThrow(
        'Tipo de cambio requerido',
      );
    });

    it.each(['FACTURA', 'NOTA_CREDITO'])('exporta %s USD en soles con el cambio documental congelado', async tipo => {
      const service = montarServicio('cuentas_por_pagar', [{
        ...facturaCompra, tipo_documento: tipo, moneda: 'USD', subtotal: 10, igv: 1.8, total: 11.8,
        tipo_cambio_origen: 3.75, fiscal_metadata: { tipo_cambio: 3.75 },
        metadata: { tipo_cambio_liquidacion: 3.780001 },
      }]);
      const campos = (await service.exportarRegistroCompras(2026, 8)).content.split('|');
      const sign = tipo === 'NOTA_CREDITO' ? '-' : '';
      expect(campos[13]).toBe(sign + '37.50');expect(campos[14]).toBe(sign + '6.75');expect(campos[22]).toBe(sign + '44.25');
      expect(campos[23]).toBe('USD');expect(campos[24]).toBe('3.750');
    });
  });
});
