'use client'

import { useState, useEffect } from 'react'
import { useApiCall } from '@/hooks/use-api'

function showToast(message: string) {
  if (typeof window === 'undefined') return

  const toast = document.createElement('div')
  const content = document.createElement('div')
  content.textContent = message
  toast.appendChild(content)
  document.body.appendChild(toast)
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast)
    }
  }, 3000)
}

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
    ubigeoDestino: '',
    fechaTraslado: '',
    modalidad: 'TRANSPORTE_PUBLICO',
    motivo: 'VENTA',
    pesoTotal: '',
    observaciones: '',
    transportista: '',
    transportistaDocumento: '',
    placaVehiculo: '',
    licenciaConducir: '',
    conductorDocumentoTipo: '1',
    conductorDocumentoNumero: '',
    conductorNombres: '',
    conductorApellidos: ''
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
        showToast(`✅ ${result.message || 'Guía de remisión creada exitosamente'}`)

        onSuccess(result.data)
        onClose()
        // Reset form
        setFormData({
          destinatario: '',
          direccionDestino: '',
          ubigeoDestino: '',
          fechaTraslado: '',
          modalidad: 'TRANSPORTE_PUBLICO',
          motivo: 'VENTA',
          pesoTotal: '',
          observaciones: '',
          transportista: '',
          transportistaDocumento: '',
          placaVehiculo: '',
          licenciaConducir: '',
          conductorDocumentoTipo: '1',
          conductorDocumentoNumero: '',
          conductorNombres: '',
          conductorApellidos: ''
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
    <div className="fixed inset-0 z-[1100] flex items-start justify-center overflow-y-auto bg-[rgba(0,_0,_0,_0.5)] p-4">
      <div className="my-auto max-h-[calc(100dvh-2rem)] w-[90%] max-w-[700px] overflow-y-auto rounded-xl bg-card p-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Nueva Guía de Remisión Electrónica</h2>
            {cpeData && (
              <p className="text-sm text-[#22c55e] mt-1 font-medium">
                🔗 Datos pre-llenados desde {(cpeData.tipoDocumento || cpeData.tipoComprobante) === '01' ? 'Factura' : 'Boleta'} {cpeData.serie}-{cpeData.numero.toString().padStart(8, '0')}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={isLoading} className="border-0 text-2xl text-muted-foreground"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="bg-[#fee2e2] border text-destructive p-3 rounded-[6px] mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4 mb-6">
            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Destinatario *
              </label>
              <input
                aria-label="Destinatario *"
                type="text"
                name="destinatario"
                value={formData.destinatario}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Dirección de Destino *
              </label>
              <input
                aria-label="Dirección de Destino *"
                type="text"
                name="direccionDestino"
                value={formData.direccionDestino}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Ubigeo de Destino *
              </label>
              <input
                aria-label="Ubigeo de Destino *"
                type="text"
                inputMode="numeric"
                name="ubigeoDestino"
                value={formData.ubigeoDestino}
                onChange={handleChange}
                minLength={6}
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="Ej: 150101"
                required
                className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Fecha de Traslado *
              </label>
              <input
                aria-label="Fecha de Traslado *"
                type="date"
                name="fechaTraslado"
                value={formData.fechaTraslado}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Modalidad de Transporte *
              </label>
              <select
                aria-label="Modalidad de Transporte *"
                name="modalidad"
                value={formData.modalidad}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              >
                <option value="TRANSPORTE_PUBLICO">Transporte Público</option>
                <option value="TRANSPORTE_PRIVADO">Transporte Privado</option>
              </select>
            </div>

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Motivo del Traslado *
              </label>
              <select
                aria-label="Motivo del Traslado *"
                name="motivo"
                value={formData.motivo}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
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
              <label className="block mb-2 font-semibold text-foreground/85">
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
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            {formData.modalidad === 'TRANSPORTE_PUBLICO' && (
              <>
                <div>
                  <label className="block mb-2 font-semibold text-foreground/85">
                    Transportista *
                  </label>
                  <input
                    aria-label="Transportista *"
                    type="text"
                    name="transportista"
                    value={formData.transportista}
                    onChange={handleChange}
                    required={formData.modalidad === 'TRANSPORTE_PUBLICO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>

                <div>
                  <label className="block mb-2 font-semibold text-foreground/85">
                    RUC del Transportista *
                  </label>
                  <input
                    aria-label="RUC del Transportista *"
                    type="text"
                    name="transportistaDocumento"
                    value={formData.transportistaDocumento}
                    onChange={handleChange}
                    inputMode="numeric"
                    maxLength={11}
                    pattern="[0-9]{11}"
                    required={formData.modalidad === 'TRANSPORTE_PUBLICO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>
              </>
            )}

            {formData.modalidad === 'TRANSPORTE_PRIVADO' && (
              <>
                <div>
                  <label className="block mb-2 font-semibold text-foreground/85">
                    Placa del Vehículo *
                  </label>
                  <input
                    aria-label="Placa del Vehículo *"
                    type="text"
                    name="placaVehiculo"
                    value={formData.placaVehiculo}
                    onChange={handleChange}
                    maxLength={8}
                    required={formData.modalidad === 'TRANSPORTE_PRIVADO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>

                <div>
                  <label className="block mb-2 font-semibold text-foreground/85">
                    Licencia de Conducir *
                  </label>
                  <input
                    aria-label="Licencia de Conducir *"
                    type="text"
                    name="licenciaConducir"
                    value={formData.licenciaConducir}
                    onChange={handleChange}
                    maxLength={10}
                    required={formData.modalidad === 'TRANSPORTE_PRIVADO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>

                <div>
                  <label className="block mb-2 font-semibold text-foreground/85">
                    Tipo Doc. Conductor *
                  </label>
                  <select
                    aria-label="Tipo Doc. Conductor *"
                    name="conductorDocumentoTipo"
                    value={formData.conductorDocumentoTipo}
                    onChange={handleChange}
                    required={formData.modalidad === 'TRANSPORTE_PRIVADO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  >
                    <option value="1">DNI</option>
                    <option value="4">Carné de extranjería</option>
                    <option value="7">Pasaporte</option>
                    <option value="0">Doc. trib. no domiciliado</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-2 font-semibold text-foreground/85">
                    Documento Conductor *
                  </label>
                  <input
                    aria-label="Documento Conductor *"
                    type="text"
                    name="conductorDocumentoNumero"
                    value={formData.conductorDocumentoNumero}
                    onChange={handleChange}
                    maxLength={15}
                    required={formData.modalidad === 'TRANSPORTE_PRIVADO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>

                <div>
                  <label className="block mb-2 font-semibold text-foreground/85">
                    Nombres Conductor *
                  </label>
                  <input
                    aria-label="Nombres Conductor *"
                    type="text"
                    name="conductorNombres"
                    value={formData.conductorNombres}
                    onChange={handleChange}
                    required={formData.modalidad === 'TRANSPORTE_PRIVADO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>

                <div>
                  <label className="block mb-2 font-semibold text-foreground/85">
                    Apellidos Conductor *
                  </label>
                  <input
                    aria-label="Apellidos Conductor *"
                    type="text"
                    name="conductorApellidos"
                    value={formData.conductorApellidos}
                    onChange={handleChange}
                    required={formData.modalidad === 'TRANSPORTE_PRIVADO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Observaciones
              </label>
              <textarea
                aria-label="Observaciones"
                name="observaciones"
                value={formData.observaciones}
                onChange={handleChange}
                rows={3} className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>
          </div>

          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={onClose} className="py-3 px-6 border rounded-[6px] bg-card text-foreground/85 cursor-pointer font-semibold"
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
