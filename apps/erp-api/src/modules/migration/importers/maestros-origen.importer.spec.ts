import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { PERMISSION_KEY } from '../../../common/decorators/require-permission.decorator';
import { OrigenArchivoCierreDto, OrigenArchivoFilasDto } from '../dto/import.dto';
import { OrigenArchivoService } from '../archivo-origen.service';
import { MigrationController } from '../migration.controller';
import { MigrationService } from '../migration.service';
import { parseCsv } from '../util/csv-parser.util';
import { BalanceAperturaImporter } from './balance-apertura.importer';
import { ClientesImporter } from './clientes.importer';
import { CxcAbiertasImporter } from './cxc-abiertas.importer';
import { MaestrosOrigenImporters, SPECS_MAESTROS } from './maestros-origen.importer';
import { ProveedoresImporter } from './proveedores.importer';
import { StockInicialImporter } from './stock-inicial.importer';
import { construirLote, ContratosSuministroImporter, CronogramaSuministroImporter, OcSuministroImporter } from './suministro-origen.importer';
import { Test } from '@nestjs/testing';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { MigrationRunsService } from '../migration-runs.service';

const TENANT = '58200000-0000-4000-8000-000000000001';
const ACTOR = '58200000-0000-4000-8000-000000000002';
const RUN = '58200000-0000-4000-8000-000000000003';
const LOTE = '58200000-0000-4000-8000-000000000004';
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const csv = (spec: keyof typeof SPECS_MAESTROS, ...filas: string[]) => {
  const s = SPECS_MAESTROS[spec];
  return parseCsv([[...s.requeridas, ...s.opcionales].join(','), ...filas].join('\n'));
};

function importadores(rpc: jest.Mock) {
  const recordRow = jest.fn().mockResolvedValue(undefined);
  const supabase = { getClient: () => ({ rpc }), getLongRunningClient: () => ({ rpc }) } as any;
  const todos = new MaestrosOrigenImporters(supabase, { recordRow } as any).todos;
  return { porTipo: (t: string) => todos.find((i) => i.runType === t)!, recordRow, todos };
}

describe('Plantillas de maestros de origen', () => {
  it('cada plantilla trae las columnas que su lote exige y un ejemplo válido', () => {
    const { todos } = importadores(jest.fn());
    expect(todos.map((i) => i.runType)).toEqual(['productos', 'almacenes', 'plan_cuentas', 'cuentas_bancarias', 'listas_precios', 'oc_compra', 'pedidos_venta']);
    for (const imp of todos) {
      const { content } = imp.getTemplate();
      expect(imp.validate(parseCsv(content))).toEqual([]);
    }
  });

  it('un pedido no acepta un precio con más decimales de los que guarda, para no alterarlo en silencio', () => {
    const fila = (precio: string) => `PV-1,PED-1,CLI-1,PEN,MED-1,10,0,${precio}`;
    expect(construirLote(SPECS_MAESTROS.PEDIDO_VENTA, csv('PEDIDO_VENTA', fila('12.50'))).errores).toEqual([]);
    const mal = construirLote(SPECS_MAESTROS.PEDIDO_VENTA, csv('PEDIDO_VENTA', fila('12.345678')));
    expect(mal.errores.map((e) => e.field)).toEqual(['precio_unitario']);
  });

  it('valida unidades homologadas, booleanos, monedas, saldos con fecha y cantidades', () => {
    const p = construirLote(SPECS_MAESTROS.PRODUCTO, csv('PRODUCTO', 'P-1,MED-1,Amoxicilina,,UND,,,,QUIZAS,,'));
    expect(p.errores.map((e) => e.field)).toEqual(['controla_lote', 'unidad_medida']);
    const b = construirLote(SPECS_MAESTROS.CUENTA_BANCARIA, csv('CUENTA_BANCARIA', 'B-1,BCP,BCP,193-1,BOB,104101,,-150.25,,'));
    expect(b.errores.map((e) => e.field)).toEqual(['moneda', 'fecha_apertura']);
    const ok = construirLote(SPECS_MAESTROS.CUENTA_BANCARIA, csv('CUENTA_BANCARIA', 'B-1,BCP,BCP,193-1,PEN,104101,,-150.25,2026-10-31,'));
    expect(ok.registros[0].payload).toMatchObject({ saldo_apertura: -150.25, fecha_apertura: '2026-10-31' });
    const oc = construirLote(SPECS_MAESTROS.OC_COMPRA, csv('OC_COMPRA', 'O-1,OC-1,PRV-1,2026-10-01,PEN,MED-1,10,12,5,,,'));
    expect(oc.errores[0]).toMatchObject({ field: 'cantidad_recibida', rowIndex: 2 });
    const pc = construirLote(SPECS_MAESTROS.CUENTA_CONTABLE, csv('CUENTA_CONTABLE', '10A,Mal,'));
    expect(pc.errores[0]).toMatchObject({ field: 'codigo' });
  });

  it('ordena el plan de cuentas padre antes que subcuenta y agrupa líneas por registro', () => {
    const pc = construirLote(SPECS_MAESTROS.CUENTA_CONTABLE, csv('CUENTA_CONTABLE', '6011101,Mercaderías lote,', '60111,Mercaderías,', '6011102,Otra,'));
    expect(pc.registros.map((r) => r.id_origen)).toEqual(['60111', '6011101', '6011102']);
    const lp = construirLote(SPECS_MAESTROS.LISTA_PRECIOS, csv('LISTA_PRECIOS',
      'L-1,HOSP,Hospitales,PEN,2026-01-01,MED-1,11.5,,,,', 'L-1,HOSP,Hospitales,PEN,2026-01-01,MED-2,7.8,,,,2'));
    expect(lp.registros).toHaveLength(1);
    expect(lp.registros[0]).toMatchObject({ filas: [2, 3], payload: { codigo: 'HOSP', lineas: [
      { producto_codigo: 'MED-1', precio_unitario: 11.5 }, { producto_codigo: 'MED-2', precio_unitario: 7.8, cantidad_minima: 2 },
    ] } });
    const otra = construirLote(SPECS_MAESTROS.LISTA_PRECIOS, csv('LISTA_PRECIOS',
      'L-1,HOSP,Hospitales,PEN,2026-01-01,MED-1,11.5,,,,', 'L-1,HOSP,Otra,PEN,2026-01-01,MED-2,7.8,,,,'));
    expect(otra.errores[0]).toMatchObject({ field: 'nombre', rowIndex: 3 });
  });

  it('las columnas opcionales vacías no cambian la huella del registro', () => {
    const [con] = construirLote(SPECS_MAESTROS.ALMACEN, csv('ALMACEN', 'A-1,ALM-1,Callao,,,')).registros;
    expect(con.payload).toEqual({ codigo: 'ALM-1', nombre: 'Callao' });
  });
});

