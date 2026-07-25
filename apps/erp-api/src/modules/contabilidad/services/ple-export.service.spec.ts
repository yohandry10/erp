import { PleExportService } from './ple-export.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';

const createQuery = (result: any) => {
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
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
});
