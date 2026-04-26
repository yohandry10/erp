import { HelpItem } from '../types'

export const configuracionHelp: Record<string, HelpItem> = {
  'configuracion.empresa': {
    key: 'configuracion.empresa',
    title: 'Datos de Empresa',
    description: 'Información general de tu empresa.',
    tips: [
      'RUC y razón social aparecen en comprobantes',
      'Configura logo para documentos'
    ],
    link: '/dashboard/configuracion/empresa'
  },
  'configuracion.usuario': {
    key: 'configuracion.usuario',
    title: 'Usuario',
    description: 'Persona que accede al sistema.',
    tips: [
      'Cada usuario tiene un rol asignado',
      'Los permisos dependen del rol'
    ]
  },
  'configuracion.rol': {
    key: 'configuracion.rol',
    title: 'Rol',
    description: 'Conjunto de permisos predefinidos.',
    tips: [
      'Cajero: Solo POS',
      'Vendedor: Ventas y clientes',
      'Admin: Acceso completo'
    ]
  },
  'configuracion.permiso': {
    key: 'configuracion.permiso',
    title: 'Permiso',
    description: 'Autorización para realizar una acción.',
    tips: [
      'Se asignan a través de roles',
      'Puedes personalizar por usuario'
    ]
  },
  'configuracion.serie': {
    key: 'configuracion.serie',
    title: 'Serie de Comprobante',
    description: 'Prefijo para numeración de documentos.',
    tips: [
      'F001 para facturas, B001 para boletas',
      'Cada punto de venta puede tener su serie'
    ]
  },
  'configuracion.impuesto': {
    key: 'configuracion.impuesto',
    title: 'Impuesto',
    description: 'Configuración de tasas impositivas.',
    tips: [
      'IGV estándar: 18%',
      'Algunos productos pueden ser exonerados'
    ]
  },
  'configuracion.moneda': {
    key: 'configuracion.moneda',
    title: 'Moneda',
    description: 'Divisa para operaciones.',
    tips: [
      'PEN: Soles peruanos',
      'USD: Dólares americanos',
      'Configura tipo de cambio diario'
    ]
  },
  'configuracion.almacen': {
    key: 'configuracion.almacen',
    title: 'Almacén',
    description: 'Punto de almacenamiento de productos.',
    tips: [
      'Puedes tener múltiples almacenes',
      'Cada uno maneja su propio stock'
    ]
  }
}
