import React from 'react'
import { fetchApi } from '@/lib/api-fetch'

interface Cotizacion {
  id: string
  numero: string
  cliente_id: string
  fecha_cotizacion: string
  fecha_vencimiento: string
  vendedor: string
  moneda: string
  subtotal: number
  igv: number
  total: number
  estado: string
  probabilidad: number
  items: any[]
  observaciones?: string
  // Nuevos campos para conversión
  fecha_aprobacion?: string
  fecha_conversion?: string
  fecha_rechazo?: string
  documento_generado_id?: string
  motivo_rechazo?: string
}

interface CotizacionViewModalProps {
  isOpen: boolean
  onClose: () => void
  cotizacion: Cotizacion | null
  onActionsComplete?: () => void
}

export default function CotizacionViewModal({ isOpen, onClose, cotizacion, onActionsComplete }: CotizacionViewModalProps) {
  const [loading, setLoading] = React.useState(false)

  if (!isOpen || !cotizacion) return null

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getStatusColor = (estado: string) => {
    const estadoNormalizado = estado?.toUpperCase().trim() || 'BORRADOR'

    switch (estadoNormalizado) {
      case 'BORRADOR':
      case 'PENDIENTE': // Legacy - convertir a BORRADOR
        return { background: '#6b7280', color: 'white' }
      case 'ENVIADA':
        return { background: '#3b82f6', color: 'white' }
      case 'APROBADA':
        return { background: '#10b981', color: 'white' }
      case 'VENCIDA':
        return { background: '#dc2626', color: 'white' }
      case 'CONVERTIDA':
        return { background: '#059669', color: 'white' }
      case 'RECHAZADA':
        return { background: '#ef4444', color: 'white' }
      default:
        return { background: '#6b7280', color: 'white' }
    }
  }

  const getProbabilityColor = (prob: number) => {
    if (prob >= 80) return '#10b981'
    if (prob >= 60) return '#f59e0b'
    if (prob >= 40) return '#f59e0b'
    return '#ef4444'
  }

  const calcularDiasVencimiento = () => {
    const fechaVencimiento = new Date(cotizacion.fecha_vencimiento)
    const hoy = new Date()
    const diasParaVencer = Math.ceil((fechaVencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))

    if (diasParaVencer > 0) {
      return { texto: `Vence en ${diasParaVencer} días`, color: diasParaVencer <= 3 ? '#f59e0b' : '#10b981' }
    } else if (diasParaVencer === 0) {
      return { texto: 'Vence hoy', color: '#ef4444' }
    } else {
      return { texto: `Vencida hace ${Math.abs(diasParaVencer)} días`, color: '#dc2626' }
    }
  }

  const handleAprobar = async () => {
    try {
      setLoading(true)

      const response = await fetchApi(`/api/cotizaciones/${cotizacion.id}/aprobar`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          probabilidad: 100,
          observaciones: 'Cotización aprobada para conversión'
        })
      })

      const result = await response.json()

      if (result.success) {
        alert('✅ Cotización aprobada exitosamente')
        onActionsComplete?.()
        onClose()
      } else {
        alert('❌ Error: ' + result.error)
      }
    } catch (error) {
      console.error('Error aprobando cotización:', error)
      alert('❌ Error aprobando cotización')
    } finally {
      setLoading(false)
    }
  }

  const handleConvertir = async () => {
    try {
      setLoading(true)

      const tipoDocumento = confirm('¿Generar FACTURA (Aceptar) o BOLETA (Cancelar)?') ? 'FACTURA' : 'BOLETA'

      const response = await fetchApi(`/api/cotizaciones/${cotizacion.id}/convertir-en-venta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          generar_factura: true,
          tipo_documento: tipoDocumento,
          metodo_pago: 'CONTADO',
          observaciones: 'Convertido desde cotización'
        })
      })

      const result = await response.json()

      if (result.success) {
        alert(`🎉 ${result.message}`)
        onActionsComplete?.()
        onClose()
      } else {
        alert('❌ Error: ' + result.error)
      }
    } catch (error) {
      console.error('Error convirtiendo cotización:', error)
      alert('❌ Error convirtiendo cotización')
    } finally {
      setLoading(false)
    }
  }

  const handleRechazar = async () => {
    const motivo = prompt('Ingrese el motivo del rechazo:')
    if (!motivo) return

    try {
      setLoading(true)

      const response = await fetchApi(`/api/cotizaciones/${cotizacion.id}/rechazar`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ motivo })
      })

      const result = await response.json()

      if (result.success) {
        alert('✅ Cotización rechazada')
        onActionsComplete?.()
        onClose()
      } else {
        alert('❌ Error: ' + result.error)
      }
    } catch (error) {
      console.error('Error rechazando cotización:', error)
      alert('❌ Error rechazando cotización')
    } finally {
      setLoading(false)
    }
  }

  const vencimiento = calcularDiasVencimiento()
  const estadoActual = cotizacion.estado?.toUpperCase()

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.6)] z-[999999] flex items-center justify-center p-5"
      onClick={onClose}
    >
      <div className="bg-card rounded-2xl w-[100%] max-w-[900px] overflow-auto shadow"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-white p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold m-0">
              📋 {cotizacion.numero}
            </h2>
            <button
              onClick={onClose} className="bg-[rgba(255,_255,_255,_0.2)] border-0 text-white w-10 h-10 rounded-full cursor-pointer text-xl"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Estado y Total */}
          <div className="grid grid-cols-[1fr_1fr] gap-5 mb-6">
            <div className="bg-muted/30 p-4 rounded-xl text-center">
              <h3 className="mt-0 mr-0 mb-2 ml-0 text-foreground/85">Estado</h3>
              <span className="py-2 px-4 rounded-[1.25rem] text-[0.875rem] font-semibold">
                {estadoActual === 'PENDIENTE' || estadoActual === 'EN PROCESO'
                  ? 'BORRADOR'
                  : (estadoActual || 'BORRADOR')}
              </span>
            </div>

            <div className="bg-muted p-4 rounded-xl text-center">
              <h3 className="mt-0 mr-0 mb-2 ml-0 text-foreground/85">Total</h3>
              <div className="text-2xl font-bold text-emerald-400">
                {formatCurrency(cotizacion.total)}
              </div>
            </div>
          </div>

          {/* Información detallada */}
          <div className="grid grid-cols-[1fr_1fr] gap-4 text-[0.875rem] mb-6">
            <div>
              <strong>Cliente:</strong><br/>
              <span className="text-muted-foreground">{cotizacion.cliente_id}</span>
            </div>
            <div>
              <strong>Vendedor:</strong><br/>
              <span className="text-muted-foreground">{cotizacion.vendedor || 'No asignado'}</span>
            </div>
            <div>
              <strong>Fecha Cotización:</strong><br/>
              <span className="text-muted-foreground">{formatDate(cotizacion.fecha_cotizacion)}</span>
            </div>
            <div>
              <strong>Vencimiento:</strong><br/>
              <span className="text-muted-foreground">{formatDate(cotizacion.fecha_vencimiento)}</span>
            </div>
            <div>
              <strong>Probabilidad:</strong><br/>
              <span className="text-muted-foreground">{cotizacion.probabilidad}%</span>
            </div>
            <div>
              <strong>Moneda:</strong><br/>
              <span className="text-muted-foreground">{cotizacion.moneda || 'PEN'}</span>
            </div>
          </div>

          {/* Información de seguimiento si existe */}
          {(cotizacion.fecha_aprobacion || cotizacion.fecha_conversion || cotizacion.fecha_rechazo) && (
            <div className="bg-muted/30 p-4 rounded-xl mb-6">
              <h3 className="mt-0 mr-0 mb-3 ml-0 text-foreground/85">Seguimiento</h3>
              {cotizacion.fecha_aprobacion && (
                <div className="mb-2 text-[0.875rem]">
                  <strong>Aprobada:</strong> {formatDate(cotizacion.fecha_aprobacion)}
                </div>
              )}
              {cotizacion.fecha_conversion && (
                <div className="mb-2 text-[0.875rem]">
                  <strong>Convertida:</strong> {formatDate(cotizacion.fecha_conversion)}
                  {cotizacion.documento_generado_id && (
                    <span className="text-emerald-400 ml-2">
                      ✅ Documento generado
                    </span>
                  )}
                </div>
              )}
              {cotizacion.fecha_rechazo && (
                <div className="text-[0.875rem]">
                  <strong>Rechazada:</strong> {formatDate(cotizacion.fecha_rechazo)}
                  {cotizacion.motivo_rechazo && (
                    <div className="text-red-500 mt-[4px]">
                      Motivo: {cotizacion.motivo_rechazo}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Desglose financiero */}
          <div className="bg-muted/30 p-4 rounded-xl mb-6">
            <h3 className="mt-0 mr-0 mb-3 ml-0 text-foreground/85">Desglose Financiero</h3>
            <div className="flex justify-between mb-2">
              <span>Subtotal:</span>
              <span>{formatCurrency(cotizacion.subtotal)}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span>IGV (18%):</span>
              <span>{formatCurrency(cotizacion.igv)}</span>
            </div>
            <hr className="my-2 mx-0 border-0 border-t" />
            <div className="flex justify-between font-bold text-base text-emerald-400">
              <span>Total:</span>
              <span>{formatCurrency(cotizacion.total)}</span>
            </div>
          </div>

          {/* Observaciones */}
          {cotizacion.observaciones && (
            <div className="mb-6">
              <h3 className="mt-0 mr-0 mb-3 ml-0 text-foreground/85">Observaciones</h3>
              <div className="bg-[#fffbeb] p-3 rounded-lg text-[#92400e] text-[0.875rem]">
                {cotizacion.observaciones}
              </div>
            </div>
          )}
        </div>

        {/* Footer con botones de acción */}
        <div className="bg-muted/30 py-5 px-6 border-t">
          <div className="flex justify-between items-center">
            <div className="text-[0.875rem] font-semibold">
              {vencimiento.texto}
            </div>

            <div className="flex gap-3">
              {/* Botones según el estado */}
              {(estadoActual === 'BORRADOR' || estadoActual === 'ENVIADA') && (
                <>
                  <button
                    onClick={handleAprobar}
                    disabled={loading} className="bg-[#10b981] text-white border-0 py-2 px-4 rounded-lg text-[0.875rem] font-semibold"
                  >
                    {loading ? '⏳' : '✅'} Aprobar
                  </button>
                  <button
                    onClick={handleRechazar}
                    disabled={loading} className="bg-red-500 text-white border-0 py-2 px-4 rounded-lg text-[0.875rem] font-semibold"
                  >
                    {loading ? '⏳' : '❌'} Rechazar
                  </button>
                </>
              )}

              {estadoActual === 'APROBADA' && (
                <button
                  onClick={handleConvertir}
                  disabled={loading} className="bg-emerald-600 text-white border-0 py-2 px-4 rounded-lg text-[0.875rem] font-semibold"
                >
                  {loading ? '⏳' : '🔄'} Convertir en Venta
                </button>
              )}

              {estadoActual === 'CONVERTIDA' && (
                <div className="bg-[#dcfce7] text-[#166534] py-2 px-4 rounded-lg text-[0.875rem] font-semibold">
                  ✅ Ya convertida en venta
                </div>
              )}

              {estadoActual === 'RECHAZADA' && (
                <div className="bg-[#fecaca] text-destructive py-2 px-4 rounded-lg text-[0.875rem] font-semibold">
                  ❌ Cotización rechazada
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