describe('Importación de maestros de origen contra la base', () => {
  it('usa la RPC 582 por registro y distingue creados, adoptados y reintentos', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: { id: 'a-1', action: 'CREATED' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'a-2', action: 'ADOPTED' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'a-3', action: 'IDEMPOTENT' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'MIGRATION_SOURCE_AMBIGUOUS_CODE: almacenes ALM-4' } });
    const { porTipo, recordRow } = importadores(rpc);
    const result = await porTipo('almacenes').run(csv('ALMACEN', 'A-1,ALM-1,Callao,,,', 'A-2,PRINCIPAL,Principal,,,SI', 'A-3,ALM-3,Lima,,,', 'A-4,ALM-4,Sur,,,'), {
      tenantId: TENANT, startedBy: ACTOR, dryRun: false, runCtx: { runId: RUN, tenantId: TENANT, runType: 'almacenes' },
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'importar_maestro_origen_582', {
      p_tenant_id: TENANT, p_actor_id: ACTOR, p_run_id: RUN, p_entidad: 'ALMACEN', p_id_origen: 'A-2',
      p_payload: { codigo: 'PRINCIPAL', nombre: 'Principal', es_principal: true },
    });
    expect(result).toMatchObject({ created: 1, updated: 1, skippedRows: 1, okRows: 2, errorRows: 1 });
    expect(result.errors[0].message).toContain('más de un registro del ERP');
    expect(recordRow.mock.calls.map((c) => [c[0].externalId, c[0].status, c[0].targetTable])).toEqual([
      ['A-1', 'ok', 'almacenes'], ['A-2', 'ok', 'almacenes'], ['A-3', 'skipped', 'almacenes'], ['A-4', 'error', 'almacenes'],
    ]);
  });

  it('el ensayo de un archivo usa la base revertida 582 con su clave de lote', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { registros: [
      { id_origen: '60111', ok: true }, { id_origen: '6011101', ok: false, error: 'MIGRATION_SOURCE_ACCOUNT_PARENT_NOT_FOUND: 6011101' },
    ] }, error: null });
    const { porTipo } = importadores(rpc);
    const result = await porTipo('plan_cuentas').run(csv('CUENTA_CONTABLE', '6011101,Lote,', '60111,Mercaderías,'), {
      tenantId: TENANT, startedBy: ACTOR, dryRun: true, fechaCorte: '2026-10-31',
    });
    expect(rpc).toHaveBeenCalledWith('ensayar_migracion_origen_582', expect.objectContaining({
      p_control: null, p_fecha_corte: '2026-10-31',
      p_lote: { cuentas_contables: [expect.objectContaining({ id_origen: '60111' }), expect.objectContaining({ id_origen: '6011101' })] },
    }));
    expect(result).toMatchObject({ okRows: 1, errorRows: 1 });
    expect(result.errors[0].message).toContain('cuenta padre por prefijo');
  });
});

