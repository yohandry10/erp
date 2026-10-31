import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { RrhhService } from './rrhh.service';

const EMPLEADO = 'a66a0b8a-5b9e-46fc-9658-a720f405b9c3';
const TENANT = 'tenant-pe';

function escenario({ ingreso = '2024-01-01', sueldo = 1200, periodo = '2026-07',
  gratificacion, bonificacion = 0, pago = '2026-07-15T17:00:00Z', errorTabla,
  depositos = [], estado = 'pagada', tenantPlanilla = TENANT, contratos, ficha,
}: {
  ingreso?: string; sueldo?: number; periodo?: string; gratificacion?: number; bonificacion?: number;
  pago?: string; errorTabla?: string; depositos?: any[]; estado?: string; tenantPlanilla?: string; contratos?: any[]; ficha?: any;
} = {}) {
  const empleado = {
    id: EMPLEADO, tenant_id: TENANT, estado: 'activo', fecha_ingreso: ingreso,
    contratos: contratos ?? [{ id: 'c1', fecha_inicio: ingreso, estado: 'vigente', sueldo_bruto: sueldo, tipo_contrato: 'indefinido', metadata: {} }],
    rrhh_peru_fichas_laborales: ficha ? [ficha] : [],
  };
  const filas: Record<string, any[]> = {
    empleados: [empleado], solicitudes: [], depositos_cts: depositos,
    normativa_peru_periodos: [{ tenant_id: TENANT, pais_codigo: 'PE', periodo: '2020-01', activo: true, rmv: 1130 }],
    planillas: gratificacion === undefined ? [] : [{ id: 'p1', tenant_id: tenantPlanilla, estado, periodo, fecha_pago: pago }],
    conceptos_planilla: [{ id: 'g6', tenant_id: TENANT, codigo: '006' }, { id: 'b7', tenant_id: TENANT, codigo: '007' }],
    empleado_planilla: [{ id: 'ep1', tenant_id: TENANT, empleado_id: EMPLEADO, planilla_id: 'p1' }],
    empleado_planilla_conceptos: gratificacion === undefined ? [] : [
      { empleado_planilla_id: 'ep1', tenant_id: TENANT, concepto_id: 'g6', monto: gratificacion },
      { empleado_planilla_id: 'ep1', tenant_id: TENANT, concepto_id: 'b7', monto: bonificacion },
    ],
  };
  const consultas: { tabla: string; filtros: [string, string, unknown][] }[] = [];
  const rpc = jest.fn().mockImplementation(async (_nombre, payload) => ({
    data: payload.p_liquidacion
      ? { success: true, data: payload.p_liquidacion }
      : { success: true, depositosIds: [], total: payload.p_depositos.reduce((s: number, d: any) => s + d.monto, 0) },
    error: null,
  }));
  const client = {
    rpc,
    from: jest.fn((tabla: string) => {
      if (!filas[tabla]) throw new Error(`Tabla inesperada: ${tabla}`);
      const filtros: [string, string, unknown][] = [];
      consultas.push({ tabla, filtros });
      const q: any = {};
      q.select = jest.fn(() => q);
      q.order = jest.fn(() => q);
      q.limit = jest.fn(() => q);
      for (const op of ['eq', 'in', 'lt', 'lte', 'gte']) q[op] = jest.fn((campo, valor) => {
        filtros.push([op, campo, valor]); return q;
      });
      const resultado = () => {
        const data = filas[tabla].filter(f => filtros.every(([op, campo, valor]: any) => {
          if (campo.includes('.')) return true;
          if (op === 'eq') return f[campo] === valor;
          if (op === 'in') return valor.includes(f[campo]);
          if (op === 'lt') return f[campo] < valor;
          if (op === 'lte') return f[campo] <= valor;
          return f[campo] >= valor;
        }));
        return { data, error: tabla === errorTabla ? { code: '42501', message: 'lectura denegada' } : null };
      };
      q.single = jest.fn(async () => ({ ...resultado(), data: resultado().data[0] }));
      q.maybeSingle = q.single;
      q.then = (resolve: any) => resolve(resultado());
      return q;
    }),
  };
  const service = new RrhhService(
    { getClient: () => client } as any, undefined,
    { obtenerContexto: async () => ({ codigo: 'PE' }) } as any,
  );
  return { service, rpc, consultas };
}

