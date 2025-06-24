'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import { toast } from '@/components/ui/use-toast'

interface CotizacionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface Cliente {
  id: string
  razon_social?: string
  nombre_comercial?: string
  numero_documento: string
  tipo_documento?: string
  email?: string
  telefono?: string
}

interface DetalleCotizacion {
  codigo: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  descuento: number
  total: number
}

export default function CotizacionModal({ isOpen, onClose, onSuccess }: CotizacionModalProps) {
  const { get, post } = useApi()
  const [loading, setLoading] = useState(false)
  const [clientes, setClientes] = useState<Cliente[]>([])
  
  const [formData, setFormData] = useState({
    cliente_id: '',
    fecha_cotizacion: new Date().toISOString().split('T')[0],
    fecha_vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    vendedor: '',
    moneda: 'PEN',
    subtotal: 0,
    igv: 0,
    total: 0,
    estado: 'BORRADOR',
    probabilidad: 50,
    observaciones: ''
  })

  const [detalles, setDetalles] = useState<DetalleCotizacion[]>([
    {
      codigo: '',
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0,
      descuento: 0,
      total: 0
    }
  ])

  useEffect(() => {
    if (isOpen) {
      loadClientes()
    }
  }, [isOpen])

  const loadClientes = async () => {
    try {
      const response = await get('/api/pos/clientes')
      if (response && response.success && Array.isArray(response.data)) {
        setClientes(response.data)
        console.log('✅ Clientes cargados desde API:', response.data)
      } else {
        throw new Error('No se pudieron cargar clientes desde API')
      }
    } catch (error) {
      console.error('⚠️ Error cargando clientes desde API, usando datos de ejemplo:', error)
      // Usar UUIDs válidos para datos de ejemplo
      setClientes([
        { 
          id: '550e8400-e29b-41d4-a716-446655440010', 
          razon_social: 'Juan Carlos García López',
          nombre_comercial: 'Juan García',
          numero_documento: '12345678',
          tipo_documento: 'DNI'
        },
        { 
          id: '550e8400-e29b-41d4-a716-446655440011', 
          razon_social: 'María Elena Rodríguez Silva',
          nombre_comercial: 'María Rodríguez',
          numero_documento: '87654321',
          tipo_documento: 'DNI'
        },
        { 
          id: '550e8400-e29b-41d4-a716-446655440012', 
          razon_social: 'Empresa Demo S.A.C.',
          nombre_comercial: 'Empresa Demo',
          numero_documento: '20123456789',
          tipo_documento: 'RUC'
        }
      ])
    }
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleDetalleChange = (index: number, field: string, value: any) => {
    const nuevosDetalles = [...detalles]
    nuevosDetalles[index] = { ...nuevosDetalles[index], [field]: value }
    
    if (field === 'cantidad' || field === 'precio_unitario' || field === 'descuento') {
      const detalle = nuevosDetalles[index]
      detalle.total = (detalle.cantidad * detalle.precio_unitario) - detalle.descuento
    }
    
    setDetalles(nuevosDetalles)
    calcularTotales(nuevosDetalles)
  }

  const calcularTotales = (detallesActualizados: DetalleCotizacion[]) => {
    const subtotal = detallesActualizados.reduce((sum, detalle) => sum + detalle.total, 0)
    const igv = subtotal * 0.18
    const total = subtotal + igv

    setFormData(prev => ({
      ...prev,
      subtotal: subtotal,
      igv: igv,
      total: total
    }))
  }

  const agregarDetalle = () => {
    setDetalles([...detalles, {
      codigo: '',
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0,
      descuento: 0,
      total: 0
    }])
  }

  const eliminarDetalle = (index: number) => {
    if (detalles.length > 1) {
      const nuevosDetalles = detalles.filter((_, i) => i !== index)
      setDetalles(nuevosDetalles)
      calcularTotales(nuevosDetalles)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (!formData.cliente_id) {
        toast({
          title: "Error",
          description: "Selecciona un cliente",
          variant: "destructive",
        })
        return
      }

      if (!formData.vendedor.trim()) {
        toast({
          title: "Error", 
          description: "Ingresa el nombre del vendedor",
          variant: "destructive",
        })
        return
      }

      if (detalles.some(d => !d.descripcion.trim() || d.cantidad <= 0 || d.precio_unitario <= 0)) {
        toast({
          title: "Error",
          description: "Completa todos los detalles correctamente",
          variant: "destructive",
        })
        return
      }

      const payload = {
        ...formData,
        items: detalles
      }

      const response = await post('/api/cotizaciones/crear', payload)

      if (response && response.success) {
        toast({
          title: "¡Éxito!",
          description: `Cotización ${response.data.numero} creada exitosamente`,
          variant: "default",
        })
        onSuccess()
        handleClose()
      } else {
        throw new Error(response?.error || 'Error desconocido')
      }
    } catch (error) {
      console.error('❌ Error creando cotización:', error)
      toast({
        title: "Error",
        description: error.message || "Error al crear la cotización",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFormData({
      cliente_id: '',
      fecha_cotizacion: new Date().toISOString().split('T')[0],
      fecha_vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      vendedor: '',
      moneda: 'PEN',
      subtotal: 0,
      igv: 0,
      total: 0,
      estado: 'BORRADOR',
      probabilidad: 50,
      observaciones: ''
    })
    setDetalles([{
      codigo: '',
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0,
      descuento: 0,
      total: 0
    }])
    onClose()
  }

  if (!isOpen) return null

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          width: '90%',
          maxWidth: '1200px',
          maxHeight: '95vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ backgroundColor: '#2563eb', color: 'white', padding: '16px', borderRadius: '8px 8px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Nueva Cotización</h2>
            <button 
              onClick={handleClose}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: 'white', 
                fontSize: '24px', 
                fontWeight: 'bold',
                cursor: 'pointer',
                padding: '0',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ×
            </button>
          </div>
        </div>
        
        {/* Body */}
        <div style={{ padding: '24px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Datos de la Cotización */}
            <div style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#374151', marginBottom: '16px', marginTop: 0 }}>
                Datos de la Cotización
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                    Cliente *
                  </label>
                  <select
                    value={formData.cliente_id}
                    onChange={(e) => handleInputChange('cliente_id', e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '8px', 
                      border: '1px solid #d1d5db', 
                      borderRadius: '4px', 
                      fontSize: '14px'
                    }}
                    required
                  >
                    <option value="">Seleccionar cliente</option>
                    {clientes.map(cliente => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.razon_social || cliente.nombre_comercial || 'Cliente'} - {cliente.numero_documento}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                    Vendedor *
                  </label>
                  <input
                    type="text"
                    value={formData.vendedor}
                    onChange={(e) => handleInputChange('vendedor', e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '8px', 
                      border: '1px solid #d1d5db', 
                      borderRadius: '4px', 
                      fontSize: '14px'
                    }}
                    placeholder="Nombre del vendedor"
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                    Moneda
                  </label>
                  <select
                    value={formData.moneda}
                    onChange={(e) => handleInputChange('moneda', e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '8px', 
                      border: '1px solid #d1d5db', 
                      borderRadius: '4px', 
                      fontSize: '14px'
                    }}
                  >
                    <option value="PEN">PEN - Soles</option>
                    <option value="USD">USD - Dólares</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                    Fecha Cotización
                  </label>
                  <input
                    type="date"
                    value={formData.fecha_cotizacion}
                    onChange={(e) => handleInputChange('fecha_cotizacion', e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '8px', 
                      border: '1px solid #d1d5db', 
                      borderRadius: '4px', 
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                    Fecha Vencimiento
                  </label>
                  <input
                    type="date"
                    value={formData.fecha_vencimiento}
                    onChange={(e) => handleInputChange('fecha_vencimiento', e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '8px', 
                      border: '1px solid #d1d5db', 
                      borderRadius: '4px', 
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                    Probabilidad (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.probabilidad}
                    onChange={(e) => handleInputChange('probabilidad', parseInt(e.target.value))}
                    style={{ 
                      width: '100%', 
                      padding: '8px', 
                      border: '1px solid #d1d5db', 
                      borderRadius: '4px', 
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Detalle de Items */}
            <div style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#374151', margin: 0 }}>
                  Detalle de Items
                </h3>
                <button
                  type="button"
                  onClick={agregarDetalle}
                  style={{
                    backgroundColor: '#10b981',
                    color: 'white',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  + Agregar Item
                </button>
              </div>

              <div style={{ backgroundColor: 'white', borderRadius: '4px', border: '1px solid #d1d5db' }}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 2fr 80px 100px 80px 80px 40px', 
                  gap: '8px', 
                  padding: '8px', 
                  backgroundColor: '#f3f4f6',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  borderBottom: '1px solid #d1d5db'
                }}>
                  <div>Código</div>
                  <div>Descripción *</div>
                  <div>Cantidad *</div>
                  <div>Precio Unit. *</div>
                  <div>IGV</div>
                  <div>Total</div>
                  <div></div>
                </div>
                
                {detalles.map((detalle, index) => (
                  <div key={index} style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 2fr 80px 100px 80px 80px 40px', 
                    gap: '8px', 
                    padding: '8px', 
                    borderBottom: index < detalles.length - 1 ? '1px solid #e5e7eb' : 'none',
                    alignItems: 'center'
                  }}>
                    <input
                      type="text"
                      value={detalle.codigo}
                      onChange={(e) => handleDetalleChange(index, 'codigo', e.target.value)}
                      style={{ 
                        width: '100%', 
                        padding: '4px', 
                        border: '1px solid #d1d5db', 
                        borderRadius: '2px', 
                        fontSize: '12px'
                      }}
                      placeholder="Código"
                    />
                    <input
                      type="text"
                      value={detalle.descripcion}
                      onChange={(e) => handleDetalleChange(index, 'descripcion', e.target.value)}
                      style={{ 
                        width: '100%', 
                        padding: '4px', 
                        border: '1px solid #d1d5db', 
                        borderRadius: '2px', 
                        fontSize: '12px'
                      }}
                      placeholder="Descripción del producto/servicio"
                      required
                    />
                    <input
                      type="number"
                      min="1"
                      value={detalle.cantidad}
                      onChange={(e) => handleDetalleChange(index, 'cantidad', parseFloat(e.target.value))}
                      style={{ 
                        width: '100%', 
                        padding: '4px', 
                        border: '1px solid #d1d5db', 
                        borderRadius: '2px', 
                        fontSize: '12px',
                        textAlign: 'center'
                      }}
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={detalle.precio_unitario}
                      onChange={(e) => handleDetalleChange(index, 'precio_unitario', parseFloat(e.target.value))}
                      style={{ 
                        width: '100%', 
                        padding: '4px', 
                        border: '1px solid #d1d5db', 
                        borderRadius: '2px', 
                        fontSize: '12px',
                        textAlign: 'right'
                      }}
                      required
                    />
                    <div style={{ textAlign: 'center', fontSize: '12px' }}>18%</div>
                    <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: '500' }}>
                      {detalle.total.toFixed(2)}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      {detalles.length > 1 && (
                        <button
                          type="button"
                          onClick={() => eliminarDetalle(index)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            padding: '0',
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resumen */}
            <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #d1d5db' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                    Observaciones
                  </label>
                  <textarea
                    value={formData.observaciones}
                    onChange={(e) => handleInputChange('observaciones', e.target.value)}
                    rows={4}
                    style={{ 
                      width: '100%', 
                      padding: '8px', 
                      border: '1px solid #d1d5db', 
                      borderRadius: '4px', 
                      fontSize: '14px',
                      resize: 'vertical'
                    }}
                    placeholder="Observaciones adicionales..."
                  />
                </div>

                <div style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '4px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '12px', marginTop: 0 }}>
                    Resumen
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>Subtotal:</span>
                      <span style={{ fontWeight: '500' }}>S/ {formData.subtotal.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>IGV (18%):</span>
                      <span style={{ fontWeight: '500' }}>S/ {formData.igv.toFixed(2)}</span>
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      paddingTop: '8px', 
                      borderTop: '1px solid #d1d5db' 
                    }}>
                      <span style={{ fontWeight: '600', color: '#374151' }}>Total:</span>
                      <span style={{ fontWeight: 'bold', fontSize: '18px', color: '#059669' }}>
                        S/ {formData.total.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Botones */}
            <div style={{ 
              backgroundColor: '#f9fafb', 
              padding: '16px 24px', 
              display: 'flex', 
              justifyContent: 'flex-end', 
              gap: '12px',
              margin: '0 -24px -24px -24px',
              borderRadius: '0 0 8px 8px'
            }}>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  color: '#374151',
                  borderRadius: '4px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '8px 24px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1
                }}
              >
                {loading ? 'Creando...' : 'Crear Cotización'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
} 