describe('Stock inicial por código de almacén de origen', () => {
  const consulta = (data: unknown[]) => {
    const q: any = new Proxy({}, { get: (_, k) => (k === 'then' ? (ok: any) => ok({ data, error: null }) : () => q) });
    return q;
  };
  const CSV = 'external_id_producto,almacen_codigo,cantidad,costo_unitario,lote,fecha_vencimiento\nMED-1,alm-callao,5,8,,\nMED-1,ALM-NORTE,2,8,,';

  it('no exige UUID cuando llega el código y valida que haya almacén', () => {
    const imp = new StockInicialImporter({} as any, {} as any);
    expect(imp.validate(parseCsv(CSV))).toEqual([]);
    expect(imp.validate(parseCsv('external_id_producto,almacen_codigo,cantidad,costo_unitario\nMED-1,,5,8')).map((e) => e.field)).toEqual(['sucursal_id', 'almacen_id']);
  });

  it('resuelve el almacén por código, toma su sucursal y rechaza el que no existe', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { id: 'mov', action: 'CREATED' }, error: null });
    const datos: Record<string, unknown[]> = {
      productos: [{ id: 'prod-1', external_id: 'MED-1', codigo: 'MED-1' }],
      almacenes: [{ id: 'alm-1', codigo: 'ALM-CALLAO', sucursal_id: 'suc-9' }],
      sucursales: [{ id: 'suc-principal' }],
    };
    const imp = new StockInicialImporter({ getClient: () => ({ rpc, from: (t: string) => consulta(datos[t]) }) } as any, { recordRow: jest.fn() } as any);
    const result = await imp.run(parseCsv(CSV), { tenantId: TENANT, startedBy: ACTOR, dryRun: false, fechaCorte: '2026-10-28' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_external_id: 'stock:MED-1:alm-1:2026-10-28',
      p_stock: { producto_id: 'prod-1', almacen_id: 'alm-1', sucursal_id: 'suc-9' } });
    expect(result.errors[0]).toMatchObject({ rowIndex: 3, field: 'almacen_codigo', message: expect.stringContaining('migre antes los almacenes') });
  });
});

