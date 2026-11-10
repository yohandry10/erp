import { CashReportsService } from './cash-reports.service';
import { limpiarCachePaisTenant } from '../../../shared/utils/fecha-tenant.util';

// El servidor corre en UTC: las horas del reporte de cierre deben imprimirse en
// la zona del país del contribuyente, no en la del proceso.
describe('Reporte de cierre de caja · horas en la zona del país', () => {
  const zonaOriginal = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'UTC'; });
  afterAll(() => { process.env.TZ = zonaOriginal; });
  const apertura = '2026-11-07T13:05:00.000Z';
  const cierre = '2026-11-07T23:30:00.000Z';
  const datos = (moneda: string) => ({
    sesion: {
      id: 'sesion-1', estado: 'ABIERTA', moneda, monto_inicio: 100, hora_apertura: apertura, hora_cierre: cierre,
      cajas: { nombre: 'Caja 1', codigo: 'C1' }, hash_integridad: null,
      denominaciones_apertura: null, denominaciones_cierre: null, cierre_administrativo: false,
    },
    movimientos: [], retiros: [], totales_por_tipo: {},
    resumen_fiscal: { base_imponible: 0, igv: 0, total: 0, cantidad_boletas: 0, cantidad_facturas: 0, cantidad_notas_credito: 0 },
    resumen_metodos_pago: { efectivo: 0, cantidad_efectivo: 0, tarjeta: 0, cantidad_tarjeta: 0, transferencia: 0, cantidad_transferencia: 0, otros: 0, cantidad_otros: 0 },
  });

  it.each([
    ['PE', 'PEN', 'es-PE', 'America/Lima'],
    ['AR', 'ARS', 'es-AR', 'America/Argentina/Buenos_Aires'],
  ])('%s: apertura y cierre en la hora local del país', async (pais, moneda, locale, timeZone) => {
    limpiarCachePaisTenant(`tenant-${pais}`);
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { pais }, error: null }) };
    const service = new CashReportsService({ getClient: () => ({ from: () => q }) } as any, {} as any, {} as any);
    jest.spyOn(service, 'obtenerDatosReporteCierre').mockResolvedValue(datos(moneda) as any);
    const lineas = (await service.generarReporteCierreTexto('sesion-1', `tenant-${pais}`)).split('\n');
    const local = (iso: string) => new Date(iso).toLocaleString(locale, { timeZone });
    const utc = (iso: string) => new Date(iso).toLocaleString(locale, { timeZone: 'UTC' });
    expect(lineas).toContain(`Apertura: ${local(apertura)}`);
    expect(lineas).toContain(`Cierre: ${local(cierre)}`);
    // El proceso simula el servidor: sin zona explícita formatearía en UTC.
    expect(new Date(apertura).toLocaleString(locale)).toBe(utc(apertura));
    expect(local(apertura)).not.toBe(utc(apertura));
  });
});
