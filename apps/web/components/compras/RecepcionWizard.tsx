'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Check, Package, Scan, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/use-toast'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { cn } from '@/lib/utils'

const fieldLabelClass = 'mb-2 block text-sm font-medium text-foreground/85'
const fieldClass = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground'
const panelClass = 'relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl border border-border bg-card'
const qualityClass = {
  OK: 'border-blue-600 bg-blue-600 text-white',
  OBSERVADO: 'border-cyan-600 bg-cyan-600 text-white',
  RECHAZADO: 'border-border bg-muted text-white',
} as const
const qualityBadgeClass = {
  OK: 'bg-primary/10 text-primary',
  OBSERVADO: 'bg-primary/10 text-primary',
  RECHAZADO: 'bg-muted text-foreground/85',
} as const

interface OrdenDetalle {
  id: string
  producto_id: string
  cantidad: number
  cantidad_recibida: number
  precio_unitario: number
  descripcion?: string | null
  codigo?: string | null
  productos?: {
    id: string
    nombre: string
    codigo: string
    unidad_medida?: string
    tipo?: string | null
    es_servicio?: boolean
    controla_stock?: boolean
  }
}

interface OrdenCompra {
  id: string
  numero: string
  proveedor_id: string
  estado: string
  proveedor?: {
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
  es_servicio: boolean
  controla_stock: boolean
}

interface RecepcionWizardProps {
  ordenId: string
  onComplete: () => void
  onCancel: () => void
}

export function RecepcionWizard({ ordenId, onComplete, onCancel }: RecepcionWizardProps) {
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState(1)
  const [orden, setOrden] = useState<OrdenCompra | null>(null)
  const [items, setItems] = useState<RecepcionItem[]>([])
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])
  const [ubicacionesPorAlmacen, setUbicacionesPorAlmacen] = useState<Record<string, Ubicacion[]>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [scannerMode, setScannerMode] = useState(false)
  const [scanBuffer, setScanBuffer] = useState('')
  const [flashItemIndex, setFlashItemIndex] = useState<number | null>(null)
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const createIdempotencyKeyRef = useRef<string | null>(null)
  const { get, post } = useApi()

  const loadOrden = useCallback(async () => {
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
            .map((detalle: OrdenDetalle) => {
              const esServicio = Boolean(detalle.productos?.es_servicio)
                || detalle.productos?.tipo?.toLowerCase() === 'servicio'

              return {
                detalle_id: detalle.id,
                producto_id: detalle.producto_id,
                producto_nombre: detalle.productos?.nombre || detalle.descripcion || 'Producto',
                producto_codigo: detalle.productos?.codigo || detalle.codigo || '',
                cantidad_pedida: detalle.cantidad,
                cantidad_recibida_anterior: detalle.cantidad_recibida || 0,
                cantidad_recibir: 0,
                calidad: 'OK' as const,
                observaciones: '',
                es_servicio: esServicio,
                controla_stock: !esServicio && detalle.productos?.controla_stock !== false,
              }
            })
          setItems(recepcionItems)
        }
      }
    } catch (error) {
      console.error('Error loading orden:', error)
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la orden de compra' })
    } finally {
      setLoading(false)
    }
  }, [get, ordenId, toast])

  const loadAlmacenes = useCallback(async () => {
    try {
      const response = await get('/api/inventario/almacenes')
      if (response?.success && response.data) {
        setAlmacenes(response.data)
      }
    } catch (error) {
      console.error('Error loading almacenes:', error)
    }
  }, [get])

  useEffect(() => {
    loadOrden()
    loadAlmacenes()
  }, [loadAlmacenes, loadOrden])

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

  const handleScanComplete = useCallback((scannedCode: string) => {
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
        setFlashItemIndex(itemIndex)
        setTimeout(() => setFlashItemIndex(null), 300)
      }
    } else {
      // Product not found
      toast({ variant: 'destructive', title: 'Producto no encontrado', description: scannedCode })
    }
  }, [items, toast])

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
  }, [handleScanComplete, scanBuffer, scannerMode])

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
        toast({ variant: 'destructive', title: 'Cantidad requerida', description: 'Debe ingresar al menos una cantidad para recepcionar' })
        return
      }
      setCurrentStep(2)
    } else if (currentStep === 2) {
      setCurrentStep(3)
    } else if (currentStep === 3) {
      // Validate all items with quantity have almacen selected
      const itemsToReceive = items.filter(item => item.cantidad_recibir > 0)
      const itemsWithoutAlmacen = itemsToReceive.filter(
        item => item.controla_stock && item.calidad !== 'RECHAZADO' && !item.almacen_id,
      )

      if (itemsWithoutAlmacen.length > 0) {
        toast({ variant: 'destructive', title: 'Almacén requerido', description: 'Debe seleccionar un almacén para cada producto físico con control de stock' })
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
        toast({ variant: 'destructive', title: 'Cantidad requerida', description: 'Debe ingresar al menos una cantidad para recepcionar' })
        return
      }

      // Create reception
      if (!createIdempotencyKeyRef.current) {
        createIdempotencyKeyRef.current = crypto.randomUUID()
      }
      const createDto = {
        orden_id: ordenId,
        idempotency_key: createIdempotencyKeyRef.current,
        items: itemsToReceive.map(item => ({
          detalle_id: item.detalle_id,
          cantidad_recibida: item.cantidad_recibir,
          calidad: item.calidad,
          observaciones: item.observaciones || undefined,
          lote: item.lote || undefined,
          serie: item.serie || undefined,
          almacen_id: item.controla_stock && item.calidad !== 'RECHAZADO' ? item.almacen_id : undefined,
          ubicacion_id: item.controla_stock && item.calidad !== 'RECHAZADO' ? item.ubicacion_id || undefined : undefined,
          fecha_expiracion: item.controla_stock && item.calidad !== 'RECHAZADO' ? item.fecha_expiracion || undefined : undefined
        })),
        observaciones: 'Recepción creada desde wizard'
      }

      const createResponse = await post(`/api/compras/recepciones/ordenes/${ordenId}`, createDto)

      const createdRecepcion = createResponse?.data ?? createResponse
      const createSucceeded = createResponse?.success !== false && Boolean(createdRecepcion?.id)

      if (!createSucceeded) {
        throw new Error(createResponse?.message || 'Error al crear la recepción')
      }

      const recepcionId = createdRecepcion.id

      // Close reception immediately
      const closeResponse = await post(`/api/compras/recepciones/${recepcionId}/cerrar`, {
        observaciones: 'Recepción cerrada automáticamente'
      })

      const closedRecepcion = closeResponse?.data ?? closeResponse
      const closeSucceeded = closeResponse?.success !== false && Boolean(closedRecepcion?.id)

      if (!closeSucceeded) {
        throw new Error(closeResponse?.message || 'Error al cerrar la recepción')
      }

      toast({
        title: 'Recepción completada',
        description: 'Se actualizaron el cumplimiento y el stock físico aplicable. La cuenta por pagar se crea al registrar la factura del proveedor.',
      })
      onComplete()
    } catch (error: any) {
      console.error('Error submitting recepcion:', error)
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo completar la recepción' })
    } finally {
      setSubmitting(false)
    }
  }

  const getTotalItems = () => items.reduce((sum, item) => sum + item.cantidad_recibir, 0)

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
      <div className="flex min-h-48 items-center justify-center">
        <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
        <p>Cargando orden de compra...</p>
      </div>
    )
  }

  if (!orden) {
    return (
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl px-8 py-12 text-center">
        <AlertCircle size={48} className="mx-auto mb-4 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          Orden no encontrada
        </h3>
        <p className="mb-6 text-muted-foreground">
          No se pudo cargar la orden de compra
        </p>
        <button onClick={onCancel} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50">
          Volver
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Progress Steps */}
      <div className="mb-8 flex items-center justify-center gap-4 rounded-xl bg-card p-6 shadow-sm">
        {[
          { num: 1, label: 'Cantidades' },
          { num: 2, label: 'Calidad' },
          { num: 3, label: 'Almacén/Lotes' },
          { num: 4, label: 'Confirmar' }
        ].map((step, idx) => (
          <div key={step.num} className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-2">
              <div className={cn(
                'flex size-10 items-center justify-center rounded-full text-base font-semibold transition',
                currentStep >= step.num ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground'
              )}>
                {currentStep > step.num ? <Check size={20} /> : step.num}
              </div>
              <span className={cn(
                'text-sm',
                currentStep === step.num ? 'font-semibold' : 'font-normal',
                currentStep >= step.num ? 'text-primary' : 'text-muted-foreground'
              )}>
                {step.label}
              </span>
            </div>
            {idx < 3 && (
              <div className={cn('h-0.5 w-16 transition', currentStep > step.num ? 'bg-blue-600' : 'bg-muted')} />
            )}
          </div>
        ))}
      </div>

      {/* Order Info */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              {orden.numero}
            </h3>
            <p className="text-sm text-muted-foreground">
              {orden.proveedor?.razon_social || 'Proveedor N/A'} - Documento fiscal: {orden.proveedor?.ruc || '-'}
            </p>
          </div>
          <div className="rounded-md bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
            {items.length} productos pendientes
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
        {currentStep === 1 && (
          <div>
            <div className="mb-6 flex items-center justify-between gap-4">
              <h3 className="text-base font-semibold text-foreground">
                Ingrese las cantidades recibidas
              </h3>
              <button
                onClick={() => setScannerMode(!scannerMode)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition',
                  scannerMode ? 'border-2 border-blue-600 bg-primary/10 text-primary' : 'border-border bg-card text-foreground/85'
                )}
              >
                <Scan size={16} />
                {scannerMode ? 'Modo Scanner Activo' : 'Activar Scanner'}
              </button>
            </div>

            {scannerMode && (
              <div className="mb-4 flex items-center gap-3 rounded-lg border-2 border-blue-600 bg-primary/10 p-4">
                <Scan size={20} className="text-primary" />
                <div>
                  <div className="text-sm font-semibold text-primary">
                    Modo Scanner Activo
                  </div>
                  <div className="text-xs text-primary">
                    Escanee los códigos de barras de los productos. Cada escaneo incrementará la cantidad en 1.
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4">
              {items.map((item, index) => {
                const maxCantidad = item.cantidad_pedida - item.cantidad_recibida_anterior
                const pendiente = maxCantidad - item.cantidad_recibir

                return (
                  <div
                    key={item.detalle_id}
                    id={`item-${index}`}
                    className={cn(
                      panelClass,
                      'rounded-lg p-4 transition',
                      flashItemIndex === index && 'bg-blue-600 text-white'
                    )}
                  >
                    <div className="grid items-center gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr]">
                      {/* Product Info */}
                      <div>
                        <div className="mb-1 text-sm font-semibold">
                          {item.producto_nombre}
                        </div>
                        <div className={cn('font-mono text-xs', flashItemIndex === index ? 'text-primary dark:text-blue-200' : 'text-muted-foreground')}>
                          Código: {item.producto_codigo}
                        </div>
                        {item.cantidad_recibida_anterior > 0 && (
                          <div className={cn('mt-1 text-xs', flashItemIndex === index ? 'text-primary dark:text-blue-200' : 'text-primary')}>
                            Ya recibido: {item.cantidad_recibida_anterior} de {item.cantidad_pedida}
                          </div>
                        )}
                      </div>

                      {/* Pedido */}
                      <div className="text-center">
                        <div className={cn('mb-1 text-xs', flashItemIndex === index ? 'text-primary dark:text-blue-200' : 'text-muted-foreground')}>
                          Pedido
                        </div>
                        <div className={cn('text-xl font-bold', flashItemIndex === index ? 'text-white' : 'text-foreground/85')}>
                          {item.cantidad_pedida}
                        </div>
                      </div>

                      {/* Quantity Input */}
                      <div>
                        <div className={cn('mb-2 text-center text-xs', flashItemIndex === index ? 'text-primary dark:text-blue-200' : 'text-muted-foreground')}>
                          Recibir ahora
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateItemQuantity(index, item.cantidad_recibir - 1)}
                            disabled={item.cantidad_recibir === 0}
                            className="flex size-8 items-center justify-center rounded-md border border-border bg-card text-xl font-semibold text-foreground/85 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                          >
                            -
                          </button>
                          <input
                             type="number"
                             min="0"
                             step="0.01"
                             max={maxCantidad}
                             value={item.cantidad_recibir}
                             onChange={(e) => updateItemQuantity(index, Number.parseFloat(e.target.value) || 0)}
                            className="w-20 rounded-md border-2 border-blue-600 px-2 py-2 text-center text-lg font-bold text-primary outline-none focus:ring-4 focus:ring-blue-100"
                          />
                          <button
                            onClick={() => updateItemQuantity(index, item.cantidad_recibir + 1)}
                            disabled={item.cantidad_recibir >= maxCantidad}
                            className="flex size-8 items-center justify-center rounded-md border border-border bg-card text-xl font-semibold text-foreground/85 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Pendiente */}
                      <div className="text-center">
                        <div className={cn('mb-1 text-xs', flashItemIndex === index ? 'text-primary dark:text-blue-200' : 'text-muted-foreground')}>
                          Pendiente
                        </div>
                        <div className="text-xl font-bold text-primary">
                          {pendiente}
                        </div>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="mt-3 flex gap-2 border-t border-border pt-3">
                      <button
                        onClick={() => updateItemQuantity(index, maxCantidad)}
                        className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/85"
                      >
                        Recibir todo ({maxCantidad})
                      </button>
                      <button
                        onClick={() => updateItemQuantity(index, 0)}
                        className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/85"
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Summary */}
            <div className="mt-6 flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 p-4">
              <span className="text-sm font-semibold text-primary">
                Total de items a recibir:
              </span>
              <span className="text-2xl font-bold text-primary">
                {getTotalItems()}
              </span>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div>
            <h3 className="mb-6 text-base font-semibold text-foreground">
              Evaluación de Calidad
            </h3>

            <div className="flex flex-col gap-4">
              {items.filter(item => item.cantidad_recibir > 0).map((item, index) => {
                const originalIndex = items.findIndex(i => i.detalle_id === item.detalle_id)

                return (
                  <div
                    key={item.detalle_id}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="mb-1 text-sm font-semibold text-foreground">
                          {item.producto_nombre}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Cantidad a recibir: {item.cantidad_recibir}
                        </div>
                      </div>
                      <div className={cn(
                        'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold',
                        qualityBadgeClass[item.calidad]
                      )}>
                        {getCalidadIcon(item.calidad)}
                        {item.calidad}
                      </div>
                    </div>

                    {/* Quality Buttons */}
                    <div className="mb-4 grid gap-2 md:grid-cols-3">
                      <button
                        onClick={() => updateItemCalidad(originalIndex, 'OK')}
                        className={cn(
                          'flex items-center justify-center gap-2 rounded-md border px-3 py-3 text-sm font-semibold transition',
                          item.calidad === 'OK' ? qualityClass.OK : 'border-border bg-card text-foreground/85'
                        )}
                      >
                        <CheckCircle size={16} />
                        OK
                      </button>
                      <button
                        onClick={() => updateItemCalidad(originalIndex, 'OBSERVADO')}
                        className={cn(
                          'flex items-center justify-center gap-2 rounded-md border px-3 py-3 text-sm font-semibold transition',
                          item.calidad === 'OBSERVADO' ? qualityClass.OBSERVADO : 'border-border bg-card text-foreground/85'
                        )}
                      >
                        <AlertCircle size={16} />
                        Observado
                      </button>
                      <button
                        onClick={() => updateItemCalidad(originalIndex, 'RECHAZADO')}
                        className={cn(
                          'flex items-center justify-center gap-2 rounded-md border px-3 py-3 text-sm font-semibold transition',
                          item.calidad === 'RECHAZADO' ? qualityClass.RECHAZADO : 'border-border bg-card text-foreground/85'
                        )}
                      >
                        <XCircle size={16} />
                        Rechazado
                      </button>
                    </div>

                    {/* Observations */}
                    {(item.calidad === 'OBSERVADO' || item.calidad === 'RECHAZADO') && (
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-foreground/85">
                          Observaciones {item.calidad === 'RECHAZADO' && '(requerido)'}
                        </label>
                        <textarea
                          value={item.observaciones || ''}
                          onChange={(e) => updateItemObservaciones(originalIndex, e.target.value)}
                          placeholder="Describa el problema encontrado..."
                          rows={2}
                          className={cn(fieldClass, 'min-h-20 resize-y')}
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
            <h3 className="mb-6 text-base font-semibold text-foreground">
              Asignar destino físico cuando corresponda
            </h3>

            <div className="flex flex-col gap-4">
              {items.filter(item => item.cantidad_recibir > 0).map((item, index) => {
                const originalIndex = items.findIndex(i => i.detalle_id === item.detalle_id)
                const requiereDestinoFisico = item.controla_stock && item.calidad !== 'RECHAZADO'

                return (
                  <div
                    key={item.detalle_id}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="mb-1 text-sm font-semibold text-foreground">
                          {item.producto_nombre}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Cantidad a recibir: {item.cantidad_recibir}
                        </div>
                      </div>
                    </div>

                    {requiereDestinoFisico ? (
                      <>
                        {/* Almacen y Ubicacion */}
                        <div className="mb-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                      {/* Almacén */}
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-foreground/85">
                          Almacén <span className="text-muted-foreground">*</span>
                        </label>
                        <select
                          value={item.almacen_id || ''}
                          onChange={(e) => updateItemAlmacen(originalIndex, e.target.value)}
                          className={fieldClass}
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
                        <label className="mb-2 block text-xs font-semibold text-foreground/85">
                          Ubicación
                        </label>
                        <select
                          value={item.ubicacion_id || ''}
                          onChange={(e) => updateItemUbicacion(originalIndex, e.target.value)}
                          disabled={!item.almacen_id}
                          className={fieldClass}
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
                        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                      {/* Lote */}
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-foreground/85">
                          Número de Lote
                        </label>
                        <input
                          type="text"
                          value={item.lote || ''}
                          onChange={(e) => updateItemLote(originalIndex, e.target.value)}
                          placeholder="Ej: LOTE-2024-001"
                          className={fieldClass}
                        />
                      </div>

                      {/* Serie */}
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-foreground/85">
                          Número de Serie
                        </label>
                        <input
                          type="text"
                          value={item.serie || ''}
                          onChange={(e) => updateItemSerie(originalIndex, e.target.value)}
                          placeholder="Ej: SN-123456789"
                          className={fieldClass}
                        />
                      </div>

                      {/* Fecha Expiración */}
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-foreground/85">
                          Fecha de Expiración
                        </label>
                        <input
                          type="date"
                          value={item.fecha_expiracion || ''}
                          onChange={(e) => updateItemFechaExpiracion(originalIndex, e.target.value)}
                          className={fieldClass}
                        />
                      </div>
                        </div>

                        <div className="mt-3 rounded-md border border-blue-300 bg-primary/10 p-3 text-xs text-primary">
                          <strong>Nota:</strong> El almacén es obligatorio para este bien físico. Ubicación, lote y serie son opcionales.
                        </div>
                      </>
                    ) : (
                      <div className="rounded-md border border-cyan-300 bg-primary/10 p-3 text-sm text-primary">
                        <strong>
                          {item.calidad === 'RECHAZADO'
                            ? 'Item rechazado'
                            : item.es_servicio
                              ? 'Servicio'
                              : 'Producto sin control de stock'}:
                        </strong>{' '}
                        {item.calidad === 'RECHAZADO'
                          ? 'queda registrado para inspección, pero no cumple la orden ni crea movimiento físico.'
                          : 'cumple la orden y alimenta contabilidad, pero no requiere almacén ni crea un movimiento físico.'}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div>
            <h3 className="mb-6 text-base font-semibold text-foreground">
              Confirmar Recepción
            </h3>

            {/* Summary Cards */}
            <div className="mb-6 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              <div className="rounded-lg border border-blue-400/30 bg-blue-500/15 p-4 group-data-[erp-theme=light]/dashboard:border-blue-300 group-data-[erp-theme=light]/dashboard:bg-blue-50">
                <div className="mb-2 text-xs text-primary">
                  Total Items
                </div>
                <div className="text-3xl font-bold text-primary">
                  {getTotalItems()}
                </div>
              </div>

              <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/15 p-4 group-data-[erp-theme=light]/dashboard:border-cyan-300 group-data-[erp-theme=light]/dashboard:bg-cyan-50">
                <div className="mb-2 text-xs text-primary">
                  OK
                </div>
                <div className="text-3xl font-bold text-primary">
                  {items.filter(i => i.cantidad_recibir > 0 && i.calidad === 'OK').reduce((sum, i) => sum + i.cantidad_recibir, 0)}
                </div>
              </div>

              <div className="rounded-lg border border-border/30 bg-muted/35 p-4 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30">
                <div className="mb-2 text-xs text-foreground/80">
                  Observados
                </div>
                <div className="text-3xl font-bold text-foreground/85">
                  {items.filter(i => i.cantidad_recibir > 0 && i.calidad === 'OBSERVADO').reduce((sum, i) => sum + i.cantidad_recibir, 0)}
                </div>
              </div>

              <div className="rounded-lg border border-border/40 bg-muted/60 p-4 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted">
                <div className="mb-2 text-xs text-foreground/85">
                  Rechazados
                </div>
                <div className="text-3xl font-bold text-foreground">
                  {items.filter(i => i.cantidad_recibir > 0 && i.calidad === 'RECHAZADO').reduce((sum, i) => sum + i.cantidad_recibir, 0)}
                </div>
              </div>
            </div>

            {/* Items Detail */}
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-card/85 group-data-[erp-theme=light]/dashboard:bg-muted/30">
                    <th className="border-b border-border px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Producto
                    </th>
                    <th className="border-b border-border px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Cantidad
                    </th>
                    <th className="border-b border-border px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Calidad
                    </th>
                    <th className="border-b border-border px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Almacén/Ubicación/Lote
                    </th>
                    <th className="border-b border-border px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Observaciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.filter(item => item.cantidad_recibir > 0).map((item) => (
                    <tr key={item.detalle_id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-3">
                        <div className="text-sm font-semibold text-foreground">
                          {item.producto_nombre}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {item.producto_codigo}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-lg font-bold text-primary">
                          {item.cantidad_recibir}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold',
                          qualityBadgeClass[item.calidad]
                        )}>
                          {getCalidadIcon(item.calidad)}
                          {item.calidad}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-xs text-foreground/85">
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
                      <td className="px-3 py-3">
                        <span className="text-xs text-muted-foreground">
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
      <div className="mt-8 flex justify-between border-t border-border pt-6">
        <button
          onClick={currentStep === 1 ? onCancel : handleBack}
          disabled={submitting}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft size={16} />
          {currentStep === 1 ? 'Cancelar' : 'Anterior'}
        </button>

        {currentStep < 4 ? (
          <button
            onClick={handleNext}
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Siguiente
            <ChevronRight size={16} />
          </button>
        ) : (
          <ProtectedComponent
            modulo="compras"
            accion="create"
            recurso="recepciones"
            fallback={null}
          >
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-cyan-700 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary size-4"></div>
                  Procesando...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Completar Recepción
                </>
              )}
            </button>
          </ProtectedComponent>
        )}
      </div>
    </div>
  )
}
