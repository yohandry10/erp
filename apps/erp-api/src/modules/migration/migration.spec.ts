import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseCsv, toBoolean, toDateOrNull, toNumber, validateHeaders } from './util/csv-parser.util';
import { validateRuc, validateDni, validateDocumento, toSafeIntegerDocumento } from './util/peru-doc.util';
import { ClientesImporter } from './importers/clientes.importer';
import { ProveedoresImporter } from './importers/proveedores.importer';
import { CxcAbiertasImporter } from './importers/cxc-abiertas.importer';
import { CxpAbiertasImporter } from './importers/cxp-abiertas.importer';
import { BalanceAperturaImporter } from './importers/balance-apertura.importer';
import { StockInicialImporter } from './importers/stock-inicial.importer';
import { ComprobantesHistoricoImporter } from './importers/comprobantes-historico.importer';
import { MigrationRunsService } from './migration-runs.service';
import { MigrationService } from './migration.service';

function makeFakeSupabase() {
  const builder = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    single: jest.fn().mockResolvedValue({ data: { id: 'uuid-1' }, error: null }),
  };
  return {
    builder,
    service: { getClient: jest.fn().mockReturnValue(builder) } as any,
  };
}

function readRepoFile(relativePath: string) {
  const candidates = [join(process.cwd(), relativePath), join(process.cwd(), '..', '..', relativePath)];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error(`No se encontró ${relativePath}`);
  }
  return readFileSync(filePath, 'utf8');
}

describe('util/csv-parser', () => {
  it('parsea header y filas, ignora líneas vacías', () => {
    const csv = 'a,b,c\n1,2,3\n\n4,5,6\n';
    const out = parseCsv(csv);
    expect(out.headers).toEqual(['a', 'b', 'c']);
    expect(out.rows).toEqual([
      { a: '1', b: '2', c: '3' },
      { a: '4', b: '5', c: '6' },
    ]);
    expect(out.totalLines).toBe(2);
  });

  it('soporta comillas dobles con comas internas', () => {
    const csv = 'a,b\n"hola, mundo","x"';
    const out = parseCsv(csv);
    expect(out.rows[0]).toEqual({ a: 'hola, mundo', b: 'x' });
  });

  it('toNumber acepta coma como separador decimal', () => {
    expect(toNumber('1,5')).toBe(1.5);
    expect(toNumber('1.5')).toBe(1.5);
    expect(toNumber('')).toBe(0);
    expect(toNumber(null as any)).toBe(0);
  });

  it('toBoolean acepta variantes', () => {
    expect(toBoolean('true')).toBe(true);
    expect(toBoolean('SI')).toBe(true);
    expect(toBoolean('false')).toBe(false);
    expect(toBoolean('')).toBe(false);
  });

  it('toDateOrNull valida ISO básico', () => {
    expect(toDateOrNull('2026-04-30')).toBe('2026-04-30');
    expect(toDateOrNull('2026-04-30T12:00:00Z')).toBe('2026-04-30');
    expect(toDateOrNull('30/04/2026')).toBeNull();
    expect(toDateOrNull('')).toBeNull();
  });

  it('validateHeaders detecta columnas faltantes', () => {
    expect(validateHeaders(['a', 'b'], ['a', 'b', 'c'])).toEqual(['Falta columna obligatoria: c']);
    expect(validateHeaders(['a', 'b', 'c'], ['a', 'b'])).toEqual([]);
  });
});

describe('util/peru-doc', () => {
  it('validateRuc rechaza largo incorrecto', () => {
    expect(validateRuc('123')).toMatch(/11 dígitos/);
  });
  it('validateRuc rechaza prefijo inválido', () => {
    // 8 dígitos válidos + dígito verificador inventado
    const ruc = '99999999990';
    expect(validateRuc(ruc)).toMatch(/Prefijo|verificador/);
  });
  it('validateRuc acepta un RUC válido', () => {
    // RUC 20100000001: sum = 5*2 + 4*0 + 3*1 + 2*0 + 7*0 + 6*0 + 5*0 + 4*0 + 3*0 + 2*1 = 10+3+2=15 → 11-15%11 = 11-4=7. Para dv válido digito = 1.
    // Como calcular el digito que sea válido tiene su mañita, generamos uno con la fórmula:
    const cuerpo = '2010000000';
    const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const digitos = cuerpo.split('').map(Number);
    const suma = factores.reduce((acc, f, i) => acc + f * digitos[i], 0);
    const resto = 11 - (suma % 11);
    const dv = resto === 10 ? 0 : resto === 11 ? 1 : resto;
    const ruc = cuerpo + dv;
    expect(validateRuc(ruc)).toBeNull();
  });
  it('validateDni valida 8 dígitos', () => {
    expect(validateDni('12345678')).toBeNull();
    expect(validateDni('1234567')).toMatch(/8 dígitos/);
  });
  it('validateDocumento delega por tipo', () => {
    expect(validateDocumento('DNI', '12345678')).toBeNull();
    expect(validateDocumento('OTRO', 'x')).toMatch(/no soportado/);
  });
  it('toSafeIntegerDocumento rechaza RUC de 11 dígitos por overflow int32', () => {
    expect(toSafeIntegerDocumento('20123456789')).toBeNull();
    expect(toSafeIntegerDocumento('12345678')).toBe(12345678);
  });
});

