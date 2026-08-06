import { contratoVigenteDe, PlanillasService } from './planillas.service';

// El contrato que rige la relación laboral decide si el empleado entra a planilla y
// con qué régimen pensionario se le descuenta. Filtrar solo por 'vigente' dejaba fuera
// del pago a los contratos renovados o en periodo de prueba.
describe('contratoVigenteDe', () => {
  it('toma el contrato vigente', () => {
    const empleado = {
      contratos: [{ estado: 'vigente', regimen_pensionario: 'ONP' }],
    };
    expect(contratoVigenteDe(empleado)?.regimen_pensionario).toBe('ONP');
  });

  it('considera vigente un contrato renovado', () => {
    const empleado = {
      contratos: [{ estado: 'renovado', regimen_pensionario: 'ONP' }],
    };
    expect(contratoVigenteDe(empleado)).toBeDefined();
  });

  it('considera vigente un contrato en periodo de prueba', () => {
    const empleado = {
      contratos: [{ estado: 'en_periodo_prueba', regimen_pensionario: 'AFP' }],
    };
    expect(contratoVigenteDe(empleado)).toBeDefined();
  });

  it('ignora contratos finalizados aunque vengan primero en el arreglo', () => {
    const empleado = {
      contratos: [
        { estado: 'finalizado', regimen_pensionario: 'AFP' },
        { estado: 'vigente', regimen_pensionario: 'ONP' },
      ],
    };
    expect(contratoVigenteDe(empleado)?.regimen_pensionario).toBe('ONP');
  });

  it('no devuelve contrato si todos estan terminados', () => {
    const empleado = {
      contratos: [{ estado: 'terminado' }, { estado: 'anulado' }],
    };
    expect(contratoVigenteDe(empleado)).toBeUndefined();
  });

  it('tolera empleado sin contratos', () => {
    expect(contratoVigenteDe({})).toBeUndefined();
    expect(contratoVigenteDe(null)).toBeUndefined();
  });

  // Una renovación puede dejar dos contratos vigentes a la vez. Sin un criterio
  // explícito, el sueldo de la planilla dependía del orden en que la base
  // devolviera las filas.
  it('con varios vigentes toma el de fecha de inicio mas reciente', () => {
    const empleado = {
      contratos: [
        { estado: 'vigente', fecha_inicio: '2024-01-01', regimen_pensionario: 'ONP' },
        { estado: 'renovado', fecha_inicio: '2026-01-01', regimen_pensionario: 'AFP' },
      ],
    };
    expect(contratoVigenteDe(empleado)?.regimen_pensionario).toBe('AFP');
  });

  it('el orden del arreglo no altera el contrato elegido', () => {
    const nuevo = { estado: 'renovado', fecha_inicio: '2026-01-01', regimen_pensionario: 'AFP' };
    const viejo = { estado: 'vigente', fecha_inicio: '2024-01-01', regimen_pensionario: 'ONP' };

    expect(contratoVigenteDe({ contratos: [nuevo, viejo] })?.regimen_pensionario).toBe('AFP');
    expect(contratoVigenteDe({ contratos: [viejo, nuevo] })?.regimen_pensionario).toBe('AFP');
  });

  it('cae a created_at cuando falta la fecha de inicio', () => {
    const empleado = {
      contratos: [
        { estado: 'vigente', created_at: '2026-05-01', regimen_pensionario: 'AFP' },
        { estado: 'vigente', created_at: '2024-05-01', regimen_pensionario: 'ONP' },
      ],
    };
    expect(contratoVigenteDe(empleado)?.regimen_pensionario).toBe('AFP');
  });
});

const normativa = {
  uit: 5500,
  rmv: 1130,
  asignacionFamiliar: 113,
  afpAporte: 0.1,
  afpPrimaSeguro: 0.0137,
  afpComisionFlujoDefault: 0.0155,
  onpAporte: 0.13,
  essaludAporte: 0.09,
  quintaDeduccionUit: 7,
};

// Códigos usados por el servicio: 001 básico, 002 asignación familiar,
// 104 ONP, 201 ESSALUD.
const conceptos = ['001', '002', '006', '007', '008', '101', '102', '103', '104', '105', '201'].map((codigo) => ({
  id: `c-${codigo}`,
  codigo,
}));

const service = new PlanillasService({ getClient: jest.fn() } as any, {} as any);

const calcular = (empleado: any, sueldo: number, periodo?: string, diasVacaciones = 0) =>
  (service as any).calcularEmpleado(empleado, sueldo, conceptos, normativa, periodo, diasVacaciones);

const montoDe = (r: any, codigo: string) =>
  r.conceptosDetalle.find((d: any) => d.id === `c-${codigo}`)?.monto;

