'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { ChevronLeft, ChevronRight, Check, FileText, Package, Eye, Plus, Trash2, Calendar } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useTaxConfig } from '@/hooks/useTaxConfig'
import { Proveedor } from '@/types/compras'

// Validation schemas
const step1Schema = z.object({
  numero: z.string().min(1, 'El número de cotización es requerido'),
  proveedor_id: z.string().min(1, 'Debe seleccionar un proveedor'),
  fecha_cotizacion: z.string().min(1, 'La fecha es requerida'),
  validez_dias: z.number().min(1, 'Los días de validez deben ser al menos 1'),
  observaciones: z.string().optional()
})

interface ProductoDetalle {
  producto_id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

interface CotizacionWizardProps {
  onSubmit: (data: any) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

export function CotizacionCompraWizard({
  onSubmit,
  onCancel,
  isLoading = false
}: CotizacionWizardProps) {
  const { tasaIgv } = useTaxConfig()
  const [currentStep, setCurrentStep] = useState(1)
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<any[]>([])
  const [detalles, setDetalles] = useState<ProductoDetalle[]>([])
  const [loadingProveedores, setLoadingProveedores] = useState(false)
  const [loadingProductos, setLoadingProductos] = useState(false)
  const { get } = useApi()

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue
  } = useForm({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      numero: `COT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      proveedor_id: '',
      fecha_cotizacion: new Date().toISOString().split('T')[0],
      validez_dias: 30,
      observaciones: ''
    }
  })

  const formData = watch()

  useEffect(() => {
    loadProveedores()
    loadProductos()
  }, [])

  const loadProveedores = async () => {
    try {
      setLoadingProveedores(true)
      const response = await get('/api/compras/proveedores?activo=true')
      if (response?.success) {
        setProveedores(response.data || [])
      }
    } catch (error) {
      console.error('Error loading proveedores:', error)
    } finally {
      setLoadingProveedores(false)
    }
  }

  const loadProductos = async () => {
    try {
      setLoadingProductos(true)
      const response = await get('/api/inventario/productos')
      if (response?.success) {
        setProductos(response.data || [])
      }
    } catch (error) {
      console.error('Error loading productos:', error)
    } finally {
      setLoadingProductos(false)
    }
  }

  const handleNext = () => {
    if (currentStep === 1) {
      handleSubmit(() => setCurrentStep(2))()
    } else if (currentStep === 2) {
      if (detalles.length === 0) {
        alert('Debe agregar al menos un producto')
        return
      }
      setCurrentStep(3)
    }
  }

  const handleBack = () => {
    setCurrentStep(prev => Math.max(1, prev - 1))
  }

  const handleAddProducto = (producto: any, cantidad: number, precio: number) => {
    const subtotal = cantidad * precio
    const newDetalle: ProductoDetalle = {
      producto_id: producto.id,
      descripcion: producto.nombre || producto.descripcion || 'Producto',
      cantidad,
      precio_unitario: precio,
      subtotal
    }
    setDetalles(prev => [...prev, newDetalle])
  }

  const handleRemoveProducto = (index: number) => {
    setDetalles(prev => prev.filter((_, i) => i !== index))
  }

  const calculateTotals = () => {
    const subtotal = detalles.reduce((sum, d) => sum + d.subtotal, 0)
    const igv = subtotal * tasaIgv
    const total = subtotal + igv
    return { subtotal, igv, total }
  }

  const handleFinalSubmit = async () => {
    const { subtotal, igv, total } = calculateTotals()
    
    const cotizacionData = {
      numero: formData.numero,
      proveedor_id: formData.proveedor_id,
      fecha_cotizacion: formData.fecha_cotizacion,
      validez_dias: formData.validez_dias,
      observaciones: formData.observaciones,
      estado: 'BORRADOR',
      detalles: detalles.map(d => ({
        producto_id: d.producto_id,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        precio_unitario: d.precio_unitario
      }))
    }

    await onSubmit(cotizacionData)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount)
  }

  return (
    <div className="activity-card">
      {/* Wizard Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem' }}>
          Nueva Cotización de Compra
        </h2>
        
        {/* Step Indicator */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {[
            { num: 1, label: 'Información Básica', icon: <FileText size={16} /> },
            { num: 2, label: 'Productos', icon: <Package size={16} /> },
            { num: 3, label: 'Revisión', icon: <Eye size={16} /> }
          ].map((step, idx) => (
            <div key={step.num} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.25rem',
                flex: 1
              }}>
                <div style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: '50%',
                  background: currentStep >= step.num ? '#3b82f6' : '#e5e7eb',
                  color: currentStep >= step.num ? 'white' : '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '600',
                  fontSize: '0.875rem'
                }}>
                  {currentStep > step.num ? <Check size={16} /> : step.icon}
                </div>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: currentStep === step.num ? '600' : '400',
                  color: currentStep >= step.num ? '#3b82f6' : '#6b7280',
                  textAlign: 'center'
                }}>
                  {step.label}
                </span>
              </div>
              {idx < 2 && (
                <div style={{ 
                  flex: 0.5, 
                  height: '2px', 
                  background: currentStep > step.num ? '#3b82f6' : '#e5e7eb',
                  marginTop: '-1.5rem'
                }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Basic Information */}
      {currentStep === 1 && (
        <div style={{ minHeight: '400px' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1.5rem' }}>
            Información Básica
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                Número de Cotización <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                {...register('numero')}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: errors.numero ? '1px solid #ef4444' : '1px solid #d1d5db',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace'
                }}
              />
              {errors.numero && (
                <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {errors.numero.message}
                </p>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                Proveedor <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                {...register('proveedor_id')}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: errors.proveedor_id ? '1px solid #ef4444' : '1px solid #d1d5db',
                  fontSize: '0.875rem',
                  background: 'white'
                }}
                disabled={loadingProveedores}
              >
                <option value="">Seleccione un proveedor</option>
                {proveedores.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.razon_social} - {p.ruc}
                  </option>
                ))}
              </select>
              {errors.proveedor_id && (
                <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {errors.proveedor_id.message}
                </p>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                Fecha de Cotización <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="date"
                {...register('fecha_cotizacion')}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: errors.fecha_cotizacion ? '1px solid #ef4444' : '1px solid #d1d5db',
                  fontSize: '0.875rem'
                }}
              />
              {errors.fecha_cotizacion && (
                <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {errors.fecha_cotizacion.message}
                </p>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                Días de Validez <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="number"
                {...register('validez_dias', { valueAsNumber: true })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: errors.validez_dias ? '1px solid #ef4444' : '1px solid #d1d5db',
                  fontSize: '0.875rem'
                }}
              />
              {errors.validez_dias && (
                <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {errors.validez_dias.message}
                </p>
              )}
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                Observaciones
              </label>
              <textarea
                {...register('observaciones')}
                rows={3}
                placeholder="Notas adicionales sobre la cotización..."
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem',
                  resize: 'vertical'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Add Products */}
      {currentStep === 2 && (
        <Step2AddProducts
          productos={productos}
          detalles={detalles}
          onAddProducto={handleAddProducto}
          onRemoveProducto={handleRemoveProducto}
          loadingProductos={loadingProductos}
        />
      )}

      {/* Step 3: Review */}
      {currentStep === 3 && (
        <Step3Review
          formData={formData}
          detalles={detalles}
          proveedores={proveedores}
          calculateTotals={calculateTotals}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Navigation Buttons */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        gap: '1rem',
        paddingTop: '2rem',
        marginTop: '2rem',
        borderTop: '1px solid rgba(0,0,0,0.1)'
      }}>
        <button
          type="button"
          onClick={currentStep === 1 ? onCancel : handleBack}
          disabled={isLoading}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            background: 'white',
            color: '#374151',
            fontSize: '0.875rem',
            fontWeight: '500',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <ChevronLeft size={16} />
          {currentStep === 1 ? 'Cancelar' : 'Anterior'}
        </button>

        {currentStep < 3 ? (
          <button
            type="button"
            onClick={handleNext}
            className="refresh-btn"
            style={{
              padding: '0.75rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            Siguiente
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFinalSubmit}
            disabled={isLoading}
            className="refresh-btn"
            style={{
              padding: '0.75rem 1.5rem',
              opacity: isLoading ? 0.7 : 1,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Check size={16} />
            {isLoading ? 'Guardando...' : 'Crear Cotización'}
          </button>
        )}
      </div>
    </div>
  )
}

// Step 2 Component: Add Products
function Step2AddProducts({ 
  productos, 
  detalles, 
  onAddProducto, 
  onRemoveProducto,
  loadingProductos 
}: any) {
  const [selectedProducto, setSelectedProducto] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [precio, setPrecio] = useState(0)

  const handleAdd = () => {
    if (!selectedProducto) {
      alert('Seleccione un producto')
      return
    }
    if (cantidad <= 0) {
      alert('La cantidad debe ser mayor a 0')
      return
    }
    if (precio < 0) {
      alert('El precio no puede ser negativo')
      return
    }

    const producto = productos.find((p: any) => p.id === selectedProducto)
    if (producto) {
      onAddProducto(producto, cantidad, precio)
      setSelectedProducto('')
      setCantidad(1)
      setPrecio(0)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount)
  }

  return (
    <div style={{ minHeight: '400px' }}>
      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1.5rem' }}>
        Agregar Productos
      </h3>

      {/* Add Product Form */}
      <div className="activity-card" style={{ marginBottom: '1.5rem', background: '#f9fafb' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '1rem', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
              Producto
            </label>
            <select
              value={selectedProducto}
              onChange={(e) => setSelectedProducto(e.target.value)}
              disabled={loadingProductos}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                background: 'white'
              }}
            >
              <option value="">Seleccione un producto</option>
              {productos.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.nombre || p.descripcion || p.codigo || 'Producto'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
              Cantidad
            </label>
            <input
              type="number"
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value))}
              min="0.01"
              step="0.01"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
              Precio Unit.
            </label>
            <input
              type="number"
              value={precio}
              onChange={(e) => setPrecio(Number(e.target.value))}
              min="0"
              step="0.01"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <button
            type="button"
            onClick={handleAdd}
            className="refresh-btn"
            style={{ padding: '0.75rem 1rem' }}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Products List */}
      {detalles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          <Package size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
            No hay productos agregados
          </h3>
          <p>Agregue al menos un producto para continuar</p>
        </div>
      ) : (
        <>
          <div style={{ overflow: 'auto', marginBottom: '1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                    Producto
                  </th>
                  <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                    Cantidad
                  </th>
                  <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                    Precio Unit.
                  </th>
                  <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                    Subtotal
                  </th>
                  <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {detalles.map((detalle, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#374151' }}>
                      {detalle.descripcion}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', color: '#374151' }}>
                      {detalle.cantidad}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', color: '#374151' }}>
                      {formatCurrency(detalle.precio_unitario)}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                      {formatCurrency(detalle.subtotal)}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => onRemoveProducto(index)}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#ef4444',
                          color: 'white',
                          cursor: 'pointer'
                        }}
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Summary - Real-time calculation */}
          <TotalesSummary detalles={detalles} formatCurrency={formatCurrency} />
        </>
      )}
    </div>
  )
}

// Totales Summary Component - Shows real-time totals
function TotalesSummary({ detalles, formatCurrency }: any) {
  const { tasaIgv } = useTaxConfig()
  const subtotal = detalles.reduce((sum: number, d: ProductoDetalle) => sum + d.subtotal, 0)
  const igv = subtotal * tasaIgv
  const total = subtotal + igv

  return (
    <div className="activity-card" style={{ background: '#f9fafb' }}>
      <div style={{ maxWidth: '400px', marginLeft: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Subtotal:</span>
          <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
            {formatCurrency(subtotal)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>IGV (18%):</span>
          <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
            {formatCurrency(igv)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 0' }}>
          <span style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>Total:</span>
          <span style={{ fontSize: '1.25rem', fontWeight: '700', color: '#3b82f6' }}>
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
  )
}

// Step 3 Component: Review
function Step3Review({ formData, detalles, proveedores, calculateTotals, formatCurrency }: any) {
  const proveedor = proveedores.find((p: Proveedor) => p.id === formData.proveedor_id)
  const { subtotal, igv, total } = calculateTotals()

  const calcularFechaVencimiento = () => {
    const fecha = new Date(formData.fecha_cotizacion)
    fecha.setDate(fecha.getDate() + formData.validez_dias)
    return fecha.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div style={{ minHeight: '400px' }}>
      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1.5rem' }}>
        Revisión Final
      </h3>

      {/* Basic Information Summary */}
      <div className="activity-card" style={{ marginBottom: '1.5rem', background: '#f9fafb' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
          Información Básica
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: '500' }}>
              Número
            </span>
            <p style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827', marginTop: '0.25rem', fontFamily: 'monospace' }}>
              {formData.numero}
            </p>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: '500' }}>
              Proveedor
            </span>
            <p style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827', marginTop: '0.25rem' }}>
              {proveedor?.razon_social || 'N/A'}
            </p>
            {proveedor?.ruc && (
              <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                RUC: {proveedor.ruc}
              </p>
            )}
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: '500' }}>
              Fecha Cotización
            </span>
            <p style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827', marginTop: '0.25rem' }}>
              {new Date(formData.fecha_cotizacion).toLocaleDateString('es-PE')}
            </p>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: '500' }}>
              Válida Hasta
            </span>
            <p style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827', marginTop: '0.25rem' }}>
              {calcularFechaVencimiento()}
            </p>
            <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              ({formData.validez_dias} días)
            </p>
          </div>
        </div>
        {formData.observaciones && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
            <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: '500' }}>
              Observaciones
            </span>
            <p style={{ fontSize: '0.875rem', color: '#374151', marginTop: '0.25rem' }}>
              {formData.observaciones}
            </p>
          </div>
        )}
      </div>

      {/* Products Summary */}
      <div className="activity-card" style={{ marginBottom: '1.5rem' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
          Productos ({detalles.length})
        </h4>
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                  Producto
                </th>
                <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                  Cantidad
                </th>
                <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                  Precio Unit.
                </th>
                <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {detalles.map((detalle: ProductoDetalle, index: number) => (
                <tr key={index} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#374151' }}>
                    {detalle.descripcion}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#374151' }}>
                    {detalle.cantidad}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#374151' }}>
                    {formatCurrency(detalle.precio_unitario)}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                    {formatCurrency(detalle.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div className="activity-card" style={{ background: '#f9fafb' }}>
        <div style={{ maxWidth: '400px', marginLeft: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Subtotal:</span>
            <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
              {formatCurrency(subtotal)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>IGV (18%):</span>
            <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
              {formatCurrency(igv)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 0' }}>
            <span style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>Total:</span>
            <span style={{ fontSize: '1.25rem', fontWeight: '700', color: '#3b82f6' }}>
              {formatCurrency(total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
