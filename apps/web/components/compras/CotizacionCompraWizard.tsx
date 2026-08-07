'use client'

import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { ChevronLeft, ChevronRight, Check, FileText, Package, Eye, Plus, Trash2, Calendar } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useTaxConfig } from '@/hooks/useTaxConfig'
import { useCountryContext } from '@/hooks/use-country-context'
import { Proveedor } from '@/types/compras'
import { cn } from '@/lib/utils'

const fieldLabelClass = 'mb-2 block text-sm font-medium text-foreground/85'
const requiredMarkClass = 'text-muted-foreground'
const fieldBaseClass = 'w-full rounded-lg border bg-card px-3 py-3 text-sm text-foreground outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60'
const fieldNormalClass = 'border-border'
const fieldErrorClass = 'border-slate-500'
const fieldErrorTextClass = 'mt-1 text-xs text-foreground/80'
const panelSoftClass = 'relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl bg-muted/30'
const tableHeadClass = 'px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground'
const tableCellClass = 'px-4 py-3 text-sm text-foreground/85'
const summaryLabelClass = 'text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground'
const summaryValueClass = 'mt-1 text-sm font-semibold text-foreground'

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
  const country = useCountryContext()
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

  const loadProveedores = useCallback(async () => {
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
  }, [get])

  const loadProductos = useCallback(async () => {
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
  }, [get])

  useEffect(() => {
    loadProveedores()
    loadProductos()
  }, [loadProductos, loadProveedores])

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
    return new Intl.NumberFormat(country.locale || 'es-PE', {
      style: 'currency',
      currency: country.moneda,
    }).format(amount)
  }

  return (
    <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
      {/* Wizard Header */}
      <div className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">
          Nueva Cotización de Compra
        </h2>

        {/* Step Indicator */}
        <div className="flex items-center gap-2">
          {[
            { num: 1, label: 'Información Básica', icon: <FileText size={16} /> },
            { num: 2, label: 'Productos', icon: <Package size={16} /> },
            { num: 3, label: 'Revisión', icon: <Eye size={16} /> }
          ].map((step, idx) => (
            <div key={step.num} className="flex flex-1 items-center gap-2">
              <div className="flex flex-1 flex-col items-center gap-1">
                <div className={cn(
                  'flex size-10 items-center justify-center rounded-full text-sm font-semibold',
                  currentStep >= step.num ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground'
                )}>
                  {currentStep > step.num ? <Check size={16} /> : step.icon}
                </div>
                <span className={cn(
                  'text-center text-xs',
                  currentStep === step.num ? 'font-semibold' : 'font-normal',
                  currentStep >= step.num ? 'text-blue-500' : 'text-muted-foreground'
                )}>
                  {step.label}
                </span>
              </div>
              {idx < 2 && (
                <div className={cn('-mt-6 h-0.5 flex-[0.5]', currentStep > step.num ? 'bg-blue-500' : 'bg-muted')} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Basic Information */}
      {currentStep === 1 && (
        <div className="min-h-[400px]">
          <h3 className="mb-6 text-lg font-semibold text-foreground">
            Información Básica
          </h3>

          <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
            <div>
              <label className={fieldLabelClass}>
                Número de Cotización <span className={requiredMarkClass}>*</span>
              </label>
              <input
                type="text"
                {...register('numero')}
                className={cn(fieldBaseClass, 'font-mono', errors.numero ? fieldErrorClass : fieldNormalClass)}
              />
              {errors.numero && (
                <p className={fieldErrorTextClass}>
                  {errors.numero.message}
                </p>
              )}
            </div>

            <div>
              <label className={fieldLabelClass}>
                Proveedor <span className={requiredMarkClass}>*</span>
              </label>
              <select
                {...register('proveedor_id')}
                className={cn(fieldBaseClass, errors.proveedor_id ? fieldErrorClass : fieldNormalClass)}
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
                <p className={fieldErrorTextClass}>
                  {errors.proveedor_id.message}
                </p>
              )}
            </div>

            <div>
              <label className={fieldLabelClass}>
                Fecha de Cotización <span className={requiredMarkClass}>*</span>
              </label>
              <input
                type="date"
                {...register('fecha_cotizacion')}
                className={cn(fieldBaseClass, errors.fecha_cotizacion ? fieldErrorClass : fieldNormalClass)}
              />
              {errors.fecha_cotizacion && (
                <p className={fieldErrorTextClass}>
                  {errors.fecha_cotizacion.message}
                </p>
              )}
            </div>

            <div>
              <label className={fieldLabelClass}>
                Días de Validez <span className={requiredMarkClass}>*</span>
              </label>
              <input
                type="number"
                {...register('validez_dias', { valueAsNumber: true })}
                className={cn(fieldBaseClass, errors.validez_dias ? fieldErrorClass : fieldNormalClass)}
              />
              {errors.validez_dias && (
                <p className={fieldErrorTextClass}>
                  {errors.validez_dias.message}
                </p>
              )}
            </div>

            <div className="col-span-full">
              <label className={fieldLabelClass}>
                Observaciones
              </label>
              <textarea
                {...register('observaciones')}
                rows={3}
                placeholder="Notas adicionales sobre la cotización..."
                className={cn(fieldBaseClass, fieldNormalClass, 'min-h-24 resize-y')}
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
      <div className="mt-8 flex justify-between gap-4 border-t border-border pt-8">
        <button
          type="button"
          onClick={currentStep === 1 ? onCancel : handleBack}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-medium text-foreground/85 transition hover:border-blue-300 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft size={16} />
          {currentStep === 1 ? 'Cancelar' : 'Anterior'}
        </button>

        {currentStep < 3 ? (
          <button
            type="button"
            onClick={handleNext}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 flex items-center gap-2 px-6 py-3"
          >
            Siguiente
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFinalSubmit}
            disabled={isLoading}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 flex items-center gap-2 px-6 py-3 disabled:cursor-not-allowed disabled:opacity-70"
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
  const country = useCountryContext()
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
    return new Intl.NumberFormat(country.locale || 'es-PE', {
      style: 'currency',
      currency: country.moneda,
    }).format(amount)
  }

  return (
    <div className="min-h-[400px]">
      <h3 className="mb-6 text-lg font-semibold text-foreground">
        Agregar Productos
      </h3>

      {/* Add Product Form */}
      <div className={cn(panelSoftClass, 'mb-6')}>
        <div className="grid items-end gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(140px,1fr)_minmax(140px,1fr)_auto]">
          <div>
            <label className={fieldLabelClass}>
              Producto
            </label>
            <select
              value={selectedProducto}
              onChange={(e) => setSelectedProducto(e.target.value)}
              disabled={loadingProductos}
              className={cn(fieldBaseClass, fieldNormalClass)}
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
            <label className={fieldLabelClass}>
              Cantidad
            </label>
            <input
              type="number"
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value))}
              min="0.01"
              step="0.01"
              className={cn(fieldBaseClass, fieldNormalClass)}
            />
          </div>

          <div>
            <label className={fieldLabelClass}>
              Precio Unit.
            </label>
            <input
              type="number"
              value={precio}
              onChange={(e) => setPrecio(Number(e.target.value))}
              min="0"
              step="0.01"
              className={cn(fieldBaseClass, fieldNormalClass)}
            />
          </div>

          <button
            type="button"
            onClick={handleAdd}
            aria-label="Agregar producto"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 flex h-12 items-center justify-center px-4"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Products List */}
      {detalles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center text-muted-foreground">
          <Package size={48} className="mx-auto mb-4 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold text-foreground/85">
            No hay productos agregados
          </h3>
          <p>Agregue al menos un producto para continuar</p>
        </div>
      ) : (
        <>
          <div className="mb-6 overflow-auto rounded-xl border border-border bg-card">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-border bg-muted/30">
                  <th className={cn(tableHeadClass, 'text-left')}>
                    Producto
                  </th>
                  <th className={cn(tableHeadClass, 'text-right')}>
                    Cantidad
                  </th>
                  <th className={cn(tableHeadClass, 'text-right')}>
                    Precio Unit.
                  </th>
                  <th className={cn(tableHeadClass, 'text-right')}>
                    Subtotal
                  </th>
                  <th className={cn(tableHeadClass, 'text-center')}>
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {detalles.map((detalle: any, index: number) => (
                  <tr key={index} className="border-b border-border last:border-b-0">
                    <td className={tableCellClass}>
                      {detalle.descripcion}
                    </td>
                    <td className={cn(tableCellClass, 'text-right')}>
                      {detalle.cantidad}
                    </td>
                    <td className={cn(tableCellClass, 'text-right')}>
                      {formatCurrency(detalle.precio_unitario)}
                    </td>
                    <td className={cn(tableCellClass, 'text-right font-semibold')}>
                      {formatCurrency(detalle.subtotal)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => onRemoveProducto(index)}
                        className="rounded-md bg-muted p-2 text-white transition hover:bg-card"
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
  const { tasaIgv, nombreImpuesto } = useTaxConfig()
  const subtotal = detalles.reduce((sum: number, d: ProductoDetalle) => sum + d.subtotal, 0)
  const igv = subtotal * tasaIgv
  const total = subtotal + igv

  return (
    <div className={panelSoftClass}>
      <div className="ml-auto max-w-md">
        <div className="flex justify-between border-b border-border py-3">
          <span className="text-sm text-muted-foreground">Subtotal:</span>
          <span className="text-sm font-semibold text-foreground/85">
            {formatCurrency(subtotal)}
          </span>
        </div>
        <div className="flex justify-between border-b border-border py-3">
          <span className="text-sm text-muted-foreground">
            {nombreImpuesto} ({Math.round(tasaIgv * 100)}%):
          </span>
          <span className="text-sm font-semibold text-foreground/85">
            {formatCurrency(igv)}
          </span>
        </div>
        <div className="flex justify-between py-4">
          <span className="text-lg font-semibold text-foreground">Total:</span>
          <span className="text-xl font-bold text-primary">
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
  )
}

// Step 3 Component: Review
function Step3Review({ formData, detalles, proveedores, calculateTotals, formatCurrency }: any) {
  const country = useCountryContext()
  const { tasaIgv, nombreImpuesto } = useTaxConfig()
  const proveedor = proveedores.find((p: Proveedor) => p.id === formData.proveedor_id)
  const { subtotal, igv, total } = calculateTotals()

  const calcularFechaVencimiento = () => {
    const fecha = new Date(formData.fecha_cotizacion)
    fecha.setDate(fecha.getDate() + formData.validez_dias)
    return fecha.toLocaleDateString(country.locale || 'es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="min-h-[400px]">
      <h3 className="mb-6 text-lg font-semibold text-foreground">
        Revisión Final
      </h3>

      {/* Basic Information Summary */}
      <div className={cn(panelSoftClass, 'mb-6')}>
        <h4 className="mb-4 text-base font-semibold text-foreground/85">
          Información Básica
        </h4>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
          <div>
            <span className={summaryLabelClass}>
              Número
            </span>
            <p className={cn(summaryValueClass, 'font-mono')}>
              {formData.numero}
            </p>
          </div>
          <div>
            <span className={summaryLabelClass}>
              Proveedor
            </span>
            <p className={summaryValueClass}>
              {proveedor?.razon_social || 'N/A'}
            </p>
            {proveedor?.ruc && (
              <p className="text-xs text-muted-foreground">
                {country.paisCodigo === 'AR' ? 'CUIT' : country.paisCodigo === 'CO' ? 'NIT' : 'RUC'}: {proveedor.ruc}
              </p>
            )}
          </div>
          <div>
            <span className={summaryLabelClass}>
              Fecha Cotización
            </span>
            <p className={summaryValueClass}>
              {new Date(formData.fecha_cotizacion).toLocaleDateString(country.locale || 'es-PE')}
            </p>
          </div>
          <div>
            <span className={summaryLabelClass}>
              Válida Hasta
            </span>
            <p className={summaryValueClass}>
              {calcularFechaVencimiento()}
            </p>
            <p className="text-xs text-muted-foreground">
              ({formData.validez_dias} días)
            </p>
          </div>
        </div>
        {formData.observaciones && (
          <div className="mt-4 border-t border-border pt-4">
            <span className={summaryLabelClass}>
              Observaciones
            </span>
            <p className="mt-1 text-sm text-foreground/85">
              {formData.observaciones}
            </p>
          </div>
        )}
      </div>

      {/* Products Summary */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-6">
        <h4 className="mb-4 text-base font-semibold text-foreground/85">
          Productos ({detalles.length})
        </h4>
        <div className="overflow-auto rounded-xl border border-border bg-card">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-border bg-muted/30">
                <th className={cn(tableHeadClass, 'text-left')}>
                  Producto
                </th>
                <th className={cn(tableHeadClass, 'text-right')}>
                  Cantidad
                </th>
                <th className={cn(tableHeadClass, 'text-right')}>
                  Precio Unit.
                </th>
                <th className={cn(tableHeadClass, 'text-right')}>
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {detalles.map((detalle: ProductoDetalle, index: number) => (
                <tr key={index} className="border-b border-border last:border-b-0">
                  <td className={tableCellClass}>
                    {detalle.descripcion}
                  </td>
                  <td className={cn(tableCellClass, 'text-right')}>
                    {detalle.cantidad}
                  </td>
                  <td className={cn(tableCellClass, 'text-right')}>
                    {formatCurrency(detalle.precio_unitario)}
                  </td>
                  <td className={cn(tableCellClass, 'text-right font-semibold')}>
                    {formatCurrency(detalle.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div className={panelSoftClass}>
        <div className="ml-auto max-w-md">
          <div className="flex justify-between border-b border-border py-3">
            <span className="text-sm text-muted-foreground">Subtotal:</span>
            <span className="text-sm font-semibold text-foreground/85">
              {formatCurrency(subtotal)}
            </span>
          </div>
          <div className="flex justify-between border-b border-border py-3">
            <span className="text-sm text-muted-foreground">
              {nombreImpuesto} ({Math.round(tasaIgv * 100)}%):
            </span>
            <span className="text-sm font-semibold text-foreground/85">
              {formatCurrency(igv)}
            </span>
          </div>
          <div className="flex justify-between py-4">
            <span className="text-lg font-semibold text-foreground">Total:</span>
            <span className="text-xl font-bold text-primary">
              {formatCurrency(total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
