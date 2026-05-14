'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { useTaxConfig } from '@/hooks/useTaxConfig'
import { Cotizacion, CotizacionDetalle } from '@/types/ventas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import ClienteSelector from './ClienteSelector'
import { Plus, Trash2, Package } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

interface Producto {
  id: string
  codigo: string
  nombre: string
  precio_venta: number
  stock_actual: number
  stock_reservado?: number
}

interface CotizacionFormProps {
  cotizacion?: Cotizacion
  onSubmit: (data: CotizacionFormData) => Promise<void>
  onCancel: () => void
  disabled?: boolean
}

export interface CotizacionFormData {
  cliente_id: string
  fecha_vencimiento?: string
  notas?: string
  detalle: {
    producto_id: string
    descripcion: string
    cantidad: number
    precio_unitario: number
  }[]
}

interface DetalleItem {
  id?: string
  producto_id: string
  producto?: Producto
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export default function CotizacionForm({
  cotizacion,
  onSubmit,
  onCancel,
  disabled = false
}: CotizacionFormProps) {
  const { get } = useApi()
  const { tasaIgv } = useTaxConfig()

  const [clienteId, setClienteId] = useState(cotizacion?.cliente_id || '')
  const [fechaVencimiento, setFechaVencimiento] = useState(cotizacion?.fecha_vencimiento || '')
  const [notas, setNotas] = useState(cotizacion?.notas || '')
  const [detalle, setDetalle] = useState<DetalleItem[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [loadingProductos, setLoadingProductos] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const stockAlerts = detalle
    .filter((item) => !!item.producto_id)
    .map((item) => {
      const producto = productos.find((p) => p.id === item.producto_id)
      const disponible = (producto?.stock_actual ?? 0) - (producto?.stock_reservado ?? 0)
      return {
        descripcion: item.descripcion || producto?.nombre || 'Producto',
        solicitado: item.cantidad,
        disponible,
        reservado: producto?.stock_reservado ?? 0,
      }
    })
    .filter((info) => info.solicitado > info.disponible)

  // Initialize detalle from cotizacion if editing
  useEffect(() => {
    if (cotizacion?.detalle && cotizacion.detalle.length > 0) {
      const initialDetalle: DetalleItem[] = cotizacion.detalle.map(item => ({
        id: item.id,
        producto_id: item.producto_id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal
      }))
      setDetalle(initialDetalle)
    }
  }, [cotizacion])

  const loadProductos = useCallback(async () => {
    try {
      setLoadingProductos(true)
      const response = await get('/inventario/productos')
      if (response?.success) {
        const productosApi = (response.data || []).map((p: any) => ({
          id: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
          precio_venta: Number(p.precio_venta ?? p.precio ?? 0),
          stock_actual: Number(p.stock ?? 0),
          stock_reservado: Number(p.stock_reservado ?? 0),
        }))
        setProductos(productosApi)
      }
    } catch (error) {
      console.error('Error loading productos:', error)
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los productos',
        variant: 'destructive'
      })
    } finally {
      setLoadingProductos(false)
    }
  }, [get])

  // Load productos on mount
  useEffect(() => {
    loadProductos()
  }, [loadProductos])

  const handleAddItem = () => {
    setDetalle([
      ...detalle,
      {
        producto_id: '',
        descripcion: '',
        cantidad: 1,
        precio_unitario: 0,
        subtotal: 0
      }
    ])
  }

  const handleRemoveItem = (index: number) => {
    setDetalle(detalle.filter((_, i) => i !== index))
  }

  const handleProductoChange = (index: number, productoId: string) => {
    const producto = productos.find(p => p.id === productoId)
    if (producto) {
      const newDetalle = [...detalle]
      newDetalle[index] = {
        ...newDetalle[index],
        producto_id: productoId,
        producto,
        descripcion: producto.nombre,
        precio_unitario: producto.precio_venta,
        subtotal: newDetalle[index].cantidad * producto.precio_venta
      }
      setDetalle(newDetalle)
    }
  }

