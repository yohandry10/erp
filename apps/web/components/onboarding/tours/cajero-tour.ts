import { OnboardingTour } from '../types'

export const cajeroTour: OnboardingTour = {
  id: 'cajero',
  nombre: 'Tour del Cajero',
  rol: 'cajero',
  pasos: [
    {
      id: 'bienvenida',
      tipo: 'modal',
      titulo: '¡Bienvenido al Punto de Venta!',
      descripcion: 'Te guiaremos por las funciones principales del POS. Este tour te ayudará a familiarizarte con el sistema.',
    },
    {
      id: 'abrir-caja',
      tipo: 'spotlight',
      selector: '[data-tour="btn-abrir-caja"]',
      titulo: 'Abrir Caja',
      descripcion: 'Antes de vender, debes abrir tu caja declarando el monto inicial de efectivo.',
      posicion: 'bottom',
    },
    {
      id: 'buscar-producto',
      tipo: 'spotlight',
      selector: '[data-tour="input-buscar-producto"]',
      titulo: 'Buscar Productos',
      descripcion: 'Escribe el nombre del producto o usa el lector de códigos de barras para agregarlo al carrito.',
      posicion: 'bottom',
    },
    {
      id: 'carrito',
      tipo: 'spotlight',
      selector: '[data-tour="carrito"]',
      titulo: 'Carrito de Compras',
      descripcion: 'Aquí verás los productos agregados. Puedes modificar cantidades o eliminar items.',
      posicion: 'left',
    },
    {
      id: 'metodo-pago',
      tipo: 'spotlight',
      selector: '[data-tour="metodo-pago"]',
      titulo: 'Método de Pago',
      descripcion: 'Selecciona cómo pagará el cliente: efectivo, tarjeta, transferencia, etc.',
      posicion: 'top',
    },
    {
      id: 'procesar-venta',
      tipo: 'spotlight',
      selector: '[data-tour="btn-procesar-venta"]',
      titulo: 'Procesar Venta',
      descripcion: 'Una vez todo listo, presiona este botón para completar la venta y generar el comprobante.',
      posicion: 'top',
    },
    {
      id: 'cerrar-caja',
      tipo: 'spotlight',
      selector: '[data-tour="btn-cerrar-caja"]',
      titulo: 'Cerrar Caja',
      descripcion: 'Al final de tu turno, cierra la caja declarando el efectivo final para cuadrar.',
      posicion: 'bottom',
    },
    {
      id: 'fin',
      tipo: 'modal',
      titulo: '¡Listo para vender!',
      descripcion: 'Ya conoces las funciones básicas del POS. Si tienes dudas, usa el botón de ayuda (?) en la esquina inferior derecha.',
    },
  ],
}
