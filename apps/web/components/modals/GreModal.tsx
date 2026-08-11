'use client'

import { useState, useEffect, useRef } from 'react'
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

function defaultTransferDate() {
  const value = new Date()
  value.setDate(value.getDate() + 1)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
    fechaTraslado: defaultTransferDate(),
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
  const [manualItems, setManualItems] = useState([{ descripcion: '', cantidad: '1', unidadMedida: 'NIU' }])
  const requestKeyRef = useRef(`gre-create:${crypto.randomUUID()}`)

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
        tenantId: pedidoContext?.tenantId,
        idempotencyKey: requestKeyRef.current,
        ...(!pedidoContext && !cpeData ? {
          items: manualItems.map((item) => ({
            descripcion: item.descripcion.trim(),
            cantidad: Number(item.cantidad),
            unidadMedida: item.unidadMedida.trim().toUpperCase() || 'NIU',
          })),
        } : {}),
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
        requestKeyRef.current = `gre-create:${crypto.randomUUID()}`
        // Reset form
        setFormData({
          destinatario: '',
          direccionDestino: '',
          ubigeoDestino: '',
          fechaTraslado: defaultTransferDate(),
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
        setManualItems([{ descripcion: '', cantidad: '1', unidadMedida: 'NIU' }])
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
              <label htmlFor="gre-modal-destinatario" className="block mb-2 font-semibold text-foreground/85">
                Destinatario *
              </label>
              <input id="gre-modal-destinatario"
                aria-label="Destinatario *"
                type="text"
                name="destinatario"
                value={formData.destinatario}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            {!pedidoContext && !cpeData && (
              <div className="col-span-full rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-foreground">Bienes trasladados *</div>
                    <div className="text-xs text-muted-foreground">La guía manual debe indicar lo que realmente se transporta.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setManualItems((items) => [...items, { descripcion: '', cantidad: '1', unidadMedida: 'NIU' }])}
                    className="rounded-md border px-3 py-2 text-sm font-semibold"
                  >
                    Agregar línea
                  </button>
                </div>
                <div className="grid gap-3">
                  {manualItems.map((item, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1fr_110px_90px_auto]">
                      <input
                        aria-label={`Descripción del bien ${index + 1}`}
                        value={item.descripcion}
                        onChange={(event) => setManualItems((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, descripcion: event.target.value } : current))}
                        placeholder="Descripción real del bien"
                        required
                        maxLength={500}
                        className="w-full rounded-md border p-3 text-sm"
                      />
                      <input
                        aria-label={`Cantidad del bien ${index + 1}`}
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={item.cantidad}
                        onChange={(event) => setManualItems((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, cantidad: event.target.value } : current))}
                        required
                        className="w-full rounded-md border p-3 text-sm"
                      />
                      <input
                        aria-label={`Unidad del bien ${index + 1}`}
                        value={item.unidadMedida}
                        onChange={(event) => setManualItems((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, unidadMedida: event.target.value } : current))}
                        minLength={2}
                        maxLength={3}
                        required
                        className="w-full rounded-md border p-3 text-sm uppercase"
                      />
                      <button
                        type="button"
                        aria-label={`Quitar bien ${index + 1}`}
                        disabled={manualItems.length === 1}
                        onClick={() => setManualItems((items) => items.filter((_, currentIndex) => currentIndex !== index))}
                        className="rounded-md border px-3 py-2 text-sm disabled:opacity-40"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="gre-modal-direccion-destino" className="block mb-2 font-semibold text-foreground/85">
                Dirección de Destino *
              </label>
              <input id="gre-modal-direccion-destino"
                aria-label="Dirección de Destino *"
                type="text"
                name="direccionDestino"
                value={formData.direccionDestino}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label htmlFor="gre-modal-ubigeo-destino" className="block mb-2 font-semibold text-foreground/85">
                Ubigeo de Destino *
              </label>
              <input id="gre-modal-ubigeo-destino"
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
              <label htmlFor="gre-modal-fecha-traslado" className="block mb-2 font-semibold text-foreground/85">
                Fecha de Traslado *
              </label>
              <input id="gre-modal-fecha-traslado"
                aria-label="Fecha de Traslado *"
                type="date"
                name="fechaTraslado"
                value={formData.fechaTraslado}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label htmlFor="gre-modal-modalidad" className="block mb-2 font-semibold text-foreground/85">
                Modalidad de Transporte *
              </label>
              <select id="gre-modal-modalidad"
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
              <label htmlFor="gre-modal-motivo" className="block mb-2 font-semibold text-foreground/85">
                Motivo del Traslado *
              </label>
              <select id="gre-modal-motivo"
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
              <label htmlFor="gre-modal-peso-total" className="block mb-2 font-semibold text-foreground/85">
                Peso Total (Kg) *
              </label>
              <input id="gre-modal-peso-total"
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
                  <label htmlFor="gre-modal-transportista" className="block mb-2 font-semibold text-foreground/85">
                    Transportista *
                  </label>
                  <input id="gre-modal-transportista"
                    aria-label="Transportista *"
                    type="text"
                    name="transportista"
                    value={formData.transportista}
                    onChange={handleChange}
                    required={formData.modalidad === 'TRANSPORTE_PUBLICO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="gre-modal-transportista-documento" className="block mb-2 font-semibold text-foreground/85">
                    RUC del Transportista *
                  </label>
                  <input id="gre-modal-transportista-documento"
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
                  <label htmlFor="gre-modal-placa-vehiculo" className="block mb-2 font-semibold text-foreground/85">
                    Placa del Vehículo *
                  </label>
                  <input id="gre-modal-placa-vehiculo"
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
                  <label htmlFor="gre-modal-licencia-conducir" className="block mb-2 font-semibold text-foreground/85">
                    Licencia de Conducir *
                  </label>
                  <input id="gre-modal-licencia-conducir"
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
                  <label htmlFor="gre-modal-conductor-documento-tipo" className="block mb-2 font-semibold text-foreground/85">
                    Tipo Doc. Conductor *
                  </label>
                  <select id="gre-modal-conductor-documento-tipo"
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
                  <label htmlFor="gre-modal-conductor-documento-numero" className="block mb-2 font-semibold text-foreground/85">
                    Documento Conductor *
                  </label>
                  <input id="gre-modal-conductor-documento-numero"
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
                  <label htmlFor="gre-modal-conductor-nombres" className="block mb-2 font-semibold text-foreground/85">
                    Nombres Conductor *
                  </label>
                  <input id="gre-modal-conductor-nombres"
                    aria-label="Nombres Conductor *"
                    type="text"
                    name="conductorNombres"
                    value={formData.conductorNombres}
                    onChange={handleChange}
                    required={formData.modalidad === 'TRANSPORTE_PRIVADO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="gre-modal-conductor-apellidos" className="block mb-2 font-semibold text-foreground/85">
                    Apellidos Conductor *
                  </label>
                  <input id="gre-modal-conductor-apellidos"
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
              <label htmlFor="gre-modal-observaciones" className="block mb-2 font-semibold text-foreground/85">
                Observaciones
              </label>
              <textarea id="gre-modal-observaciones"
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
