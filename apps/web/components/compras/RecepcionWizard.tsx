'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Check, Package, Scan, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { useApi } from '@/hooks/use-api'

interface OrdenDetalle {
  id: string
  producto_id: string
  cantidad: number
  cantidad_recibida: number
  precio_unitario: number
  productos?: {
    id: string
    nombre: string
    codigo: string
    unidad_medida?: string
  }
}

interface OrdenCompra {
  id: string
  numero: string
  proveedor_id: string
  estado: string
  proveedores?: {
    razon_social: string
    ruc: string
  }
  detalles?: OrdenDetalle[]
}

interface Almacen {
  id: string
  nombre: string
  codigo: string
  es_principal: boolean
}

interface Ubicacion {
  id: string
  codigo: string
  descripcion?: string
  tipo?: string
}

interface RecepcionItem {
  detalle_id: string
  producto_id: string
  producto_nombre: string
  producto_codigo: string
  cantidad_pedida: number
  cantidad_recibida_anterior: number
  cantidad_recibir: number
  calidad: 'OK' | 'OBSERVADO' | 'RECHAZADO'
  observaciones?: string
  lote?: string
  serie?: string
  almacen_id?: string
  ubicacion_id?: string
  fecha_expiracion?: string
}

interface RecepcionWizardProps {
  ordenId: string
  onComplete: () => void
  onCancel: () => void
}

