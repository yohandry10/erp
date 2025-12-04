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
  roles_destinatarios?: string[]; // Array de role_ids
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
  roles_destinatarios?: string[]; // Array de role_ids para notificar a roles específicos
}

export interface NotificationFilters {
  type?: NotificationType;
  severity?: NotificationSeverity;
  leida?: boolean;
  usuario_id?: string;
}

/**
 * Mapeo de tipos de notificación a roles por defecto
 * Esto permite configurar qué roles reciben qué tipos de notificaciones
 */
export const DEFAULT_NOTIFICATION_ROLES: Partial<Record<NotificationType, string[]>> = {
  // Stock bajo → Almacenero, Gerente de Inventario, Administrador
  [NotificationType.STOCK_BAJO]: ['Almacenero', 'Gerente de Inventario', 'Administrador'],
  
  // Órdenes de compra → Compras, Administrador
  [NotificationType.OC_REQUIERE_APROBACION]: ['Gerente de Compras', 'Administrador'],
  [NotificationType.OC_APROBADA]: ['Compras', 'Administrador'],
  [NotificationType.OC_RECHAZADA]: ['Compras', 'Administrador'],
  
  // Ventas → Vendedor, Gerente de Ventas
  [NotificationType.COTIZACION_CONVERTIDA]: ['Vendedor', 'Gerente de Ventas'],
  [NotificationType.PEDIDO_CONFIRMADO]: ['Vendedor', 'Almacenero', 'Gerente de Ventas'],
  [NotificationType.PEDIDO_LISTO_DESPACHO]: ['Almacenero', 'Logística'],
  [NotificationType.PEDIDO_LISTO_FACTURAR]: ['Facturación', 'Contador'],
  [NotificationType.FACTURA_EMITIDA]: ['Contador', 'Administrador'],
  
  // Certificados → Solo Administrador
  [NotificationType.CERTIFICATE_EXPIRING]: ['Administrador'],
  [NotificationType.CERTIFICATE_EXPIRED]: ['Administrador'],
  
  // Configuración → Solo Administrador
  [NotificationType.CONFIGURATION_INCOMPLETE]: ['Administrador'],
  
  // Integraciones → Administrador, IT
  [NotificationType.INTEGRACION_ERROR]: ['Administrador'],
  [NotificationType.INTEGRACION_LENTA]: ['Administrador'],
};
