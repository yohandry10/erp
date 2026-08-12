import { OnboardingTour } from '../types'

export const vendedorTour: OnboardingTour = {
  id: 'vendedor',
  nombre: 'Tour del Vendedor',
  rol: 'vendedor',
  pasos: [
    {
      id: 'bienvenida',
      tipo: 'modal',
      titulo: '¡Bienvenido al Módulo de Ventas!',
      descripcion: 'Te mostraremos cómo gestionar clientes, crear cotizaciones y procesar pedidos.',
    },
    {
      id: 'menu-ventas',
      tipo: 'spotlight',
      selector: '[data-tour="menu-ventas"]',
      titulo: 'Menú de Ventas',
      descripcion: 'Desde aquí accedes a todas las funciones de ventas: clientes, cotizaciones, pedidos y facturas.',
      posicion: 'right',
    },
    {
      id: 'clientes',
      tipo: 'spotlight',
      selector: '[data-tour="menu-clientes"]',
      titulo: 'Gestión de Clientes',
      descripcion: 'Registra y administra tus clientes con los documentos fiscales y personales del país.',
      posicion: 'right',
    },
    {
      id: 'cotizaciones',
      tipo: 'spotlight',
      selector: '[data-tour="menu-cotizaciones"]',
      titulo: 'Cotizaciones',
      descripcion: 'Crea propuestas comerciales para tus clientes. Puedes enviarlas por email.',
      posicion: 'right',
    },
    {
      id: 'pedidos',
      tipo: 'spotlight',
      selector: '[data-tour="menu-pedidos"]',
      titulo: 'Pedidos',
      descripcion: 'Cuando el cliente acepta, convierte la cotización en pedido. El stock se reserva automáticamente.',
      posicion: 'right',
    },
    {
      id: 'facturas',
      tipo: 'spotlight',
      // No existe un menu "Facturas": los comprobantes viven en Documentos.
      selector: '[data-tour="menu-documentos"]',
      titulo: 'Facturación',
      descripcion: 'Genera los comprobantes electrónicos habilitados y procésalos con la autoridad fiscal del tenant.',
      posicion: 'right',
    },
    {
      id: 'fin',
      tipo: 'modal',
      titulo: '¡Listo para vender!',
      descripcion: 'Ya conoces el flujo de ventas. Recuerda: Cotización → Pedido → Factura. ¡Éxito!',
    },
  ],
}