// La asignación familiar es remuneración computable (Ley 25129): integra la base de
// AFP/ONP y del aporte del empleador a ESSALUD. Calcularla solo sobre el sueldo básico
// sub-declaraba el aporte a ESSALUD y sub-retenía el aporte previsional.
describe('calcularEmpleado — base asegurable peruana', () => {

  it('incluye la asignacion familiar en la base de ONP y ESSALUD', () => {
    const empleado = {
      tiene_hijos: true,
      contratos: [{ estado: 'vigente', regimen_pensionario: 'ONP' }],
    };

    const r = calcular(empleado, 2000);

    expect(r.totalIngresos).toBe(2113); // 2000 + 113
    expect(montoDe(r, '104')).toBe(274.69); // ONP 13% sobre 2113, no sobre 2000
    expect(montoDe(r, '201')).toBe(190.17); // ESSALUD 9% sobre 2113
  });

  it('sin hijos la base es solo el sueldo basico', () => {
    const empleado = {
      tiene_hijos: false,
      contratos: [{ estado: 'vigente', regimen_pensionario: 'ONP' }],
    };

    const r = calcular(empleado, 2000);

    expect(r.totalIngresos).toBe(2000);
    expect(montoDe(r, '104')).toBe(260); // 13% de 2000
    expect(montoDe(r, '201')).toBe(180); // 9% de 2000
  });

  it('aplica AFP cuando el regimen del contrato vigente es AFP', () => {
    const empleado = {
      tiene_hijos: false,
      contratos: [{ estado: 'vigente', regimen_pensionario: 'AFP' }],
    };

    const r = calcular(empleado, 2000);

    expect(montoDe(r, '101')).toBe(200); // aporte 10%
    expect(montoDe(r, '104')).toBeUndefined(); // no debe haber ONP
  });
});

// Ley 27735: la gratificacion se paga en julio y diciembre. Ley 30334: esta
// inafecta de aportes y contribuciones, y se agrega una bonificacion
// extraordinaria del 9 % equivalente al aporte a EsSalud que no se paga.
describe('calcularEmpleado — gratificaciones de ley', () => {
  const empleadoDesde = (fechaIngreso: string) => ({
    tiene_hijos: false,
    fecha_ingreso: fechaIngreso,
    contratos: [{ estado: 'vigente', regimen_pensionario: 'ONP' }],
  });

  it('no paga gratificacion en un mes que no es julio ni diciembre', () => {
    const r = calcular(empleadoDesde('2020-01-01'), 2000, '2026-05');
    expect(montoDe(r, '006')).toBeUndefined();
    expect(r.totalIngresos).toBe(2000);
  });

  it('en julio paga un sueldo completo por el semestre trabajado', () => {
    const r = calcular(empleadoDesde('2020-01-01'), 2000, '2026-07');
    expect(montoDe(r, '006')).toBe(2000);
    expect(montoDe(r, '007')).toBe(180); // 9 % de 2000
    expect(r.totalIngresos).toBe(4180);
  });

  it('en diciembre paga por el semestre julio-diciembre', () => {
    const r = calcular(empleadoDesde('2020-01-01'), 2000, '2026-12');
    expect(montoDe(r, '006')).toBe(2000);
  });

  it('prorratea por los meses completos del semestre', () => {
    // Ingreso en abril: abril, mayo y junio -> 3/6
    const r = calcular(empleadoDesde('2026-04-01'), 2400, '2026-07');
    expect(montoDe(r, '006')).toBe(1200);
    expect(montoDe(r, '007')).toBe(108);
  });

  it('la gratificacion no entra en la base de ONP ni de EsSalud', () => {
    const r = calcular(empleadoDesde('2020-01-01'), 2000, '2026-07');
    // Aportes sobre 2000, no sobre 4180
    expect(montoDe(r, '104')).toBe(260);
    expect(montoDe(r, '201')).toBe(180);
  });

  it('la asignacion familiar si integra la base de la gratificacion', () => {
    const empleado = { ...empleadoDesde('2020-01-01'), tiene_hijos: true };
    const r = calcular(empleado, 2000, '2026-07');
    expect(montoDe(r, '006')).toBe(2113);
  });
});

