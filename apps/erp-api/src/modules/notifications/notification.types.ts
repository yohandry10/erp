export enum NotificationType {
  CERTIFICATE_EXPIRING = 'certificate_expiring',
  CERTIFICATE_EXPIRED = 'certificate_expired',
  CONFIGURATION_INCOMPLETE = 'configuration_incomplete',
  VALIDATION_ERROR = 'validation_error',
  GRE_AUTO_CREATED = 'gre_auto_created',
  GRE_CREATION_FAILED = 'gre_creation_failed',
  // Sales events
  COTIZACION_CONVERTIDA = 'cotizacion_convertida',
  PEDIDO_CONFIRMADO = 'pedido_confirmado',
  PEDIDO_LISTO_DESPACHO = 'pedido_listo_despacho',
  PEDIDO_DESPACHO_PARCIAL = 'pedido_despacho_parcial',
  PEDIDO_LISTO_FACTURAR = 'pedido_listo_facturar',
  STOCK_BAJO = 'stock_bajo',
  FACTURA_EMITIDA = 'factura_emitida',
  GRE_GENERADA = 'gre_generada',
  BACKORDER_REPROGRAMADO = 'backorder_reprogramado',
  // Integrations
  INTEGRACION_ERROR = 'integration_error',
  INTEGRACION_LENTA = 'integration_slow',
  // Purchase orders
  OC_REQUIERE_APROBACION = 'oc_requiere_aprobacion',
  OC_APROBADA = 'oc_aprobada',
  OC_RECHAZADA = 'oc_rechazada',
  OC_CANCELADA = 'oc_cancelada'
}

export enum NotificationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error'
}

export interface Notification {
  id: string;
  tenant_id: string;
  usuario_id?: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  action_url?: string;
  action_label?: string;
  leida: boolean;
  created_at: Date;
  leida_at?: Date;
}

export interface CreateNotificationDto {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  action_url?: string;
  action_label?: string;
  usuario_id?: string;
}

export interface NotificationFilters {
  type?: NotificationType;
  severity?: NotificationSeverity;
  leida?: boolean;
  usuario_id?: string;
}
