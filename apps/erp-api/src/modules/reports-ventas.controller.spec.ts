import { ReportsController } from './reports.controller';
import { SupabaseService } from '../shared/supabase/supabase.service';

const construirQuery = (resultado: any) => {
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    not: jest.fn(() => query),
    gte: jest.fn(() => query),
    lte: jest.fn(() => query),
    order: jest.fn(() => query),
    then: (resolve: any, reject: any) =>
      Promise.resolve(resultado).then(resolve, reject),
  };
  return query;
};

const montar = (documentos: any[]) => {
  const supabase = {
    getClient: jest.fn(() => ({
      from: jest.fn(() => construirQuery({ data: documentos, error: null })),
    })),
  } as unknown as SupabaseService;
  return new ReportsController(supabase);
};

/**
 * El resumen de ventas no tenia prueba. Su trabajo es que las tres cifras que ve
 * el usuario cuadren con el total: mientras las bases exoneradas no se sumaban
 * aparte, subtotal + IGV se quedaba corto y no habia forma de saber por que.
 */
describe('ReportsController · resumen de ventas', () => {
  // Boleta mixta: 25.00 gravados + 3.50 exonerados + 4.50 de IGV = 33.00.
  const boletaMixta = {
    id: 'doc-1',
    fecha: '2026-08-02',
    estado: 'EMITIDO',
    numero_documento: '00000001',
    tipo_documento: 'BOLETA',
    subtotal: 25,
    igv: 4.5,
    total: 33,
    total_gravadas: 25,
    total_exoneradas: 3.5,
    total_inafectas: 0,
    total_exportacion: 0,
  };

  it('suma las bases no gravadas aparte, sin mezclarlas con la imponible', async () => {
    const controller = montar([boletaMixta]);

    const res: any = await controller.reporteVentas('tenant-1', {});

    expect(res.resumen.subtotal).toBe(25);
    expect(res.resumen.igv).toBe(4.5);
    expect(res.resumen.exoneradas).toBe(3.5);
    expect(res.resumen.inafectas).toBe(0);
    expect(res.resumen.total).toBe(33);
  });

  it('el resumen cuadra: base + no gravadas + IGV = total', async () => {
    const controller = montar([boletaMixta]);

    const { resumen }: any = await controller.reporteVentas('tenant-1', {});
    const suma =
      resumen.subtotal +
      resumen.exoneradas +
      resumen.inafectas +
      resumen.exportacion +
      resumen.igv;

    expect(suma).toBeCloseTo(resumen.total, 2);
  });

  it('acumula varios comprobantes sin arrastrar error de coma flotante', async () => {
    // 0.1 + 0.2 en binario no da 0.3; por eso el acumulado usa Decimal.
    const controller = montar([
      { ...boletaMixta, subtotal: 0.1, igv: 0, total: 0.1, total_gravadas: 0.1, total_exoneradas: 0 },
      { ...boletaMixta, subtotal: 0.2, igv: 0, total: 0.2, total_gravadas: 0.2, total_exoneradas: 0 },
    ]);

    const { resumen }: any = await controller.reporteVentas('tenant-1', {});

    expect(resumen.subtotal).toBe(0.3);
    expect(resumen.total).toBe(0.3);
  });

  it('sin comprobantes devuelve ceros, no undefined', async () => {
    const controller = montar([]);

    const res: any = await controller.reporteVentas('tenant-1', {});

    expect(res.total).toBe(0);
    expect(res.resumen).toEqual({
      subtotal: 0,
      igv: 0,
      total: 0,
      exoneradas: 0,
      inafectas: 0,
      exportacion: 0,
    });
  });

  it('trata como cero el comprobante antiguo sin bases por afectacion', async () => {
    // Documentos anteriores al backfill no traen las columnas nuevas.
    const controller = montar([
      { id: 'viejo', fecha: '2026-08-02', subtotal: 100, igv: 18, total: 118 },
    ]);

    const { resumen }: any = await controller.reporteVentas('tenant-1', {});

    expect(resumen.subtotal).toBe(100);
    expect(resumen.exoneradas).toBe(0);
    expect(resumen.total).toBe(118);
  });
});
