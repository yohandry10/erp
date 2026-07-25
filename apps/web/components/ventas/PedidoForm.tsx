'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { useTaxConfig } from '@/hooks/useTaxConfig'
import { PedidoVenta } from '@/types/ventas'
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
  precio: number
  stock: number
  stock_reservado?: number
}

interface PedidoFormProps {
  pedido?: PedidoVenta
  onSubmit: (data: PedidoFormData) => Promise<void>
  onCancel: () => void
  disabled?: boolean
}

export interface PedidoFormData {
  cliente_id: string
  observaciones?: string
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

export default function PedidoForm({
  pedido,
  onSubmit,
  onCancel,
  disabled = false
}: PedidoFormProps) {
  const { get } = useApi()
  const { tasaIgv } = useTaxConfig()

  const [clienteId, setClienteId] = useState(pedido?.cliente_id || '')
  const [observaciones, setObservaciones] = useState(pedido?.observaciones || '')
  const [detalle, setDetalle] = useState<DetalleItem[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [loadingProductos, setLoadingProductos] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Derivar advertencias de stock para mostrar alerta en la UI antes de enviar
 const stockAlerts = detalle
   .filter((item) => !!item.producto_id)
   .map((item) => {
     const producto = productos.find((p) => p.id === item.producto_id)
     const disponible = (producto?.stock ?? 0) - (producto?.stock_reservado ?? 0)
       return {
         descripcion: item.descripcion || producto?.nombre || 'Producto',
         solicitado: item.cantidad,
         disponible,
         reservado: producto?.stock_reservado ?? 0,
       }
   })
  .filter((info) => info.solicitado > info.disponible)
const hasStockShortage = stockAlerts.length > 0

  // Initialize detalle from pedido if editing
  useEffect(() => {
    if (pedido?.detalle && pedido.detalle.length > 0) {
      const initialDetalle: DetalleItem[] = pedido.detalle.map(item => ({
        id: item.id,
        producto_id: item.producto_id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal
      }))
      setDetalle(initialDetalle)
    }
  }, [pedido])

  const loadProductos = useCallback(async () => {
    try {
      setLoadingProductos(true)
      const response = await get('/inventario/productos')
      if (response?.success) {
        const productosApi = (response.data || []).map((p: any) => ({
          id: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
          precio: Number(p.precio ?? p.precio_venta ?? 0),
          stock: Number(p.stock ?? p.stock_actual ?? 0),
          stock_reservado: Number(p.stock_reservado ?? 0)
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
        precio_unitario: producto.precio,
        subtotal: newDetalle[index].cantidad * producto.precio
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
      const producto = productos.find(p => p.id === item.producto_id)
      const disponible = (producto?.stock ?? 0) - (producto?.stock_reservado ?? 0)
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

    if (hasStockShortage) {
      const first = stockAlerts[0]
      toast({
        title: 'Stock insuficiente',
        description: `${first.descripcion}: solicitado ${first.solicitado}, disponible ${first.disponible} (reservado ${first.reservado}). Ajusta las cantidades o repon stock para continuar.`,
        variant: 'destructive'
      })
      return
    }

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

      const formData: PedidoFormData = {
        cliente_id: clienteId,
        observaciones: observaciones || undefined,
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
        description: error.message || 'Error al guardar el pedido',
        variant: 'destructive'
      })
    } finally {
      setSubmitting(false)
    }
  }

  const { subtotal, igv, total } = calculateTotals()

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {hasStockShortage && (
        <div className="border bg-destructive/10 text-destructive py-3 px-4 rounded-xl text-sm">
          <strong>Stock insuficiente</strong>
          <ul className="mt-2 mr-0 mb-0 ml-5 p-0">
            {stockAlerts.map((a, idx) => (
              <li key={idx}>
                {a.descripcion}: solicitado {a.solicitado}, disponible {a.disponible} (reservado {a.reservado})
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Cliente Section */}
      <div className="p-6 shadow border">
        <h3 className="text-[1.125rem] font-semibold text-[var(--primary-900)] mb-4">Cliente</h3>
        <ClienteSelector
          value={clienteId}
          onChange={(id) => setClienteId(id)}
          disabled={disabled}
          error={errors.cliente}
        />
      </div>

      {/* Productos Section */}
      <div className="p-6 shadow border">
        {stockAlerts.length > 0 && (
          <div className="bg-destructive/10 border text-[var(--red-700)] py-3 px-4 mb-3">
            <strong className="block mb-1">⚠️ Stock insuficiente</strong>
            <ul className="m-0 pl-4 text-sm">
              {stockAlerts.map((s, i) => (
                <li key={i}>
                  {s.descripcion}: solicitado {s.solicitado}, disponible {s.disponible} (reservado {s.reservado})
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[1.125rem] font-semibold text-[var(--primary-900)] m-0">Productos</h3>
          <button
            type="button"
            onClick={handleAddItem}
            disabled={disabled || loadingProductos}
            title={loadingProductos
              ? 'Cargando productos disponibles'
              : disabled
                ? 'El formulario está procesando otra operación'
                : 'Agregar un producto al pedido'}
            className="inline-flex items-center gap-2 py-2.5 px-5 text-[0.875rem] font-semibold text-white bg-[var(--gradient-primary)] border-0 transition shadow"
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
            <Plus className="w-4 h-4" />
            Agregar Producto
          </button>
        </div>

        {errors.detalle && (
          <p className="text-[0.875rem] text-[var(--red-600)] mb-4">{errors.detalle}</p>
        )}

        {detalle.length === 0 ? (
          <div className="text-center p-8 text-[var(--primary-500)]">
            <Package className="w-12 h-12 text-[var(--primary-400)]" />
            <p className="my-2 mx-0">No hay productos agregados</p>
            <p className="text-[0.875rem] m-0">Haz clic en &quot;Agregar Producto&quot; para comenzar</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {detalle.map((item, index) => (
              <div key={index} className="border p-4 bg-card/50">
                <div className="grid grid-cols-[repeat(12,_1fr)] gap-4">
                  {/* Producto Selector */}
                  <div>
                    <label className="block text-[0.875rem] font-medium text-[var(--primary-700)] mb-1">
                      Producto
                    </label>
                    <select
                      value={item.producto_id}
                      onChange={(e) => handleProductoChange(index, e.target.value)}
                      disabled={disabled} className="w-[100%] py-3 px-4 text-base bg-card text-[var(--primary-800)] cursor-pointer"
                    >
                      <option value="">Seleccionar producto...</option>
                      {productos.map(producto => {
                        const reservado = producto.stock_reservado ?? 0
                        const disponible = (producto.stock ?? 0) - reservado
                        const warning = disponible <= 0
                        return (
                          <option key={producto.id} value={producto.id}>
                            {warning ? '⚠️ ' : ''}
                            {producto.codigo} - {producto.nombre} (Stock: {producto.stock} | Reservado: {reservado} | Disp: {disponible})
                          </option>
                        )
                      })}
                    </select>
                    {errors[`producto_${index}`] && (
                      <p className="text-xs text-[var(--red-600)] mt-1">
                        {errors[`producto_${index}`]}
                      </p>
                    )}
                  </div>

                  {/* Cantidad */}
                  <div>
                    <label className="block text-[0.875rem] font-medium text-[var(--primary-700)] mb-1">
                      Cantidad
                    </label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={item.cantidad}
                      onChange={(e) => handleCantidadChange(index, parseInt(e.target.value || '0', 10))}
                      disabled={disabled}
                    />
                    {errors[`cantidad_${index}`] && (
                      <p className="text-xs text-[var(--red-600)] mt-1">
                        {errors[`cantidad_${index}`]}
                      </p>
                    )}
                    {item.producto && (
                      (() => {
                        const reservado = item.producto?.stock_reservado ?? 0
                        const disponible = (item.producto.stock ?? 0) - reservado
                        const warn = item.cantidad > disponible
                        return (
                          <p className="text-xs mt-[0.15rem]">
                            {warn ? '⚠️ ' : ''}
                            Stock: {item.producto.stock ?? 0} • Reservado: {reservado} • Disponible: {disponible}
                          </p>
                        )
                      })()
                    )}
                  </div>

                  {/* Precio Unitario */}
                  <div>
                    <label className="block text-[0.875rem] font-medium text-[var(--primary-700)] mb-1">
                      Precio Unit.
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.precio_unitario}
                      onChange={(e) => handlePrecioChange(index, parseFloat(e.target.value) || 0)}
                      disabled={disabled}
                    />
                    {errors[`precio_${index}`] && (
                      <p className="text-xs text-[var(--red-600)] mt-1">
                        {errors[`precio_${index}`]}
                      </p>
                    )}
                  </div>

                  {/* Subtotal */}
                  <div>
                    <label className="block text-[0.875rem] font-medium text-[var(--primary-700)] mb-1">
                      Subtotal
                    </label>
                    <Input
                      type="text"
                      value={`S/ ${item.subtotal.toFixed(2)}`}
                      disabled className="bg-[var(--primary-50)]"
                    />
                  </div>

                  {/* Remove Button */}
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      disabled={disabled} className="inline-flex items-center justify-center p-2 text-[var(--red-600)] bg-transparent border-0 transition"
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
                      <Trash2 className="w-[1.125rem] h-[1.125rem]" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totales Section */}
      <div className="p-6 shadow border">
        <h3 className="text-[1.125rem] font-semibold text-[var(--primary-900)] mb-4">Totales</h3>
        <div className="flex flex-col gap-2 max-w-[28rem] ml-auto">
          <div className="flex justify-between text-[0.875rem]">
            <span className="text-[var(--primary-600)]">Subtotal:</span>
            <span className="font-medium">S/ {subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-[0.875rem]">
            <span className="text-[var(--primary-600)]">IGV (18%):</span>
            <span className="font-medium">S/ {igv.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-[1.125rem] font-bold border-t pt-2">
            <span>Total:</span>
            <span>S/ {total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Additional Info Section */}
      <div className="p-6 shadow border">
        <h3 className="text-[1.125rem] font-semibold text-[var(--primary-900)] mb-4">Información Adicional</h3>
        <div>
          <label className="block text-[0.875rem] font-medium text-[var(--primary-700)] mb-1">
            Observaciones (Opcional)
          </label>
          <Textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            disabled={disabled}
            rows={4}
            placeholder="Agregar observaciones o comentarios adicionales..."
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-4 pt-4">
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold leading-5 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={disabled || submitting || stockAlerts.length > 0}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {submitting ? 'Guardando...' : pedido ? 'Actualizar Pedido' : 'Crear Pedido'}
      </button>
    </div>
    </form>
  )
}
