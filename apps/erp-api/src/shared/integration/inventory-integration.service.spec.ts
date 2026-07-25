import { BadRequestException } from '@nestjs/common';
import { InventoryIntegrationService } from './inventory-integration.service';

function query(result: any) {
  const builder: any = {
    select: jest.fn(() => builder),
    update: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    single: jest.fn(async () => result),
    maybeSingle: jest.fn(async () => result),
  };
  return builder;
}

function clientFromSequence(buildersByTable: Record<string, any[]>) {
  return {
    from: jest.fn((table: string) => {
      const next = buildersByTable[table]?.shift();
      if (!next) {
        throw new Error(`No query builder configured for ${table}`);
      }
      return next;
    }),
  };
}

describe('InventoryIntegrationService', () => {
  const tenantId = 'tenant-qa';
  const producto = {
    id: 'producto-1',
    codigo: 'QA-PROD-READY-INV',
    nombre: 'QA-PROD-READY producto inventario',
    precio: 10,
    stock_actual: 2,
    categoria: 'QA',
    activo: true,
    tenant_id: tenantId,
  };

  function buildService(client: any) {
    return new InventoryIntegrationService(
      { getClient: () => client } as any,
      { emitMovimientoStock: jest.fn(), onVentaProcessed: jest.fn(), onCompraEntregada: jest.fn() } as any,
      { getTenantId: () => tenantId } as any,
    );
  }

  it('rechaza una salida que excede el stock disponible', async () => {
    const client = clientFromSequence({
      productos: [query({ data: producto, error: null })],
    });
    const service = buildService(client);

    await expect(
      service.realizarMovimientoStock(
        {
          productoId: producto.id,
          tipoMovimiento: 'SALIDA',
          cantidad: 3,
          stockAnterior: 0,
          stockNuevo: 0,
          motivo: 'QA-PROD-READY salida inválida',
          precioUnitario: 10,
          valorTotal: 30,
          usuarioId: 'qa',
        },
        tenantId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza un almacén inválido cuando el movimiento lo declara', async () => {
    const client = clientFromSequence({
      productos: [query({ data: producto, error: null })],
      almacenes: [query({ data: null, error: null })],
    });
    const service = buildService(client);

    await expect(
      service.realizarMovimientoStock(
        {
          productoId: producto.id,
          tipoMovimiento: 'SALIDA',
          cantidad: 1,
          stockAnterior: 0,
          stockNuevo: 0,
          motivo: 'QA-PROD-READY almacén inválido',
          precioUnitario: 10,
          valorTotal: 10,
          usuarioId: 'qa',
          almacenId: '00000000-0000-4000-8000-000000000001',
        },
        tenantId,
      ),
    ).rejects.toThrow('Almacén inválido o inactivo');
  });

  it('retorna el movimiento existente sin descontar stock cuando llega un duplicado con la misma referencia', async () => {
    const client = clientFromSequence({
      productos: [query({ data: producto, error: null })],
      almacenes: [query({ data: { id: '00000000-0000-4000-8000-000000000001', activo: true }, error: null })],
      stock_movimientos: [query({ data: { id: 'mov-existente' }, error: null })],
    });
    const service = buildService(client);

    await expect(
      service.realizarMovimientoStock(
        {
          productoId: producto.id,
          tipoMovimiento: 'SALIDA',
          cantidad: 1,
          stockAnterior: 0,
          stockNuevo: 0,
          motivo: 'QA-PROD-READY duplicado',
          precioUnitario: 10,
          valorTotal: 10,
          usuarioId: 'qa',
          referencia: 'QA-PROD-READY-DUP-001',
          almacenId: '00000000-0000-4000-8000-000000000001',
        },
        tenantId,
      ),
    ).resolves.toBe('mov-existente');

    expect(client.from).toHaveBeenCalledTimes(3);
  });
});
