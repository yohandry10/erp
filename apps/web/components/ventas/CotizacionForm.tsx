'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
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

const IGV_RATE = 0.18

export default function CotizacionForm({
  cotizacion,
  onSubmit,
  onCancel,
  disabled = false
}: CotizacionFormProps) {
  const { get } = useApi()
  
  const [clienteId, setClienteId] = useState(cotizacion?.cliente_id || '')
  const [fechaVencimiento, setFechaVencimiento] = useState(cotizacion?.fecha_vencimiento || '')
  const [notas, setNotas] = useState(cotizacion?.notas || '')
  const [detalle, setDetalle] = useState<DetalleItem[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [loadingProductos, setLoadingProductos] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Load productos on mount
  useEffect(() => {
    loadProductos()
  }, [])

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

  const loadProductos = async () => {
    try {
      setLoadingProductos(true)
      const response = await get('/inventario/productos')
      if (response?.success) {
        setProductos(response.data || [])
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
  }

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
    const igv = subtotal * IGV_RATE
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Cliente Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cliente</h3>
        <ClienteSelector
          value={clienteId}
          onChange={(id) => setClienteId(id)}
          disabled={disabled}
          error={errors.cliente}
        />
      </div>

      {/* Productos Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Productos</h3>
          <Button
            type="button"
            onClick={handleAddItem}
            disabled={disabled || loadingProductos}
            variant="outline"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Agregar Producto
          </Button>
        </div>

        {errors.detalle && (
          <p className="text-sm text-red-600 mb-4">{errors.detalle}</p>
        )}

        {detalle.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p>No hay productos agregados</p>
            <p className="text-sm">Haz clic en "Agregar Producto" para comenzar</p>
          </div>
        ) : (
          <div className="space-y-4">
            {detalle.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-12 gap-4">
                  {/* Producto Selector */}
                  <div className="col-span-12 md:col-span-5">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Producto
                    </label>
                    <select
                      value={item.producto_id}
                      onChange={(e) => handleProductoChange(index, e.target.value)}
                      disabled={disabled}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors[`producto_${index}`] ? 'border-red-500' : 'border-gray-300'
                      }`}
                    >
                      <option value="">Seleccionar producto...</option>
                      {productos.map(producto => (
                        <option key={producto.id} value={producto.id}>
                          {producto.codigo} - {producto.nombre} (Stock: {producto.stock_actual})
                        </option>
                      ))}
                    </select>
                    {errors[`producto_${index}`] && (
                      <p className="text-xs text-red-600 mt-1">{errors[`producto_${index}`]}</p>
                    )}
                  </div>

                  {/* Cantidad */}
                  <div className="col-span-6 md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cantidad
                    </label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.cantidad}
                      onChange={(e) => handleCantidadChange(index, parseFloat(e.target.value) || 0)}
                      disabled={disabled}
                      className={errors[`cantidad_${index}`] ? 'border-red-500' : ''}
                    />
                    {errors[`cantidad_${index}`] && (
                      <p className="text-xs text-red-600 mt-1">{errors[`cantidad_${index}`]}</p>
                    )}
                  </div>

                  {/* Precio Unitario */}
                  <div className="col-span-6 md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Precio Unit.
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.precio_unitario}
                      onChange={(e) => handlePrecioChange(index, parseFloat(e.target.value) || 0)}
                      disabled={disabled}
                      className={errors[`precio_${index}`] ? 'border-red-500' : ''}
                    />
                    {errors[`precio_${index}`] && (
                      <p className="text-xs text-red-600 mt-1">{errors[`precio_${index}`]}</p>
                    )}
                  </div>

                  {/* Subtotal */}
                  <div className="col-span-10 md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subtotal
                    </label>
                    <Input
                      type="text"
                      value={`S/ ${item.subtotal.toFixed(2)}`}
                      disabled
                      className="bg-gray-50"
                    />
                  </div>

                  {/* Remove Button */}
                  <div className="col-span-2 md:col-span-1 flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveItem(index)}
                      disabled={disabled}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totales Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Totales</h3>
        <div className="space-y-2 max-w-md ml-auto">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotal:</span>
            <span className="font-medium">S/ {subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">IGV (18%):</span>
            <span className="font-medium">S/ {igv.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold border-t pt-2">
            <span>Total:</span>
            <span>S/ {total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Additional Info Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Información Adicional</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={disabled || submitting}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {submitting ? 'Guardando...' : cotizacion ? 'Actualizar Cotización' : 'Crear Cotización'}
        </Button>
      </div>
    </form>
  )
}
