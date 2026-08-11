import { CotizacionesCompraRepository } from './cotizaciones-compra.repository';

describe('CotizacionesCompraRepository de solo lectura', () => {
  it('filtra cabecera y detalles por tenant', async () => {
    const filters: Array<[string, string]> = [];
    const client = {
      from: jest.fn((table: string) => {
        if (table === 'cotizaciones_compra') {
          const header: any = {
            select: () => header,
            eq: (field: string, value: string) => {
              filters.push([field, value]);
              return header;
            },
            single: async () => ({ data: { id: 'quote-1' }, error: null }),
          };
          return header;
        }
        const details: any = {
          select: () => details,
          eq: (field: string, value: string) => {
            filters.push([field, value]);
            return details;
          },
          then: (resolve: (value: unknown) => void) =>
            resolve({ data: [], error: null }),
        };
        return details;
      }),
    };
    const repository = new CotizacionesCompraRepository({ getClient: () => client } as any);

    await repository.findById('quote-1', 'tenant-1');

    expect(filters).toEqual([
      ['id', 'quote-1'],
      ['tenant_id', 'tenant-1'],
      ['cotizacion_id', 'quote-1'],
      ['tenant_id', 'tenant-1'],
    ]);
  });

  it('devuelve null cuando la cabecera no existe', async () => {
    const query: any = {
      select: () => query,
      eq: () => query,
      single: async () => ({ data: null, error: { message: 'not found' } }),
    };
    const repository = new CotizacionesCompraRepository({
      getClient: () => ({ from: () => query }),
    } as any);

    await expect(repository.findById('missing', 'tenant-1')).resolves.toBeNull();
  });
});
