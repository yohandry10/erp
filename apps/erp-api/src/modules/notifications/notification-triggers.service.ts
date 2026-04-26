import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationType, NotificationSeverity } from './notification.types';

@Injectable()
export class NotificationTriggersService {
  private readonly logger = new Logger(NotificationTriggersService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Trigger notification for certificate expiring soon (< 30 days)
   */
  async triggerCertificateExpiring(
    tenantId: string,
    daysUntilExpiration: number,
    expirationDate: Date
  ): Promise<void> {
    try {
      const formattedDate = expirationDate.toLocaleDateString('es-PE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      await this.notificationsService.createNotification(tenantId, {
        type: NotificationType.CERTIFICATE_EXPIRING,
        severity: daysUntilExpiration <= 7 ? NotificationSeverity.ERROR : NotificationSeverity.WARNING,
        title: 'Certificado Digital Próximo a Vencer',
        message: `Su certificado digital vencerá en ${daysUntilExpiration} días (${formattedDate}). Por favor, renueve su certificado para evitar interrupciones en la emisión de documentos.`,
        action_url: '/dashboard/configuracion/certificado',
        action_label: 'Renovar Certificado'
      });

      this.logger.log(`Certificate expiring notification created for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to trigger certificate expiring notification: ${error.message}`, error);
    }
  }

