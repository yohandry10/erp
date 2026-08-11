import { redirect } from 'next/navigation'

/**
 * Compatibilidad de navegación: las cotizaciones pertenecen al flujo de
 * Ventas. Mantener una segunda pantalla bajo CPE había creado una segunda API
 * de escritura que podía facturar sin Pedido ni reserva de inventario.
 */
export default function CotizacionesCpeRedirect() {
  redirect('/dashboard/ventas/cotizaciones')
}