describe('Ensayo integral en el servicio', () => {
  function servicio(rpc: jest.Mock) {
    const supabase = { getClient: () => ({ rpc }), getLongRunningClient: () => ({ rpc }) } as any;
    const runs = {} as any;
    const fake = (runType: string) => ({ runType, requiredHeaders: [], getTemplate: jest.fn(), validate: jest.fn(() => []), run: jest.fn() }) as any;
    return new MigrationService(supabase, runs, new ClientesImporter(supabase, runs), new ProveedoresImporter(supabase, runs),
      new CxcAbiertasImporter(supabase, runs), fake('cxp_abiertas'), new BalanceAperturaImporter(supabase, runs),
      new StockInicialImporter(supabase, runs), fake('comprobantes_historico'), fake('contratos_suministro'), fake('oc_suministro'),
      fake('cronograma_suministro'), new MaestrosOrigenImporters(supabase, runs));
  }
  const CLIENTES = 'external_id,tipo,tipo_documento,numero_documento,razon_social\nCLI-1,EMPRESA,RUC,20100070970,Hospital Regional SAC\nCLI-2,EMPRESA,RUC,123,Mal';
  const CXC = 'external_id,external_id_cliente,tipo_documento,serie,numero,fecha_emision,fecha_vencimiento,moneda,monto_total,saldo_pendiente\n'
    + 'CXC-1,CLI-1,FACTURA,F001,123,2026-10-01,2026-11-01,PEN,1180,500';
  const BALANCE = 'cuenta_contable_codigo,debe,haber,descripcion\n104101,15000,0,Bancos\n50,0,15000,Capital';

  it('arma un solo lote en el orden real con el mismo payload de cada importador', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { registros: [{ entidad: 'CLIENTE', id_origen: 'CLI-1', ok: false,
      error: 'MIGRATION_SOURCE_REFERENCE_NOT_FOUND: plan_cuentas 104999' }], conciliacion: null, ensayo: true, errores: 1 }, error: null });
    const res = await servicio(rpc).ensayoOrigen({
      clientes: b64(CLIENTES), cxc: b64(CXC), balance: b64(BALANCE),
      productos: b64(SPECS_MAESTROS.PRODUCTO.requeridas.join(',') + '\nP-1,MED-1,Amoxicilina'),
      fechaCorte: '2026-10-31T00:00:00.000Z', control: { cxc: { registros: 1, saldo: 500 } },
    }, TENANT, ACTOR);
    const [nombre, args] = rpc.mock.calls[0];
    expect(nombre).toBe('ensayar_migracion_origen_582');
    expect(args.p_fecha_corte).toBe('2026-10-31');
    expect(args.p_lote.clientes).toEqual([{ id_origen: 'CLI-1', fila: 2, payload: expect.objectContaining({
      tipo: 'EMPRESA', documento_tipo: 'RUC', documento_identidad: '20100070970', razon_social: 'Hospital Regional SAC' }) }]);
    expect(args.p_lote.cxc[0].payload).toMatchObject({ codigo_tercero: 'CLI-1', serie: 'F001', saldo_pendiente: 500, moneda: 'PEN' });
    expect(args.p_lote.balance.map((b: any) => b.payload)).toEqual([
      { cuenta_contable_codigo: '104101', debe: 15000, haber: 0, centro_costo_codigo: null, descripcion: 'Bancos' },
      { cuenta_contable_codigo: '50', debe: 0, haber: 15000, centro_costo_codigo: null, descripcion: 'Capital' },
    ]);
    expect(args.p_lote.productos).toEqual([{ id_origen: 'P-1', fila: 2, payload: { codigo: 'MED-1', nombre: 'Amoxicilina' } }]);
    expect(res.data.errores_archivo).toEqual([expect.objectContaining({ archivo: 'clientes', rowIndex: 3, field: 'numero_documento' })]);
    expect(res.data.registros[0].error).toContain('migre antes el maestro');
  });

  it('exige fecha de corte para saldos, balance y stock', async () => {
    const rpc = jest.fn();
    await expect(servicio(rpc).ensayoOrigen({ cxc: b64(CXC) }, TENANT, ACTOR)).rejects.toThrow('fechaCorte es obligatoria');
    await expect(servicio(rpc).ensayoOrigen({ balance: b64(BALANCE) }, TENANT, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('Archivo íntegro', () => {
  const svc = (rpc: jest.Mock) => new OrigenArchivoService({ getClient: () => ({ rpc }), getLongRunningClient: () => ({ rpc }) } as any);

  it('exige Idempotency-Key en las operaciones del lote', async () => {
    const rpc = jest.fn();
    await expect(svc(rpc).crearLote(TENANT, ACTOR, { descripcion: 'Extracto' })).rejects.toThrow('Idempotency-Key');
    await expect(svc(rpc).cerrarLote(TENANT, ACTOR, LOTE, { tablas: {} }, 'corta')).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('opera el lote, archiva tandas y consulta con filtros', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { id: LOTE, estado: 'CARGANDO', filas: [] }, error: null });
    const s = svc(rpc);
    await s.crearLote(TENANT, ACTOR, { descripcion: 'Extracto', fechaCorte: '2026-10-31' }, 'lote-origen-2026-10');
    expect(rpc).toHaveBeenLastCalledWith('operar_archivo_origen_582', { p_tenant_id: TENANT, p_actor_id: ACTOR, p_accion: 'CREAR_LOTE',
      p_payload: { descripcion: 'Extracto', fecha_corte: '2026-10-31' }, p_idempotency_key: 'lote-origen-2026-10' });
    await s.archivarFilas(TENANT, ACTOR, LOTE, { tabla: 'CLIENTES', filas: [{ clave: 'C1', fila: { RAZON: 'X' } }] });
    expect(rpc).toHaveBeenLastCalledWith('archivar_filas_origen_582', expect.objectContaining({ p_lote_id: LOTE, p_tabla: 'CLIENTES' }));
    await s.consultar(TENANT, ACTOR, { texto: 'andino', limite: 20 });
    expect(rpc).toHaveBeenLastCalledWith('consultar_archivo_origen_582', expect.objectContaining({
      p_filtros: { lote_id: null, tabla: null, texto: 'andino', pagina: 1, limite: 20 } }));
  });

  it('traduce los rechazos de la base', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: null, error: { code: '23514', message: 'MIGRATION_ARCHIVE_COUNT_MISMATCH: declarado={"A": 3} cargado={"A": 2}' } })
      .mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'PERMISSION_DENIED' } })
      .mockResolvedValueOnce({ data: null, error: { code: 'P0002', message: 'MIGRATION_ARCHIVE_NOT_FOUND' } })
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'MIGRATION_ARCHIVE_ROW_CHANGED: 1' } });
    const s = svc(rpc);
    const cierre = s.cerrarLote(TENANT, ACTOR, LOTE, { tablas: { A: 3 } }, 'cierre-lote-1');
    await expect(cierre).rejects.toBeInstanceOf(ConflictException);
    await expect(s.consultar(TENANT, ACTOR, {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(s.consultar(TENANT, ACTOR, { loteId: LOTE })).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.archivarFilas(TENANT, ACTOR, LOTE, { tabla: 'A', filas: [] })).rejects.toThrow('el extracto cambió');
  });

  it('cada ruta del archivo y de maestros exige su permiso', () => {
    const esperado: Record<string, string> = {
      importMaestroOrigen: 'migration.origen.import',
      crearLoteArchivo: 'migration.archivo.import',
      archivarFilas: 'migration.archivo.import',
      cerrarLoteArchivo: 'migration.archivo.import',
      descartarLoteArchivo: 'migration.archivo.import',
      consultarArchivo: 'migration.archivo.read',
    };
    for (const [method, codigo] of Object.entries(esperado))
      expect(Reflect.getMetadata(PERMISSION_KEY, (MigrationController.prototype as any)[method])?.raw).toBe(codigo);
  });

  it('rechaza un maestro desconocido sin tocar la base', async () => {
    const service = { import: jest.fn() } as any;
    const ctl = new MigrationController(service, {} as any);
    await expect(ctl.importMaestroOrigen('nomina', { fileBase64: 'eA==' }, TENANT, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    await ctl.importMaestroOrigen('oc_compra', { fileBase64: 'eA==' }, TENANT, ACTOR);
    expect(service.import).toHaveBeenCalledWith('oc_compra', { fileBase64: 'eA==' }, TENANT, ACTOR);
  });
});

