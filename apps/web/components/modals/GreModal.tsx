'use client'

import { useState, useEffect } from 'react'
import { useApiCall } from '@/hooks/use-api'

interface CpeData {
  id: string
  tipoDocumento?: string
  tipoComprobante: string
  serie: string
  numero: number
  fechaEmision: string
  cliente: string
  clienteRuc: string
  total: number
  moneda: string
  estado: string
}

interface PedidoContext {
  id: string
  numero: string
  clienteNombre: string
  clienteDireccion?: string | null
  tenantId: string
}

interface GreModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (data?: any) => void
  cpeData?: CpeData | null // Datos opcionales del CPE para pre-llenar
  pedidoContext?: PedidoContext
  additionalPayload?: Record<string, any>
}

export default function GreModal({
  isOpen,
  onClose,
  onSuccess,
  cpeData,
  pedidoContext,
  additionalPayload
}: GreModalProps) {
  const [formData, setFormData] = useState({
    destinatario: '',
    direccionDestino: '',
    fechaTraslado: '',
    modalidad: 'TRANSPORTE_PUBLICO',
    motivo: 'VENTA',
    pesoTotal: '',
    observaciones: '',
    transportista: '',
    placaVehiculo: '',
    licenciaConducir: ''
  })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

    const api = useApiCall()

  // Pre-llenar datos cuando se proporciona CPE (OPCIONAL, para facilitar)
  useEffect(() => {
    if (cpeData && isOpen) {
      console.log('🔗 Pre-llenando GRE con datos de CPE para facilitar:', cpeData)
      
      // Calcular fecha de traslado (mañana por defecto)
      const mañana = new Date()
      mañana.setDate(mañana.getDate() + 1)
      const fechaTraslado = mañana.toISOString().split('T')[0]
      
      setFormData(prev => ({
        ...prev,
        destinatario: cpeData.cliente,
        fechaTraslado: fechaTraslado,
        motivo: 'VENTA',
        observaciones: `Relacionado con ${(cpeData.tipoDocumento || cpeData.tipoComprobante) === '01' ? 'Factura' : 'Boleta'} ${cpeData.serie}-${cpeData.numero.toString().padStart(8, '0')} - ${cpeData.cliente}`
      }))
    }
  }, [cpeData, isOpen])

  useEffect(() => {
    if (pedidoContext && isOpen) {
      setFormData(prev => ({
        ...prev,
        destinatario: prev.destinatario || pedidoContext.clienteNombre,
        direccionDestino: pedidoContext.clienteDireccion || prev.direccionDestino
      }))
    }
  }, [pedidoContext, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    
    try {
      const greData = {
        ...formData,
        ...(additionalPayload || {}),
        pesoTotal: parseFloat(formData.pesoTotal) || 0,
        pedidoId: pedidoContext?.id,
        pedidoNumero: pedidoContext?.numero,
        tenantId: pedidoContext?.tenantId
      }

      console.log('🚚 Enviando datos GRE:', greData)
      const result = await api.post('/api/gre/guias', greData)
      
      console.log('✅ Respuesta del servidor:', result)
      
      if (result && result.success) {
        console.log('✅ GRE creada exitosamente:', result.data)
        
        // Mostrar toast de éxito
        if (typeof window !== 'undefined') {
          const successToast = document.createElement('div')
          successToast.innerHTML = `
            <div>
              ✅ ${result.message || 'Guía de remisión creada exitosamente'}
            </div>
          `
          document.body.appendChild(successToast)
          setTimeout(() => {
            document.body.removeChild(successToast)
          }, 3000)
        }
        
        onSuccess(result.data)
        onClose()
        // Reset form
        setFormData({
          destinatario: '',
          direccionDestino: '',
          fechaTraslado: '',
          modalidad: 'TRANSPORTE_PUBLICO',
          motivo: 'VENTA',
          pesoTotal: '',
          observaciones: '',
          transportista: '',
          placaVehiculo: '',
          licenciaConducir: ''
        })
      } else {
        console.log('❌ Error en la respuesta:', result)
        setError(result?.message || 'Error al crear la guía de remisión')
      }
    } catch (err: any) {
      console.error('❌ Error al crear GRE:', err)
      setError(err.message || 'Error al crear la guía de remisión')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.5)] flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-3 p-8 w-[90%] max-w-[700px] overflow-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-6 font-semibold text-gray-800">Nueva Guía de Remisión Electrónica</h2>
            {cpeData && (
              <p className="text-3.5 text-[#22c55e] mt-1 font-medium">
                🔗 Datos pre-llenados desde {(cpeData.tipoDocumento || cpeData.tipoComprobante) === '01' ? 'Factura' : 'Boleta'} {cpeData.serie}-{cpeData.numero.toString().padStart(8, '0')}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={isLoading} className="border-0 text-6 text-gray-500"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="bg-[#fee2e2] border text-red-600 p-3 rounded-[6px] mb-4 text-3.5">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4 mb-6">
            <div>
              <label className="block mb-2 font-semibold text-gray-700">
                Destinatario *
              </label>
              <input
                aria-label="Destinatario *"
                type="text"
                name="destinatario"
                value={formData.destinatario}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-3.5"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold text-gray-700">
                Dirección de Destino *
              </label>
              <input
                aria-label="Dirección de Destino *"
                type="text"
                name="direccionDestino"
                value={formData.direccionDestino}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-3.5"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold text-gray-700">
                Fecha de Traslado *
              </label>
              <input
                aria-label="Fecha de Traslado *"
                type="date"
                name="fechaTraslado"
                value={formData.fechaTraslado}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-3.5"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold text-gray-700">
                Modalidad de Transporte *
              </label>
              <select
                aria-label="Modalidad de Transporte *"
                name="modalidad"
                value={formData.modalidad}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-3.5"
              >
                <option value="TRANSPORTE_PUBLICO">Transporte Público</option>
                <option value="TRANSPORTE_PRIVADO">Transporte Privado</option>
              </select>
            </div>

            <div>
              <label className="block mb-2 font-semibold text-gray-700">
                Motivo del Traslado *
              </label>
              <select
                aria-label="Motivo del Traslado *"
                name="motivo"
                value={formData.motivo}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-3.5"
              >
                <option value="VENTA">Venta</option>
                <option value="COMPRA">Compra</option>
                <option value="TRASLADO_ENTRE_ESTABLECIMIENTOS">Traslado entre establecimientos</option>
                <option value="CONSIGNACION">Consignación</option>
                <option value="DEVOLUCION">Devolución</option>
                <option value="OTROS">Otros</option>
              </select>
            </div>

            <div>
              <label className="block mb-2 font-semibold text-gray-700">
                Peso Total (Kg) *
              </label>
              <input
                aria-label="Peso Total (Kg) *"
                type="number"
                name="pesoTotal"
                value={formData.pesoTotal}
                onChange={handleChange}
                step="0.01"
                min="0"
                required className="w-[100%] p-3 border rounded-[6px] text-3.5"
              />
            </div>

            {formData.modalidad === 'TRANSPORTE_PUBLICO' && (
              <div>
                <label className="block mb-2 font-semibold text-gray-700">
                  Transportista
                </label>
                <input
                  aria-label="Transportista"
                  type="text"
                  name="transportista"
                  value={formData.transportista}
                  onChange={handleChange} className="w-[100%] p-3 border rounded-[6px] text-3.5"
                />
              </div>
            )}

            {formData.modalidad === 'TRANSPORTE_PRIVADO' && (
              <>
                <div>
                  <label className="block mb-2 font-semibold text-gray-700">
                    Placa del Vehículo
                  </label>
                  <input
                    aria-label="Placa del Vehículo"
                    type="text"
                    name="placaVehiculo"
                    value={formData.placaVehiculo}
                    onChange={handleChange} className="w-[100%] p-3 border rounded-[6px] text-3.5"
                  />
                </div>

                <div>
                  <label className="block mb-2 font-semibold text-gray-700">
                    Licencia de Conducir
                  </label>
                  <input
                    aria-label="Licencia de Conducir"
                    type="text"
                    name="licenciaConducir"
                    value={formData.licenciaConducir}
                    onChange={handleChange} className="w-[100%] p-3 border rounded-[6px] text-3.5"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block mb-2 font-semibold text-gray-700">
                Observaciones
              </label>
              <textarea
                aria-label="Observaciones"
                name="observaciones"
                value={formData.observaciones}
                onChange={handleChange}
                rows={3} className="w-[100%] p-3 border rounded-[6px] text-3.5"
              />
            </div>
          </div>

          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={onClose} className="py-3 px-6 border rounded-[6px] bg-white text-gray-700 cursor-pointer font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading} className="py-3 px-6 border-0 rounded-[6px] text-white font-semibold"
            >
              {isLoading ? 'Creando...' : 'Crear GRE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
