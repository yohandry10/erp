import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PERMISSION_KEY } from '../../../common/decorators/require-permission.decorator';
import { MigrationController } from '../migration.controller';
import { MigrationService } from '../migration.service';
import { parseCsv } from '../util/csv-parser.util';
import { filasEnsayoStock, StockInicialImporter } from './stock-inicial.importer';
import {
  construirLoteFox,
  ContratosSuministroImporter,
  CronogramaSuministroImporter,
  OcSuministroImporter,
} from './suministro-fox.importer';

const TENANT = '58000000-0000-4000-8000-000000000001';
const ACTOR = '58000000-0000-4000-8000-000000000002';
const RUN = '58000000-0000-4000-8000-000000000003';
const ALMACEN = '58000000-0000-4000-8000-000000000004';
const SUCURSAL = '58000000-0000-4000-8000-000000000005';

const CONTRATOS = [
  'id_origen_contrato,numero,cliente_codigo,asunto,moneda,vigencia_desde,vigencia_hasta,id_origen_linea,producto_codigo,cantidad_original,cantidad_ejecutada,precio_unitario,estado',
  'C-100,LP-12,CLI-45,Suministro anual,PEN,2026-01-01,2026-12-31,1,MED-001,1000,600,12.50,VIGENTE',
  'C-100,LP-12,CLI-45,Suministro anual,PEN,2026-01-01,2026-12-31,2,MED-002,300,300,8.00,VIGENTE',
  'C-200,LP-13,CLI-46,Otro,PEN,2026-01-01,2026-12-31,1,MED-003,10,0,5,VIGENTE',
].join('\n');

function servicios(rpc: jest.Mock) {
  const recordRow = jest.fn().mockResolvedValue(undefined);
  const supabase = { getClient: () => ({ rpc }) } as any;
  return { supabase, runs: { recordRow } as any, recordRow };
}

describe('construirLoteFox', () => {
  it('agrupa las líneas de cada contrato y arma el saldo abierto de origen', () => {
    const { registros, errores } = construirLoteFox('CONTRATO', parseCsv(CONTRATOS));
    expect(errores).toEqual([]);
    expect(registros.map((r) => [r.id_origen, r.fila, r.filas])).toEqual([['C-100', 2, [2, 3]], ['C-200', 4, [4]]]);
    expect(registros[0].payload).toEqual({
      numero: 'LP-12', cliente_codigo: 'CLI-45', asunto: 'Suministro anual', moneda: 'PEN',
      vigencia_desde: '2026-01-01', vigencia_hasta: '2026-12-31', estado: 'VIGENTE',
      lineas: [
        { id_origen: '1', producto_codigo: 'MED-001', cantidad_original: 1000, cantidad_ejecutada: 600, precio_unitario: 12.5 },
        { id_origen: '2', producto_codigo: 'MED-002', cantidad_original: 300, cantidad_ejecutada: 300, precio_unitario: 8 },
      ],
    });
  });

  it.each([
    ['cabecera distinta en el mismo contrato', CONTRATOS.replace('LP-12,CLI-45,Suministro anual,PEN,2026-01-01,2026-12-31,2', 'LP-99,CLI-45,Suministro anual,PEN,2026-01-01,2026-12-31,2'), 'numero difiere de la fila 2'],
    ['cantidad con coma', CONTRATOS.replace('1000,600', '"1000,5",600'), 'cantidad_original debe ser un número'],
    ['fecha imposible', CONTRATOS.replace('2026-01-01,2026-12-31,1,MED-003', '2026-02-30,2026-12-31,1,MED-003'), 'vigencia_desde debe ser AAAA-MM-DD'],
    ['moneda desconocida', CONTRATOS.replace('Otro,PEN', 'Otro,BOB'), 'moneda inválida'],
    ['id con almohadilla', CONTRATOS.replace('C-200', 'C#200').replace('C-200', 'C#200'), 'sin "#"'],
  ])('rechaza %s en la fila correcta sin perder el resto', (_, csv, mensaje) => {
    const { registros, errores } = construirLoteFox('CONTRATO', parseCsv(csv));
    expect(errores.some((e) => e.message.includes(mensaje))).toBe(true);
    // El contrato con error queda fuera completo; el otro sigue.
    expect(registros.length).toBe(1);
  });

  it('exige las columnas y no admite entregas repetidas', () => {
    expect(construirLoteFox('OC', parseCsv('id_origen_oc,numero\nOC-1,X')).errores[0]).toMatchObject({ rowIndex: 1 });
    const csv = 'id_origen_entrega,id_origen_oc,id_origen_linea_oc,fecha_programada,cantidad,destino\nE-1,OC-9,1,2026-11-10,120,Hospital\nE-1,OC-9,1,2026-11-12,10,Hospital';
    const { registros, errores } = construirLoteFox('ENTREGA', parseCsv(csv));
    expect(errores).toEqual([expect.objectContaining({ rowIndex: 3, message: 'id_origen_entrega repetido' })]);
    expect(registros).toEqual([]);
  });

  it('las plantillas traen las columnas que el lote exige', () => {
    for (const I of [ContratosSuministroImporter, OcSuministroImporter, CronogramaSuministroImporter]) {
      const imp = new I({} as any, {} as any);
      const { content } = imp.getTemplate();
      const parsed = parseCsv(content);
      expect(imp.requiredHeaders.every((h) => parsed.headers.includes(h))).toBe(true);
      expect(imp.validate(parsed)).toEqual([]);
    }
  });
});