describe('ClientesImporter.validate', () => {
  const { service } = makeFakeSupabase();
  const importer = new ClientesImporter(service, {} as any);

  it('detecta header faltante', () => {
    const csv = 'external_id,tipo\nX,EMPRESA';
    const errs = importer.validate(parseCsv(csv));
    expect(errs.some((e) => e.message.includes('tipo_documento'))).toBe(true);
  });

  it('detecta external_id duplicado en archivo', () => {
    const csv = [
      'external_id,tipo,tipo_documento,numero_documento,razon_social',
      'CLI-1,EMPRESA,DNI,12345678,Cliente A',
      'CLI-1,EMPRESA,DNI,12345679,Cliente B',
    ].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs.some((e) => e.message.includes('duplicado'))).toBe(true);
  });

  it('detecta tipo inválido', () => {
    const csv = [
      'external_id,tipo,tipo_documento,numero_documento,razon_social',
      'CLI-1,EXTRATERRESTRE,DNI,12345678,Cliente A',
    ].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs.some((e) => e.field === 'tipo')).toBe(true);
  });

  it('detecta RUC con dígito verificador incorrecto', () => {
    const csv = [
      'external_id,tipo,tipo_documento,numero_documento,razon_social',
      'CLI-1,EMPRESA,RUC,20100000099,Cliente A',
    ].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs.some((e) => e.field === 'numero_documento')).toBe(true);
  });

  it('detecta email inválido', () => {
    const csv = [
      'external_id,tipo,tipo_documento,numero_documento,razon_social,email',
      'CLI-1,EMPRESA,DNI,12345678,Cliente A,no-es-email',
    ].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs.some((e) => e.field === 'email')).toBe(true);
  });

  it('CSV bien formado pasa sin errores', () => {
    const csv = [
      'external_id,tipo,tipo_documento,numero_documento,razon_social',
      'CLI-1,EMPRESA,DNI,12345678,Cliente A',
    ].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs).toEqual([]);
  });

  it('getTemplate retorna CSV con headers requeridos', () => {
    const tpl = importer.getTemplate();
    expect(tpl.filename).toBe('plantilla_migracion_clientes.csv');
    expect(tpl.content).toContain('external_id');
    expect(tpl.content).toContain('tipo_documento');
  });
});

describe('ProveedoresImporter.validate', () => {
  const { service } = makeFakeSupabase();
  const importer = new ProveedoresImporter(service, {} as any);

  it('rechaza detraccion_tasa fuera de rango', () => {
    const csv = [
      'external_id,tipo,tipo_documento,numero_documento,razon_social,detraccion_tasa',
      'PROV-1,EMPRESA,DNI,12345678,Prov,1.5',
    ].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs.some((e) => e.field === 'detraccion_tasa')).toBe(true);
  });
});

describe('CxcAbiertasImporter.validate', () => {
  const { service } = makeFakeSupabase();
  const importer = new CxcAbiertasImporter(service, {} as any);

  it('rechaza saldo_pendiente > monto_total', () => {
    const csv = [
      'external_id,external_id_cliente,tipo_documento,serie,numero,fecha_emision,fecha_vencimiento,moneda,monto_total,saldo_pendiente',
      'CXC-1,CLI-1,FACTURA,F001,1,2026-01-01,2026-02-01,PEN,100,200',
    ].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs.some((e) => e.message.includes('no puede exceder'))).toBe(true);
  });

  it('rechaza moneda inválida', () => {
    const csv = [
      'external_id,external_id_cliente,tipo_documento,serie,numero,fecha_emision,fecha_vencimiento,moneda,monto_total,saldo_pendiente',
      'CXC-1,CLI-1,FACTURA,F001,1,2026-01-01,2026-02-01,XYZ,100,100',
    ].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs.some((e) => e.field === 'moneda')).toBe(true);
  });
});

