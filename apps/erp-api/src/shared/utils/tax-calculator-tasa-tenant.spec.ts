import { TaxCalculatorService } from './tax-calculator';

/**
 * La tasa que aplica el calculador tiene que ser la del contribuyente.
 *
 * El mismo numero se leia de dos sitios distintos en el servidor:
 *
 *   RPC de venta del POS y, desde la 522, toda la cadena SQL
 *                              -> empresa_config.igv_porcentaje
 *   TaxCalculatorService (TS)  -> configuracion_fiscal, por pais
 *
 * `TaxCalculatorService` es el que usan cotizaciones, pedidos y --lo mas
 * grave-- la construccion del CPE desde un pedido. Comprobado en produccion el
 * 2026-08-28 con un tenant al 10 %: la rama SQL calculaba 10 y esta 18.
 *
 * `configuracion_fiscal` sigue siendo el valor por defecto del pais y de donde
 * salen la moneda, el pais y el nombre del impuesto; lo unico que pasa a mandar
 * es la tasa cuando el contribuyente la declara.
 */
describe('TaxCalculatorService — manda la tasa del contribuyente', () => {
  const construir = (igvPorcentaje: unknown, tasaDelPais = 0.18) => {
    const empresaChain: any = {
      select: () => empresaChain,
      eq: () => empresaChain,
      maybeSingle: async () => ({
        data: { pais_id: 1, igv_porcentaje: igvPorcentaje },
        error: null,
      }),
    };
    const fiscalChain: any = {
      select: () => fiscalChain,
      eq: () => fiscalChain,
      or: () => fiscalChain,
      order: () => fiscalChain,
      limit: () => fiscalChain,
      maybeSingle: async () => ({
        data: {
          tasa_igv: tasaDelPais,
          impuesto_principal_porcentaje: tasaDelPais,
          impuesto_principal_nombre: 'IGV',
          pais_id: 1,
          tenant_id: null,
          paises: [{ codigo_iso: 'PE', moneda_codigo: 'PEN' }],
        },
        error: null,
      }),
    };
    const supabase: any = {
      getClient: () => ({
        from: (tabla: string) => (tabla === 'empresa_config' ? empresaChain : fiscalChain),
      }),
    };
    return new TaxCalculatorService(supabase);
  };

  it('usa la tasa del contribuyente y no la del país', async () => {
    // El caso que estaba roto: la rama SQL calcularia 10 y esta 18.
    await expect(construir(10).getTasaIgv('t-1')).resolves.toBe(0.1);
  });

  it('un contribuyente exonerado recibe 0, no el 18 % del país', async () => {
    // Ley de Amazonia. Si el 0 se tratara como «sin dato» se cobraria un
    // impuesto a quien no debe pagarlo.
    await expect(construir(0).getTasaIgv('t-2')).resolves.toBe(0);
  });

  it('sin tasa propia hereda la del país', async () => {
    await expect(construir(null).getTasaIgv('t-3')).resolves.toBe(0.18);
    await expect(construir(undefined, 0.19).getTasaIgv('t-4')).resolves.toBe(0.19);
  });

  it('una tasa imposible del contribuyente no secuestra el cálculo', async () => {
    // No puede llegar --la tabla lo acota a 0..100-- pero si llegara, heredar la
    // del pais es preferible a calcular con un disparate.
    await expect(construir(250).getTasaIgv('t-5')).resolves.toBe(0.18);
    await expect(construir('dieciocho').getTasaIgv('t-6')).resolves.toBe(0.18);
  });

  it('el país, la moneda y el nombre siguen saliendo del catálogo fiscal', async () => {
    // Lo que se cambia es de donde sale la tasa, no el resto de la configuracion.
    const config = await construir(10).getTaxConfig('t-7');
    expect(config).toMatchObject({ pais: 'PE', moneda: 'PEN', nombreImpuesto: 'IGV', tasaIgv: 0.1 });
  });

  it('también manda cuando el llamante ya resolvió el país', async () => {
    // `calcularImpuestos` admite un `paisId` explicito, y por esa via se saltaba
    // la consulta del contribuyente. Hoy nadie lo pasa, pero dejarlo abierto es
    // el mismo hueco latente que se esta cerrando en el resto del servidor.
    const config = await construir(10).getTaxConfig('t-8', '1');
    expect(config.tasaIgv).toBe(0.1);
  });

  it('con el país resuelto y sin tasa propia, hereda la del país', async () => {
    const config = await construir(null).getTaxConfig('t-9', '1');
    expect(config.tasaIgv).toBe(0.18);
  });
});
