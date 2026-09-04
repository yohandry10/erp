'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useTaxConfig } from '@/hooks/useTaxConfig'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/use-toast'
import { useCountryContext } from '@/hooks/use-country-context'
import { multiplicarMoneda } from '@/lib/format-utils'

interface OrdenCompraModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  orden?: any
}

interface OrdenItem {
  id: string
  producto_id: string
  producto_nombre?: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  /** Catalogo 07 SUNAT: 10 gravado, 20 exonerado, 30 inafecto, 40 exportacion. */
  afectacion_igv?: string
  esNuevoProducto?: boolean
}

export default function OrdenCompraModal({
  isOpen,
  onClose,
  onSuccess,
  orden
}: OrdenCompraModalProps) {
  const country = useCountryContext()
  const isArgentina = country.paisCodigo === 'AR'
  const defaultCurrency = country.moneda || (isArgentina ? 'ARS' : country.paisCodigo === 'CO' ? 'COP' : 'PEN')
  const currencySymbol = country.simboloMoneda || (country.paisCodigo === 'PE' ? 'S/' : '$')
  const { tasaIgv, nombreImpuesto } = useTaxConfig()
  const { get, post, put } = useApi({ throwOnError: true, showErrorToast: false })
  const { toast } = useToast()
  const createIdempotencyKeyRef = useRef<string | null>(null)
  const openedOrderRef = useRef<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // DEBUG: Log de props recibidas

  const [formData, setFormData] = useState({
    numero: '',
    proveedor_id: '',
    fecha_orden: new Date().toISOString().split('T')[0],
    fecha_entrega: '',
    moneda: defaultCurrency,
    subtotal: 0,
    igv: 0,
    total: 0,
    estado: 'PENDIENTE',
    observaciones: ''
  })

  const [items, setItems] = useState<OrdenItem[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [productos, setProductos] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const [totales, setTotales] = useState<{
    subtotal: number;
    igv: number;
    total: number;
  }>({
    subtotal: 0,
    igv: 0,
    total: 0
  })

  const loadProveedores = useCallback(async () => {
    try {
      const resp = await get('/api/compras/proveedores')
      if ((resp as any)?.success) {
        const proveedoresData = (resp as any).data || []
        setProveedores(proveedoresData)
      } else {
        console.error('🔥 [MODAL] Error en respuesta:', (resp as any)?.error || (resp as any)?.message)
      }
    } catch (error) {
      console.error('🔥 [MODAL] Error loading proveedores:', error)
    }
  }, [get])

  const loadProductos = useCallback(async () => {
    try {
      const resp = await get('/api/compras/productos')
      if ((resp as any)?.success) {
        setProductos((resp as any).data || [])
      }
    } catch (error) {
      console.error('Error loading productos:', error)
    }
  }, [get])

  const generateNumeroOrden = useCallback(async () => {
    try {
      const resp = await get('/api/compras/next-number')
      if ((resp as any)?.success) {
        const numero = (resp as any)?.data?.numero
        if (numero) {
          setFormData(prev => ({ ...prev, numero }))
        }
      }
    } catch (error) {
      console.error('Error generating order number:', error)
    }
  }, [get])

  const loadOrdenData = useCallback(() => {
    if (orden) {

      setFormData({
        numero: orden.numero,
        proveedor_id: orden.proveedor_id,
        fecha_orden: orden.fecha_orden,
        fecha_entrega: orden.fecha_entrega,
        moneda: orden.moneda,
        subtotal: Number(orden.subtotal) || 0,
        igv: Number(orden.igv) || 0,
        total: Number(orden.total) || 0,
        estado: orden.estado,
        observaciones: orden.observaciones || ''
      })

      // Procesar los items correctamente
      const itemsArray = Array.isArray(orden.items) ? orden.items : []

      const itemsToLoad: OrdenItem[] = itemsArray.map((item: any, index: number) => {
        const processedItem: OrdenItem = {
          id: item.id || `item-${Date.now()}-${index}`,
          producto_id: item.producto_id || '',
          producto_nombre: item.producto_nombre || item.nombre || '',
          cantidad: Number(item.cantidad) || 0,
          precio_unitario: Number(item.precio_unitario) || 0,
          subtotal: Number(item.subtotal) || (Number(item.cantidad) * Number(item.precio_unitario)) || 0,
        }
        return processedItem
      })

      setItems(itemsToLoad)
    }
  }, [orden])

  const calculateTotales = useCallback(() => {
    const subtotal = items.reduce((sum, item) => {
      const itemSubtotal = Number(item.subtotal) || 0
      return sum + itemSubtotal
    }, 0)
    // Comprar un producto exonerado no genera IGV. Aplicar la tasa sobre todo
    // el subtotal inflaba la deuda con el proveedor y, peor, se tomaba credito
    // fiscal de un impuesto inexistente en el Registro de Compras.
    const baseGravada = items.reduce((sum, item) => {
      const afectacion = String(item.afectacion_igv ?? '10').trim()
      return afectacion === '10' ? sum + (Number(item.subtotal) || 0) : sum
    }, 0)
    const igv = baseGravada * tasaIgv
    const total = subtotal + igv

    setTotales({ subtotal, igv, total })
    setFormData(prev => ({ ...prev, subtotal, igv, total }))
  }, [items, tasaIgv])

  const addItem = useCallback(() => {
    const newItem: OrdenItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      producto_id: '',
      producto_nombre: '',
      cantidad: 1,
      precio_unitario: 0,
      subtotal: 0,
      esNuevoProducto: false,
    }
    setItems(prev => [...prev, newItem])
  }, [])

  // Cargar datos iniciales
  useEffect(() => {
    if (!isOpen) {
      openedOrderRef.current = null
      return
    }
    const opening = orden?.id || 'new'
    if (openedOrderRef.current !== opening) {
      openedOrderRef.current = opening
      createIdempotencyKeyRef.current = null
      setSubmitError(null)
      loadProveedores()
      loadProductos()
      if (orden) {
        loadOrdenData()
      } else {
        setFormData({ numero: '', proveedor_id: '', fecha_orden: new Date().toISOString().split('T')[0], fecha_entrega: '', moneda: defaultCurrency, subtotal: 0, igv: 0, total: 0, estado: 'PENDIENTE', observaciones: '' })
        setItems([])
        addItem()
        generateNumeroOrden()
      }
    }
  }, [addItem, defaultCurrency, generateNumeroOrden, isOpen, loadOrdenData, loadProductos, loadProveedores, orden])

  // Calcular totales cuando cambien los items
  useEffect(() => {
    calculateTotales()
  }, [calculateTotales])

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items]

    // Convertir valores numéricos y validar
    if (field === 'cantidad' || field === 'precio_unitario') {
      const numValue = Number(value) || 0
      newItems[index] = { ...newItems[index], [field]: numValue }
    } else {
      newItems[index] = { ...newItems[index], [field]: value }
    }

    // Actualizar nombre del producto si se selecciona uno
    if (field === 'producto_id') {
      const producto = productos.find((p: any) => p.id === value)
      if (producto) {
        newItems[index].producto_nombre = producto.nombre
        newItems[index].precio_unitario = Number(producto.precio) || 0
        newItems[index].afectacion_igv = producto.afectacion_igv ?? '10'
      }
    }

    // Recalcular subtotal con validación
    if (field === 'cantidad' || field === 'precio_unitario' || field === 'producto_id') {
      const cantidad = Number(newItems[index].cantidad) || 0
      const precio = Number(newItems[index].precio_unitario) || 0
      newItems[index].subtotal = multiplicarMoneda(cantidad, precio)
    }

    setItems(newItems)
  }

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return
    setSubmitError(null)
    if (!items.length || items.some(item => !item.producto_id || !Number.isFinite(item.cantidad) || item.cantidad <= 0 || !Number.isFinite(item.precio_unitario) || item.precio_unitario < 0)) {
      setSubmitError('Seleccione al menos un producto del catálogo, con cantidad mayor a cero y precio no negativo.')
      return
    }
    setIsLoading(true)

    try {

      // El backend (CreateOrdenCompraDto) usa whitelist estricta: espera `detalles[]`
      // con { producto_id, descripcion, cantidad, precio_unitario } y calcula él mismo
      // subtotal/igv/total. Enviar items/subtotal/igv/total o un estado fuera
      // del enum (BORRADOR/APROBADA/…) provoca 400. El estado inicial lo pone el backend.
      const ordenData: Record<string, unknown> = {
        numero: formData.numero,
        proveedor_id: formData.proveedor_id,
        moneda: formData.moneda,
        fecha_orden: formData.fecha_orden || undefined,
        fecha_entrega_esperada: formData.fecha_entrega || undefined,
        observaciones: formData.observaciones || undefined,
        detalles: items.map(item => ({
          producto_id: item.producto_id,
          descripcion: item.producto_nombre || 'Producto',
          cantidad: Number(item.cantidad),
          precio_unitario: Number(item.precio_unitario),
        })),
      }


      if (!orden) {
        createIdempotencyKeyRef.current ??= crypto.randomUUID()
        ordenData.idempotency_key = createIdempotencyKeyRef.current
      }
      const result = orden
        ? await put(`/api/compras/ordenes/${orden.id}`, ordenData)
        : await post('/api/compras/ordenes', ordenData)

      if (result?.success && result.data?.id) {
        onSuccess()
        onClose()
        resetForm()
      } else {
        setSubmitError(result?.message || 'No se pudo confirmar el guardado de la orden. Revise el listado antes de iniciar otra compra.')
      }
    } catch (error) {
      console.error('Error submitting order:', error)
      setSubmitError(error instanceof Error ? error.message : 'Error al procesar la orden')
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
      moneda: defaultCurrency,
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
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.5)] flex items-center justify-center z-[1100]">
      <div className="bg-card rounded-xl p-8 w-[95%] max-w-[1200px] max-h-[90dvh] overflow-auto shadow">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-foreground">
            {orden ? 'Editar Orden de Compra' : 'Nueva Orden de Compra'}
          </h2>
          <button
            onClick={onClose} className="border-0 text-2xl cursor-pointer text-muted-foreground w-[30px] h-[30px] rounded-full flex items-center justify-center"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {submitError && <div role="alert" className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm">{submitError}</div>}
          {/* Información básica */}
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4 mb-6">
            <div>
              <label htmlFor="orden-compra-modal-numero" className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                Número de Orden
              </label>
              <input id="orden-compra-modal-numero"
                type="text"
                value={formData.numero}
                disabled className="w-[100%] p-2 border rounded-md bg-muted text-muted-foreground"
              />
            </div>

            <div>
              <label htmlFor="orden-compra-modal-proveedor-id" className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                Proveedor *
              </label>
              <div className="flex gap-2">
                <select id="orden-compra-modal-proveedor-id"
                  value={formData.proveedor_id}
                  onChange={(e) => setFormData({...formData, proveedor_id: e.target.value})}
                  required className="flex-[1] p-2 border rounded-md bg-card"
                >
                  <option value="">Seleccionar proveedor</option>
                  {proveedores.map((proveedor: any) => (
                    <option key={proveedor.id} value={proveedor.id}>
                      {proveedor.nombre} - {proveedor.cuit || proveedor.ruc}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    toast({ title: 'Agregar proveedor', description: 'Créalo desde el módulo de Proveedores.' });
                    // Aquí abrirías el modal de proveedores o irías a su página
                  }} className="py-2 px-4 border rounded-md bg-[#10b981] text-white cursor-pointer whitespace-nowrap"
                  title="Agregar nuevo proveedor"
                >
                  + Nuevo
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="orden-compra-modal-moneda" className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                Moneda
              </label>
              <select id="orden-compra-modal-moneda"
                value={formData.moneda}
                onChange={(e) => setFormData({...formData, moneda: e.target.value})} className="w-[100%] p-2 border rounded-md bg-card"
              >
                {isArgentina ? (
                  <option value="ARS">ARS - Pesos argentinos</option>
                ) : country.paisCodigo === 'CO' ? (
                  <option value="COP">COP - Pesos colombianos</option>
                ) : (
                  <option value="PEN">PEN - Soles</option>
                )}
                <option value="USD">USD - Dólares</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4 mb-6">
            <div>
              <label htmlFor="orden-compra-modal-fecha-orden" className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                Fecha de Orden *
              </label>
              <input id="orden-compra-modal-fecha-orden"
                type="date"
                value={formData.fecha_orden}
                onChange={(e) => setFormData({...formData, fecha_orden: e.target.value})}
                required className="w-[100%] p-2 border rounded-md"
              />
            </div>

            <div>
              <label htmlFor="orden-compra-modal-fecha-entrega" className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                Fecha de Entrega *
              </label>
              <input id="orden-compra-modal-fecha-entrega"
                type="date"
                value={formData.fecha_entrega}
                onChange={(e) => setFormData({...formData, fecha_entrega: e.target.value})}
                required className="w-[100%] p-2 border rounded-md"
              />
            </div>
          </div>

          {/* Items */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[1.125rem] font-semibold text-foreground/85">Items de la Orden</h3>
              <button
                type="button"
                onClick={addItem} className="bg-blue-500 text-white py-2 px-4 rounded-md border-0 cursor-pointer text-[0.875rem] font-medium"
              >
                + Agregar Item
              </button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-[100%]">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left text-[0.875rem] font-medium text-foreground/85">Producto</th>
                    <th className="p-3 text-center text-[0.875rem] font-medium text-foreground/85">Cantidad</th>
                    <th className="p-3 text-right text-[0.875rem] font-medium text-foreground/85">Precio Unit.</th>
                    <th className="p-3 text-right text-[0.875rem] font-medium text-foreground/85">Subtotal</th>
                    <th className="p-3 text-center text-[0.875rem] font-medium text-foreground/85">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-3">
                        {item.esNuevoProducto ? (
                          <div className="flex gap-2 items-center">
                            <input aria-label="Nombre del nuevo producto"
                              type="text"
                              placeholder="Nombre del nuevo producto"
                              value={item.producto_nombre || ''}
                              onChange={(e) => updateItem(index, 'producto_nombre', e.target.value)}
                              required className="flex-[1] py-1 px-2 border rounded text-[0.875rem] bg-card"
                            />
                            <button
                              type="button"
                              onClick={() => updateItem(index, 'esNuevoProducto', false)} className="bg-gray-500 text-white py-1 px-2 rounded border-0 cursor-pointer text-xs"
                              title="Cancelar producto nuevo"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2 items-center">
                            <select aria-label="Producto"
                              value={item.producto_id}
                              onChange={(e) => updateItem(index, 'producto_id', e.target.value)}
                              required className="flex-[1] py-1 px-2 border rounded text-[0.875rem]"
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
                              onClick={() => updateItem(index, 'esNuevoProducto', true)} className="bg-[#10b981] text-white py-1 px-2 rounded border-0 cursor-pointer text-xs"
                              title="Crear producto nuevo"
                            >
                              + Nuevo
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <input aria-label="Cantidad"
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          value={item.cantidad || ''}
                          onChange={(e) => updateItem(index, 'cantidad', e.target.value)} className="w-[80px] p-1 border rounded text-center text-[0.875rem]"
                        />
                      </td>
                      <td className="p-3 text-right">
                        <input aria-label="Precio unitario"
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={item.precio_unitario}
                          onChange={(e) => updateItem(index, 'precio_unitario', e.target.value)} className="w-[100px] p-1 border rounded text-right text-[0.875rem]"
                        />
                      </td>
                      <td className="p-3 text-right font-medium">
                        {currencySymbol} {Number(item.subtotal || 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(index)} className="bg-red-600 text-white py-1 px-2 rounded border-0 cursor-pointer text-xs"
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
            <div className="mt-4 bg-muted p-4 rounded-lg">
              <div className="flex justify-end">
                <div className="text-right">
                  <div className="mb-2 text-[0.875rem]">
                    <span className="font-medium">Subtotal: </span>
                    <span>{currencySymbol} {Number(totales.subtotal || 0).toFixed(2)}</span>
                  </div>
                  <div className="mb-2 text-[0.875rem]">
                    <span className="font-medium">{nombreImpuesto} ({Number((tasaIgv * 100).toFixed(2))}%): </span>
                    <span>{currencySymbol} {Number(totales.igv || 0).toFixed(2)}</span>
                  </div>
                  <div className="text-[1.125rem] font-semibold border-t pt-2">
                    <span>Total: {currencySymbol} {Number(totales.total || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Observaciones */}
          <div className="mb-6">
            <label htmlFor="orden-compra-modal-observaciones" className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
              Observaciones
            </label>
            <textarea id="orden-compra-modal-observaciones"
              value={formData.observaciones}
              onChange={(e) => setFormData({...formData, observaciones: e.target.value})}
              rows={3}
              placeholder="Observaciones adicionales..." className="w-[100%] p-2 border rounded-md"
            />
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-6 border-t">
            <button
              type="button"
              onClick={onClose} className="py-2 px-4 border rounded-md bg-card text-foreground/85 cursor-pointer text-[0.875rem] font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading} className="py-2 px-4 text-white border-0 rounded-md text-[0.875rem] font-medium"
            >
              {isLoading ? 'Procesando...' : (orden ? 'Actualizar' : 'Crear')} Orden
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