  const handleCantidadChange = (index: number, cantidad: number) => {
    const newDetalle = [...detalle]
    newDetalle[index] = {
      ...newDetalle[index],
      cantidad,
      subtotal: cantidad * newDetalle[index].precio_unitario
    }
    setDetalle(newDetalle)
  }

  const handlePrecioChange = (index: number, precio: number) => {
    const newDetalle = [...detalle]
    newDetalle[index] = {
      ...newDetalle[index],
      precio_unitario: precio,
      subtotal: newDetalle[index].cantidad * precio
    }
    setDetalle(newDetalle)
  }

  const calculateTotals = () => {
    const subtotal = detalle.reduce((sum, item) => sum + item.subtotal, 0)
    const igv = subtotal * tasaIgv
    const total = subtotal + igv
    return { subtotal, igv, total }
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!clienteId) {
      newErrors.cliente = 'Debe seleccionar un cliente'
    }

    if (detalle.length === 0) {
      newErrors.detalle = 'Debe agregar al menos un producto'
    }

    detalle.forEach((item, index) => {
      if (!item.producto_id) {
        newErrors[`producto_${index}`] = 'Debe seleccionar un producto'
      }
      if (item.cantidad <= 0) {
        newErrors[`cantidad_${index}`] = 'La cantidad debe ser mayor a 0'
      }
      const producto = productos.find((p) => p.id === item.producto_id)
      const disponible = (producto?.stock_actual ?? 0) - (producto?.stock_reservado ?? 0)
      if (producto && item.cantidad > disponible) {
        newErrors[`cantidad_${index}`] = `Solo hay ${disponible} disponibles (reservado: ${producto.stock_reservado ?? 0})`
      }
      if (item.precio_unitario <= 0) {
        newErrors[`precio_${index}`] = 'El precio debe ser mayor a 0'
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      toast({
        title: 'Error de validación',
        description: 'Por favor corrija los errores en el formulario',
        variant: 'destructive'
      })
      return
    }

    try {
      setSubmitting(true)

      const formData: CotizacionFormData = {
        cliente_id: clienteId,
        fecha_vencimiento: fechaVencimiento || undefined,
        notas: notas || undefined,
        detalle: detalle.map(item => ({
          producto_id: item.producto_id,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario
        }))
      }

      await onSubmit(formData)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Error al guardar la cotización',
        variant: 'destructive'
      })
    } finally {
      setSubmitting(false)
    }
  }

  const { subtotal, igv, total } = calculateTotals()

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Cliente Section */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: 'var(--border-radius-lg)',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid rgba(255, 255, 255, 0.3)'
      }}>
        {stockAlerts.length > 0 && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: 'var(--red-700)',
            borderRadius: 'var(--border-radius)',
            padding: '0.75rem 1rem',
            marginBottom: '0.75rem'
          }}>
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>⚠️ Stock insuficiente</strong>
            <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.9rem' }}>
              {stockAlerts.map((s, i) => (
                <li key={i}>
                  {s.descripcion}: solicitado {s.solicitado}, disponible {s.disponible} (reservado {s.reservado})
                </li>
              ))}
            </ul>
          </div>
        )}
        <h3 style={{
          fontSize: '1.125rem',
          fontWeight: '600',
          color: 'var(--primary-900)',
          marginBottom: '1rem'
        }}>Cliente</h3>
        <ClienteSelector
          value={clienteId}
          onChange={(id) => setClienteId(id)}
          disabled={disabled}
          error={errors.cliente}
        />
      </div>

      {/* Productos Section */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: 'var(--border-radius-lg)',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid rgba(255, 255, 255, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{
            fontSize: '1.125rem',
            fontWeight: '600',
            color: 'var(--primary-900)',
            margin: 0
          }}>Productos</h3>
          <button
            type="button"
            onClick={handleAddItem}
            disabled={disabled || loadingProductos}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: 'white',
              background: 'var(--gradient-primary)',
              border: 'none',
              borderRadius: 'var(--border-radius)',
              cursor: disabled || loadingProductos ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: 'var(--shadow-md)',
              opacity: disabled || loadingProductos ? 0.6 : 1
            }}
            onMouseEnter={(e) => {
              if (!disabled && !loadingProductos) {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'var(--shadow-md)'
            }}
          >
            <Plus style={{ width: '1rem', height: '1rem' }} />
            Agregar Producto
          </button>
        </div>

        {errors.detalle && (
          <p style={{ fontSize: '0.875rem', color: 'var(--red-600)', marginBottom: '1rem' }}>{errors.detalle}</p>
        )}

        {detalle.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--primary-500)' }}>
            <Package style={{ width: '3rem', height: '3rem', margin: '0 auto 0.5rem', color: 'var(--primary-400)' }} />
            <p style={{ margin: '0.5rem 0' }}>No hay productos agregados</p>
            <p style={{ fontSize: '0.875rem', margin: 0 }}>Haz clic en &quot;Agregar Producto&quot; para comenzar</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {detalle.map((item, index) => (
              <div key={index} style={{
                border: '1px solid var(--primary-200)',
                borderRadius: 'var(--border-radius)',
                padding: '1rem',
                background: 'rgba(255, 255, 255, 0.5)'
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(12, 1fr)',
                  gap: '1rem'
                }}>
                  {/* Producto Selector */}
                  <div style={{ gridColumn: 'span 12 / span 12' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: 'var(--primary-700)',
                      marginBottom: '0.25rem'
                    }}>
                      Producto
                    </label>
                    <select
                      value={item.producto_id}
                      onChange={(e) => handleProductoChange(index, e.target.value)}
                      disabled={disabled}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        border: errors[`producto_${index}`] ? '1px solid var(--red-500)' : '1px solid var(--primary-300)',
                        borderRadius: 'var(--border-radius)',
                        fontSize: '1rem',
                        background: 'white',
                        color: 'var(--primary-800)',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">Seleccionar producto...</option>
                      {productos.map(producto => {
                        const reservado = producto.stock_reservado ?? 0
                        const disponible = (producto.stock_actual ?? 0) - reservado
                        const warning = disponible <= 0
                        return (
                          <option key={producto.id} value={producto.id}>
                            {warning ? '⚠️ ' : ''}
                            {producto.codigo} - {producto.nombre} (Stock: {producto.stock_actual} | Reservado: {reservado} | Disp: {disponible})
                          </option>
                        )
                      })}
                    </select>
                    {errors[`producto_${index}`] && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--red-600)', marginTop: '0.25rem' }}>
                        {errors[`producto_${index}`]}
                      </p>
                    )}
                  </div>

                  {/* Cantidad */}
                  <div style={{ gridColumn: 'span 4 / span 4' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: 'var(--primary-700)',
                      marginBottom: '0.25rem'
                    }}>
                      Cantidad
                    </label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={item.cantidad}
                      onChange={(e) =>
                        handleCantidadChange(index, Math.max(1, parseInt(e.target.value || '0', 10)))
                      }
                      disabled={disabled}
                      style={{
                        borderColor: errors[`cantidad_${index}`] ? 'var(--red-500)' : undefined
                        }}
                    />
                    {errors[`cantidad_${index}`] && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--red-600)', marginTop: '0.25rem' }}>
                        {errors[`cantidad_${index}`]}
                      </p>
                    )}
                    {item.producto_id && (() => {
                      const producto = productos.find(p => p.id === item.producto_id)
                      const reservado = producto?.stock_reservado ?? 0
                      const disponible = (producto?.stock_actual ?? 0) - reservado
                      const warn = item.cantidad > disponible
                      return (
                        <p style={{ fontSize: '0.75rem', color: warn ? 'var(--red-600)' : 'var(--primary-600)', marginTop: '0.15rem', fontWeight: warn ? 600 : 400 }}>
                          {warn ? '⚠️ ' : ''}
                          Stock: {producto?.stock_actual ?? 0} • Reservado: {reservado} • Disponible: {disponible}
                        </p>
                      )
                    })()}
                  </div>

                  {/* Precio Unitario */}
                  <div style={{ gridColumn: 'span 4 / span 4' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: 'var(--primary-700)',
                      marginBottom: '0.25rem'
                    }}>
                      Precio Unit.
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.precio_unitario}
                      onChange={(e) => handlePrecioChange(index, parseFloat(e.target.value) || 0)}
                      disabled={disabled}
                      style={{
                        borderColor: errors[`precio_${index}`] ? 'var(--red-500)' : undefined
                      }}
                    />
                    {errors[`precio_${index}`] && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--red-600)', marginTop: '0.25rem' }}>
                        {errors[`precio_${index}`]}
                      </p>
                    )}
                  </div>

                  {/* Subtotal */}
                  <div style={{ gridColumn: 'span 3 / span 3' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: 'var(--primary-700)',
                      marginBottom: '0.25rem'
                    }}>
                      Subtotal
                    </label>
                    <Input
                      type="text"
                      value={`S/ ${item.subtotal.toFixed(2)}`}
                      disabled
                      style={{ background: 'var(--primary-50)' }}
                    />
                  </div>

                  {/* Remove Button */}
                  <div style={{ gridColumn: 'span 1 / span 1', display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      disabled={disabled}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0.5rem',
                        color: 'var(--red-600)',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 'var(--border-radius)',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                        opacity: disabled ? 0.5 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (!disabled) {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'
                          e.currentTarget.style.color = 'var(--red-700)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = 'var(--red-600)'
                      }}
                    >
                      <Trash2 style={{ width: '1.125rem', height: '1.125rem' }} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totales Section */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: 'var(--border-radius-lg)',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid rgba(255, 255, 255, 0.3)'
      }}>
        <h3 style={{
          fontSize: '1.125rem',
          fontWeight: '600',
          color: 'var(--primary-900)',
          marginBottom: '1rem'
        }}>Totales</h3>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          maxWidth: '28rem',
          marginLeft: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--primary-600)' }}>Subtotal:</span>
            <span style={{ fontWeight: '500' }}>S/ {subtotal.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--primary-600)' }}>IGV (18%):</span>
            <span style={{ fontWeight: '500' }}>S/ {igv.toFixed(2)}</span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '1.125rem',
            fontWeight: '700',
            borderTop: '1px solid var(--primary-200)',
            paddingTop: '0.5rem'
          }}>
            <span>Total:</span>
            <span>S/ {total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Additional Info Section */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: 'var(--border-radius-lg)',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid rgba(255, 255, 255, 0.3)'
      }}>
        <h3 style={{
          fontSize: '1.125rem',
          fontWeight: '600',
          color: 'var(--primary-900)',
          marginBottom: '1rem'
        }}>Información Adicional</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: 'var(--primary-700)',
              marginBottom: '0.25rem'
            }}>
              Fecha de Vencimiento (Opcional)
            </label>
            <Input
              type="date"
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: 'var(--primary-700)',
              marginBottom: '0.25rem'
            }}>
              Notas (Opcional)
            </label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              disabled={disabled}
              rows={4}
              placeholder="Agregar notas o comentarios adicionales..."
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', paddingTop: '1rem' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: '600',
            color: 'var(--primary-700)',
            background: 'white',
            border: '2px solid var(--primary-300)',
            borderRadius: 'var(--border-radius)',
            cursor: submitting ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: 'var(--shadow-sm)',
            opacity: submitting ? 0.6 : 1
          }}
          onMouseEnter={(e) => {
            if (!submitting) {
              e.currentTarget.style.background = 'var(--primary-50)'
              e.currentTarget.style.borderColor = 'var(--primary-400)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white'
            e.currentTarget.style.borderColor = 'var(--primary-300)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={disabled || submitting || stockAlerts.length > 0}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 2rem',
            fontSize: '1rem',
            fontWeight: '600',
            color: 'white',
            background: 'var(--gradient-primary)',
            border: 'none',
            borderRadius: 'var(--border-radius)',
            cursor: disabled || submitting ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: 'var(--shadow-lg)',
            opacity: disabled || submitting ? 0.6 : 1,
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={(e) => {
            if (!disabled && !submitting) {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = 'var(--shadow-xl)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
          }}
        >
          {submitting ? 'Guardando...' : cotizacion ? 'Actualizar Cotización' : 'Crear Cotización'}
        </button>
      </div>
    </form>
  )
}
