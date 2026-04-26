/**
 * EJEMPLO DE USO DEL SISTEMA DE EVENTOS DE VENTAS
 * 
 * Este archivo muestra cómo usar el SalesEventsService en los diferentes módulos
 * No es código de producción, solo ejemplos de referencia
 */

import { SalesEventsService, SalesEventType } from './sales-events.service';

/**
 * Ejemplo 1: Emitir evento cuando se convierte una cotización a pedido
 * Usar en: CotizacionesService.convertirAPedido()
 */
async function ejemploCotizacionConvertida(
  salesEventsService: SalesEventsService,
  tenantId: string,
  usuarioId: string
) {
  await salesEventsService.emit(SalesEventType.COTIZACION_CONVERTIDA, {
    tenant_id: tenantId,
    usuario_id: usuarioId,
    cotizacion_id: 'uuid-cotizacion',
    cotizacion_numero: 'COT-2024-001',
    pedido_id: 'uuid-pedido',
    pedido_numero: 'PV-2024-001',
    cliente_nombre: 'Empresa ABC SAC'
  });
}

/**
 * Ejemplo 2: Emitir evento cuando se confirma un pedido
 * Usar en: PedidosService.confirmarPedido()
 */
async function ejemploPedidoConfirmado(
  salesEventsService: SalesEventsService,
  tenantId: string,
  usuarioId: string
) {
  await salesEventsService.emit(SalesEventType.PEDIDO_CONFIRMADO, {
    tenant_id: tenantId,
    usuario_id: usuarioId,
    pedido_id: 'uuid-pedido',
    pedido_numero: 'PV-2024-001',
    cliente_nombre: 'Empresa ABC SAC',
    total: 1500.00,
    stock_warnings: [
      {
        producto: 'Producto XYZ',
        disponible: 5,
        solicitado: 10
      }
    ]
  });
}

/**
 * Ejemplo 3: Emitir evento cuando un pedido está listo para despacho
 * Usar en: LogisticaService.marcarListoDespacho()
 */
async function ejemploPedidoListoDespacho(
  salesEventsService: SalesEventsService,
  tenantId: string,
  usuarioId: string
) {
  await salesEventsService.emit(SalesEventType.PEDIDO_LISTO_DESPACHO, {
    tenant_id: tenantId,
    usuario_id: usuarioId,
    pedido_id: 'uuid-pedido',
    pedido_numero: 'PV-2024-001',
    cliente_nombre: 'Empresa ABC SAC'
  });
}

/**
 * Ejemplo 4: Emitir evento cuando un pedido está listo para facturar
 * Usar en: PedidosService.confirmarPedido() o LogisticaService.confirmarDespacho()
 */
async function ejemploPedidoListoFacturar(
  salesEventsService: SalesEventsService,
  tenantId: string,
  usuarioId: string
) {
  await salesEventsService.emit(SalesEventType.PEDIDO_LISTO_FACTURAR, {
    tenant_id: tenantId,
    usuario_id: usuarioId,
    pedido_id: 'uuid-pedido',
    pedido_numero: 'PV-2024-001',
    cliente_nombre: 'Empresa ABC SAC',
    total: 1500.00
  });
}

/**
 * Ejemplo 5: Emitir evento cuando el stock está bajo
 * Usar en: InventarioService.reservarStock() o InventarioService.descontarStock()
 */
async function ejemploStockBajo(
  salesEventsService: SalesEventsService,
  tenantId: string
) {
  await salesEventsService.emit(SalesEventType.STOCK_BAJO, {
    tenant_id: tenantId,
    producto_id: 'uuid-producto',
    producto_nombre: 'Producto XYZ',
    stock_actual: 3,
    stock_minimo: 10
  });
}

/**
 * Ejemplo 6: Emitir evento cuando se emite una factura
 * Usar en: PedidosService.generarFactura()
 */
async function ejemploFacturaEmitida(
  salesEventsService: SalesEventsService,
  tenantId: string,
  usuarioId: string
) {
  await salesEventsService.emit(SalesEventType.FACTURA_EMITIDA, {
    tenant_id: tenantId,
    usuario_id: usuarioId,
    factura_id: 'uuid-factura',
    factura_numero: 'F001-00000123',
    pedido_numero: 'PV-2024-001',
    cliente_nombre: 'Empresa ABC SAC',
    total: 1500.00
  });
}

/**
 * Ejemplo 7: Emitir evento cuando se genera una GRE
 * Usar en: GREService.generarGRE()
 */
async function ejemploGREGenerada(
  salesEventsService: SalesEventsService,
  tenantId: string,
  usuarioId: string
) {
  await salesEventsService.emit(SalesEventType.GRE_GENERADA, {
    tenant_id: tenantId,
    usuario_id: usuarioId,
    gre_id: 'uuid-gre',
    gre_numero: 'T001-00000045',
    factura_numero: 'F001-00000123',
    cliente_nombre: 'Empresa ABC SAC'
  });
}

/**
 * INTEGRACIÓN EN SERVICIOS
 * 
 * Para usar el sistema de eventos en tus servicios:
 * 
 * 1. Inyectar SalesEventsService en el constructor:
 * 
 *    constructor(
 *      private readonly salesEventsService: SalesEventsService
 *    ) {}
 * 
 * 2. Emitir eventos en los métodos apropiados:
 * 
 *    async confirmarPedido(pedidoId: string, tenantId: string) {
 *      // ... lógica de negocio ...
 *      
 *      await this.salesEventsService.emit(
 *        SalesEventType.PEDIDO_CONFIRMADO,
 *        {
 *          tenant_id: tenantId,
 *          pedido_id: pedidoId,
 *          pedido_numero: pedido.numero,
 *          cliente_nombre: pedido.cliente.razon_social,
 *          total: pedido.total
 *        }
 *      );
 *    }
 */