describe('CTS y liquidación con gratificación histórica', () => {
  it('congela6.75% EPS en liquidación sin añadir el bono anterior aCTS', async () => {
    const { service } = escenario({ ingreso: '2026-03-01', ficha: { activo: true, regimen_salud_codigo: '01', eps_servicios_propios_codigo: '3' } });
    const { data } = await service.calcularLiquidacion(EMPLEADO, 'renuncia', '2026-06-30', TENANT, 'actor');
    expect(data.metadata.gratificacion_trunca).toBe(800);
    expect(data.metadata.bonificacion_extraordinaria).toBe(54);
    expect(data.metadata.tasa_bonificacion_gratificacion).toBe(0.0675);
    expect(data.metadata.regimen_bonificacion_gratificacion).toBe('EPS');
    expect(data.monto_cts).toBe(400);
    expect(data.total_liquidacion).toBe(1654);
  });
  it('la gratificación trunca usa el contrato del mes anterior cuando cambia el sueldo al cese', async () => {
    const { service } = escenario({ ingreso: '2026-03-01', gratificacion: 1000, contratos: [
      { id: 'anterior', fecha_inicio: '2026-03-01', fecha_fin: '2026-09-30', estado: 'finalizado', sueldo_bruto: 1500 },
      { id: 'actual', fecha_inicio: '2026-10-01', estado: 'vigente', sueldo_bruto: 2000 },
    ] });
    const { data } = await service.calcularLiquidacion(EMPLEADO, 'renuncia', '2026-10-31', TENANT, 'actor');
    expect(data.metadata.remuneracion_mensual).toBe(2000);
    expect(data.metadata.gratificacion_trunca).toBe(1000);
    expect(data.metadata.base_gratificacion_trunca).toMatchObject({ monto: 1500, periodo: '2026-09', contrato_id: 'anterior', fuente: 'CONTRATO_HISTORICO' });
  });
  it('acepta una base externa explícita y audita el actor sin crear un pago histórico', async () => {
    const { service, rpc } = escenario({ ingreso: '2026-03-01', gratificacion: 1000, contratos: [
      { id: 'actual', fecha_inicio: '2026-10-01', estado: 'vigente', sueldo_bruto: 2000 },
    ] });
    const { data } = await service.calcularLiquidacion(EMPLEADO, 'renuncia', '2026-10-31', TENANT, 'actor', undefined, {
      periodo: '2026-09', monto: 1500, referencia: 'Boleta de septiembre anterior al ERP',
    });
    expect(data.metadata.gratificacion_trunca).toBe(1000);
    expect(data.metadata.base_gratificacion_trunca).toMatchObject({ monto: 1500, fuente: 'FUENTE_EXTERNA_DECLARADA', declarado_por: 'actor' });
    expect(rpc.mock.calls.map(c => c[0])).toEqual(['guardar_liquidacion_calculada_tx']);
  });
  it('no presupone el salario del mes anterior si sólo conoce un contrato iniciado al cese', async () => {
    const { service, rpc } = escenario({ ingreso: '2026-03-01', gratificacion: 1000, contratos: [
      { id: 'actual', fecha_inicio: '2026-10-01', estado: 'vigente', sueldo_bruto: 2000 },
    ] });
    await expect(service.calcularLiquidacion(EMPLEADO, 'renuncia', '2026-10-31', TENANT, 'actor')).rejects.toThrow(/2026-09/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([{ periodo: '2026-10' }, { monto: 1.001 }, { monto: 0 }, { referencia: '  ' }])(
    'rechaza una base histórica inválida (%j)', async cambio => {
      const { service, rpc } = escenario({ ingreso: '2026-03-01', gratificacion: 1000 });
      await expect(service.calcularLiquidacion(EMPLEADO, 'renuncia', '2026-10-31', TENANT, 'actor', undefined, {
        periodo: '2026-09', monto: 1500, referencia: 'Boleta septiembre', ...cambio,
      })).rejects.toBeInstanceOf(BadRequestException);
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it.each(['2026-06-30', '2026-12-31'])('no pierde el semestre completo con cese %s', async (cese) => {
    const { service } = escenario({ ingreso: '2026-01-01' });
    const fuente = cese.endsWith('12-31')
      ? { periodo: '2026-12', monto: 0, fecha_pago: '2026-12-31', referencia: 'Sin gratificación percibida' }
      : undefined;
    const { data } = await service.calcularLiquidacion(EMPLEADO, 'renuncia', cese, TENANT, 'actor', fuente);
    expect(data.metadata.gratificacion_trunca).toBe(1200);
    expect(data.metadata.bonificacion_extraordinaria_9).toBe(108);
  });

  it('usa lo pagado en julio aunque el sueldo aumentara antes del depósito CTS', async () => {
    const { service, rpc, consultas } = escenario({ sueldo: 2000, periodo: '2025-07', gratificacion: 1000, pago: '2025-07-15T17:00:00Z' });
    await service.calcularDepositosCts('2025-11', TENANT, 'actor');
    const deposito = rpc.mock.calls[0][1].p_depositos[0];
    expect(deposito.remuneracion_computable).toBe(2166.67);
    expect(deposito.monto).toBe(1083.34);
    expect(deposito.metadata.gratificacion_cts).toMatchObject({ monto: 1000, fuente: 'PLANILLA_PAGADA', planilla_ids: ['p1'] });
    for (const consulta of consultas.filter(c => ['planillas', 'empleado_planilla', 'empleado_planilla_conceptos', 'conceptos_planilla'].includes(c.tabla))) {
      expect(consulta.filtros).toContainEqual(['eq', 'tenant_id', TENANT]);
    }
    expect(consultas.find(c => c.tabla === 'empleado_planilla')?.filtros).toContainEqual(['eq', 'empleado_id', EMPLEADO]);
  });

  it('CTS mayo calcula con sueldo de abril aunque el contrato actual comience en octubre', async () => {
    const { service, rpc } = escenario({ ingreso: '2026-03-01', contratos: [
      { id: 'new', fecha_inicio: '2026-10-01', estado: 'vigente', sueldo_bruto: 2000 },
      { id: 'old', fecha_inicio: '2026-03-01', fecha_fin: '2026-09-30', estado: 'finalizado', sueldo_bruto: 1200 },
    ] });
    await service.calcularDepositosCts('2026-05', TENANT, 'actor');
    expect(rpc.mock.calls[0][1].p_depositos[0]).toMatchObject({ remuneracion_computable: 1200, monto: 200,
      metadata: { base_remuneracion_cts: { periodo: '2026-04', monto: 1200, contrato_id: 'old' } } });
  });
  it('CTS admite base computable externa con variables regulares y actor sin inventar historial pagado', async () => {
    const { service, rpc } = escenario({ ingreso: '2026-03-01' });
    await service.calcularDepositosCts('2026-05', TENANT, 'actor', [], [{ empleado_id: EMPLEADO,
      periodo: '2026-04', monto: 1500, referencia: 'Boleta abril y promedio semestral horas extras' }]);
    expect(rpc.mock.calls[0][1].p_depositos[0]).toMatchObject({ remuneracion_computable: 1500, monto: 250,
      metadata: { base_remuneracion_cts: { monto: 1500, fuente: 'FUENTE_EXTERNA_DECLARADA', declarado_por: 'actor' } } });
  });

  it.each([[1200, 108, 0, 0], [1000, 90, 200, 18]])(
    'deduce diciembre ya pagado: gratificación %s y bonificación %s',
    async (gratificacion, bonificacion, pendiente, bonoPendiente) => {
      const { service } = escenario({ ingreso: '2026-01-01', periodo: '2026-12', gratificacion, bonificacion, pago: '2026-12-15T17:00:00Z' });
      const { data } = await service.calcularLiquidacion(EMPLEADO, 'renuncia', '2026-12-31', TENANT, 'actor');
      expect(data.metadata.gratificacion_trunca).toBe(pendiente);
      expect(data.metadata.bonificacion_extraordinaria_9).toBe(bonoPendiente);
      expect(data.metadata.gratificacion_cts.monto).toBe(gratificacion);
    },
  );

  it('no sustituye un importe pagado por una declaración distinta', async () => {
    const { service, rpc } = escenario({ gratificacion: 1000 });
    await expect(service.calcularLiquidacion(EMPLEADO, 'renuncia', '2026-10-31', TENANT, 'actor', {
      periodo: '2026-07', monto: 1200, fecha_pago: '2026-07-15', referencia: 'Importe declarado',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('incluye un pago del último día en Lima aunque su instante UTC sea del día siguiente', async () => {
    const { service } = escenario({ gratificacion: 1000, pago: '2026-11-01T04:30:00Z' });
    const { data } = await service.calcularLiquidacion(EMPLEADO, 'renuncia', '2026-10-31', TENANT, 'actor');
    expect(data.metadata.gratificacion_cts).toMatchObject({ monto: 1000, fuente: 'PLANILLA_PAGADA' });
  });

  it.each([{ estado: 'calculada' }, { tenantPlanilla: 'otro-tenant' }, { pago: '2026-11-01T17:00:00Z' }])(
    'no trata como percibida una planilla sin evidencia aplicable (%j)', async (opciones) => {
      const { service, rpc } = escenario({ gratificacion: 1200, ...opciones });
      await expect(service.calcularLiquidacion(EMPLEADO, 'renuncia', '2026-10-31', TENANT, 'actor'))
        .rejects.toBeInstanceOf(ConflictException);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it('permite declarar un histórico externo y conserva fuente, actor e importe en el cálculo', async () => {
    const { service } = escenario();
    const { data } = await service.calcularLiquidacion(EMPLEADO, 'renuncia', '2026-10-31', TENANT, 'actor', {
      periodo: '2026-07', monto: 900, fecha_pago: '2026-07-15', referencia: 'Boleta anterior al ERP',
    });
    expect(data.metadata.gratificacion_cts).toMatchObject({ monto: 900, fuente: 'FUENTE_EXTERNA_DECLARADA', declarado_por: 'actor' });
    expect(data.metadata.remuneracion_computable_cts).toBe(1350);
  });

  it.each(['planillas', 'conceptos_planilla', 'empleado_planilla', 'empleado_planilla_conceptos'])(
    'falla cerrado con 503 si no puede leer %s, incluso si hay declaración externa', async (errorTabla) => {
      const { service, rpc } = escenario({ gratificacion: 1000, errorTabla });
      await expect(service.calcularLiquidacion(EMPLEADO, 'renuncia', '2026-10-31', TENANT, 'actor', {
        periodo: '2026-07', monto: 1000, fecha_pago: '2026-07-15', referencia: 'Historia',
      })).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it.each([
    { periodo: '2026-12' }, { fecha_pago: '2026-11-01' }, { fecha_pago: '2026-02-30' },
    { monto: -1 }, { monto: 10.001 }, { referencia: '  ' },
  ])('rechaza la declaración inválida antes de escribir (%j)', async (cambio) => {
    const { service, rpc } = escenario();
    await expect(service.calcularLiquidacion(EMPLEADO, 'renuncia', '2026-10-31', TENANT, 'actor', {
      periodo: '2026-07', monto: 1000, fecha_pago: '2026-07-15', referencia: 'Historia', ...cambio,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });
});
