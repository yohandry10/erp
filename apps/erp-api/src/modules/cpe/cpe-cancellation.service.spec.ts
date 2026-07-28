import { CpeCancellationService } from './cpe-cancellation.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { AuditService } from '../audit/audit.service';

describe('CpeCancellationService', () => {
  const service = new CpeCancellationService(
    {} as unknown as SupabaseService,
    {} as unknown as AuditService,
  );

  const resolverSerie = (serie: string): string =>
    (service as any).resolveSerieNotaCredito(serie);

  describe('serie de la nota de crédito', () => {
    // SUNAT exige series de exactamente 4 caracteres alfanuméricos; una serie de
    // 5 (FC001) hace que el comprobante sea rechazado al enviarlo.
    it('siempre produce una serie de 4 caracteres', () => {
      for (const serie of ['F001', 'B001', 'F123', 'B999', '', 'X7']) {
        expect(resolverSerie(serie)).toHaveLength(4);
      }
    });

    it('conserva el prefijo del comprobante afectado', () => {
      expect(resolverSerie('F001')).toBe('FC01');
      expect(resolverSerie('B001')).toBe('BC01');
    });

    it('mantiene distinguibles series distintas del mismo tipo', () => {
      expect(resolverSerie('F001')).not.toBe(resolverSerie('F002'));
      expect(resolverSerie('B001')).not.toBe(resolverSerie('B002'));
    });

    it('respeta el patrón alfanumérico en mayúsculas exigido por SUNAT', () => {
      for (const serie of ['F001', 'b002', 'F010', '']) {
        expect(resolverSerie(serie)).toMatch(/^[A-Z0-9]{4}$/);
      }
    });
  });

  // El reverso es efectivo que sale hoy. Cargarlo en la sesion original ya cerrada
  // rompia un arqueo cuadrado y ademas hacia imposible anular una venta de un turno
  // anterior: la RPC lo rechazaba y la anulacion fallaba a medias.
  describe('sesion destino del reverso de caja', () => {
    const abierta = { id: 'ses-abierta', estado: 'ABIERTA', hora_cierre: null, fecha_cierre: null };
    const cerrada = { id: 'ses-cerrada', estado: 'CERRADA', hora_cierre: '2026-01-01', fecha_cierre: '2026-01-01' };

    const resolver = (respuestas: any[], sesionOriginalId: string | null = 'ses-original') => {
      let llamada = 0;
      const client = {
        from: () => {
          const actual = respuestas[llamada++] ?? null;
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            is: () => chain,
            order: () => chain,
            limit: () => chain,
            maybeSingle: async () => ({ data: actual }),
          };
          return chain;
        },
      };
      return (service as any).resolverSesionParaReverso(client, 't1', sesionOriginalId);
    };

    it('usa la sesion de la venta si sigue abierta', async () => {
      await expect(resolver([abierta])).resolves.toBe('ses-abierta');
    });

    it('cae a la sesion abierta vigente si la de la venta ya cerro', async () => {
      await expect(resolver([cerrada, { id: 'ses-hoy' }])).resolves.toBe('ses-hoy');
    });

    it('devuelve null si no hay ninguna sesion abierta', async () => {
      await expect(resolver([cerrada, null])).resolves.toBeNull();
    });

    it('no exige sesion original para resolver la vigente', async () => {
      await expect(resolver([{ id: 'ses-hoy' }], null)).resolves.toBe('ses-hoy');
    });
  });
});
