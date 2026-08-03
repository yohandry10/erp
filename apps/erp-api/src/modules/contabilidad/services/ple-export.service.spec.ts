import { PleExportService } from './ple-export.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';

const createQuery = (result: any) => {
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    gte: jest.fn(() => query),
    lte: jest.fn(() => query),
    order: jest.fn(() => query),
    single: jest.fn(async () => result),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
};

describe('PleExportService', () => {
  it('exporta Libro Diario con fechas y correlativo SUNAT PLE', async () => {
    const asientos = [
      {
        id: 'asiento-1',
        numero_asiento: 7,
        fecha: '2024-10-05T15:30:00Z',
        concepto: 'Venta POS',
        referencia: 'B001-1',
        detalle_asientos: [
          {
            id: 'detalle-1',
            cuenta_id: 'cuenta-12',
            debe: 118,
            haber: 0,
            concepto: 'Cliente',
            plan_cuentas: { codigo: '12', nombre: 'Clientes' },
          },
        ],
      },
    ];

    const supabase = {
      getClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'empresa_config') {
            return createQuery({ data: { ruc: '20616053575', razon_social: 'NEXTELCO' }, error: null });
          }
          if (table === 'asientos_contables') {
            return createQuery({ data: asientos, error: null });
          }
          return createQuery({ data: [], error: null });
        }),
      })),
    } as unknown as SupabaseService;
    const tenantContext = {
      getTenantId: jest.fn(() => 'tenant-1'),
    } as unknown as TenantContextService;

    const service = new PleExportService(supabase, tenantContext);

    const result = await service.exportarLibroDiario(2024, 10);
    const fields = result.content.split('|');

    expect(result.filename).toBe('LE206160535752024100005010000111.TXT');
    expect(fields[0]).toBe('20241000');
    expect(fields[1]).toBe('M00000007');
    expect(fields[2]).toBe('M000001');
    expect(fields[12]).toBe('05/10/2024');
    expect(fields[14]).toBe('05/10/2024');
  });

  const montarServicio = (tabla: string, filas: any[]) => {
    const supabase = {
      getClient: jest.fn(() => ({
        from: jest.fn((nombre: string) => {
          if (nombre === 'empresa_config') {
            return createQuery({ data: { ruc: '20616053575', pais: 'PE' }, error: null });
          }
          if (nombre === tabla) {
            return createQuery({ data: filas, error: null });
          }
          return createQuery({ data: [], error: null });
        }),
      })),
    } as unknown as SupabaseService;
    const tenantContext = {
      getTenantId: jest.fn(() => 'tenant-1'),
    } as unknown as TenantContextService;
    return new PleExportService(supabase, tenantContext);
  };

  describe('Registro de Ventas 14.1', () => {
    // Boleta mixta: S/ 25.00 gravados, S/ 3.50 exonerados, IGV solo sobre la
    // base gravada. Es el caso que obliga a separar las bases.
    const boletaMixta = {
      id: 'doc-1',
      serie: 'B001',
      numero: '00000001',
      tipo_documento: 'BOLETA',
      fecha_emision: '2026-08-02T00:00:00+00:00',
      fecha_vencimiento: null,
      moneda: 'PEN',
      tipo_cambio: 1,
      estado: 'EMITIDO',
      subtotal: 25,
      impuesto_igv: 4.5,
      total: 33,
      total_gravadas: 25,
      total_exoneradas: 3.5,
      total_inafectas: 0,
      total_exportacion: 0,
      receptor_tipo_doc: 'DNI',
      receptor_numero_doc: '44556677',
      receptor_razon_social: 'CLIENTE GENERAL',
    };

    it('declara cada base en su casilla y no las suma', async () => {
      const service = montarServicio('documentos', [boletaMixta]);

      const result = await service.exportarRegistroVentas(2026, 8);
      const campos = result.content.split('|');

      expect(campos[0]).toBe('20260800');
      expect(campos[3]).toBe('02/08/2026');
      expect(campos[5]).toBe('03');
      expect(campos[6]).toBe('B001');
      expect(campos[8]).toBe('00000001');
      expect(campos[13]).toBe('0.00');
      expect(campos[14]).toBe('25.00');
      expect(campos[16]).toBe('4.50');
      expect(campos[18]).toBe('3.50');
      expect(campos[19]).toBe('0.00');
      expect(campos[24]).toBe('33.00');
    });

    it('usa el codigo de libro 140100 en el nombre del archivo', async () => {
      const service = montarServicio('documentos', [boletaMixta]);

      const result = await service.exportarRegistroVentas(2026, 8);

      expect(result.filename).toBe('LE206160535752026080014010000111.TXT');
    });

    it('marca como anulado el comprobante dado de baja', async () => {
      const service = montarServicio('documentos', [
        { ...boletaMixta, estado: 'ANULADO' },
      ]);

      const result = await service.exportarRegistroVentas(2026, 8);
      const campos = result.content.split('|');

      expect(campos[35]).toBe('2');
    });

    it('reconoce el RUC como documento tipo 6 aunque el registro diga otra cosa', async () => {
      const service = montarServicio('documentos', [
        { ...boletaMixta, receptor_tipo_doc: 'DNI', receptor_numero_doc: '20512345671' },
      ]);

      const result = await service.exportarRegistroVentas(2026, 8);
      const campos = result.content.split('|');

      expect(campos[10]).toBe('6');
      expect(campos[11]).toBe('20512345671');
    });
  });

  describe('Registro de Compras 8.1', () => {
    const facturaCompra = {
      id: 'cxp-1',
      numero_documento: 'F001-00000123',
      tipo_documento: 'FACTURA',
      fecha_emision: '2026-08-01',
      fecha_vencimiento: '2026-08-31',
      subtotal: 100,
      igv: 18,
      total: 118,
      moneda: 'PEN',
      estado: 'PENDIENTE',
      proveedores: {
        ruc: '20512345671',
        numero_documento: '20512345671',
        razon_social: 'DISTRIBUIDORA ANDINA S.A.C.',
        tipo_documento: 'RUC',
      },
    };

    it('separa serie y numero del comprobante del proveedor', async () => {
      const service = montarServicio('cuentas_por_pagar', [facturaCompra]);

      const result = await service.exportarRegistroCompras(2026, 8);
      const campos = result.content.split('|');

      expect(campos[5]).toBe('01');
      expect(campos[6]).toBe('F001');
      expect(campos[8]).toBe('00000123');
      expect(campos[10]).toBe('6');
      expect(campos[11]).toBe('20512345671');
    });

    it('lleva la base a la casilla gravada cuando el comprobante trae IGV', async () => {
      const service = montarServicio('cuentas_por_pagar', [facturaCompra]);

      const result = await service.exportarRegistroCompras(2026, 8);
      const campos = result.content.split('|');

      expect(campos[13]).toBe('100.00');
      expect(campos[14]).toBe('18.00');
      expect(campos[20]).toBe('0.00');
      expect(campos[23]).toBe('118.00');
    });

    it('sin IGV en el comprobante la base va como no gravada, no como credito fiscal', async () => {
      const service = montarServicio('cuentas_por_pagar', [
        { ...facturaCompra, igv: 0, total: 100 },
      ]);

      const result = await service.exportarRegistroCompras(2026, 8);
      const campos = result.content.split('|');

      expect(campos[13]).toBe('0.00');
      expect(campos[14]).toBe('0.00');
      expect(campos[20]).toBe('100.00');
    });

    it('usa el codigo de libro 080100 en el nombre del archivo', async () => {
      const service = montarServicio('cuentas_por_pagar', [facturaCompra]);

      const result = await service.exportarRegistroCompras(2026, 8);

      expect(result.filename).toBe('LE206160535752026080008010000111.TXT');
    });
  });
});
