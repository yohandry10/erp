'use client'

import { useState, useEffect } from 'react'
import { useApiCall } from '@/hooks/use-api'

interface CpeData {
  id: string
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

interface GreModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  cpeData?: CpeData | null // Datos opcionales del CPE para pre-llenar
}

export default function GreModal({ isOpen, onClose, onSuccess, cpeData }: GreModalProps) {
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
        observaciones: `Relacionado con ${cpeData.tipoComprobante === '01' ? 'Factura' : 'Boleta'} ${cpeData.serie}-${cpeData.numero.toString().padStart(8, '0')} - ${cpeData.cliente}`
      }))
    }
  }, [cpeData, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    
    try {
      const greData = {
        ...formData,
        pesoTotal: parseFloat(formData.pesoTotal) || 0
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
            <div style="
              position: fixed;
              top: 20px;
              right: 20px;
              background: #10b981;
              color: white;
              padding: 1rem 1.5rem;
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              z-index: 9999;
              font-weight: 600;
              animation: slideIn 0.3s ease-out;
            ">
              ✅ ${result.message || 'Guía de remisión creada exitosamente'}
            </div>
            <style>
              @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
              }
            </style>
          `
          document.body.appendChild(successToast)
          setTimeout(() => {
            document.body.removeChild(successToast)
          }, 3000)
        }
        
        onSuccess()
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
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '2rem',
        width: '90%',
        maxWidth: '700px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>Nueva Guía de Remisión Electrónica</h2>
            {cpeData && (
              <p style={{ fontSize: '0.9rem', color: '#22c55e', marginTop: '0.25rem', fontWeight: '500' }}>
                🔗 Datos pre-llenados desde {cpeData.tipoComprobante === '01' ? 'Factura' : 'Boleta'} {cpeData.serie}-{cpeData.numero.toString().padStart(8, '0')}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              color: '#6b7280',
              opacity: isLoading ? 0.5 : 1
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            padding: '0.75rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.9rem'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                Destinatario *
              </label>
              <input
                type="text"
                name="destinatario"
                value={formData.destinatario}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                Dirección de Destino *
              </label>
              <input
                type="text"
                name="direccionDestino"
                value={formData.direccionDestino}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                Fecha de Traslado *
              </label>
              <input
                type="date"
                name="fechaTraslado"
                value={formData.fechaTraslado}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                Modalidad de Transporte *
              </label>
              <select
                name="modalidad"
                value={formData.modalidad}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.9rem'
                }}
              >
                <option value="TRANSPORTE_PUBLICO">Transporte Público</option>
                <option value="TRANSPORTE_PRIVADO">Transporte Privado</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                Motivo del Traslado *
              </label>
              <select
                name="motivo"
                value={formData.motivo}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.9rem'
                }}
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
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                Peso Total (Kg) *
              </label>
              <input
                type="number"
                name="pesoTotal"
                value={formData.pesoTotal}
                onChange={handleChange}
                step="0.01"
                min="0"
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            {formData.modalidad === 'TRANSPORTE_PUBLICO' && (
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  Transportista
                </label>
                <input
                  type="text"
                  name="transportista"
                  value={formData.transportista}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
            )}

            {formData.modalidad === 'TRANSPORTE_PRIVADO' && (
              <>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                    Placa del Vehículo
                  </label>
                  <input
                    type="text"
                    name="placaVehiculo"
                    value={formData.placaVehiculo}
                    onChange={handleChange}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                    Licencia de Conducir
                  </label>
                  <input
                    type="text"
                    name="licenciaConducir"
                    value={formData.licenciaConducir}
                    onChange={handleChange}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </>
            )}

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                Observaciones
              </label>
              <textarea
                name="observaciones"
                value={formData.observaciones}
                onChange={handleChange}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  resize: 'vertical'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: 'white',
                color: '#374151',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: isLoading ? '#9ca3af' : '#3b82f6',
                color: 'white',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontWeight: '600'
              }}
            >
              {isLoading ? 'Creando...' : 'Crear GRE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}