import { BadRequestException } from '@nestjs/common';
import { RrhhService } from './rrhh.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';

describe('RrhhService asistencia', () => {
  let service: RrhhService;
  let client: any;

  beforeEach(() => {
    client = {
      rpc: jest.fn(),
    };

    service = new RrhhService({
      getClient: jest.fn(() => client),
    } as unknown as SupabaseService);
  });

  it('registra entrada con tenant y sincronizacion de asistencia', async () => {
    client.rpc.mockResolvedValueOnce({
      data: { id: 'asis-1', hora_entrada: '08:00' },
      error: null,
    });

    const result = await service.marcarAsistencia(
      'emp-1',
      '2026-05-14',
      'entrada',
      '08:00',
      'tenant-1',
      'actor-1',
      'attendance-entry-20260514-emp-1',
    );

    expect(result.success).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('ejecutar_operacion_rrhh_tx', {
      p_tenant_id: 'tenant-1',
      p_actor_id: 'actor-1',
      p_operacion: 'ATTENDANCE_MARK',
      p_payload: {
        empleado_id: 'emp-1',
        fecha: '2026-05-14',
        tipo: 'entrada',
        hora: '08:00',
      },
      p_idempotency_key: 'attendance-entry-20260514-emp-1',
    });
  });

  it('rechaza entrada duplicada como conflicto de negocio, no 500', async () => {
    client.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'ATTENDANCE_ENTRY_ALREADY_EXISTS' },
    });

    await expect(service.marcarAsistencia(
      'emp-1',
      '2026-05-14',
      'entrada',
      '08:05',
      'tenant-1',
      'actor-1',
      'attendance-entry-duplicate-emp-1',
    )).rejects.toMatchObject({ status: 409 });
  });

  it('rechaza salida anterior a entrada como validacion 400', async () => {
    client.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '22023', message: 'ATTENDANCE_EXIT_MUST_FOLLOW_ENTRY' },
    });

    await expect(service.marcarAsistencia(
      'emp-1',
      '2026-05-14',
      'salida',
      '07:59',
      'tenant-1',
      'actor-1',
      'attendance-exit-invalid-emp-1',
    )).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('RrhhService createContrato — normativa laboral peruana', () => {
  let service: RrhhService;
  let client: any;

  // Builder para la consulta de normativa: la fila del tenant no existe y la global trae RMV.
  const normativaChain = (rmv: number | null) => {
    const builder: any = {};
    for (const metodo of ['select', 'eq', 'is', 'lte', 'order', 'limit']) {
      builder[metodo] = jest.fn(() => builder);
    }
    builder.maybeSingle = jest.fn(async () => ({ data: rmv === null ? null : { rmv }, error: null }));
    return builder;
  };

  // Un contrato laboral peruano siempre declara régimen pensionario: sin él no se
  // puede liquidar la planilla, y desde ahora el alta lo exige.
  const base = {
    empleado_id: 'emp-1',
    tipo_contrato: 'indefinido',
    fecha_inicio: '2026-07-01',
    moneda: 'PEN',
    regimen_pensionario: 'ONP',
  };

  beforeEach(() => {
    client = { from: jest.fn(), rpc: jest.fn() };
    service = new RrhhService({ getClient: jest.fn(() => client) } as unknown as SupabaseService);
  });

  it('rechaza remuneracion menor a la RMV en jornada completa', async () => {
    // Primera llamada: fila del tenant (vacía). Segunda: fila global con RMV 1130.
    client.from
      .mockReturnValueOnce(normativaChain(null))
      .mockReturnValueOnce(normativaChain(1130));

    await expect(service.createContrato(
      { ...base, jornada_laboral: 'tiempo_completo', sueldo_bruto: 900 },
      'tenant-1',
    )).rejects.toThrow(/RMV vigente/);
  });

  it('permite remuneracion bajo la RMV en part time', async () => {
    // En part time no se consulta normativa: la RMV completa no es exigible.
    client.rpc.mockResolvedValueOnce({ data: { id: 'ctr-1' }, error: null });

    const result = await service.createContrato(
      { ...base, jornada_laboral: 'part_time', sueldo_bruto: 700 },
      'tenant-1',
      'actor-1',
      'contract-part-time-emp-1',
    );

    expect(result.success).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith(
      'ejecutar_operacion_rrhh_tx',
      expect.objectContaining({
        p_actor_id: 'actor-1',
        p_operacion: 'CONTRACT_CREATE',
        p_idempotency_key: 'contract-part-time-emp-1',
      }),
    );
  });

  it('rechaza contrato sujeto a modalidad mayor a 5 anios', async () => {
    await expect(service.createContrato(
      { ...base, tipo_contrato: 'temporal', fecha_fin: '2031-08-01', sueldo_bruto: 2000 },
      'tenant-1',
    )).rejects.toThrow(/5 años/);
  });

  it('acepta contrato sujeto a modalidad de exactamente 5 anios', async () => {
    client.from
      .mockReturnValueOnce(normativaChain(null))
      .mockReturnValueOnce(normativaChain(1130));
    client.rpc.mockResolvedValueOnce({ data: { id: 'ctr-2' }, error: null });

    const result = await service.createContrato(
      { ...base, tipo_contrato: 'temporal', fecha_fin: '2031-07-01', sueldo_bruto: 2000 },
      'tenant-1',
      'actor-1',
      'contract-five-years-emp-1',
    );

    expect(result.success).toBe(true);
  });

  it('rechaza periodo de prueba mayor al maximo legal de 12 meses', async () => {
    await expect(service.createContrato(
      { ...base, periodo_prueba_meses: 18, sueldo_bruto: 2000 },
      'tenant-1',
    )).rejects.toThrow(/periodo de prueba/i);
  });

  // El régimen pensionario decide cuánto se le descuenta al trabajador. Antes no se
  // exigía al crear el contrato y el motor de planilla lo suplía con AFP, de modo
  // que alguien que nunca eligió terminaba con cerca de 13 % descontado.
  it('rechaza un contrato laboral peruano sin regimen pensionario', async () => {
    client.from
      .mockReturnValueOnce(normativaChain(null))
      .mockReturnValueOnce(normativaChain(1130));
    const { regimen_pensionario: _omitido, ...sinRegimen } = base;
    await expect(service.createContrato(
      { ...sinRegimen, sueldo_bruto: 2000 },
      'tenant-1',
    )).rejects.toThrow(/régimen pensionario/i);
  });

  it('rechaza un regimen pensionario que no sea AFP ni ONP', async () => {
    client.from
      .mockReturnValueOnce(normativaChain(null))
      .mockReturnValueOnce(normativaChain(1130));
    await expect(service.createContrato(
      { ...base, regimen_pensionario: 'NINGUNO', sueldo_bruto: 2000 },
      'tenant-1',
    )).rejects.toThrow(/régimen pensionario/i);
  });

  it('exige la administradora cuando el afiliado va a AFP', async () => {
    client.from
      .mockReturnValueOnce(normativaChain(null))
      .mockReturnValueOnce(normativaChain(1130));
    await expect(service.createContrato(
      { ...base, regimen_pensionario: 'AFP', tipo_comision_afp: 'FLUJO', sueldo_bruto: 2000 },
      'tenant-1',
    )).rejects.toThrow(/administradora/i);
  });

  it('exige el tipo de comision cuando el afiliado va a AFP', async () => {
    client.from
      .mockReturnValueOnce(normativaChain(null))
      .mockReturnValueOnce(normativaChain(1130));
    await expect(service.createContrato(
      { ...base, regimen_pensionario: 'AFP', afp_codigo: 'PRIMA', sueldo_bruto: 2000 },
      'tenant-1',
    )).rejects.toThrow(/tipo de comisión/i);
  });

  // No se cae a Integra en silencio: un afiliado a Prima quedaba registrado con una
  // administradora que no era la suya.
  it('conserva la administradora declarada en vez de sustituirla por Integra', async () => {
    client.from
      .mockReturnValueOnce(normativaChain(null))
      .mockReturnValueOnce(normativaChain(1130));
    client.rpc.mockResolvedValueOnce({ data: { id: 'ctr-afp' }, error: null });

    await service.createContrato(
      {
        ...base,
        regimen_pensionario: 'AFP',
        afp_codigo: 'prima',
        tipo_comision_afp: 'saldo',
        sueldo_bruto: 2000,
      },
      'tenant-1',
      'actor-1',
      'contract-afp-emp-1',
    );

    const payload = client.rpc.mock.calls.at(-1)?.[1];
    const metadata = payload?.p_payload?.metadata ?? payload?.p_contrato?.metadata ?? {};
    expect(metadata.afp_codigo).toBe('PRIMA');
    expect(metadata.tipo_comision_afp).toBe('SALDO');
  });

  it('no exige regimen pensionario en locacion de servicios por no ser contrato laboral', async () => {
    client.rpc.mockResolvedValueOnce({ data: { id: 'ctr-loc' }, error: null });
    const { regimen_pensionario: _omitido, ...sinRegimen } = base;

    const result = await service.createContrato(
      { ...sinRegimen, tipo_contrato: 'locacion_servicios', sueldo_bruto: 500 },
      'tenant-1',
      'actor-1',
      'contract-locacion-sin-regimen',
    );

    expect(result).toBeDefined();
  });

  it('no exige RMV en locacion de servicios por no ser contrato laboral', async () => {
    client.rpc.mockResolvedValueOnce({ data: { id: 'ctr-3' }, error: null });

    const result = await service.createContrato(
      { ...base, tipo_contrato: 'locacion_servicios', sueldo_bruto: 500 },
      'tenant-1',
      'actor-1',
      'contract-locacion-emp-1',
    );

    expect(result.success).toBe(true);
  });
});

