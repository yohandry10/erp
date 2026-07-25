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
});
