import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { EstadoPedido } from '../../ventas/pedidos/entities';
import { PedidoLockService } from '../../../shared/locks/pedido-lock.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { ConfirmarDespachoDto } from './dto';
import { LogisticaService } from './logistica.service';

describe('LogisticaService', () => {
  describe('confirmarDespacho', () => {
    it('delega una sola vez en despachar_pedido_parcial_tx y no ejecuta escrituras ni eventos legacy', async () => {
      const pedidoId = '11111111-1111-4111-8111-111111111111';
      const tenantId = '22222222-2222-4222-8222-222222222222';
      const userId = '33333333-3333-4333-8333-333333333333';
      const detalleId = '44444444-4444-4444-8444-444444444444';
      const resultadoRpc = {
        pedido_id: pedidoId,
        estado: EstadoPedido.LISTO_FACTURAR,
        idempotente: false,
      };

      const pedidoQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: pedidoId,
            numero: 'PED-0001',
            estado: EstadoPedido.LISTO_DESPACHO,
          },
          error: null,
        }),
        insert: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      };
      const rpc = jest.fn().mockResolvedValue({ data: resultadoRpc, error: null });
      const client = {
        from: jest.fn().mockReturnValue(pedidoQuery),
        rpc,
      };
      const supabase = {
        getClient: jest.fn().mockReturnValue(client),
      } as unknown as SupabaseService;
      const notifications = {
        createNotification: jest.fn().mockResolvedValue(undefined),
      } as unknown as NotificationsService;
      const audit = {
        logAction: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuditService;
      const pedidoLock = {
        runWithLock: jest.fn(
          async (_tenantId: string, _pedidoId: string, trabajo: () => Promise<unknown>) => trabajo(),
        ),
      } as unknown as PedidoLockService;
      const service = new LogisticaService(
        supabase,
        notifications,
        audit,
        pedidoLock,
      );
      const eventoLogisticoLegacy = jest.spyOn(
        service as unknown as { registrarEventoLogistico: (...args: unknown[]) => Promise<void> },
        'registrarEventoLogistico',
      );
      const dto: ConfirmarDespachoDto = {
        idempotency_key: 'despacho-pedido-0001',
        notas: 'Salida completa',
        almacen_id: '55555555-5555-4555-8555-555555555555',
        ubicacion_id: '66666666-6666-4666-8666-666666666666',
        lote: 'LOTE-01',
        items_despachados: [
          {
            detalle_id: detalleId,
            cantidad: 2,
            almacen_id: '55555555-5555-4555-8555-555555555555',
            ubicacion_id: '66666666-6666-4666-8666-666666666666',
            lote: 'LOTE-01',
          },
        ],
        bultos: 1,
        peso_total: 10,
        volumen_total: 0.5,
        transportista: 'Transportes Demo',
        placa: 'ABC-123',
        conductor: 'Conductor Demo',
      };

      const resultado = await service.confirmarDespacho(
        pedidoId,
        tenantId,
        dto,
        userId,
      );

      expect(pedidoLock.runWithLock).toHaveBeenCalledTimes(1);
      expect(pedidoLock.runWithLock).toHaveBeenCalledWith(
        tenantId,
        pedidoId,
        expect.any(Function),
      );
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith('despachar_pedido_parcial_tx', {
        p_pedido_id: pedidoId,
        p_tenant_id: tenantId,
        p_idempotency_key: dto.idempotency_key,
        p_items: dto.items_despachados,
        p_notas: dto.notas,
        p_registrado_por: userId,
        p_datos_logisticos: {
          almacen_id: dto.almacen_id,
          ubicacion_id: dto.ubicacion_id,
          lote: dto.lote,
          bultos: dto.bultos,
          peso_total: dto.peso_total,
          volumen_total: dto.volumen_total,
          transportista: dto.transportista,
          placa: dto.placa,
          conductor: dto.conductor,
        },
      });

      expect(client.from).toHaveBeenCalledTimes(1);
      expect(client.from).toHaveBeenCalledWith('pedidos_venta');
      expect(pedidoQuery.select).toHaveBeenCalledTimes(1);
      expect(pedidoQuery.insert).not.toHaveBeenCalled();
      expect(pedidoQuery.update).not.toHaveBeenCalled();
      expect(pedidoQuery.upsert).not.toHaveBeenCalled();
      expect(pedidoQuery.delete).not.toHaveBeenCalled();
      expect(eventoLogisticoLegacy).not.toHaveBeenCalled();
      expect(Object.prototype.hasOwnProperty.call(service, 'eventBus')).toBe(false);
      expect(resultado).toEqual({ success: true, data: resultadoRpc });
    });
  });
});
