import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ComercialVentasService } from './comercial-ventas.service';

function build(rpcImpl: (name: string, args: any) => any = () => ({ data: {}, error: null })) {
  const rpc = jest.fn(async (name: string, args: any) => rpcImpl(name, args));
  const service = new ComercialVentasService({ getClient: () => ({ rpc }) } as any);
  return { service, rpc };
}

describe('ComercialVentasService 469', () => {
  it('expone vendedores canónicos y conserva identidades legacy sin duplicarlas', async () => {
    const rows: Record<string, any[]> = {
      productos: [],
      clientes: [],
      usuarios_sistema: [
        { id: 'same', nombre: 'Canónico', email: 'canonico@local', activo: true },
        { id: 'canonical-only', nombre: 'Ana', email: 'ana@local', activo: true },
      ],
      usuarios: [
        { id: 'same', nombre: 'Legacy obsoleto', email: 'legacy@local', activo: true },
        { id: 'legacy-only', nombre: 'Zeta', email: 'zeta@local', activo: true },
      ],
    };
    const from = jest.fn((table: string) => {
      const query: any = {
        select: jest.fn(() => query),
        eq: jest.fn(() => query),
        order: jest.fn(() => query),
        then: (resolve: (value: any) => void) => resolve({ data: rows[table], error: null }),
      };
      return query;
    });
    const service = new ComercialVentasService({ getClient: () => ({ from }) } as any);

    const result = await service.catalogos('tenant-1');

    expect(from).toHaveBeenCalledWith('usuarios_sistema');
    expect(from).toHaveBeenCalledWith('usuarios');
    expect(result.vendedores).toHaveLength(3);
    expect(result.vendedores.find((row: any) => row.id === 'same')?.nombre).toBe('Canónico');
  });

  it('exige idempotencia antes de registrar configuración comercial', async () => {
    const { service, rpc } = build();
    await expect(service.crearReglaComision(
      'tenant-1',
      'actor-1',
      {
        codigo: 'COM-1', nombre: 'Comisión uno', porcentaje: 5,
        vigencia_desde: '2026-01-01',
      },
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rechaza líneas de precio ambiguas con producto y marca', async () => {
    const { service, rpc } = build();
    await expect(service.crearListaPrecios(
      'tenant-1',
      'actor-1',
      {
        codigo: 'LP-1', nombre: 'Lista uno', moneda: 'PEN', vigencia_desde: '2026-01-01',
        detalles: [{
          producto_id: '4e9b26b1-1607-4f8a-9d28-5f292b8fae2c',
          marca: 'Marca', cantidad_minima: 1, precio_unitario: 10,
        }],
      },
      'price-list-key-1',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('resuelve precios con tenant, vendedor efectivo y moneda explícitos', async () => {
    const { service, rpc } = build(() => ({ data: [{ precio_unitario: 70 }], error: null }));
    const result = await service.resolverPrecios('tenant-1', 'actor-1', {
      cliente_id: '0f49e122-6e69-4c92-838a-cd04be11160c',
      moneda: 'pen',
      detalle: [{
        producto_id: '4e9b26b1-1607-4f8a-9d28-5f292b8fae2c', cantidad: 2,
      }],
    });
    expect(result).toEqual([{ precio_unitario: 70 }]);
    expect(rpc).toHaveBeenCalledWith('resolver_precios_venta_tx', expect.objectContaining({
      p_tenant_id: 'tenant-1', p_vendedor_id: 'actor-1', p_moneda: 'PEN',
    }));
  });

  it('rechaza una venta repetida en el bloque antes de invocar SQL', async () => {
    const { service, rpc } = build();
    const source = { tipo: 'POS' as const, id: '4e9b26b1-1607-4f8a-9d28-5f292b8fae2c' };
    await expect(service.crearConsolidado(
      'tenant-1', 'actor-1', { fuentes: [source, source] }, 'batch-key-469',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['23505', ConflictException],
    ['42501', ForbiddenException],
  ])('mapea SQLSTATE %s sin ocultar el conflicto', async (code, expected) => {
    const { service } = build(() => ({ data: null, error: { code, message: 'fallo controlado' } }));
    await expect(service.crearConsolidado(
      'tenant-1',
      'actor-1',
      { fuentes: [{ tipo: 'POS', id: '4e9b26b1-1607-4f8a-9d28-5f292b8fae2c' }] },
      'batch-key-469',
    )).rejects.toBeInstanceOf(expected as any);
  });
});