describe('Importadores FOX contra la base', () => {
  it('importa cada contrato una vez, registra sus filas y distingue el reintento', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: { id: 'erp-1', action: 'CREATED' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'erp-2', action: 'IDEMPOTENT' }, error: null });
    const { supabase, runs, recordRow } = servicios(rpc);
    const result = await new ContratosSuministroImporter(supabase, runs).run(parseCsv(CONTRATOS), {
      tenantId: TENANT, startedBy: ACTOR, dryRun: false, runCtx: { runId: RUN, tenantId: TENANT, runType: 'contratos_suministro' },
    });
    expect(rpc).toHaveBeenNthCalledWith(1, 'importar_suministro_fox_580', expect.objectContaining({
      p_tenant_id: TENANT, p_actor_id: ACTOR, p_run_id: RUN, p_entidad: 'CONTRATO', p_id_origen: 'C-100',
    }));
    expect(result).toMatchObject({ okRows: 2, skippedRows: 1, errorRows: 0, created: 1 });
    expect(recordRow.mock.calls.map((c) => [c[0].rowIndex, c[0].status, c[0].targetId])).toEqual([
      [2, 'ok', 'erp-1'], [3, 'ok', 'erp-1'], [4, 'skipped', 'erp-2'],
    ]);
  });

  it('informa por registro el error de la base sin detener el lote', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: null, error: { code: '23503', message: 'MIGRATION_FOX_PRODUCT_NOT_FOUND: MED-001' } })
      .mockResolvedValueOnce({ data: { id: 'erp-2', action: 'CREATED' }, error: null });
    const { supabase, runs } = servicios(rpc);
    const result = await new ContratosSuministroImporter(supabase, runs).run(parseCsv(CONTRATOS), {
      tenantId: TENANT, startedBy: ACTOR, dryRun: false,
    });
    expect(result).toMatchObject({ okRows: 1, errorRows: 2 });
    expect(result.errors).toEqual([expect.objectContaining({ rowIndex: 2, externalId: 'C-100', message: 'El producto no existe o es ambiguo en el ERP (MED-001)' })]);
  });

  it('el ensayo usa la base revertida y no la importación', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { registros: [
      { id_origen: 'C-100', ok: true }, { id_origen: 'C-200', ok: false, error: 'MIGRATION_FOX_CLIENT_NOT_FOUND: codigo=CLI-46' },
    ] }, error: null });
    const { supabase, runs } = servicios(rpc);
    const result = await new ContratosSuministroImporter(supabase, runs).run(parseCsv(CONTRATOS), {
      tenantId: TENANT, startedBy: ACTOR, dryRun: true,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('ensayar_migracion_fox_580');
    expect(rpc.mock.calls[0][1].p_lote.contratos.map((r: any) => r.id_origen)).toEqual(['C-100', 'C-200']);
    expect(result).toMatchObject({ okRows: 2, errorRows: 1 });
    expect(result.errors[0]).toMatchObject({ rowIndex: 4, message: expect.stringContaining('importe antes los clientes') });
  });
});

