'use client'

import { useState, useEffect } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface OrdenCompraModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  orden?: any
}

interface OrdenItem {
  id: string
  producto_id: string
  producto_nombre: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export default function OrdenCompraModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  orden 
}: OrdenCompraModalProps) {
  
  // DEBUG: Log de props recibidas
  console.log('🔍 OrdenCompraModal recibido props:', { isOpen, orden })
  console.log('🔍 Modal renderizando con isOpen:', isOpen)
  console.log('🔍 Elemento Dialog debe estar visible:', isOpen ? 'SÍ' : 'NO')
  
  const [formData, setFormData] = useState({
    numero: '',
    proveedor_id: '',
    fecha_orden: new Date().toISOString().split('T')[0],
    fecha_entrega: '',
    moneda: 'PEN',
    subtotal: 0,
    igv: 0,
    total: 0,
    estado: 'PENDIENTE',
    observaciones: ''
  })

  const [items, setItems] = useState<OrdenItem[]>([])
  const [proveedores, setProveedores] = useState([])
  const [productos, setProductos] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const [totales, setTotales] = useState({
    subtotal: 0,
    igv: 0,
    total: 0
  })

  // Cargar datos iniciales
  useEffect(() => {
    if (isOpen) {
      loadProveedores()
      loadProductos()
      generateNumeroOrden()
      if (orden) {
        loadOrdenData()
      } else {
        addItem() // Agregar un item por defecto
      }
    }
  }, [isOpen, orden])

  // Calcular totales cuando cambien los items
  useEffect(() => {
    calculateTotales()
  }, [items])

  const loadProveedores = async () => {
    try {
      const response = await fetch(`${API_URL}/api/compras/proveedores`)
      const data = await response.json()
      if (data.success) {
        setProveedores(data.data)
      }
    } catch (error) {
      console.error('Error loading proveedores:', error)
    }
  }

  const loadProductos = async () => {
    try {
      const response = await fetch(`${API_URL}/api/compras/productos`)
      const data = await response.json()
      if (data.success) {
        setProductos(data.data)
      }
    } catch (error) {
      console.error('Error loading productos:', error)
    }
  }

  const generateNumeroOrden = async () => {
    try {
      const response = await fetch(`${API_URL}/api/compras/next-number`)
      const data = await response.json()
      if (data.success) {
        setFormData(prev => ({ ...prev, numero: data.data.numero }))
      }
    } catch (error) {
      console.error('Error generating order number:', error)
    }
  }

  const loadOrdenData = () => {
    if (orden) {
      console.log('🔍 Cargando datos de orden:', JSON.stringify(orden, null, 2))
      
      setFormData({
        numero: orden.numero,
        proveedor_id: orden.proveedor_id,
        fecha_orden: orden.fecha_orden,
        fecha_entrega: orden.fecha_entrega,
        moneda: orden.moneda,
        subtotal: orden.subtotal,
        igv: orden.igv,
        total: orden.total,
        estado: orden.estado,
        observaciones: orden.observaciones || ''
      })
      
      // Procesar los items correctamente - ASEGURAR QUE SE PROCESAN BIEN
      const itemsArray = Array.isArray(orden.items) ? orden.items : [];
      console.log('📋 Items raw de orden:', JSON.stringify(orden.items, null, 2));
      
      const itemsToLoad = itemsArray.map((item: any, index: number) => {
        const processedItem = {
          id: item.id || `item-${Date.now()}-${index}`,
          producto_id: item.producto_id || '',
          producto_nombre: item.producto_nombre || item.nombre || '',
          cantidad: parseFloat(item.cantidad) || 0,
          precio_unitario: parseFloat(item.precio_unitario) || 0,
          subtotal: parseFloat(item.subtotal) || (parseFloat(item.cantidad) * parseFloat(item.precio_unitario)) || 0
        };
        
        console.log(`📋 Item ${index} procesado:`, JSON.stringify(processedItem, null, 2));
        return processedItem;
      })
      
      console.log('📋 Items procesados para cargar:', JSON.stringify(itemsToLoad, null, 2))
      setItems(itemsToLoad)
    }
  }

  const calculateTotales = () => {
    const subtotal = items.reduce((sum, item) => {
      const itemSubtotal = parseFloat(item.subtotal) || 0
      return sum + itemSubtotal
    }, 0)
    const igv = subtotal * 0.18
    const total = subtotal + igv

    setTotales({ subtotal, igv, total })
    setFormData(prev => ({ ...prev, subtotal, igv, total }))
  }

  const addItem = () => {
    const newItem: OrdenItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // ID más único
      producto_id: '',
      producto_nombre: '',
      cantidad: 1,
      precio_unitario: 0,
      subtotal: 0
    }
    setItems(prev => [...prev, newItem])
  }

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items]
    
    // Convertir valores numéricos y validar
    if (field === 'cantidad' || field === 'precio_unitario') {
      const numValue = parseFloat(value) || 0
      newItems[index] = { ...newItems[index], [field]: numValue }
    } else {
      newItems[index] = { ...newItems[index], [field]: value }
    }

    // Actualizar nombre del producto si se selecciona uno
    if (field === 'producto_id') {
      const producto = productos.find((p: any) => p.id === value)
      if (producto) {
        newItems[index].producto_nombre = producto.nombre
        newItems[index].precio_unitario = parseFloat(producto.precio) || 0
      }
    }

    // Recalcular subtotal con validación
    if (field === 'cantidad' || field === 'precio_unitario') {
      const cantidad = parseFloat(newItems[index].cantidad) || 0
      const precio = parseFloat(newItems[index].precio_unitario) || 0
      newItems[index].subtotal = cantidad * precio
    }

    setItems(newItems)
  }

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      console.log('🚀 Enviando orden con items:', JSON.stringify(items, null, 2))
      
      const ordenData = {
        ...formData,
        items: items.map(item => ({
          producto_id: item.producto_id,
          producto_nombre: item.producto_nombre,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          subtotal: item.subtotal
        }))
      }
      
      console.log('📤 Datos completos a enviar:', JSON.stringify(ordenData, null, 2))

      const url = orden 
        ? `${API_URL}/api/compras/ordenes/${orden.id}`
        : `${API_URL}/api/compras/ordenes`
      
      const method = orden ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ordenData)
      })

      const result = await response.json()

      if (result.success) {
        onSuccess()
        onClose()
        resetForm()
      } else {
        alert('Error: ' + (result.message || 'Error al procesar la orden'))
      }
    } catch (error) {
      console.error('Error submitting order:', error)
      alert('Error al procesar la orden')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      numero: '',
      proveedor_id: '',
      fecha_orden: new Date().toISOString().split('T')[0],
      fecha_entrega: '',
      moneda: 'PEN',
      subtotal: 0,
      igv: 0,
      total: 0,
      estado: 'PENDIENTE',
      observaciones: ''
    })
    setItems([])
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
        width: '95%',
        maxWidth: '1200px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>
            {orden ? 'Editar Orden de Compra' : 'Nueva Orden de Compra'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              hover: { backgroundColor: '#f3f4f6' }
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Información básica */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Número de Orden
              </label>
              <input
                type="text"
                value={formData.numero}
                disabled
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  backgroundColor: '#f9fafb',
                  color: '#6b7280'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Proveedor *
              </label>
              <select
                value={formData.proveedor_id}
                onChange={(e) => setFormData({...formData, proveedor_id: e.target.value})}
                required
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  backgroundColor: 'white'
                }}
              >
                <option value="">Seleccionar proveedor</option>
                {proveedores.map((proveedor: any) => (
                  <option key={proveedor.id} value={proveedor.id}>
                    {proveedor.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Moneda
              </label>
              <select
                value={formData.moneda}
                onChange={(e) => setFormData({...formData, moneda: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  backgroundColor: 'white'
                }}
              >
                <option value="PEN">PEN - Soles</option>
                <option value="USD">USD - Dólares</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Fecha de Orden *
              </label>
              <input
                type="date"
                value={formData.fecha_orden}
                onChange={(e) => setFormData({...formData, fecha_orden: e.target.value})}
                required
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Fecha de Entrega *
              </label>
              <input
                type="date"
                value={formData.fecha_entrega}
                onChange={(e) => setFormData({...formData, fecha_entrega: e.target.value})}
                required
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem'
                }}
              />
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#374151' }}>Items de la Orden</h3>
              <button
                type="button"
                onClick={addItem}
                style={{
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                + Agregar Item
              </button>
            </div>

            <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: '#f9fafb' }}>
                  <tr>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Producto</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Cantidad</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Precio Unit.</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Subtotal</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.75rem' }}>
                        {item.esNuevoProducto ? (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                              type="text"
                              placeholder="Nombre del nuevo producto"
                              value={item.producto_nombre || ''}
                              onChange={(e) => updateItem(index, 'producto_nombre', e.target.value)}
                              required
                              style={{
                                flex: 1,
                                padding: '0.25rem 0.5rem',
                                border: '1px solid #3b82f6',
                                borderRadius: '0.25rem',
                                fontSize: '0.875rem',
                                backgroundColor: '#eff6ff'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => updateItem(index, 'esNuevoProducto', false)}
                              style={{
                                backgroundColor: '#6b7280',
                                color: 'white',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.25rem',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.75rem'
                              }}
                              title="Cancelar producto nuevo"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <select
                              value={item.producto_id}
                              onChange={(e) => updateItem(index, 'producto_id', e.target.value)}
                              required
                              style={{
                                flex: 1,
                                padding: '0.25rem 0.5rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '0.25rem',
                                fontSize: '0.875rem'
                              }}
                            >
                              <option value="">Seleccionar producto</option>
                              {productos.map((producto: any) => (
                                <option key={producto.id} value={producto.id}>
                                  {producto.nombre}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => updateItem(index, 'esNuevoProducto', true)}
                              style={{
                                backgroundColor: '#10b981',
                                color: 'white',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.25rem',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.75rem'
                              }}
                              title="Crear producto nuevo"
                            >
                              + Nuevo
                            </button>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          value={item.cantidad || ''}
                          onChange={(e) => updateItem(index, 'cantidad', e.target.value)}
                          style={{
                            width: '80px',
                            padding: '0.25rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '0.25rem',
                            textAlign: 'center',
                            fontSize: '0.875rem'
                          }}
                        />
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.precio_unitario || ''}
                          onChange={(e) => updateItem(index, 'precio_unitario', e.target.value)}
                          style={{
                            width: '100px',
                            padding: '0.25rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '0.25rem',
                            textAlign: 'right',
                            fontSize: '0.875rem'
                          }}
                        />
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '500' }}>
                        S/ {(parseFloat(item.subtotal) || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          style={{
                            backgroundColor: '#dc2626',
                            color: 'white',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totales */}
            <div style={{ marginTop: '1rem', backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ fontWeight: '500' }}>Subtotal: </span>
                    <span>S/ {(parseFloat(totales.subtotal) || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ fontWeight: '500' }}>IGV (18%): </span>
                    <span>S/ {(parseFloat(totales.igv) || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: '1.125rem', fontWeight: '600', borderTop: '1px solid #d1d5db', paddingTop: '0.5rem' }}>
                    <span>Total: S/ {(parseFloat(totales.total) || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Observaciones */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
              Observaciones
            </label>
            <textarea
              value={formData.observaciones}
              onChange={(e) => setFormData({...formData, observaciones: e.target.value})}
              rows={3}
              placeholder="Observaciones adicionales..."
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                backgroundColor: 'white',
                color: '#374151',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: isLoading ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              {isLoading ? 'Procesando...' : (orden ? 'Actualizar' : 'Crear')} Orden
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}