import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CpeCancellationService } from './cpe-cancellation.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { AuditService } from '../audit/audit.service';

describe('CpeCancellationService', () => {
  const build = (response: { data?: any; error?: any } = { data: null }) => {
    const rpc = jest.fn().mockResolvedValue({ error: null, ...response });
    const service = new CpeCancellationService(
      { getClient: () => ({ rpc }) } as unknown as SupabaseService,
      {} as unknown as AuditService,
    );
    return { service, rpc };
  };

  describe('solicitud atómica de nota 07', () => {
    const result = {
      estado: 'PENDIENTE_CDR',
      cpe_anulado: { id: 'cpe-1' },
      nota_credito: { id: 'nc-1', tipo_documento: '07' },
    };

    it('exige actor y no abre ninguna ruta directa a tablas', async () => {
      const { service, rpc } = build({ data: result });

      await expect(
        service.anularComprobante('cpe-1', 'Error', 'tenant-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(rpc).not.toHaveBeenCalled();
    });

    it('delega creación, vínculo e idempotencia a una única RPC', async () => {
      const { service, rpc } = build({ data: [result] });

      await expect(
        service.anularComprobante(
          'cpe-1',
          'Error en operación',
          'tenant-1',
          'user-1',
          '01',
          'request-448',
        ),
      ).resolves.toEqual(result);

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith('solicitar_anulacion_cpe_tx', {
        p_cpe_id: 'cpe-1',
        p_tenant_id: 'tenant-1',
        p_actor_id: 'user-1',
        p_motivo: 'Error en operación',
        p_tipo_nota: '01',
        p_idempotency_key: 'request-448',
      });
    });

    it('genera una key estable cuando el caller no envía una', async () => {
      const { service, rpc } = build({ data: result });
      await service.anularComprobante(
        'cpe-1',
        'Error',
        'tenant-1',
        'user-1',
      );

      expect(rpc).toHaveBeenCalledWith(
        'solicitar_anulacion_cpe_tx',
        expect.objectContaining({
          p_idempotency_key: 'cpe.cancel.request:tenant-1:cpe-1',
        }),
      );
    });

    it('expone conflicto de key/payload sin intentar una segunda escritura', async () => {
      const { service, rpc } = build({
        error: {
          code: 'P0001',
          message: 'CPE_CANCELLATION_IDEMPOTENCY_KEY_OR_PAYLOAD_CONFLICT',
        },
      });

      await expect(
        service.anularComprobante(
          'cpe-1',
          'Otro motivo',
          'tenant-1',
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    it('mapea aislamiento tenant/not-found', async () => {
      const { service } = build({
        error: { code: 'P0002', message: 'CPE_ORIGINAL_NOT_FOUND_IN_TENANT' },
      });
      await expect(
        service.anularComprobante(
          'cpe-ajeno',
          'Error',
          'tenant-1',
          'user-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('finalización atómica después del CDR', () => {
    it('devuelve pendiente sin ejecutar reversos desde TypeScript', async () => {
      const pending = { participa: true, estado: 'PENDIENTE_CDR' };
      const { service, rpc } = build({ data: pending });

      await expect(
        service.finalizarAnulacionAceptada('nc-1', 'tenant-1'),
      ).resolves.toEqual(pending);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith('finalizar_anulacion_cpe_tx', {
        p_nota_credito_id: 'nc-1',
        p_tenant_id: 'tenant-1',
        p_actor_id: null,
        p_idempotency_key: 'cpe.cancel.final:tenant-1:nc-1',
      });
    });

    it('ignora CPE aceptados que no participan en este flujo', async () => {
      const { service } = build({ data: { participa: false } });
      await expect(
        service.finalizarAnulacionAceptada('factura-1', 'tenant-1'),
      ).resolves.toBeNull();
    });

    it('falla cerrado si PostgREST no devuelve el resultado transaccional', async () => {
      const { service } = build({ data: null });
      await expect(
        service.finalizarAnulacionAceptada('nc-1', 'tenant-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('propaga actor y key explícitos a la transacción final', async () => {
      const finalizado = { participa: true, estado: 'FINALIZADA' };
      const { service, rpc } = build({ data: [finalizado] });
      await service.finalizarAnulacionAceptada(
        'nc-1',
        'tenant-1',
        'user-1',
        'final-448',
      );
      expect(rpc).toHaveBeenCalledWith('finalizar_anulacion_cpe_tx', {
        p_nota_credito_id: 'nc-1',
        p_tenant_id: 'tenant-1',
        p_actor_id: 'user-1',
        p_idempotency_key: 'final-448',
      });
    });
  });

  describe('reversa explícita de cobros aplicados', () => {
    it('exige una clave idempotente del cliente antes de invocar la RPC', async () => {
      const { service, rpc } = build();

      await expect(
        service.revertirCobroAplicado(
          'cpe-1',
          'pago-1',
          { motivo: 'Reembolso al cliente' },
          'tenant-1',
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(rpc).not.toHaveBeenCalled();
    });

    it('delega tesorería, CxC, outbox y continuación 448 a una única RPC', async () => {
      const result = {
        estado: 'FINALIZADA',
        reversa_id: 'reversa-1',
        cpe_anulado: true,
      };
      const { service, rpc } = build({ data: [result] });

      await expect(
        service.revertirCobroAplicado(
          'cpe-1',
          'pago-1',
          {
            motivo: '  Reembolso al cliente  ',
            sesion_caja_id: 'sesion-1',
          },
          'tenant-1',
          'user-1',
          'CPE:REFUND:466:001',
        ),
      ).resolves.toEqual(result);

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith('revertir_cobro_cxc_anulacion_tx', {
        p_tenant_id: 'tenant-1',
        p_actor_id: 'user-1',
        p_cpe_id: 'cpe-1',
        p_pago_id: 'pago-1',
        p_payload: {
          motivo: 'Reembolso al cliente',
          sesion_caja_id: 'sesion-1',
        },
        p_idempotency_key: 'cpe:refund:466:001',
      });
    });

    it('expone conflicto de fingerprint sin intentar compensaciones locales', async () => {
      const { service, rpc } = build({
        error: {
          code: '23505',
          message: 'CXC_REFUND_IDEMPOTENCY_KEY_OR_PAYLOAD_CONFLICT',
        },
      });

      await expect(
        service.revertirCobroAplicado(
          'cpe-1',
          'pago-1',
          { motivo: 'Motivo diferente' },
          'tenant-1',
          'user-1',
          'cpe:refund:466:001',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    it('propaga RBAC como 403 y no lo disfraza de payload inválido', async () => {
      const { service } = build({
        error: { code: '42501', message: 'ACTOR_PERMISSION_REQUIRED' },
      });
      await expect(
        service.revertirCobroAplicado(
          'cpe-1',
          'pago-1',
          { motivo: 'Reembolso al cliente' },
          'tenant-1',
          'user-sin-permiso',
          'cpe:refund:466:forbidden',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('reversa explícita de ajustes fiscales aplicados', () => {
    it('delega contexto CPE y ajuste a una única RPC 466', async () => {
      const result = {
        estado: 'FINALIZADA',
        operacion_id: 'operacion-fiscal-1',
        idempotent: false,
      };
      const { service, rpc } = build({ data: result });

      await expect(service.revertirAjusteAplicado(
        'cpe-1',
        'operacion-fiscal-1',
        { motivo: '  Anulación integral del comprobante  ' },
        'tenant-1',
        'user-1',
        'CPE:ADJUSTMENT:REVERSE:466:001',
      )).resolves.toEqual(result);

      expect(rpc).toHaveBeenCalledWith('revertir_ajuste_cxc_anulacion_tx', {
        p_tenant_id: 'tenant-1',
        p_actor_id: 'user-1',
        p_cpe_id: 'cpe-1',
        p_operacion_id: 'operacion-fiscal-1',
        p_payload: { motivo: 'Anulación integral del comprobante' },
        p_idempotency_key: 'cpe:adjustment:reverse:466:001',
      });
    });
  });

  describe('serie de la nota de crédito', () => {
    const resolver = (service: CpeCancellationService, serie: string) =>
      (service as any).resolveSerieNotaCredito(serie);

    it('produce cuatro caracteres y conserva el origen F/B', () => {
      const { service } = build();
      expect(resolver(service, 'F001')).toBe('FC01');
      expect(resolver(service, 'B002')).toBe('BC02');
      expect(resolver(service, 'X7')).toBe('NC07');
      expect(resolver(service, '')).toBe('NC00');
    });
  });
});