describe('Contrato HTTP del archivo íntegro', () => {
  // Las mismas opciones del ValidationPipe global (main.ts).
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } });

  it('la tanda llega a la base con cada fila intacta', async () => {
    const fila = { CODALM: '01', NOMBRE: 'Almacén', PRINCIPAL: true, FECHA: '2026-01-01', STOCK: 3, NOTAS: null, _borrado: true };
    const dto = await pipe.transform({ tabla: 'ALMACEN', filas: [{ clave: '1', fila }] }, { type: 'body', metatype: OrigenArchivoFilasDto });
    expect(JSON.parse(JSON.stringify(dto.filas))).toEqual([{ clave: '1', fila }]);
    const cierre = await pipe.transform({ tablas: { ALMACEN: 4 } }, { type: 'body', metatype: OrigenArchivoCierreDto });
    expect(cierre.tablas).toEqual({ ALMACEN: 4 });
  });

  it('rechaza claves vacías, filas que no son objeto y campos extra', async () => {
    for (const filas of [[{ clave: '', fila: {} }], [{ clave: '1', fila: [] }], [{ clave: '1', fila: {}, extra: 1 }], []])
      await expect(pipe.transform({ tabla: 'A', filas }, { type: 'body', metatype: OrigenArchivoFilasDto })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Inyección de dependencias de los importadores del sistema anterior', () => {
  it('Nest entrega la base y el registro de filas a cada importador', async () => {
    const supabase = { getClient: jest.fn(), getLongRunningClient: jest.fn() };
    const runs = { recordRow: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [ContratosSuministroImporter, OcSuministroImporter, CronogramaSuministroImporter, MaestrosOrigenImporters,
        { provide: SupabaseService, useValue: supabase }, { provide: MigrationRunsService, useValue: runs }],
    }).compile();
    for (const tipo of [ContratosSuministroImporter, OcSuministroImporter, CronogramaSuministroImporter]) {
      const imp = moduleRef.get<any>(tipo);
      expect([imp.supabase, imp.runs]).toEqual([supabase, runs]);
    }
    for (const imp of moduleRef.get(MaestrosOrigenImporters).todos as any[]) expect([imp.supabase, imp.runs]).toEqual([supabase, runs]);
  });
});
