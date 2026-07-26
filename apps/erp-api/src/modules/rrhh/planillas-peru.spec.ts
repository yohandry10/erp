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
});

// La asignación familiar es remuneración computable (Ley 25129): integra la base de
// AFP/ONP y del aporte del empleador a ESSALUD. Calcularla solo sobre el sueldo básico
// sub-declaraba el aporte a ESSALUD y sub-retenía el aporte previsional.
describe('calcularEmpleado — base asegurable peruana', () => {
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
  const conceptos = ['001', '002', '101', '102', '103', '104', '105', '201'].map((codigo) => ({
    id: `c-${codigo}`,
    codigo,
  }));

  const service = new PlanillasService({ getClient: jest.fn() } as any, {} as any);

  const calcular = (empleado: any, sueldo: number) =>
    (service as any).calcularEmpleado(empleado, sueldo, conceptos, normativa);

  const montoDe = (r: any, codigo: string) =>
    r.conceptosDetalle.find((d: any) => d.id === `c-${codigo}`)?.monto;

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