// D. Leg. 713 art. 15: la remuneracion vacacional sustituye al sueldo de esos
// dias, no se suma. Y es remuneracion computable, asi que los aportes no varian.
describe('calcularEmpleado — remuneracion vacacional', () => {
  const empleado = {
    tiene_hijos: false,
    fecha_ingreso: '2020-01-01',
    contratos: [{ estado: 'vigente', regimen_pensionario: 'ONP' }],
  };

  it('separa el tramo vacacional sin cambiar el total del mes', () => {
    const r = calcular(empleado, 3000, '2026-03', 15);
    expect(montoDe(r, '001')).toBe(1500);
    expect(montoDe(r, '008')).toBe(1500);
    expect(r.totalIngresos).toBe(3000);
  });

  it('no altera la base de ONP ni de EsSalud', () => {
    const conVacaciones = calcular(empleado, 3000, '2026-03', 15);
    const sinVacaciones = calcular(empleado, 3000, '2026-03', 0);
    expect(montoDe(conVacaciones, '104')).toBe(montoDe(sinVacaciones, '104'));
    expect(montoDe(conVacaciones, '201')).toBe(montoDe(sinVacaciones, '201'));
  });

  it('sin vacaciones no emite el concepto', () => {
    const r = calcular(empleado, 3000, '2026-03', 0);
    expect(montoDe(r, '008')).toBeUndefined();
    expect(montoDe(r, '001')).toBe(3000);
  });
});

describe('calcularEmpleadoPersonalizado — contrato autoritativo', () => {
  const calcularPersonalizado = (empleado: any) =>
    (service as any).calcularEmpleadoPersonalizado(empleado, conceptos, normativa);

  it('respeta cero dias trabajados y no lo convierte en treinta', () => {
    const r = calcularPersonalizado({
      id: 'empleado-1',
      nombres: 'Sin días pagables',
      sueldo_base: 3000,
      dias_trabajados: 0,
      contratos: [{ estado: 'vigente', regimen_pensionario: 'ONP' }],
    });

    expect(r.totalIngresos).toBe(0);
    expect(r.netoPagar).toBe(0);
  });

  it('incluye quinta categoria usando la normativa del periodo', () => {
    const r = calcularPersonalizado({
      id: 'empleado-2',
      nombres: 'Renta alta',
      sueldo_base: 10000,
      dias_trabajados: 30,
      contratos: [{ estado: 'vigente', regimen_pensionario: 'ONP' }],
    });

    expect(montoDe(r, '105')).toBe(813.33);
  });

  it('falla cerrado cuando no existe contrato vigente', () => {
    expect(() => calcularPersonalizado({
      id: 'empleado-3',
      nombres: 'Sin contrato',
      sueldo_base: 2000,
      dias_trabajados: 30,
      contratos: [],
    })).toThrow('no tiene contrato vigente');
  });
});

describe('persistencia atomica de planilla', () => {
  it('delega empleados, conceptos y totales a una unica RPC tenant-scoped', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        success: true,
        totalEmpleados: 1,
        totalIngresos: 2000,
        totalDescuentos: 260,
        totalAportes: 180,
        totalNeto: 1740,
      },
      error: null,
    });
    const servicio = new PlanillasService(
      { getClient: () => ({ rpc }) } as any,
      {} as any,
    );
    const empleados = [{
      empleado_id: '11111111-1111-4111-8111-111111111111',
      dias_trabajados: 30,
      horas_extras_25: 0,
      horas_extras_35: 0,
      tardanzas_minutos: 0,
      faltas: 0,
      total_ingresos: 2000,
      total_descuentos: 260,
      total_aportes: 180,
      neto_pagar: 1740,
      conceptos: [],
    }];

    await expect((servicio as any).guardarCalculoPlanillaAtomico(
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      empleados,
    )).resolves.toMatchObject({ success: true, totalEmpleados: 1 });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('guardar_calculo_planilla_tx', {
      p_tenant_id: '33333333-3333-4333-8333-333333333333',
      p_planilla_id: '22222222-2222-4222-8222-222222222222',
      p_empleados: empleados,
    });
  });

  it('paga mediante una sola RPC que también deja el evento durable', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        success: true,
        periodo: '2026-08',
        totalPagado: 1740,
        empleadosPagados: 1,
        eventId: '44444444-4444-4444-8444-444444444444',
      },
      error: null,
    });
    const servicio = new PlanillasService(
      { getClient: () => ({ rpc }) } as any,
      { emitPlanillaPagada: jest.fn() } as any,
    );

    await expect(servicio.pagarPlanillaCompleta(
      '22222222-2222-4222-8222-222222222222',
      'transferencia',
      '33333333-3333-4333-8333-333333333333',
    )).resolves.toMatchObject({
      success: true,
      data: { totalPagado: 1740, empleadosPagados: 1 },
    });

    expect(rpc).toHaveBeenCalledWith('pagar_planilla_completa_tx', {
      p_tenant_id: '33333333-3333-4333-8333-333333333333',
      p_planilla_id: '22222222-2222-4222-8222-222222222222',
      p_metodo_pago: 'transferencia',
      p_usuario_id: 'sistema',
    });
  });
});
