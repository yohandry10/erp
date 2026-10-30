import { CashflowService } from './cashflow.service';
import { EstadosFinancierosService } from './estados-financieros.service';

describe('CashflowService', () => {
  let service: CashflowService;
  let estadosFinancieros: jest.Mocked<EstadosFinancierosService>;

  beforeEach(() => {
    estadosFinancieros = {
      getEstadoResultados: jest.fn().mockResolvedValue({ utilidad_neta: 0 }),
      getBalanceComprobacion: jest.fn(),
    } as any;

    service = new CashflowService(estadosFinancieros as any);
  });

  it('calcula cashflow indirecto con variaciones de capital de trabajo', async () => {
    const currentBalance = [
      { cuenta: '12', saldo_final: 120 },
      { cuenta: '20', saldo_final: 200 },
      { cuenta: '42', saldo_final: -80 },
      { cuenta: '33', saldo_final: 300 },
      { cuenta: '45', saldo_final: -400 },
    ];
    const prevBalance = [
      { cuenta: '12', saldo_final: 100 },
      { cuenta: '20', saldo_final: 150 },
      { cuenta: '42', saldo_final: -60 },
      { cuenta: '33', saldo_final: 250 },
      { cuenta: '45', saldo_final: -350 },
    ];

    estadosFinancieros.getBalanceComprobacion
      .mockResolvedValueOnce(currentBalance as any)
      .mockResolvedValueOnce(prevBalance as any);

    estadosFinancieros.getEstadoResultados.mockResolvedValueOnce({
      ingresos: { total_ingresos: 0 },
      costos: { costo_ventas: 0 },
      gastos: { total_gastos: 0 },
      utilidad_neta: 50,
    } as any);

    const result = await service.getCashFlow('tenant', 2025, 5);

    expect(result.detalle.utilidadNeta).toBe(50);
    expect(result.detalle.variacionCxc).toBe(20); // 120-100
    expect(result.detalle.variacionInventario).toBe(50); // 200-150
    expect(result.detalle.variacionCxp).toBe(20); // 80-60
    expect(result.detalle.variacionInversiones).toBe(50); // 300-250
    expect(result.detalle.variacionFinanciamiento).toBe(50); // 400-350
    // operativo = 50 - 20 - 50 + 20 = 0
    expect(result.operativo).toBe(0);
    expect(result.inversion).toBe(-50);
    expect(result.financiamiento).toBe(50);
    expect(result.neto).toBe(0);
  });

  it('calcula ratios financieros básicos', async () => {
    const balance = [
      { cuenta: '10', saldo_final: 100 },
      { cuenta: '12', saldo_final: 120 },
      { cuenta: '20', saldo_final: 200 },
      { cuenta: '40', saldo_final: -10 },
      { cuenta: '42', saldo_final: -80 },
    ];

    estadosFinancieros.getBalanceComprobacion.mockResolvedValueOnce(balance as any);

    estadosFinancieros.getEstadoResultados.mockResolvedValueOnce({
      ingresos: { total_ingresos: 500 },
      costos: { costo_ventas: 300, utilidad_bruta: 200 },
      gastos: { total_gastos: 100 },
      utilidad_neta: 100,
    } as any);

    const result = await service.getRatios('tenant', 2025, 5);

    // activos corrientes = 10+12+20 = 420; pasivos corrientes = 40+42 = 90
    expect(result.liquidez).toBeCloseTo(420 / 90, 6);
    expect(result.pruebaAcida).toBeCloseTo((420 - 200) / 90, 6);
    // ebitda = ventas - costo - gastos = 500-300-100 = 100 => margin 0.2
    expect(result.ebitdaMargin).toBeCloseTo(0.2, 6);
    expect(result.dso).toBeCloseTo((120 / 500) * 30, 6);
    expect(result.dpo).toBeCloseTo((80 / 300) * 30, 6);
    expect(result.dio).toBeCloseTo((200 / 300) * 30, 6);
    expect(result.rotacionInventario).toBeCloseTo(300 / 200, 6);
  });

  it('usa la utilidad mensual al pagar una planilla devengada antes', async () => {
    estadosFinancieros.getBalanceComprobacion
      .mockResolvedValueOnce([
        { cuenta: '1041', saldo_final: -1044 },
        { cuenta: '403', saldo_final: -264 },
        { cuenta: '411', saldo_final: 0 },
      ] as any)
      .mockResolvedValueOnce([
        { cuenta: '403', saldo_final: -264 },
        { cuenta: '411', saldo_final: -1044 },
      ] as any);
    estadosFinancieros.getEstadoResultados
      .mockResolvedValueOnce({ utilidad_neta: -1308 } as any)
      .mockResolvedValueOnce({ utilidad_neta: -1308 } as any);
    const result = await service.getCashFlow('tenant', 2026, 10);
    expect(result.detalle.utilidadNeta).toBe(0);
    expect(result.operativo).toBe(-1044);
    expect(result.neto).toBe(-1044);
    expect(result.detalle.descuadre).toBe(0);
    expect(estadosFinancieros.getEstadoResultados.mock.calls).toEqual([
      ['tenant', 2026, 10], ['tenant', 2026, 9],
    ]);
  });

  it('enero no descuenta el resultado del ejercicio anterior', async () => {
    estadosFinancieros.getBalanceComprobacion
      .mockResolvedValueOnce([{ cuenta: '1041', saldo_final: 1100 }] as any)
      .mockResolvedValueOnce([{ cuenta: '1041', saldo_final: 1000 }] as any);
    estadosFinancieros.getEstadoResultados.mockResolvedValueOnce({ utilidad_neta: 100 } as any);
    const result = await service.getCashFlow('tenant', 2027, 1);
    expect(result.detalle.utilidadNeta).toBe(100);
    expect(result.neto).toBe(100);
    expect(result.detalle.descuadre).toBe(0);
    expect(estadosFinancieros.getEstadoResultados).toHaveBeenCalledTimes(1);
  });

  it('redondea los importes monetarios del flujo a dos decimales', async () => {
    estadosFinancieros.getBalanceComprobacion
      .mockResolvedValueOnce([
        { cuenta: '12', saldo_final: 94.4 },
        { cuenta: '20', saldo_final: 350 },
        { cuenta: '42', saldo_final: -295 },
        { cuenta: '50', saldo_final: -300 },
      ] as any)
      .mockResolvedValueOnce([] as any);
    estadosFinancieros.getEstadoResultados.mockResolvedValueOnce({
      ingresos: { total_ingresos: 0 },
      costos: { costo_ventas: 0 },
      gastos: { total_gastos: 0 },
      utilidad_neta: 0,
    } as any);

    const result = await service.getCashFlow('tenant', 2026, 8);

    expect(result.operativo).toBe(-149.4);
    expect(result.financiamiento).toBe(300);
    expect(result.neto).toBe(150.6);
    expect(result.detalle.variacionCxc).toBe(94.4);
  });

  describe('correccion por gastos que no movieron caja', () => {
    // El metodo indirecto corrige la utilidad con lo que no salio de caja. La
    // depreciacion abona la 39: su aumento es lo que se devuelve al operativo.
    const conBalances = (actual: any[], previo: any[], utilidadNeta: number) => {
      estadosFinancieros.getBalanceComprobacion
        .mockResolvedValueOnce(actual as any)
        .mockResolvedValueOnce(previo as any);
      estadosFinancieros.getEstadoResultados.mockResolvedValueOnce({
        ingresos: { total_ingresos: 0 },
        costos: { costo_ventas: 0 },
        gastos: { total_gastos: 0 },
        utilidad_neta: utilidadNeta,
      } as any);
    };

    it('devuelve la depreciacion del mes al flujo operativo', async () => {
      // Utilidad 1000 con 300 de depreciacion: la caja subio 1300, no 1000.
      conBalances(
        [
          { cuenta: '10', saldo_final: 1300 },
          { cuenta: '39', saldo_final: -300 },
        ],
        [{ cuenta: '10', saldo_final: 0 }],
        1000,
      );

      const result = await service.getCashFlow('tenant', 2026, 8);

      expect(result.detalle.gastosNoDesembolsables).toBe(300);
      expect(result.operativo).toBe(1300);
    });

    it('el estado cuadra con la variacion real de caja', async () => {
      conBalances(
        [
          { cuenta: '10', saldo_final: 1300 },
          { cuenta: '39', saldo_final: -300 },
        ],
        [{ cuenta: '10', saldo_final: 0 }],
        1000,
      );

      const result = await service.getCashFlow('tenant', 2026, 8);

      expect(result.detalle.variacionCaja).toBe(1300);
      expect(result.detalle.descuadre).toBe(0);
    });

    it('delata el descuadre en vez de callarlo', async () => {
      // La caja subio 2000 y el estado solo explica 1300: faltan 700 por
      // clasificar. Antes no se veia porque nada comparaba contra la caja.
      conBalances(
        [
          { cuenta: '10', saldo_final: 2000 },
          { cuenta: '39', saldo_final: -300 },
        ],
        [{ cuenta: '10', saldo_final: 0 }],
        1000,
      );

      const result = await service.getCashFlow('tenant', 2026, 8);

      expect(result.detalle.descuadre).toBe(-700);
    });

    it('la compra de un activo fijo sale por inversion, no por operacion', async () => {
      conBalances(
        [
          { cuenta: '10', saldo_final: 500 },
          { cuenta: '33', saldo_final: 500, debe: 500, haber: 0 },
        ],
        [
          { cuenta: '10', saldo_final: 1000 },
          { cuenta: '33', saldo_final: 0 },
        ],
        0,
      );

      const result = await service.getCashFlow('tenant', 2026, 8);

      expect(result.inversion).toBe(-500);
      expect(result.operativo).toBe(0);
      expect(result.detalle.descuadre).toBe(0);
    });

    it('incluye el IGV a favor y la mercaderia por facturar', async () => {
      // Compra de 1000 + 180 de IGV recibida y facturada: 20 D 1000 / 4699 H,
      // 4699 D 1000 + 40 D 180 / 42 H 1180, y se paga 1180 por banco.
      conBalances(
        [
          { cuenta: '1041', saldo_final: -1180 },
          { cuenta: '20', saldo_final: 1000 },
          { cuenta: '40', saldo_final: 180 },
          { cuenta: '4699', saldo_final: 0 },
          { cuenta: '42', saldo_final: 0 },
        ],
        [],
        0,
      );

      const result = await service.getCashFlow('tenant', 2026, 10);

      expect(result.detalle.otrosOperativos).toBe(-180);
      expect(result.operativo).toBe(-1180);
      expect(result.detalle.descuadre).toBe(0);
    });

    it('no cuenta dos veces un faltante de inventario', async () => {
      // Faltante de 96 contra la 20: es gasto sin caja, pero ya esta dentro de
      // la variacion de existencias.
      conBalances(
        [
          { cuenta: '10', saldo_final: 0 },
          { cuenta: '20', saldo_final: 904 },
          { cuenta: '68', saldo_final: 96, debe: 96, haber: 0 },
        ],
        [
          { cuenta: '10', saldo_final: 0 },
          { cuenta: '20', saldo_final: 1000 },
        ],
        -96,
      );

      const result = await service.getCashFlow('tenant', 2026, 10);

      expect(result.detalle.gastosNoDesembolsables).toBe(0);
      expect(result.operativo).toBe(0);
      expect(result.detalle.descuadre).toBe(0);
    });
  });
});
