import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AsientosService } from './asientos.service';
import { PeriodosService } from './periodos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

/**
 * Ciclo de vida del asiento contable (Fase 1 del cierre de brecha con Odoo).
 *
 * Las transiciones prohibidas son el objeto real de estas pruebas: lo que
 * protege el libro no es que confirmar funcione, sino que un asiento
 * confirmado no se pueda editar, borrar ni reversar dos veces.
 */
describe('AsientosService — ciclo de vida', () => {
  let service: AsientosService;
  let periodosService: { validarPeriodoAbierto: jest.Mock };

  const TENANT = 'tenant-1';
  const USER = 'user-1';

  /**
   * El cliente de Supabase se encadena (`from().select().eq()...`) y termina en
   * `single`, `maybeSingle` o en el propio thenable. Se modela por tabla para
   * que cada prueba declare solo lo que le importa.
   */
  let tablas: Record<string, any>;
  let inserciones: Array<{ tabla: string; payload: any }>;
  let actualizaciones: Array<{ tabla: string; payload: any }>;
  let eliminaciones: string[];
  let rpcs: Array<{ funcion: string; parametros: any }>;
  let resultadosRpc: Record<string, any>;

  const construirQuery = (tabla: string) => {
    const filtros: string[] = [];
    const resultado = () => {
      const valor = tablas[tabla];
      return typeof valor === 'function'
        ? valor(filtros)
        : valor ?? { data: null, error: null };
    };
    const query: any = {
      select: jest.fn(() => query),
      insert: jest.fn((payload: any) => {
        inserciones.push({ tabla, payload });
        return query;
      }),
      update: jest.fn((payload: any) => {
        actualizaciones.push({ tabla, payload });
        return query;
      }),
      delete: jest.fn(() => {
        eliminaciones.push(tabla);
        return query;
      }),
      eq: jest.fn((columna: string) => {
        filtros.push(columna);
        return query;
      }),
      in: jest.fn(() => query),
      gte: jest.fn(() => query),
      lte: jest.fn(() => query),
      order: jest.fn(() => query),
      single: jest.fn(async () => resultado()),
      maybeSingle: jest.fn(async () => resultado()),
      then: (onFulfilled: any) => Promise.resolve(resultado()).then(onFulfilled)
    };
    return query;
  };

  const asientoConfirmado = {
    id: 'asiento-confirmado',
    tenant_id: TENANT,
    numero_asiento: 42,
    fecha: '2026-03-15T00:00:00.000Z',
    concepto: 'Provisión de servicios',
    referencia: 'F001-1',
    total_debe: 118,
    total_haber: 118,
    estado: 'CONFIRMADO'
  };

  const detallesConfirmado = [
    {
      id: 'det-1',
      cuenta_id: 'cuenta-63',
      cuenta_codigo: '63',
      cuenta_nombre: 'Servicios',
      debe: 100,
      haber: 0,
      concepto: 'Servicio',
      centro_costo_id: 'cc-1'
    },
    {
      id: 'det-2',
      cuenta_id: 'cuenta-42',
      cuenta_codigo: '42',
      cuenta_nombre: 'Proveedores',
      debe: 0,
      haber: 100,
      concepto: 'Proveedor'
    }
  ];

  beforeEach(async () => {
    tablas = {};
    inserciones = [];
    actualizaciones = [];
    eliminaciones = [];
    rpcs = [];
    resultadosRpc = {
      crear_asiento_con_detalles_tx: { data: { id: 'nuevo' }, error: null },
      actualizar_asiento_borrador_tx: { data: { id: 'borrador' }, error: null }
    };
    periodosService = { validarPeriodoAbierto: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AsientosService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => ({
              from: jest.fn((tabla: string) => construirQuery(tabla)),
              rpc: jest.fn(async (funcion: string, parametros: any) => {
                rpcs.push({ funcion, parametros });
                return resultadosRpc[funcion] ?? { data: null, error: null };
              })
            }))
          }
        },
        { provide: PeriodosService, useValue: periodosService }
      ]
    }).compile();

    service = module.get<AsientosService>(AsientosService);
    jest.spyOn(service as any, 'obtenerDetallesAsiento').mockResolvedValue(detallesConfirmado);
  });

  afterEach(() => jest.clearAllMocks());

  /**
   * Deja el asiento indicado como respuesta de `asientos_contables`. La
   * búsqueda del contra-asiento se distingue por su filtro, no por el orden de
   * llamada: así el mock no depende de cuántas veces se consulte la tabla.
   */
  const dadoElAsiento = (asiento: any, reversion: any = null) => {
    tablas['asientos_contables'] = (filtros: string[]) =>
      filtros.includes('reversion_de_asiento_id')
        ? { data: reversion, error: null }
        : { data: asiento, error: null };
  };

  describe('transiciones prohibidas sobre un asiento CONFIRMADO', () => {
    it('no permite actualizar', async () => {
      dadoElAsiento(asientoConfirmado);

      await expect(
        service.actualizarAsientoBorrador(TENANT, USER, asientoConfirmado.id, {
          fecha: '2026-03-15',
          concepto: 'Corregido',
          detalles: [
            { cuenta_id: 'cuenta-63', debe: 50, haber: 0, concepto: 'a' },
            { cuenta_id: 'cuenta-42', debe: 0, haber: 50, concepto: 'b' }
          ]
        })
      ).rejects.toThrow(/inmutable/i);

      expect(actualizaciones).toHaveLength(0);
    });

    it('no permite eliminar', async () => {
      dadoElAsiento(asientoConfirmado);

      await expect(
        service.eliminarAsientoBorrador(TENANT, asientoConfirmado.id)
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(eliminaciones).toHaveLength(0);
    });

    it('no permite confirmar de nuevo', async () => {
      dadoElAsiento(asientoConfirmado);

      await expect(
        service.confirmarAsiento(TENANT, USER, asientoConfirmado.id)
      ).rejects.toThrow(/CONFIRMADO/);
    });
  });

  describe('transiciones prohibidas sobre un asiento ANULADO', () => {
    it('no permite reabrirlo por ninguna vía', async () => {
      dadoElAsiento({ ...asientoConfirmado, estado: 'ANULADO' });

      await expect(
        service.confirmarAsiento(TENANT, USER, asientoConfirmado.id)
      ).rejects.toThrow(/estado final/i);
    });
  });

  describe('transiciones permitidas sobre un BORRADOR', () => {
    const borrador = { ...asientoConfirmado, id: 'borrador-1', estado: 'BORRADOR' };

    it('confirma revalidando las líneas dentro de la transacción', async () => {
      dadoElAsiento(borrador);
      tablas['plan_cuentas'] = { data: [{ id: 'cuenta-63' }, { id: 'cuenta-42' }], error: null };

      await service.confirmarAsiento(TENANT, USER, borrador.id);

      expect(rpcs).toContainEqual({
        funcion: 'transicionar_asiento_borrador_tx',
        parametros: expect.objectContaining({
          p_asiento_id: borrador.id,
          p_destino: 'CONFIRMADO',
          p_actor: USER
        })
      });
    });

    it('anula bajo lock y conserva el motivo', async () => {
      dadoElAsiento(borrador);

      await service.anularAsientoBorrador(TENANT, USER, borrador.id, 'Error de digitación');

      expect(rpcs).toContainEqual({
        funcion: 'transicionar_asiento_borrador_tx',
        parametros: expect.objectContaining({
          p_asiento_id: borrador.id,
          p_destino: 'ANULADO',
          p_motivo: 'Error de digitación'
        })
      });
    });

    it('elimina bajo lock sin depender de una compensación posterior', async () => {
      dadoElAsiento(borrador);

      await service.eliminarAsientoBorrador(TENANT, borrador.id);

      expect(rpcs).toContainEqual({
        funcion: 'eliminar_asiento_borrador_tx',
        parametros: { p_tenant_id: TENANT, p_asiento_id: borrador.id }
      });
    });

    it('actualiza cabecera y líneas mediante una única RPC', async () => {
      dadoElAsiento(borrador);
      tablas['plan_cuentas'] = { data: [{ id: 'cuenta-63' }, { id: 'cuenta-42' }], error: null };

      await service.actualizarAsientoBorrador(TENANT, USER, borrador.id, {
        fecha: '2026-03-16',
        concepto: 'Corregido',
        detalles: [
          { cuenta_id: 'cuenta-63', debe: 50, haber: 0, concepto: 'a' },
          { cuenta_id: 'cuenta-42', debe: 0, haber: 50, concepto: 'b' }
        ]
      });

      expect(rpcs).toContainEqual({
        funcion: 'actualizar_asiento_borrador_tx',
        parametros: expect.objectContaining({ p_asiento_id: borrador.id })
      });
    });
  });

  describe('reversión', () => {
    it('rechaza reversar un BORRADOR', async () => {
      dadoElAsiento({ ...asientoConfirmado, estado: 'BORRADOR' });

      await expect(
        service.reversarAsiento(TENANT, USER, asientoConfirmado.id)
      ).rejects.toThrow(/Solo se puede reversar un asiento CONFIRMADO/);
    });

    it('rechaza reversar dos veces el mismo asiento', async () => {
      dadoElAsiento(asientoConfirmado, { id: 'reversion-previa' });

      await expect(
        service.reversarAsiento(TENANT, USER, asientoConfirmado.id)
      ).rejects.toThrow(/ya fue reversado/);

      expect(rpcs).toHaveLength(0);
    });

    it('invierte debe y haber, y enlaza al original', async () => {
      dadoElAsiento(asientoConfirmado);

      await service.reversarAsiento(TENANT, USER, asientoConfirmado.id);

      const escritura = rpcs.find(r => r.funcion === 'crear_asiento_con_detalles_tx');
      expect(escritura).toBeDefined();
      expect(escritura!.parametros.p_tenant_id).toBe(TENANT);
      expect(escritura!.parametros.p_asiento).toMatchObject({
        reversion_de_asiento_id: asientoConfirmado.id,
        estado: 'CONFIRMADO'
      });

      expect(escritura!.parametros.p_detalles).toEqual([
        expect.objectContaining({ cuenta_id: 'cuenta-63', debe: 0, haber: 100, centro_costo_id: 'cc-1' }),
        expect.objectContaining({ cuenta_id: 'cuenta-42', debe: 100, haber: 0 })
      ]);
    });

    it('valida el período de la fecha de reversión, no el del original', async () => {
      dadoElAsiento(asientoConfirmado);

      await service.reversarAsiento(TENANT, USER, asientoConfirmado.id, { fecha: '2026-08-01' });

      const fechaValidada = periodosService.validarPeriodoAbierto.mock.calls[0][1] as Date;
      expect(fechaValidada.getUTCFullYear()).toBe(2026);
      expect(fechaValidada.getUTCMonth()).toBe(7); // agosto
    });

    it('propaga el cierre de período y no deja cabecera huérfana', async () => {
      dadoElAsiento(asientoConfirmado);
      periodosService.validarPeriodoAbierto.mockRejectedValueOnce(
        new BadRequestException('El período contable 2026-03 está CERRADO.')
      );

      await expect(
        service.reversarAsiento(TENANT, USER, asientoConfirmado.id)
      ).rejects.toThrow(/CERRADO/);

      expect(inserciones).toHaveLength(0);
    });
  });

  describe('creación', () => {
    const detallesValidos = [
      { cuenta_id: 'cuenta-63', debe: 100, haber: 0, concepto: 'a' },
      { cuenta_id: 'cuenta-42', debe: 0, haber: 100, concepto: 'b' }
    ];

    beforeEach(() => {
      tablas['plan_cuentas'] = { data: [{ id: 'cuenta-63' }, { id: 'cuenta-42' }], error: null };
    });

    it('mantiene CONFIRMADO como estado por defecto', async () => {
      dadoElAsiento({ ...asientoConfirmado, id: 'nuevo' });

      await service.crearAsientoManual(TENANT, USER, {
        fecha: '2026-03-15',
        concepto: 'Asiento',
        detalles: detallesValidos
      });

      const escritura = rpcs.find(r => r.funcion === 'crear_asiento_con_detalles_tx');
      expect(escritura!.parametros.p_asiento.estado).toBe('CONFIRMADO');
      expect(escritura!.parametros.p_asiento.confirmado_por).toBe(USER);
    });

    it('crea en BORRADOR cuando se pide, sin marcar confirmación', async () => {
      dadoElAsiento({ ...asientoConfirmado, id: 'nuevo', estado: 'BORRADOR' });

      await service.crearAsientoManual(TENANT, USER, {
        fecha: '2026-03-15',
        concepto: 'Asiento',
        detalles: detallesValidos,
        estado: 'BORRADOR' as any
      });

      const escritura = rpcs.find(r => r.funcion === 'crear_asiento_con_detalles_tx');
      expect(escritura!.parametros.p_asiento.estado).toBe('BORRADOR');
      expect(escritura!.parametros.p_asiento.confirmado_por).toBeNull();
      expect(escritura!.parametros.p_asiento.confirmado_en).toBeNull();
    });

    it('rechaza un asiento descuadrado antes de tocar la base', async () => {
      await expect(
        service.crearAsientoManual(TENANT, USER, {
          fecha: '2026-03-15',
          concepto: 'Descuadrado',
          detalles: [
            { cuenta_id: 'cuenta-63', debe: 100, haber: 0, concepto: 'a' },
            { cuenta_id: 'cuenta-42', debe: 0, haber: 90, concepto: 'b' }
          ]
        })
      ).rejects.toThrow(/no cuadra/);

      expect(inserciones).toHaveLength(0);
      expect(rpcs).toHaveLength(0);
    });

    it('rechaza cuentas de otra organización', async () => {
      tablas['plan_cuentas'] = { data: [{ id: 'cuenta-63' }], error: null };

      await expect(
        service.crearAsientoManual(TENANT, USER, {
          fecha: '2026-03-15',
          concepto: 'Cuenta ajena',
          detalles: detallesValidos
        })
      ).rejects.toThrow(/no existen o no pertenecen/);

      expect(inserciones).toHaveLength(0);
      expect(rpcs).toHaveLength(0);
    });

    it('propaga el fallo de la transacción sin intentar compensaciones locales', async () => {
      dadoElAsiento({ ...asientoConfirmado, id: 'nuevo' });
      resultadosRpc.crear_asiento_con_detalles_tx = {
        data: null,
        error: { message: 'fallo atómico' }
      };

      await expect(
        service.crearAsientoManual(TENANT, USER, {
          fecha: '2026-03-15',
          concepto: 'Asiento',
          detalles: detallesValidos
        })
      ).rejects.toThrow(/fallo atómico/);

      expect(rpcs).toHaveLength(1);
      expect(inserciones).toHaveLength(0);
      expect(eliminaciones).toHaveLength(0);
    });
  });
});