export function RecepcionWizard({ ordenId, onComplete, onCancel }: RecepcionWizardProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [orden, setOrden] = useState<OrdenCompra | null>(null)
  const [items, setItems] = useState<RecepcionItem[]>([])
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])
  const [ubicacionesPorAlmacen, setUbicacionesPorAlmacen] = useState<Record<string, Ubicacion[]>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [scannerMode, setScannerMode] = useState(false)
  const [scanBuffer, setScanBuffer] = useState('')
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const { get, post } = useApi()

  useEffect(() => {
    loadOrden()
    loadAlmacenes()
  }, [ordenId])

  // Scanner detection: rapid keystrokes indicate scanner input
  useEffect(() => {
    if (!scannerMode) return

    const handleKeyPress = (e: KeyboardEvent) => {
      // Clear previous timeout
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
      }

      // Enter key indicates end of scan
      if (e.key === 'Enter') {
        if (scanBuffer.length > 0) {
          handleScanComplete(scanBuffer)
          setScanBuffer('')
        }
        return
      }

      // Accumulate characters
      if (e.key.length === 1) {
        setScanBuffer(prev => prev + e.key)
        
        // Auto-complete after 100ms of no input (scanner is fast)
        scanTimeoutRef.current = setTimeout(() => {
          if (scanBuffer.length > 0) {
            handleScanComplete(scanBuffer + e.key)
            setScanBuffer('')
          }
        }, 100)
      }
    }

    window.addEventListener('keypress', handleKeyPress)
    return () => {
      window.removeEventListener('keypress', handleKeyPress)
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
      }
    }
  }, [scannerMode, scanBuffer])

  const loadOrden = async () => {
    try {
      setLoading(true)
      const response = await get(`/api/compras/ordenes/${ordenId}`)
      
      if (response?.success && response.data) {
        const ordenData = response.data
        setOrden(ordenData)
        
        // Initialize items with pending quantities
        if (ordenData.detalles && ordenData.detalles.length > 0) {
          const recepcionItems: RecepcionItem[] = ordenData.detalles
            .filter((d: OrdenDetalle) => (d.cantidad_recibida || 0) < d.cantidad)
            .map((detalle: OrdenDetalle) => ({
              detalle_id: detalle.id,
              producto_id: detalle.producto_id,
              producto_nombre: detalle.productos?.nombre || 'Producto',
              producto_codigo: detalle.productos?.codigo || '',
              cantidad_pedida: detalle.cantidad,
              cantidad_recibida_anterior: detalle.cantidad_recibida || 0,
              cantidad_recibir: 0,
              calidad: 'OK' as const,
              observaciones: ''
            }))
          setItems(recepcionItems)
        }
      }
    } catch (error) {
      console.error('Error loading orden:', error)
      alert('Error: No se pudo cargar la orden de compra')
    } finally {
      setLoading(false)
    }
  }

  const loadAlmacenes = async () => {
    try {
      const response = await get('/api/inventario/almacenes')
      if (response?.success && response.data) {
        setAlmacenes(response.data)
      }
    } catch (error) {
      console.error('Error loading almacenes:', error)
    }
  }

  const loadUbicaciones = async (almacenId: string) => {
    if (ubicacionesPorAlmacen[almacenId]) {
      return // Already loaded
    }

    try {
      const response = await get(`/api/inventario/almacenes/${almacenId}/ubicaciones`)
      if (response?.success && response.data) {
        setUbicacionesPorAlmacen(prev => ({
          ...prev,
          [almacenId]: response.data
        }))
      }
    } catch (error) {
      console.error('Error loading ubicaciones:', error)
    }
  }

  const handleScanComplete = (scannedCode: string) => {
    // Find item by product code
    const itemIndex = items.findIndex(item => 
      item.producto_codigo.toLowerCase() === scannedCode.toLowerCase()
    )
    
    if (itemIndex !== -1) {
      // Increment quantity by 1
      const updatedItems = [...items]
      const item = updatedItems[itemIndex]
      const maxCantidad = item.cantidad_pedida - item.cantidad_recibida_anterior
      
      if (item.cantidad_recibir < maxCantidad) {
        updatedItems[itemIndex] = {
          ...item,
          cantidad_recibir: item.cantidad_recibir + 1
        }
        setItems(updatedItems)
        
        // Visual feedback
        const element = document.getElementById(`item-${itemIndex}`)
        if (element) {
          element.style.background = 'var(--success)'
          element.style.color = 'white'
          setTimeout(() => {
            element.style.background = ''
            element.style.color = ''
          }, 300)
        }
      }
    } else {
      // Product not found
      alert(`Producto no encontrado: ${scannedCode}`)
    }
  }

  const updateItemQuantity = (index: number, cantidad: number) => {
    const updatedItems = [...items]
    const item = updatedItems[index]
    const maxCantidad = item.cantidad_pedida - item.cantidad_recibida_anterior
    
    // Validate quantity
    const validCantidad = Math.max(0, Math.min(cantidad, maxCantidad))
    
    updatedItems[index] = {
      ...item,
      cantidad_recibir: validCantidad
    }
    setItems(updatedItems)
  }

  const updateItemCalidad = (index: number, calidad: 'OK' | 'OBSERVADO' | 'RECHAZADO') => {
    const updatedItems = [...items]
    updatedItems[index] = {
      ...updatedItems[index],
      calidad
    }
    setItems(updatedItems)
  }

  const updateItemObservaciones = (index: number, observaciones: string) => {
    const updatedItems = [...items]
    updatedItems[index] = {
      ...updatedItems[index],
      observaciones
    }
    setItems(updatedItems)
  }

  const updateItemLote = (index: number, lote: string) => {
    const updatedItems = [...items]
    updatedItems[index] = {
      ...updatedItems[index],
      lote
    }
    setItems(updatedItems)
  }

  const updateItemSerie = (index: number, serie: string) => {
    const updatedItems = [...items]
    updatedItems[index] = {
      ...updatedItems[index],
      serie
    }
    setItems(updatedItems)
  }

  const updateItemFechaExpiracion = (index: number, fecha_expiracion: string) => {
    const updatedItems = [...items]
    updatedItems[index] = {
      ...updatedItems[index],
      fecha_expiracion
    }
    setItems(updatedItems)
  }

  const updateItemAlmacen = async (index: number, almacen_id: string) => {
    const updatedItems = [...items]
    updatedItems[index] = {
      ...updatedItems[index],
      almacen_id,
      ubicacion_id: undefined // Reset ubicacion when almacen changes
    }
    setItems(updatedItems)

    // Load ubicaciones for this almacen
    if (almacen_id) {
      await loadUbicaciones(almacen_id)
    }
  }

  const updateItemUbicacion = (index: number, ubicacion_id: string) => {
    const updatedItems = [...items]
    updatedItems[index] = {
      ...updatedItems[index],
      ubicacion_id
    }
    setItems(updatedItems)
  }

  const handleNext = () => {
    if (currentStep === 1) {
      // Validate at least one item has quantity
      const hasItems = items.some(item => item.cantidad_recibir > 0)
      if (!hasItems) {
        alert('Debe ingresar al menos una cantidad para recepcionar')
        return
      }
      setCurrentStep(2)
    } else if (currentStep === 2) {
      setCurrentStep(3)
    } else if (currentStep === 3) {
      // Validate all items with quantity have almacen selected
      const itemsToReceive = items.filter(item => item.cantidad_recibir > 0)
      const itemsWithoutAlmacen = itemsToReceive.filter(item => !item.almacen_id)
      
      if (itemsWithoutAlmacen.length > 0) {
        alert('Debe seleccionar un almacén para todos los productos a recepcionar')
        return
      }
      setCurrentStep(4)
    }
  }

  const handleBack = () => {
    setCurrentStep(prev => Math.max(1, prev - 1))
  }

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      
      // Filter items with quantity > 0
      const itemsToReceive = items.filter(item => item.cantidad_recibir > 0)
      
      if (itemsToReceive.length === 0) {
        alert('Debe ingresar al menos una cantidad para recepcionar')
        return
      }

      // Create reception
      const createDto = {
        orden_id: ordenId,
        items: itemsToReceive.map(item => ({
          detalle_id: item.detalle_id,
          cantidad_recibida: item.cantidad_recibir,
          calidad: item.calidad,
          observaciones: item.observaciones || undefined,
          lote: item.lote || undefined,
          serie: item.serie || undefined,
          almacen_id: item.almacen_id,
          ubicacion_id: item.ubicacion_id || undefined,
          fecha_expiracion: item.fecha_expiracion || undefined
        })),
        observaciones: 'Recepción creada desde wizard'
      }

      const createResponse = await post(`/api/compras/recepciones/ordenes/${ordenId}`, createDto)
      
      if (!createResponse?.success) {
        throw new Error(createResponse?.message || 'Error al crear la recepción')
      }

      const recepcionId = createResponse.data?.id
      
      // Close reception immediately
      const closeResponse = await post(`/api/compras/recepciones/${recepcionId}/cerrar`, {
        observaciones: 'Recepción cerrada automáticamente'
      })
      
      if (!closeResponse?.success) {
        throw new Error(closeResponse?.message || 'Error al cerrar la recepción')
      }

      alert('Recepción completada exitosamente')
      onComplete()
    } catch (error: any) {
      console.error('Error submitting recepcion:', error)
      alert(`Error: ${error.message || 'No se pudo completar la recepción'}`)
    } finally {
      setSubmitting(false)
    }
  }

  const getTotalItems = () => items.reduce((sum, item) => sum + item.cantidad_recibir, 0)
  
  const getCalidadColor = (calidad: string) => {
    switch (calidad) {
      case 'OK': return '#10b981'
      case 'OBSERVADO': return '#f59e0b'
      case 'RECHAZADO': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getCalidadIcon = (calidad: string) => {
    switch (calidad) {
      case 'OK': return <CheckCircle size={16} />
      case 'OBSERVADO': return <AlertCircle size={16} />
      case 'RECHAZADO': return <XCircle size={16} />
      default: return null
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Cargando orden de compra...</p>
      </div>
    )
  }

  if (!orden) {
    return (
      <div className="activity-card" style={{ textAlign: 'center', padding: '3rem' }}>
        <AlertCircle size={48} style={{ margin: '0 auto 1rem', color: '#ef4444' }} />
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
          Orden no encontrada
        </h3>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
          No se pudo cargar la orden de compra
        </p>
        <button onClick={onCancel} className="refresh-btn">
          Volver
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Progress Steps */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '2rem',
        padding: '1.5rem',
        background: 'white',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        {[
          { num: 1, label: 'Cantidades' },
          { num: 2, label: 'Calidad' },
          { num: 3, label: 'Almacén/Lotes' },
          { num: 4, label: 'Confirmar' }
        ].map((step, idx) => (
          <div key={step.num} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: currentStep >= step.num ? '#3b82f6' : '#e5e7eb',
                color: currentStep >= step.num ? 'white' : '#6b7280',
                fontWeight: '600',
                fontSize: '1rem',
                transition: 'all 0.3s ease'
              }}>
                {currentStep > step.num ? <Check size={20} /> : step.num}
              </div>
              <span style={{
                fontSize: '0.875rem',
                fontWeight: currentStep === step.num ? '600' : '400',
                color: currentStep >= step.num ? '#3b82f6' : '#6b7280'
              }}>
                {step.label}
              </span>
            </div>
            {idx < 3 && (
              <div style={{
                width: '60px',
                height: '2px',
                background: currentStep > step.num ? '#3b82f6' : '#e5e7eb',
                transition: 'all 0.3s ease'
              }} />
            )}
          </div>
        ))}
      </div>

      {/* Order Info */}
      <div className="activity-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              {orden.numero}
            </h3>
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
              {orden.proveedores?.razon_social} - RUC: {orden.proveedores?.ruc}
            </p>
          </div>
          <div style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            background: 'var(--primary-100)',
            color: 'var(--primary-800)',
            fontSize: '0.875rem',
            fontWeight: '600'
          }}>
            {items.length} productos pendientes
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="activity-card">
        {currentStep === 1 && (
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem'
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600' }}>
                Ingrese las cantidades recibidas
              </h3>
              <button
                onClick={() => setScannerMode(!scannerMode)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: scannerMode ? '2px solid #3b82f6' : '1px solid #d1d5db',
                  background: scannerMode ? '#eff6ff' : 'white',
                  color: scannerMode ? '#3b82f6' : '#374151',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
              >
                <Scan size={16} />
                {scannerMode ? 'Modo Scanner Activo' : 'Activar Scanner'}
              </button>
            </div>

            {scannerMode && (
              <div style={{
                padding: '1rem',
                borderRadius: '8px',
                background: '#eff6ff',
                border: '2px solid #3b82f6',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <Scan size={20} style={{ color: '#3b82f6' }} />
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e40af' }}>
                    Modo Scanner Activo
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#3b82f6' }}>
                    Escanee los códigos de barras de los productos. Cada escaneo incrementará la cantidad en 1.
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {items.map((item, index) => {
                const maxCantidad = item.cantidad_pedida - item.cantidad_recibida_anterior
                const pendiente = maxCantidad - item.cantidad_recibir
                
                return (
                  <div
                    key={item.detalle_id}
                    id={`item-${index}`}
                    style={{
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      background: 'white',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr',
                      gap: '1rem',
                      alignItems: 'center'
                    }}>
                      {/* Product Info */}
                      <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                          {item.producto_nombre}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', fontFamily: 'monospace' }}>
                          Código: {item.producto_codigo}
                        </div>
                        {item.cantidad_recibida_anterior > 0 && (
                          <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '0.25rem' }}>
                            Ya recibido: {item.cantidad_recibida_anterior} de {item.cantidad_pedida}
                          </div>
                        )}
                      </div>

                      {/* Pedido */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                          Pedido
                        </div>
                        <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#374151' }}>
                          {item.cantidad_pedida}
                        </div>
                      </div>

                      {/* Quantity Input */}
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', textAlign: 'center' }}>
                          Recibir ahora
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button
                            onClick={() => updateItemQuantity(index, item.cantidad_recibir - 1)}
                            disabled={item.cantidad_recibir === 0}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '6px',
                              border: '1px solid #d1d5db',
                              background: item.cantidad_recibir === 0 ? '#f3f4f6' : 'white',
                              color: item.cantidad_recibir === 0 ? '#9ca3af' : '#374151',
                              cursor: item.cantidad_recibir === 0 ? 'not-allowed' : 'pointer',
                              fontSize: '1.25rem',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            max={maxCantidad}
                            value={item.cantidad_recibir}
                            onChange={(e) => updateItemQuantity(index, parseInt(e.target.value) || 0)}
                            style={{
                              width: '80px',
                              padding: '0.5rem',
                              borderRadius: '6px',
                              border: '2px solid #3b82f6',
                              textAlign: 'center',
                              fontSize: '1.125rem',
                              fontWeight: '700',
                              color: '#3b82f6'
                            }}
                          />
                          <button
                            onClick={() => updateItemQuantity(index, item.cantidad_recibir + 1)}
                            disabled={item.cantidad_recibir >= maxCantidad}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '6px',
                              border: '1px solid #d1d5db',
                              background: item.cantidad_recibir >= maxCantidad ? '#f3f4f6' : 'white',
                              color: item.cantidad_recibir >= maxCantidad ? '#9ca3af' : '#374151',
                              cursor: item.cantidad_recibir >= maxCantidad ? 'not-allowed' : 'pointer',
                              fontSize: '1.25rem',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Pendiente */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                          Pendiente
                        </div>
                        <div style={{
                          fontSize: '1.25rem',
                          fontWeight: '700',
                          color: pendiente === 0 ? '#10b981' : '#f59e0b'
                        }}>
                          {pendiente}
                        </div>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div style={{
                      display: 'flex',
                      gap: '0.5rem',
                      marginTop: '0.75rem',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid #e5e7eb'
                    }}>
                      <button
                        onClick={() => updateItemQuantity(index, maxCantidad)}
                        style={{
                          padding: '0.375rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          background: 'white',
                          color: '#374151',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: '500'
                        }}
                      >
                        Recibir todo ({maxCantidad})
                      </button>
                      <button
                        onClick={() => updateItemQuantity(index, 0)}
                        style={{
                          padding: '0.375rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          background: 'white',
                          color: '#374151',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: '500'
                        }}
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Summary */}
            <div style={{
              marginTop: '1.5rem',
              padding: '1rem',
              borderRadius: '8px',
              background: 'var(--primary-50)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-700)' }}>
                Total de items a recibir:
              </span>
              <span style={{ fontSize: '1.5rem', fontWeight: '700', color: '#3b82f6' }}>
                {getTotalItems()}
              </span>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1.5rem' }}>
              Evaluación de Calidad
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {items.filter(item => item.cantidad_recibir > 0).map((item, index) => {
                const originalIndex = items.findIndex(i => i.detalle_id === item.detalle_id)
                
                return (
                  <div
                    key={item.detalle_id}
                    style={{
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      background: 'white'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'start',
                      marginBottom: '1rem'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                          {item.producto_nombre}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          Cantidad a recibir: {item.cantidad_recibir}
                        </div>
                      </div>
                      <div style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        background: getCalidadColor(item.calidad) + '20',
                        color: getCalidadColor(item.calidad),
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        {getCalidadIcon(item.calidad)}
                        {item.calidad}
                      </div>
                    </div>

                    {/* Quality Buttons */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.5rem',
                      marginBottom: '1rem'
                    }}>
                      <button
                        onClick={() => updateItemCalidad(originalIndex, 'OK')}
                        style={{
                          padding: '0.75rem',
                          borderRadius: '6px',
                          border: item.calidad === 'OK' ? '2px solid #10b981' : '1px solid #d1d5db',
                          background: item.calidad === 'OK' ? '#10b981' : 'white',
                          color: item.calidad === 'OK' ? 'white' : '#374151',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <CheckCircle size={16} />
                        OK
                      </button>
                      <button
                        onClick={() => updateItemCalidad(originalIndex, 'OBSERVADO')}
                        style={{
                          padding: '0.75rem',
                          borderRadius: '6px',
                          border: item.calidad === 'OBSERVADO' ? '2px solid #f59e0b' : '1px solid #d1d5db',
                          background: item.calidad === 'OBSERVADO' ? '#f59e0b' : 'white',
                          color: item.calidad === 'OBSERVADO' ? 'white' : '#374151',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <AlertCircle size={16} />
                        Observado
                      </button>
                      <button
                        onClick={() => updateItemCalidad(originalIndex, 'RECHAZADO')}
                        style={{
                          padding: '0.75rem',
                          borderRadius: '6px',
                          border: item.calidad === 'RECHAZADO' ? '2px solid #ef4444' : '1px solid #d1d5db',
                          background: item.calidad === 'RECHAZADO' ? '#ef4444' : 'white',
                          color: item.calidad === 'RECHAZADO' ? 'white' : '#374151',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <XCircle size={16} />
                        Rechazado
                      </button>
                    </div>

                    {/* Observations */}
                    {(item.calidad === 'OBSERVADO' || item.calidad === 'RECHAZADO') && (
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#374151',
                          marginBottom: '0.5rem'
                        }}>
                          Observaciones {item.calidad === 'RECHAZADO' && '(requerido)'}
                        </label>
                        <textarea
                          value={item.observaciones || ''}
                          onChange={(e) => updateItemObservaciones(originalIndex, e.target.value)}
                          placeholder="Describa el problema encontrado..."
                          rows={2}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            fontSize: '0.875rem',
                            resize: 'vertical'
                          }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1.5rem' }}>
              Asignar Almacén, Ubicación, Lotes y Series
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {items.filter(item => item.cantidad_recibir > 0).map((item, index) => {
                const originalIndex = items.findIndex(i => i.detalle_id === item.detalle_id)
                
                return (
                  <div
                    key={item.detalle_id}
                    style={{
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      background: 'white'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'start',
                      marginBottom: '1rem'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                          {item.producto_nombre}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          Cantidad a recibir: {item.cantidad_recibir}
                        </div>
                      </div>
                    </div>

                    {/* Almacen y Ubicacion */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '1rem',
                      marginBottom: '1rem'
                    }}>
                      {/* Almacén */}
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#374151',
                          marginBottom: '0.5rem'
                        }}>
                          Almacén <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <select
                          value={item.almacen_id || ''}
                          onChange={(e) => updateItemAlmacen(originalIndex, e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            fontSize: '0.875rem',
                            background: 'white'
                          }}
                        >
                          <option value="">Seleccione almacén</option>
                          {almacenes.map(almacen => (
                            <option key={almacen.id} value={almacen.id}>
                              {almacen.nombre} ({almacen.codigo})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Ubicación */}
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#374151',
                          marginBottom: '0.5rem'
                        }}>
                          Ubicación
                        </label>
                        <select
                          value={item.ubicacion_id || ''}
                          onChange={(e) => updateItemUbicacion(originalIndex, e.target.value)}
                          disabled={!item.almacen_id}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            fontSize: '0.875rem',
                            background: item.almacen_id ? 'white' : '#f3f4f6',
                            cursor: item.almacen_id ? 'pointer' : 'not-allowed'
                          }}
                        >
                          <option value="">Sin ubicación específica</option>
                          {item.almacen_id && ubicacionesPorAlmacen[item.almacen_id]?.map(ubicacion => (
                            <option key={ubicacion.id} value={ubicacion.id}>
                              {ubicacion.codigo} {ubicacion.descripcion ? `- ${ubicacion.descripcion}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Lote/Serie/Expiracion Grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '1rem'
                    }}>
                      {/* Lote */}
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#374151',
                          marginBottom: '0.5rem'
                        }}>
                          Número de Lote
                        </label>
                        <input
                          type="text"
                          value={item.lote || ''}
                          onChange={(e) => updateItemLote(originalIndex, e.target.value)}
                          placeholder="Ej: LOTE-2024-001"
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>

                      {/* Serie */}
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#374151',
                          marginBottom: '0.5rem'
                        }}>
                          Número de Serie
                        </label>
                        <input
                          type="text"
                          value={item.serie || ''}
                          onChange={(e) => updateItemSerie(originalIndex, e.target.value)}
                          placeholder="Ej: SN-123456789"
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>

                      {/* Fecha Expiración */}
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#374151',
                          marginBottom: '0.5rem'
                        }}>
                          Fecha de Expiración
                        </label>
                        <input
                          type="date"
                          value={item.fecha_expiracion || ''}
                          onChange={(e) => updateItemFechaExpiracion(originalIndex, e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                    </div>

                    {/* Info Note */}
                    <div style={{
                      marginTop: '0.75rem',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      background: '#eff6ff',
                      border: '1px solid #3b82f6',
                      fontSize: '0.75rem',
                      color: '#1e40af'
                    }}>
                      <strong>Nota:</strong> El almacén es obligatorio. Los campos de ubicación, lote y serie son opcionales. Complete solo si aplica para este producto.
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1.5rem' }}>
              Confirmar Recepción
            </h3>

            {/* Summary Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{
                padding: '1rem',
                borderRadius: '8px',
                background: '#eff6ff',
                border: '1px solid #3b82f6'
              }}>
                <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginBottom: '0.5rem' }}>
                  Total Items
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#3b82f6' }}>
                  {getTotalItems()}
                </div>
              </div>

              <div style={{
                padding: '1rem',
                borderRadius: '8px',
                background: '#f0fdf4',
                border: '1px solid #10b981'
              }}>
                <div style={{ fontSize: '0.75rem', color: '#10b981', marginBottom: '0.5rem' }}>
                  OK
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#10b981' }}>
                  {items.filter(i => i.cantidad_recibir > 0 && i.calidad === 'OK').reduce((sum, i) => sum + i.cantidad_recibir, 0)}
                </div>
              </div>

              <div style={{
                padding: '1rem',
                borderRadius: '8px',
                background: '#fffbeb',
                border: '1px solid #f59e0b'
              }}>
                <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginBottom: '0.5rem' }}>
                  Observados
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#f59e0b' }}>
                  {items.filter(i => i.cantidad_recibir > 0 && i.calidad === 'OBSERVADO').reduce((sum, i) => sum + i.cantidad_recibir, 0)}
                </div>
              </div>

              <div style={{
                padding: '1rem',
                borderRadius: '8px',
                background: '#fef2f2',
                border: '1px solid #ef4444'
              }}>
                <div style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '0.5rem' }}>
                  Rechazados
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#ef4444' }}>
                  {items.filter(i => i.cantidad_recibir > 0 && i.calidad === 'RECHAZADO').reduce((sum, i) => sum + i.cantidad_recibir, 0)}
                </div>
              </div>
            </div>

            {/* Items Detail */}
            <div style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      Producto
                    </th>
                    <th style={{
                      padding: '0.75rem',
                      textAlign: 'center',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      Cantidad
                    </th>
                    <th style={{
                      padding: '0.75rem',
                      textAlign: 'center',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      Calidad
                    </th>
                    <th style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      Almacén/Ubicación/Lote
                    </th>
                    <th style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      Observaciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.filter(item => item.cantidad_recibir > 0).map((item) => (
                    <tr key={item.detalle_id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: '600' }}>
                          {item.producto_nombre}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', fontFamily: 'monospace' }}>
                          {item.producto_codigo}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '1.125rem', fontWeight: '700', color: '#3b82f6' }}>
                          {item.cantidad_recibir}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          background: getCalidadColor(item.calidad) + '20',
                          color: getCalidadColor(item.calidad)
                        }}>
                          {getCalidadIcon(item.calidad)}
                          {item.calidad}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ fontSize: '0.75rem', color: '#374151' }}>
                          {item.almacen_id && (
                            <div>
                              <strong>Almacén:</strong> {almacenes.find(a => a.id === item.almacen_id)?.nombre || item.almacen_id}
                            </div>
                          )}
                          {item.ubicacion_id && ubicacionesPorAlmacen[item.almacen_id || ''] && (
                            <div>
                              <strong>Ubicación:</strong> {ubicacionesPorAlmacen[item.almacen_id || '']?.find(u => u.id === item.ubicacion_id)?.codigo || item.ubicacion_id}
                            </div>
                          )}
                          {item.lote && (
                            <div>
                              <strong>Lote:</strong> {item.lote}
                            </div>
                          )}
                          {item.serie && (
                            <div>
                              <strong>Serie:</strong> {item.serie}
                            </div>
                          )}
                          {item.fecha_expiracion && (
                            <div>
                              <strong>Exp:</strong> {new Date(item.fecha_expiracion).toLocaleDateString()}
                            </div>
                          )}
                          {!item.almacen_id && !item.lote && !item.serie && !item.fecha_expiracion && '-'}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {item.observaciones || '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '2rem',
        paddingTop: '1.5rem',
        borderTop: '1px solid #e5e7eb'
      }}>
        <button
          onClick={currentStep === 1 ? onCancel : handleBack}
          disabled={submitting}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            background: 'white',
            color: '#374151',
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            fontWeight: '600',
            opacity: submitting ? 0.5 : 1
          }}
        >
          <ChevronLeft size={16} />
          {currentStep === 1 ? 'Cancelar' : 'Anterior'}
        </button>

        {currentStep < 4 ? (
          <button
            onClick={handleNext}
            disabled={submitting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: '#3b82f6',
              color: 'white',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              opacity: submitting ? 0.5 : 1
            }}
          >
            Siguiente
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: '#10b981',
              color: 'white',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              opacity: submitting ? 0.5 : 1
            }}
          >
            {submitting ? (
              <>
                <div className="loading-spinner" style={{ width: '16px', height: '16px' }}></div>
                Procesando...
              </>
            ) : (
              <>
                <Check size={16} />
                Completar Recepción
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
