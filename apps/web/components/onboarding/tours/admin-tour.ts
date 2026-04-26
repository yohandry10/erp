import { OnboardingTour } from '../types'

export const adminTour: OnboardingTour = {
  id: 'admin',
  nombre: 'Tour del Administrador',
  rol: 'admin',
  pasos: [
    {
      id: 'bienvenida',
      tipo: 'modal',
      titulo: '¡Bienvenido Administrador!',
      descripcion: 'Te mostraremos las funciones principales para gestionar tu empresa en el ERP.',
    },
    {
      id: 'dashboard',
      tipo: 'spotlight',
      selector: '[data-tour="menu-dashboard"]',
      titulo: 'Dashboard',
      descripcion: 'Vista general de tu negocio: ventas, inventario, finanzas y alertas importantes.',
      posicion: 'right',
    },
    {
      id: 'configuracion',
      tipo: 'spotlight',
      selector: '[data-tour="menu-configuracion"]',
      titulo: 'Configuración',
      descripcion: 'Configura tu empresa, usuarios, roles, series de comprobantes y más.',
      posicion: 'right',
    },
    {
      id: 'usuarios',
      tipo: 'spotlight',
      selector: '[data-tour="menu-usuarios"]',
      titulo: 'Gestión de Usuarios',
      descripcion: 'Crea usuarios y asigna roles. Cada rol tiene permisos específicos.',
      posicion: 'right',
    },
    {
      id: 'reportes',
      tipo: 'spotlight',
      selector: '[data-tour="menu-reportes"]',
      titulo: 'Reportes',
      descripcion: 'Genera reportes de ventas, inventario, finanzas y más. Exporta a Excel o PDF.',
      posicion: 'right',
    },
    {
      id: 'modulos',
      tipo: 'modal',
      titulo: 'Módulos Disponibles',
      descripcion: 'El ERP incluye: Ventas, Compras, Inventario, Finanzas, Contabilidad, RRHH y POS. Explora cada uno según tus necesidades.',
    },
    {
      id: 'fin',
      tipo: 'modal',
      titulo: '¡Todo listo!',
      descripcion: 'Ya conoces las funciones principales. Usa el botón de ayuda (?) para resolver dudas. ¡Éxito con tu negocio!',
    },
  ],
}
