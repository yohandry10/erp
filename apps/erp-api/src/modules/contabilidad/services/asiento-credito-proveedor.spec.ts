import { AsientosGeneratorService } from './asientos-generator.service';

describe('Crédito proveedor: distribución financiera y valor en libros', () => {
  let service: AsientosGeneratorService;
  let write: jest.SpyInstance;
  let accounts: Map<string, any>;
  const base = {
    tenantId: 'tenant-1', eventId: 'event-570', fecha: '2026-10-07', numeroDocumento: 'FC02-10',
    cuentaProveedorId: 'pc-42', cuentaCreditoId: 'pc-422', cuentaAjusteId: 'pc-63', cuentaIgvId: 'pc-40',
    cuentaAjusteCodigo: '63', tipoCambio: 1,
  };

  beforeEach(() => {
    accounts = new Map(['42', '421', '422', '63', '40', '776', '676'].map((code) => [
      code, { id: `pc-${code}`, codigo: code, acepta_movimiento: true },
    ]));
    service = new AsientosGeneratorService({ getClient: jest.fn() } as any, {} as any, {
      obtenerCuentasPorCodigos: jest.fn(async () => accounts),
    } as any);
    write = jest.spyOn(service, 'generarAsiento').mockResolvedValue({ id: 'asiento-570' } as any);
  });

  const lines = () => write.mock.calls[0][3] as any[];
  const assertBalanced = () => {
    expect(lines().reduce((sum, item) => sum + item.debe - item.haber, 0)).toBeCloseTo(0, 2);
    expect(write.mock.calls[0][0]).toBe('tenant-1');
    expect(write.mock.calls[0][5]).toBe('event-570');
  };

  it('divide una NC entre deuda restante y crédito sin asiento de inventario implícito', async () => {
    await service.generarAsientoCreditoProveedor({ ...base, tipoEvento: 'nota_credito.proveedor.registrada',
      subtotal: 200, igv: 36, total: 236, deudaReducida: 100, creditoCreado: 136 });
    expect(lines()).toEqual([
      expect.objectContaining({ cuenta_id: 'pc-42', debe: 100, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'pc-422', debe: 136, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'pc-63', debe: 0, haber: 200 }),
      expect.objectContaining({ cuenta_id: 'pc-40', debe: 0, haber: 36 }),
    ]);
    assertBalanced();
  });

  const note607 = {
    ...base, tipoEvento: 'nota_credito.proveedor.registrada', tipoCambio: 3.8,
    subtotal: .01, igv: 0, total: .01, deudaReducida: 0, creditoCreado: .01,
    noteValuationVersion: 607, monedaLocal: 'PEN', subtotalLocal: .03, igvLocal: 0,
    totalLocal: .03, deudaReducidaLocal: 0, creditoCreadoLocal: .03,
  };

  it('D39 contabiliza el céntimo asignado desde el origen sin reconvertir la nota', async () => {
    await service.generarAsientoCreditoProveedor(note607);
    expect(lines()).toEqual([
      expect.objectContaining({ cuenta_id: 'pc-422', debe: .03, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'pc-63', debe: 0, haber: .03 }),
    ]);
    assertBalanced();
  });

  it.each([
    { subtotalLocal: undefined }, { creditoCreadoLocal: .04 }, { igvLocal: -.01 },
    { totalLocal: .035 }, { deudaReducidaLocal: Infinity }, { noteValuationVersion: 999 },
    { monedaLocal: undefined }, { subtotalLocal: '0.03' },
    { creditoCreado: .02 }, { subtotal: .015 },
  ])('rechaza NC607 con snapshot incompleto o alterado: %j', async change => {
    await expect(service.generarAsientoCreditoProveedor({ ...note607, ...change })).rejects.toThrow('Snapshot');
    expect(write).not.toHaveBeenCalled();
  });

  it.each([[3.9, 'pc-776', 0, 10], [3.7, 'pc-676', 10, 0]])(
    'aplica crédito con TC original 3.8 y factura TC %s, contabilizando sólo su diferencia',
    async (targetRate, fxAccount, debit, credit) => {
      await service.generarAsientoCreditoProveedor({ ...base, tipoEvento: 'credito.proveedor.aplicado',
        monto: 100, tipoCambio: 3.8, tipoCambioFactura: targetRate });
      expect(lines()).toEqual(expect.arrayContaining([
        expect.objectContaining({ cuenta_id: 'pc-422', debe: 0, haber: 380 }),
        expect.objectContaining({ cuenta_id: fxAccount, debe: debit, haber: credit }),
      ]));
      assertBalanced();
    },
  );

  it('D38 conserva el último céntimo del crédito y la CxP según el snapshot606', async () => {
    await service.generarAsientoCreditoProveedor({ ...base, tipoEvento: 'credito.proveedor.aplicado',
      monto: .01, tipoCambioCredito: 3.8, tipoCambioFactura: 3.8, creditValuationVersion: 606,
      montoCreditoLocal: .03, montoDestinoLocal: .03 });
    expect(lines()).toEqual([
      expect.objectContaining({ cuenta_id: 'pc-42', debe: .03, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'pc-422', debe: 0, haber: .03 }),
    ]);
    assertBalanced();
  });

  it('D38 ajusta liquidación0.04 contra el último valor0.03 reembolsado', async () => {
    await service.generarAsientoCreditoProveedor({ ...base, tipoEvento: 'credito.proveedor.reembolsado',
      monto: .01, tipoCambioCredito: 3.8, tipoCambioLiquidacion: 3.8, creditValuationVersion: 606,
      montoCreditoLocal: .03, montoDestinoLocal: .04 });
    expect(lines()).toEqual([
      expect.objectContaining({ cuenta_id: 'pc-422', debe: .01, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'pc-776', debe: 0, haber: .01 }),
    ]);
    assertBalanced();
  });

  it.each([undefined, -.01, Infinity, .005])('rechaza snapshot606 incompleto o inválido: %s', async value => {
    await expect(service.generarAsientoCreditoProveedor({ ...base, tipoEvento: 'credito.proveedor.aplicado',
      monto: .01, creditValuationVersion: 606, montoCreditoLocal: value, montoDestinoLocal: .03 }))
      .rejects.toThrow('Snapshot');
    expect(write).not.toHaveBeenCalled();
  });

  it('reembolso sin diferencia deja banco/422 exclusivamente al evento bancario existente', async () => {
    expect(await service.generarAsientoCreditoProveedor({ ...base, tipoEvento: 'credito.proveedor.reembolsado',
      monto: 118, tipoCambioLiquidacion: 1 })).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });

  it('reembolso con diferencia ajusta 422 y ganancia, sin duplicar movimiento bancario', async () => {
    await service.generarAsientoCreditoProveedor({ ...base, tipoEvento: 'credito.proveedor.reembolsado',
      monto: 100, tipoCambio: 3.8, tipoCambioLiquidacion: 3.9 });
    expect(lines()).toEqual([
      expect.objectContaining({ cuenta_id: 'pc-422', debe: 10, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'pc-776', debe: 0, haber: 10 }),
    ]);
    assertBalanced();
  });

  it('rechaza distribución que crearía crédito ficticio', async () => {
    await expect(service.generarAsientoCreditoProveedor({ ...base, tipoEvento: 'nota_credito.proveedor.registrada',
      subtotal: 200, igv: 36, total: 236, deudaReducida: 100, creditoCreado: 137 }))
      .rejects.toThrow('distribución financiera inconsistente');
    expect(write).not.toHaveBeenCalled();
  });

  it('rechaza cuentas sustituidas después del snapshot del evento', async () => {
    accounts.set('422', { id: 'otra-cuenta', acepta_movimiento: true });
    await expect(service.generarAsientoCreditoProveedor({ ...base, tipoEvento: 'credito.proveedor.aplicado', monto: 100 }))
      .rejects.toThrow('identidad contable');
    expect(write).not.toHaveBeenCalled();
  });

  it('revierte sólo la reclasificación pendiente 421 contra 42, con identidad congelada', async () => {
    await service.generarAsientoReversaDetraccionProveedor({ ...base, monto: 118, cuentaDetraccionId: 'pc-421' });
    expect(lines()).toEqual([
      expect.objectContaining({ cuenta_id: 'pc-421', debe: 118, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'pc-42', debe: 0, haber: 118 }),
    ]);
    assertBalanced();
  });
});