describe('CxpAbiertasImporter.validate', () => {
  const { service } = makeFakeSupabase();
  const importer = new CxpAbiertasImporter(service, {} as any);

  it('happy path', () => {
    const csv = [
      'external_id,external_id_proveedor,tipo_documento,serie,numero,fecha_emision,fecha_vencimiento,moneda,monto_total,saldo_pendiente',
      'CXP-1,PROV-1,FACTURA,F002,5,2026-01-01,2026-02-01,PEN,500,500',
    ].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs).toEqual([]);
  });
});

describe('BalanceAperturaImporter.validate', () => {
  const { service } = makeFakeSupabase();
  const importer = new BalanceAperturaImporter(service, {} as any);

  it('rechaza balance no cuadrado', () => {
    const csv = ['cuenta_contable_codigo,debe,haber', '1011,100,0', '5011,0,80'].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs.some((e) => e.message.includes('no cuadra'))).toBe(true);
  });

  it('rechaza debe y haber simultáneos', () => {
    const csv = ['cuenta_contable_codigo,debe,haber', '1011,100,100'].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs.some((e) => e.message.includes('simultáneamente'))).toBe(true);
  });

  it('acepta balance cuadrado', () => {
    const csv = [
      'cuenta_contable_codigo,debe,haber',
      '1011,100,0',
      '5011,0,100',
    ].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs).toEqual([]);
  });
});

describe('StockInicialImporter.validate', () => {
  const { service } = makeFakeSupabase();
  const importer = new StockInicialImporter(service, {} as any);

  it('exige almacen_id en el contrato y en la plantilla CSV', () => {
    const csv = [
      'external_id_producto,sucursal_id,cantidad,costo_unitario',
      'PROD-1,00000000-0000-0000-0000-000000000000,10,5.5',
    ].join('\n');

    expect(importer.requiredHeaders).toContain('almacen_id');
    expect(importer.getTemplate().content.split('\n')[0].split(',')).toContain('almacen_id');
    expect(importer.validate(parseCsv(csv))).toContainEqual({
      rowIndex: 1,
      message: 'Falta columna obligatoria: almacen_id',
    });
  });

  it('rechaza almacen_id vacío', () => {
    const csv = [
      'external_id_producto,sucursal_id,almacen_id,cantidad,costo_unitario',
      'PROD-1,00000000-0000-0000-0000-000000000000,,10,5.5',
    ].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs.some((e) => e.field === 'almacen_id')).toBe(true);
  });

  it('rechaza sucursal_id no UUID', () => {
    const csv = [
      'external_id_producto,sucursal_id,almacen_id,cantidad,costo_unitario',
      'PROD-1,no-es-uuid,33333333-3333-3333-3333-333333333333,10,5.5',
    ].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs.some((e) => e.field === 'sucursal_id')).toBe(true);
  });

  it('rechaza cantidad negativa', () => {
    const csv = [
      'external_id_producto,sucursal_id,almacen_id,cantidad,costo_unitario',
      'PROD-1,00000000-0000-0000-0000-000000000000,33333333-3333-3333-3333-333333333333,-5,1',
    ].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs.some((e) => e.field === 'cantidad')).toBe(true);
  });
});

describe('StockInicialImporter.run', () => {
  it('valida idempotencia por producto, sucursal, almacén y fecha de corte', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const sucursalId = '22222222-2222-2222-2222-222222222222';
    const fechaCorte = '2026-05-01';

    const productosBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{ id: 'producto-1', external_id: 'PROD-1' }],
        error: null,
      }),
    };
    const movimientosBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'mov-1' }, error: null }),
    };
    const stockBuilder = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };
    const client = {
      from: jest.fn((table: string) => {
        if (table === 'productos') return productosBuilder;
        if (table === 'producto_stock_sucursal') return stockBuilder;
        if (table === 'movimientos_inventario') return movimientosBuilder;
        throw new Error(`tabla inesperada: ${table}`);
      }),
      // run() aplica el movimiento vía RPC atómica aplicar_movimiento_inventario_tx.
      rpc: jest.fn().mockResolvedValue({ data: 'mov-1', error: null }),
    };
    const importer = new StockInicialImporter(
      { getClient: jest.fn().mockReturnValue(client) } as any,
      { recordRow: jest.fn() } as any,
    );

    const almacenId = '33333333-3333-3333-3333-333333333333';
    const parsed = parseCsv(
      [
        'external_id_producto,sucursal_id,almacen_id,cantidad,costo_unitario',
        `PROD-1,${sucursalId},${almacenId},10,2.5`,
      ].join('\n'),
    );

    const result = await importer.run(parsed, {
      tenantId,
      fechaCorte,
      dryRun: false,
    });

    expect(result.created).toBe(1);
    expect(movimientosBuilder.contains).toHaveBeenCalledWith('metadata', {
      fecha_corte: fechaCorte,
      sucursal_id: sucursalId,
      almacen_id: almacenId,
    });
  });
});

