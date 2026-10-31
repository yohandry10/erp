import { ReportsController } from './reports.controller';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PassThrough } from 'stream';

const construirQuery = (resultado: any) => {
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    not: jest.fn(() => query),
    gte: jest.fn(() => query),
    lte: jest.fn(() => query),
    lt: jest.fn(() => query),
    range: jest.fn(() => query),
    order: jest.fn(() => query),
    then: (resolve: any, reject: any) =>
      Promise.resolve(typeof resultado === 'function' ? resultado() : resultado).then(resolve, reject),
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
    subtotal: 28.5,
    igv: 4.5,
    total: 33,
    total_gravadas: 25,
    total_exoneradas: 3.5,
    total_inafectas: 0,
    total_exportacion: 0,
    moneda: 'PEN',
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

  it('una base gravada cero no cae al subtotal de operaciones exoneradas', async () => {
    const { resumen }: any = await montar([{ ...boletaMixta, subtotal: 10, total_gravadas: 0,
      total_exoneradas: 10, igv: 0, total: 10 }]).reporteVentas('tenant-1', {});
    expect(resumen).toMatchObject({ subtotal: 0, exoneradas: 10, total: 10 });
  });

  it('conserva PEN y USD en grupos independientes y no devuelve total escalar mixto', async () => {
    const res: any = await montar([boletaMixta, { ...boletaMixta, id: 'usd', moneda: 'USD',
      total_gravadas: 10, total_exoneradas: 0, igv: 1.8, total: 11.8 }]).reporteVentas('tenant-1', {});
    expect(res.resumen).toBeNull();
    expect(res.resumenPorMoneda).toEqual([
      { moneda: 'PEN', subtotal: 25, exoneradas: 3.5, inafectas: 0, exportacion: 0, igv: 4.5, total: 33 },
      { moneda: 'USD', subtotal: 10, exoneradas: 0, inafectas: 0, exportacion: 0, igv: 1.8, total: 11.8 },
    ]);
  });

  it('limita al tenant, aplica estado y moneda e incluye todo el último día', async () => {
    const query = construirQuery({ data: [], error: null });
    const supabase: any = { getClient: () => ({ from: () => query }) };
    await new ReportsController(supabase).reporteVentas('tenant-1', {
      fechaInicio: '2026-10-01', fechaFin: '2026-10-08', estado: 'CONFIRMADO', moneda: 'USD',
    });
    expect(query.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(query.eq).toHaveBeenCalledWith('estado', 'CONFIRMADO');
    expect(query.eq).toHaveBeenCalledWith('moneda', 'USD');
    expect(query.gte).toHaveBeenCalledWith('fecha_emision', '2026-10-01T00:00:00.000Z');
    expect(query.lt).toHaveBeenCalledWith('fecha_emision', '2026-10-09T00:00:00.000Z');
  });

  it('filtra por razón social o documento canónico sin exigir aliases legacy', async () => {
    const rows = [{ ...boletaMixta, clientes: { nombre: null, numero_documento: null,
      razon_social: 'Comercial Perú SAC', documento_numero: '20601234567' } },
    { ...boletaMixta, id: 'otro', clientes: { nombre: 'Otro cliente', numero_documento: '12345678' } }];
    const byName: any = await montar(rows).reporteVentas('tenant-1', { cliente: ' PERÚ ' });
    const byDocument: any = await montar(rows).reporteVentas('tenant-1', { cliente: '20601234567' });
    expect(byName.total).toBe(1);
    expect(byName.data[0].clientes).toMatchObject({ nombre: 'Comercial Perú SAC', numero_documento: '20601234567' });
    expect(byDocument.data).toEqual(byName.data);
    expect(byName.resumen.total).toBe(33);
  });

  it('no trunca el resumen ni la exportación en el límite de 1000 filas', async () => {
    let page = 0;
    const row = { ...boletaMixta, total_gravadas: 0.1, total_exoneradas: 0, total: 0.1, igv: 0 };
    const query = construirQuery(() => ({ data: page++ === 0 ? Array.from({ length: 1000 }, (_, i) => ({ ...row, id: String(i) })) : [row], error: null }));
    const supabase: any = { getClient: () => ({ from: () => query }) };
    const res: any = await new ReportsController(supabase).reporteVentas('tenant-1', {});
    expect(res.total).toBe(1001);
    expect(res.resumen.total).toBe(100.1);
    expect(query.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it('una página fallida rechaza todo el reporte, sin publicar resultados parciales', async () => {
    let page = 0;
    const query = construirQuery(() => page++ === 0 ? { data: Array(1000).fill(boletaMixta), error: null }
      : { data: null, error: { message: 'unavailable' } });
    const supabase: any = { getClient: () => ({ from: () => query }) };
    await expect(new ReportsController(supabase).reporteVentas('tenant-1', {})).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([
    { fechaInicio: '2026-02-30' }, { fechaFin: '08/10/2026' },
    { fechaInicio: '2026-10-09', fechaFin: '2026-10-08' },
  ])('rechaza fechas inválidas o un rango invertido %j', async query => {
    await expect(montar([]).reporteVentas('tenant-1', query)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('Excel usa los mismos filtros y conserva serie, cliente y bases separadas', async () => {
    const query = construirQuery({ data: [{ ...boletaMixta, serie: 'B001', clientes: {
      razon_social: 'Comercial, Perú SAC', documento_numero: '20601234567' } }], error: null });
    const supabase: any = { getClient: () => ({ from: () => query }) };
    const response: any = new PassThrough();
    response.setHeader = jest.fn();
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    await new ReportsController(supabase).exportVentasExcel('tenant-1', { estado: 'EMITIDO', cliente: 'Perú' }, response);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.concat(chunks) as any);
    const sheet = workbook.getWorksheet(1)!;
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(2).getCell(2).value).toBe('BOLETA B001-00000001');
    expect(sheet.getRow(2).getCell(3).value).toBe('Comercial, Perú SAC');
    expect(sheet.getRow(2).getCell(6).value).toBe(25);
    expect(query.eq).toHaveBeenCalledWith('estado', 'EMITIDO');
  });

  it('Excel informa 503 al fallar la lectura, no un archivo vacío', async () => {
    const query = construirQuery({ data: null, error: { message: 'unavailable' } });
    const supabase: any = { getClient: () => ({ from: () => query }) };
    const response: any = { status: jest.fn(() => response), json: jest.fn() };
    await new ReportsController(supabase).exportVentasExcel('tenant-1', {}, response);
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({ success: false, message: 'No se pudo exportar el reporte de ventas' });
  });
});