  /**
   * Trigger notification for expired certificate
   */
  async triggerCertificateExpired(
    tenantId: string,
    expirationDate: Date
  ): Promise<void> {
    try {
      const formattedDate = expirationDate.toLocaleDateString('es-PE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      await this.notificationsService.createNotification(tenantId, {
        type: NotificationType.CERTIFICATE_EXPIRED,
        severity: NotificationSeverity.ERROR,
        title: 'Certificado Digital Vencido',
        message: `Su certificado digital venció el ${formattedDate}. No podrá emitir documentos electrónicos hasta que renueve su certificado.`,
        action_url: '/dashboard/configuracion/certificado',
        action_label: 'Renovar Certificado'
      });

      this.logger.log(`Certificate expired notification created for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to trigger certificate expired notification: ${error.message}`, error);
    }
  }

  /**
   * Trigger notification for incomplete configuration
   */
  async triggerConfigurationIncomplete(
    tenantId: string,
    missingItems: string[]
  ): Promise<void> {
    try {
      const itemsList = missingItems.map(item => `• ${item}`).join('\n');

      await this.notificationsService.createNotification(tenantId, {
        type: NotificationType.CONFIGURATION_INCOMPLETE,
        severity: NotificationSeverity.WARNING,
        title: 'Configuración Incompleta',
        message: `Su configuración está incompleta. Complete los siguientes elementos para poder emitir documentos:\n${itemsList}`,
        action_url: '/dashboard/wizard',
        action_label: 'Completar Configuración'
      });

      this.logger.log(`Configuration incomplete notification created for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to trigger configuration incomplete notification: ${error.message}`, error);
    }
  }

  /**
   * Trigger notification for validation errors
   */
  async triggerValidationError(
    tenantId: string,
    validationType: string,
    errors: string[],
    usuarioId?: string
  ): Promise<void> {
    try {
      const errorsList = errors.slice(0, 5).map(error => `• ${error}`).join('\n');
      const moreErrors = errors.length > 5 ? `\n... y ${errors.length - 5} errores más` : '';

      await this.notificationsService.createNotification(tenantId, {
        type: NotificationType.VALIDATION_ERROR,
        severity: NotificationSeverity.ERROR,
        title: `Error de Validación: ${validationType}`,
        message: `Se encontraron errores de validación:\n${errorsList}${moreErrors}`,
        action_url: '/dashboard/configuracion',
        action_label: 'Ver Detalles',
        usuario_id: usuarioId
      });

      this.logger.log(`Validation error notification created for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to trigger validation error notification: ${error.message}`, error);
    }
  }

  /**
   * Trigger notification for successful GRE auto-creation
   */
  async triggerGREAutoCreated(
    tenantId: string,
    greId: string,
    greNumero: string,
    saleAmount: number,
    usuarioId?: string
  ): Promise<void> {
    try {
      const formattedAmount = new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: 'PEN'
      }).format(saleAmount);

      await this.notificationsService.createNotification(tenantId, {
        type: NotificationType.GRE_AUTO_CREATED,
        severity: NotificationSeverity.INFO,
        title: 'Guía de Remisión Creada Automáticamente',
        message: `Se creó automáticamente la Guía de Remisión ${greNumero} para una venta de ${formattedAmount}.`,
        action_url: `/dashboard/gre/${greId}`,
        action_label: 'Ver Guía',
        usuario_id: usuarioId
      });

      this.logger.log(`GRE auto-created notification created for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to trigger GRE auto-created notification: ${error.message}`, error);
    }
  }

  /**
   * Trigger notification for failed GRE auto-creation
   */
  async triggerGRECreationFailed(
    tenantId: string,
    saleId: string,
    errorMessage: string,
    usuarioId?: string
  ): Promise<void> {
    try {
      await this.notificationsService.createNotification(tenantId, {
        type: NotificationType.GRE_CREATION_FAILED,
        severity: NotificationSeverity.ERROR,
        title: 'Error al Crear Guía de Remisión',
        message: `No se pudo crear automáticamente la Guía de Remisión para la venta. Error: ${errorMessage}`,
        action_url: `/dashboard/ventas/${saleId}`,
        action_label: 'Ver Venta',
        usuario_id: usuarioId
      });

      this.logger.log(`GRE creation failed notification created for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to trigger GRE creation failed notification: ${error.message}`, error);
    }
  }

  /**
   * Check and trigger certificate expiration notifications for a tenant
   * This method should be called by a background job
   */
  async checkAndNotifyCertificateExpiration(
    tenantId: string,
    certificateExpiresAt: Date
  ): Promise<void> {
    try {
      const now = new Date();
      const daysUntilExpiration = Math.ceil(
        (certificateExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilExpiration < 0) {
        // Certificate has expired
        await this.triggerCertificateExpired(tenantId, certificateExpiresAt);
      } else if (daysUntilExpiration <= 30) {
        // Certificate expiring soon
        await this.triggerCertificateExpiring(tenantId, daysUntilExpiration, certificateExpiresAt);
      }
    } catch (error) {
      this.logger.error(`Failed to check certificate expiration: ${error.message}`, error);
    }
  }

  /**
   * Trigger notification when a cotización is converted to pedido
   */
  async triggerCotizacionConvertida(
    tenantId: string,
    cotizacionNumero: string,
    pedidoId: string,
    pedidoNumero: string,
    clienteNombre: string,
    usuarioId?: string
  ): Promise<void> {
    try {
      await this.notificationsService.createNotification(tenantId, {
        type: NotificationType.COTIZACION_CONVERTIDA,
        severity: NotificationSeverity.INFO,
        title: 'Cotización Convertida a Pedido',
        message: `La cotización ${cotizacionNumero} para ${clienteNombre} ha sido convertida al pedido ${pedidoNumero}.`,
        action_url: `/dashboard/ventas/pedidos/${pedidoId}`,
        action_label: 'Ver Pedido',
        usuario_id: usuarioId
      });

      this.logger.log(`Cotización convertida notification created for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to trigger cotización convertida notification: ${error.message}`, error);
    }
  }

  /**
   * Trigger notification when a pedido is confirmed
   */
  async triggerPedidoConfirmado(
    tenantId: string,
    pedidoId: string,
    pedidoNumero: string,
    clienteNombre: string,
    total: number,
    stockWarnings?: Array<{ producto: string; disponible: number; solicitado: number }>,
    usuarioId?: string
  ): Promise<void> {
    try {
      const formattedTotal = new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: 'PEN'
      }).format(total);

      let message = `El pedido ${pedidoNumero} para ${clienteNombre} (${formattedTotal}) ha sido confirmado y el stock ha sido reservado.`;
      
      if (stockWarnings && stockWarnings.length > 0) {
        const warningsList = stockWarnings
          .slice(0, 3)
          .map(w => `• ${w.producto}: disponible ${w.disponible}, solicitado ${w.solicitado}`)
          .join('\n');
        message += `\n\n⚠️ Advertencias de stock:\n${warningsList}`;
        if (stockWarnings.length > 3) {
          message += `\n... y ${stockWarnings.length - 3} productos más`;
        }
      }

      await this.notificationsService.createNotification(tenantId, {
        type: NotificationType.PEDIDO_CONFIRMADO,
        severity: stockWarnings && stockWarnings.length > 0 ? NotificationSeverity.WARNING : NotificationSeverity.INFO,
        title: 'Pedido Confirmado',
        message,
        action_url: `/dashboard/ventas/pedidos/${pedidoId}`,
        action_label: 'Ver Pedido',
        usuario_id: usuarioId
      });

      this.logger.log(`Pedido confirmado notification created for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to trigger pedido confirmado notification: ${error.message}`, error);
    }
  }

  /**
   * Trigger notification when a pedido is ready for dispatch
   */
  async triggerPedidoListoDespacho(
    tenantId: string,
    pedidoId: string,
    pedidoNumero: string,
    clienteNombre: string,
    usuarioId?: string
  ): Promise<void> {
    try {
      await this.notificationsService.createNotification(tenantId, {
        type: NotificationType.PEDIDO_LISTO_DESPACHO,
        severity: NotificationSeverity.INFO,
        title: 'Pedido Listo para Despacho',
        message: `El pedido ${pedidoNumero} para ${clienteNombre} está listo para ser despachado.`,
        action_url: `/dashboard/inventario/logistica/listo-despacho`,
        action_label: 'Ver Órdenes',
        usuario_id: usuarioId
      });

      this.logger.log(`Pedido listo despacho notification created for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to trigger pedido listo despacho notification: ${error.message}`, error);
    }
  }

  /**
   * Trigger notification when a pedido is ready for invoicing
   */
  async triggerPedidoListoFacturar(
    tenantId: string,
    pedidoId: string,
    pedidoNumero: string,
    clienteNombre: string,
    total: number,
    usuarioId?: string
  ): Promise<void> {
    try {
      const formattedTotal = new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: 'PEN'
      }).format(total);

      await this.notificationsService.createNotification(tenantId, {
        type: NotificationType.PEDIDO_LISTO_FACTURAR,
        severity: NotificationSeverity.INFO,
        title: 'Pedido Listo para Facturar',
        message: `El pedido ${pedidoNumero} para ${clienteNombre} (${formattedTotal}) está listo para generar la factura.`,
        action_url: `/dashboard/ventas/pedidos/${pedidoId}`,
        action_label: 'Generar Factura',
        usuario_id: usuarioId
      });

      this.logger.log(`Pedido listo facturar notification created for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to trigger pedido listo facturar notification: ${error.message}`, error);
    }
  }

  /**
   * Trigger notification when stock is low
   */
  async triggerStockBajo(
    tenantId: string,
    productoId: string,
    productoNombre: string,
    stockActual: number,
    stockMinimo: number,
    usuarioId?: string
  ): Promise<void> {
    try {
      await this.notificationsService.createNotification(tenantId, {
        type: NotificationType.STOCK_BAJO,
        severity: stockActual === 0 ? NotificationSeverity.ERROR : NotificationSeverity.WARNING,
        title: stockActual === 0 ? 'Producto Sin Stock' : 'Stock Bajo',
        message: `El producto "${productoNombre}" tiene stock bajo. Stock actual: ${stockActual}, Stock mínimo: ${stockMinimo}.`,
        action_url: `/dashboard/inventario/productos/${productoId}`,
        action_label: 'Ver Producto',
        usuario_id: usuarioId
      });

      this.logger.log(`Stock bajo notification created for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to trigger stock bajo notification: ${error.message}`, error);
    }
  }

  /**
   * Trigger notification when a factura is issued
   */
  async triggerFacturaEmitida(
    tenantId: string,
    facturaId: string,
    facturaNumero: string,
    pedidoNumero: string,
    clienteNombre: string,
    total: number,
    usuarioId?: string
  ): Promise<void> {
    try {
      const formattedTotal = new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: 'PEN'
      }).format(total);

      await this.notificationsService.createNotification(tenantId, {
        type: NotificationType.FACTURA_EMITIDA,
        severity: NotificationSeverity.INFO,
        title: 'Factura Emitida',
        message: `La factura ${facturaNumero} para el pedido ${pedidoNumero} de ${clienteNombre} (${formattedTotal}) ha sido emitida exitosamente.`,
        action_url: `/dashboard/cpe/${facturaId}`,
        action_label: 'Ver Factura',
        usuario_id: usuarioId
      });

      this.logger.log(`Factura emitida notification created for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to trigger factura emitida notification: ${error.message}`, error);
    }
  }

  /**
   * Trigger notification when a GRE is generated
   */
  async triggerGREGenerada(
    tenantId: string,
    greId: string,
    greNumero: string,
    facturaNumero: string,
    clienteNombre: string,
    usuarioId?: string
  ): Promise<void> {
    try {
      await this.notificationsService.createNotification(tenantId, {
        type: NotificationType.GRE_GENERADA,
        severity: NotificationSeverity.INFO,
        title: 'Guía de Remisión Generada',
        message: `La guía de remisión ${greNumero} para la factura ${facturaNumero} de ${clienteNombre} ha sido generada exitosamente.`,
        action_url: `/dashboard/gre/${greId}`,
        action_label: 'Ver Guía',
        usuario_id: usuarioId
      });

      this.logger.log(`GRE generada notification created for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to trigger GRE generada notification: ${error.message}`, error);
    }
  }
}