describe('MigrationService.decodeCsv', () => {
  function makeService() {
    const fakeImporter = (runType: any) =>
      ({
        runType,
        requiredHeaders: [],
        getTemplate: jest.fn(),
        validate: jest.fn(),
        run: jest.fn(),
      }) as any;

    return new MigrationService(
      {} as any,
      {} as any,
      fakeImporter('clientes'),
      fakeImporter('proveedores'),
      fakeImporter('cxc_abiertas'),
      fakeImporter('cxp_abiertas'),
      fakeImporter('balance_apertura'),
      fakeImporter('stock_inicial'),
      fakeImporter('comprobantes_historico'),
    );
  }

  it('rechaza base64 mal formado que Buffer decodificaría parcialmente', () => {
    const service = makeService();
    expect(() => (service as any).decodeCsv('@@@')).toThrow('fileBase64 inválido');
  });

  it('decodifica CSV UTF-8 válido', () => {
    const service = makeService();
    const encoded = Buffer.from('a,b\n1,2\n', 'utf8').toString('base64');
    expect((service as any).decodeCsv(encoded)).toBe('a,b\n1,2\n');
  });
});

describe('ComprobantesHistoricoImporter.validate', () => {
  const { service } = makeFakeSupabase();
  const importer = new ComprobantesHistoricoImporter(service, {} as any);

  it('detecta subtotal+igv != total', () => {
    const csv = [
      'external_id,tipo_documento,serie,numero,fecha_emision,external_id_cliente,moneda,subtotal,igv,total',
      'CPE-1,FACTURA,F001,1,2026-01-01,CLI-1,PEN,100,18,200',
    ].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs.some((e) => e.message.includes('no coincide'))).toBe(true);
  });

  it('happy path', () => {
    const csv = [
      'external_id,tipo_documento,serie,numero,fecha_emision,external_id_cliente,moneda,subtotal,igv,total',
      'CPE-1,FACTURA,F001,1,2026-01-01,CLI-1,PEN,100,18,118',
    ].join('\n');
    const errs = importer.validate(parseCsv(csv));
    expect(errs).toEqual([]);
  });
});

describe('ClientesImporter.run (con Supabase mockeada)', () => {
  it('dry run no llama a la BD', async () => {
    const { service, builder } = makeFakeSupabase();
    const runs = { recordRow: jest.fn() } as unknown as MigrationRunsService;
    const importer = new ClientesImporter(service, runs);
    const parsed = parseCsv(
      ['external_id,tipo,tipo_documento,numero_documento,razon_social', 'CLI-1,EMPRESA,DNI,12345678,Cliente A'].join('\n'),
    );
    const result = await importer.run(parsed, { tenantId: 't', dryRun: true });
    expect(result.okRows).toBe(1);
    expect(result.created).toBe(0); // dry run no crea
    expect(builder.insert).not.toHaveBeenCalled();
  });
});

describe('migrations/341 transactional idempotency coverage', () => {
  const sql = () => readRepoFile('supabase/migrations/341__transactional_idempotency_coverage_hardening.sql');

  it('amarra entradas de recepción al item exacto y rechaza legacy ambiguo', () => {
    const migration = sql();

    expect(migration).toContain("metadata->>'recepcion_item_id'");
    expect(migration).toContain("'recepcion_item_id', v_item.id::text");
    expect(migration).toContain('Movimiento legacy ambiguo');
    expect(migration).not.toContain('AND producto_id = v_item.producto_id\n      AND tipo = ');
  });

  it('no permite skip ciego cuando hay reservas parciales del pedido', () => {
    const migration = sql();

    expect(migration).toContain("metadata->>'pedido_detalle_id'");
    expect(migration).toContain("'pedido_detalle_id', v_item.id::text");
    expect(migration).toContain('Reservas existentes incompletas o ambiguas');
    expect(migration).toContain('reservas completas existentes');
    expect(migration).not.toContain("'reservas ya existentes'");
  });
});