describe('RrhhService liquidaciones — frontera transaccional', () => {
  const activeEmployee = {
    id: 'emp-1',
    fecha_ingreso: '2024-01-01',
    contratos: [{
      id: 'contrato-1',
      estado: 'en_periodo_prueba',
      sueldo_bruto: 2_000_000,
      tipo_contrato: 'indefinido',
      metadata: {},
    }],
  };

  const employeeQuery = () => {
    const query: any = {};
    query.select = jest.fn(() => query);
    query.eq = jest.fn(() => query);
    query.in = jest.fn(() => query);
    query.single = jest.fn().mockResolvedValue({ data: activeEmployee, error: null });
    return query;
  };

  it('rechaza el cálculo sin actor antes de consultar o escribir RRHH', async () => {
    const getClient = jest.fn();
    const service = new RrhhService({ getClient } as any);

    await expect(service.calcularLiquidacion(
      'emp-1',
      'renuncia',
      '2026-08-09',
      'tenant-1',
      undefined,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(getClient).not.toHaveBeenCalled();
  });

  it.each(['AR', 'CO'] as const)(
    'calcular para %s no cesa al empleado ni termina el contrato',
    async (pais) => {
      const empleadoBuilder = employeeQuery();
      const rpc = jest.fn().mockResolvedValue({
        data: { success: true, data: { id: 'liq-1', estado: 'calculada' } },
        error: null,
      });
      const colombiaConfig: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { salario_minimo: 1_750_905, auxilio_transporte: 249_095 },
          error: null,
        }),
      };
      const client = {
        from: jest.fn((table: string) => {
          if (table === 'empleados') return empleadoBuilder;
          if (table === 'rrhh_configuracion_colombia') return colombiaConfig;
          throw new Error(`Tabla inesperada: ${table}`);
        }),
        rpc,
      };
      const service = new RrhhService(
        { getClient: jest.fn(() => client) } as any,
        undefined,
        { obtenerContexto: jest.fn().mockResolvedValue({ codigo: pais }) } as any,
      );

      const result = await service.calcularLiquidacion(
        'emp-1',
        'renuncia',
        '2026-08-09',
        'tenant-1',
        'actor-1',
      );

      expect(result).toMatchObject({ success: true, data: { estado: 'calculada' } });
      expect(empleadoBuilder.in).toHaveBeenCalledWith(
        'contratos.estado',
        ['vigente', 'renovado', 'en_periodo_prueba'],
      );
      expect(client.from).not.toHaveBeenCalledWith('contratos');
      expect(client.from).not.toHaveBeenCalledWith('liquidaciones');
      expect((empleadoBuilder as any).update).toBeUndefined();
      expect(rpc).toHaveBeenCalledWith(
        'guardar_liquidacion_calculada_tx',
        expect.objectContaining({
          p_tenant_id: 'tenant-1',
          p_usuario_id: 'actor-1',
          p_liquidacion: expect.objectContaining({
            id_empleado: 'emp-1',
            estado: 'calculada',
            pais_codigo: pais,
          }),
        }),
      );
    },
  );

  it('delega confirmación, pago, reversa y depósito CTS a sus RPC atómicas con actor', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { success: true }, error: null });
    const service = new RrhhService({
      getClient: jest.fn(() => ({ rpc })),
    } as any);

    await service.confirmarLiquidacion('liq-1', 'tenant-1', 'actor-1');
    await service.pagarLiquidacion(
      'liq-1',
      { metodo_pago: 'transferencia', cuenta_bancaria_id: 'bank-1', referencia: 'OP-1' },
      'tenant-1',
      'actor-1',
    );
    await service.revertirPagoLiquidacion('liq-1', 'error bancario', 'tenant-1', 'actor-1');
    await service.depositarCts(
      'cts-1',
      { cuenta_bancaria_id: 'bank-1', referencia: 'CTS-1' },
      'tenant-1',
      'actor-1',
    );

    expect(rpc).toHaveBeenNthCalledWith(1, 'confirmar_liquidacion_tx', expect.objectContaining({
      p_usuario_id: 'actor-1',
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, 'pagar_liquidacion_tx', expect.objectContaining({
      p_pago: expect.objectContaining({ referencia: 'OP-1' }),
    }));
    expect(rpc).toHaveBeenNthCalledWith(3, 'revertir_pago_liquidacion_tx', expect.objectContaining({
      p_motivo: 'error bancario',
    }));
    expect(rpc).toHaveBeenNthCalledWith(4, 'depositar_cts_tx', expect.objectContaining({
      p_deposito_id: 'cts-1',
    }));
  });
});