describe('Stock inicial con lote y vencimiento', () => {
  const csv = (extra: string) =>
    `external_id_producto,sucursal_id,almacen_id,cantidad,costo_unitario,lote,fecha_vencimiento\n${extra}`;

  it('valida que el vencimiento venga con lote y en formato ISO', () => {
    const imp = new StockInicialImporter({} as any, {} as any);
    expect(imp.validate(parseCsv(csv(`MED-1,${SUCURSAL},${ALMACEN},5,8,L1,2027-05-31`)))).toEqual([]);
    expect(imp.validate(parseCsv(csv(`MED-1,${SUCURSAL},${ALMACEN},5,8,,2027-05-31`)))[0]).toMatchObject({ field: 'fecha_vencimiento' });
    expect(imp.validate(parseCsv(csv(`MED-1,${SUCURSAL},${ALMACEN},5,8,L1,31/05/2027`)))[0]).toMatchObject({ field: 'fecha_vencimiento' });
  });

  it('cada lote tiene su propia identidad de apertura y viaja a la base', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { id: 'mov', action: 'CREATED' }, error: null });
    const from = jest.fn(() => ({
      select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [{ id: 'prod-1', external_id: 'MED-1', codigo: 'MED-1' }], error: null }) }) }),
    }));
    const imp = new StockInicialImporter({ getClient: () => ({ rpc, from }) } as any, { recordRow: jest.fn() } as any);
    await imp.run(parseCsv(csv(`MED-1,${SUCURSAL},${ALMACEN},5,8,l1,2027-05-31\nMED-1,${SUCURSAL},${ALMACEN},3,8,L0,2026-10-01`)), {
      tenantId: TENANT, startedBy: ACTOR, dryRun: false, fechaCorte: '2026-10-28',
    });
    expect(rpc.mock.calls.map((c) => c[1].p_external_id)).toEqual([
      `stock:MED-1:L1:${ALMACEN}:2026-10-28`, `stock:MED-1:L0:${ALMACEN}:2026-10-28`,
    ]);
    expect(rpc.mock.calls[0][1].p_stock).toMatchObject({ lote: 'L1', fecha_vencimiento: '2027-05-31' });
  });

  it('arma las filas del ensayo con el código del producto', () => {
    const [fila] = filasEnsayoStock(parseCsv(csv(`MED-1,${SUCURSAL},${ALMACEN},5,8,L1,2027-05-31`)), '2026-10-28');
    expect(fila).toEqual({
      external_id: `stock:MED-1:L1:${ALMACEN}:2026-10-28`, fila: 2,
      stock: { producto_codigo: 'MED-1', almacen_id: ALMACEN, sucursal_id: SUCURSAL, fecha_corte: '2026-10-28',
        cantidad: 5, costo_unitario: 8, lote: 'L1', fecha_vencimiento: '2027-05-31' },
    });
  });
});

describe('Ensayo y conciliación FOX en el servicio', () => {
  const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
  function servicio(rpc: jest.Mock) {
    const fake = (runType: string) => ({ runType, requiredHeaders: [], getTemplate: jest.fn(), validate: jest.fn(() => []), run: jest.fn() }) as any;
    const supabase = { getClient: () => ({ rpc }) } as any;
    return new MigrationService(supabase, {} as any, fake('clientes'), fake('proveedores'), fake('cxc_abiertas'), fake('cxp_abiertas'),
      fake('balance_apertura'), new StockInicialImporter(supabase, {} as any), fake('comprobantes_historico'),
      new ContratosSuministroImporter(supabase, {} as any), new OcSuministroImporter(supabase, {} as any),
      new CronogramaSuministroImporter(supabase, {} as any));
  }

  it('ensaya todos los archivos juntos con su control y devuelve los errores de archivo', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { registros: [], conciliacion: { cuadra: true }, ensayo: true, errores: 0 }, error: null });
    const control = { contratos: { registros: 1, cantidad: 400 } };
    const res = await servicio(rpc).ensayoFox({
      contratos: b64(CONTRATOS.replace('Otro,PEN', 'Otro,BOB')),
      stock: b64(`external_id_producto,sucursal_id,almacen_id,cantidad,costo_unitario,lote,fecha_vencimiento\nMED-1,${SUCURSAL},${ALMACEN},5,8,L1,2027-05-31`),
      fechaCorte: '2026-10-28',
      control,
    }, TENANT, ACTOR);
    const args = rpc.mock.calls[0][1];
    expect(rpc.mock.calls[0][0]).toBe('ensayar_migracion_fox_580');
    expect(args.p_lote.contratos.map((r: any) => r.id_origen)).toEqual(['C-100']);
    expect(args.p_lote.stock).toHaveLength(1);
    expect(args.p_control).toEqual(control);
    expect(res.data.errores_archivo).toEqual([expect.objectContaining({ archivo: 'contratos', rowIndex: 4 })]);
  });

  it('exige archivos y fecha de corte para el stock', async () => {
    const rpc = jest.fn();
    await expect(servicio(rpc).ensayoFox({}, TENANT, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio(rpc).ensayoFox({ stock: b64('external_id_producto\nX') }, TENANT, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('concilia y traduce los rechazos de la base', async () => {
    const rpc = jest.fn().mockResolvedValueOnce({ data: { cuadra: false, entidades: [] }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'PERMISSION_DENIED' } })
      .mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'MIGRATION_FOX_CONTROL_INVALID' } });
    const s = servicio(rpc);
    expect((await s.conciliarFox({ oc: {} }, TENANT, ACTOR)).data.cuadra).toBe(false);
    await expect(s.conciliarFox({}, TENANT, ACTOR)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(s.conciliarFox({ nomina: {} }, TENANT, ACTOR)).rejects.toThrow('sólo admiten contratos, oc, entregas y stock');
  });

  it('cada ruta FOX exige su permiso', () => {
    const esperado: Record<string, string> = {
      importContratosSuministro: 'migration.suministro.import',
      importOcSuministro: 'migration.suministro.import',
      importCronogramaSuministro: 'migration.suministro.import',
      ensayoFox: 'migration.suministro.import',
      conciliacionFox: 'migration.validar.read',
    };
    for (const [method, codigo] of Object.entries(esperado))
      expect(Reflect.getMetadata(PERMISSION_KEY, (MigrationController.prototype as any)[method])?.raw).toBe(codigo);
  });
});
