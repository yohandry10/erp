'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { ArrowLeft, Package, Save } from 'lucide-react'

export default function NuevoProductoPage() {
  const router = useRouter()
  const { post } = useApi()
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    categoria: '',
    precioVenta: '',
    precioCompra: '',
    stock: '',
    stockMinimo: '',
    codigoBarras: '',
    impuesto: '18'
  })

  const validateForm = () => {
    const nextErrors: Record<string, string> = {}
    const precioVenta = Number(formData.precioVenta)
    const precioCompra = formData.precioCompra === '' ? 0 : Number(formData.precioCompra)
    const stock = formData.stock === '' ? 0 : Number(formData.stock)
    const stockMinimo = formData.stockMinimo === '' ? 0 : Number(formData.stockMinimo)
    const impuesto = formData.impuesto === '' ? 0 : Number(formData.impuesto)

    if (!formData.codigo.trim()) nextErrors.codigo = 'El código es requerido'
    if (!formData.nombre.trim()) nextErrors.nombre = 'El nombre es requerido'
    if (!formData.categoria) nextErrors.categoria = 'La categoría es requerida'
    if (!formData.precioVenta || Number.isNaN(precioVenta) || precioVenta <= 0) {
      nextErrors.precioVenta = 'El precio de venta debe ser mayor a 0'
    }
    if (Number.isNaN(precioCompra) || precioCompra < 0) {
      nextErrors.precioCompra = 'El precio de compra no puede ser negativo'
    }
    if (Number.isNaN(stock) || stock < 0) {
      nextErrors.stock = 'El stock inicial no puede ser negativo'
    }
    if (Number.isNaN(stockMinimo) || stockMinimo < 0) {
      nextErrors.stockMinimo = 'El stock mínimo no puede ser negativo'
    }
    if (Number.isNaN(impuesto) || impuesto < 0 || impuesto > 100) {
      nextErrors.impuesto = 'El impuesto debe estar entre 0 y 100'
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setSubmitError(null)
    if (!validateForm()) {
      return
    }

    setIsLoading(true)
    try {
      const response = await post('/inventario/productos', formData)
      
      if (response?.success) {
        alert('✅ Producto creado exitosamente')
        router.push('/dashboard/inventario/productos')
      } else {
        throw new Error(response?.message || 'Error al crear producto')
      }
    } catch (error: any) {
      console.error('Error:', error)
      setSubmitError(error.message || 'Error al crear producto')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
    if (submitError) setSubmitError(null)
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.push('/dashboard/inventario/productos')} className="inline-flex items-center gap-2 text-gray-500 text-[0.875rem] mb-2 border-0 cursor-pointer py-1 px-0"
          >
            <ArrowLeft size={16} />
            Volver a Productos
          </button>
          <h1 className="dashboard-title flex items-center gap-3">
            <Package size={32} />
            Nuevo Producto
          </h1>
          <p className="dashboard-subtitle">Complete la información del nuevo producto</p>
        </div>
      </div>

      <div className="text-white py-4 px-6 rounded-3 mb-8 flex items-center gap-4">
        <div className="text-8">ℹ️</div>
        <div>
          <h3 className="font-semibold mb-1">Información Importante</h3>
          <p className="text-[0.875rem] opacity-[0.95]">
            Los campos marcados con <span className="text-[#fbbf24]">*</span> son obligatorios.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {(submitError || Object.keys(errors).length > 0) && (
          <div
            role="alert" className="bg-[#fef2f2] border text-red-800 py-[0.875rem] px-4 rounded-2 mb-4 text-[0.875rem]"
          >
            {submitError || 'Revise los campos marcados antes de crear el producto.'}
          </div>
        )}
        <div className="activity-card mb-8">
          <h2 className="activity-title">Información Básica</h2>
          <div className="modal-grid">
            <div>
              <label>Código <span className="text-[var(--red-500)]">*</span></label>
              <input
                type="text"
                name="codigo"
                value={formData.codigo}
                onChange={handleChange}
                aria-invalid={Boolean(errors.codigo)}
                aria-describedby={errors.codigo ? 'producto-codigo-error' : undefined}
                placeholder="Ej: PROD001"
              />
              {errors.codigo && (
                <p id="producto-codigo-error" className="text-red-500 text-3 mt-1">
                  {errors.codigo}
                </p>
              )}
            </div>
            <div>
              <label>Código de Barras</label>
              <input
                type="text"
                name="codigoBarras"
                value={formData.codigoBarras}
                onChange={handleChange}
                placeholder="Ej: 7501234567890"
              />
            </div>
          </div>

          <div className="mt-4">
            <label>Nombre <span className="text-[var(--red-500)]">*</span></label>
            <input
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              aria-invalid={Boolean(errors.nombre)}
              aria-describedby={errors.nombre ? 'producto-nombre-error' : undefined}
              placeholder="Nombre del producto"
            />
            {errors.nombre && (
              <p id="producto-nombre-error" className="text-red-500 text-3 mt-1">
                {errors.nombre}
              </p>
            )}
          </div>

          <div className="mt-4">
            <label>Descripción</label>
            <textarea
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              rows={3}
              placeholder="Descripción detallada del producto"
            />
          </div>

          <div className="mt-4">
            <label>Categoría <span className="text-[var(--red-500)]">*</span></label>
            <select
              name="categoria"
              value={formData.categoria}
              onChange={handleChange}
              aria-invalid={Boolean(errors.categoria)}
              aria-describedby={errors.categoria ? 'producto-categoria-error' : undefined}
            >
              <option value="">Seleccione una categoría</option>
              <option value="ELECTRONICA">Electrónica</option>
              <option value="ALIMENTOS">Alimentos</option>
              <option value="ROPA">Ropa</option>
              <option value="HOGAR">Hogar</option>
              <option value="OFICINA">Oficina</option>
              <option value="OTROS">Otros</option>
            </select>
            {errors.categoria && (
              <p id="producto-categoria-error" className="text-red-500 text-3 mt-1">
                {errors.categoria}
              </p>
            )}
          </div>
        </div>

        <div className="activity-card mb-8">
          <h2 className="activity-title">Precios e Impuestos</h2>
          <div className="modal-grid">
            <div>
              <label>Precio de Compra</label>
              <input
                type="number"
                name="precioCompra"
                value={formData.precioCompra}
                onChange={handleChange}
                step="0.01"
                min="0"
                aria-invalid={Boolean(errors.precioCompra)}
                aria-describedby={errors.precioCompra ? 'producto-precio-compra-error' : undefined}
                placeholder="0.00"
              />
              {errors.precioCompra && (
                <p id="producto-precio-compra-error" className="text-red-500 text-3 mt-1">
                  {errors.precioCompra}
                </p>
              )}
            </div>
            <div>
              <label>Precio de Venta <span className="text-[var(--red-500)]">*</span></label>
              <input
                type="number"
                name="precioVenta"
                value={formData.precioVenta}
                onChange={handleChange}
                step="0.01"
                min="0"
                aria-invalid={Boolean(errors.precioVenta)}
                aria-describedby={errors.precioVenta ? 'producto-precio-venta-error' : undefined}
                placeholder="0.00"
              />
              {errors.precioVenta && (
                <p id="producto-precio-venta-error" className="text-red-500 text-3 mt-1">
                  {errors.precioVenta}
                </p>
              )}
            </div>
            <div>
              <label>Impuesto (%)</label>
              <input
                type="number"
                name="impuesto"
                value={formData.impuesto}
                onChange={handleChange}
                step="0.01"
                min="0"
                max="100"
                aria-invalid={Boolean(errors.impuesto)}
                aria-describedby={errors.impuesto ? 'producto-impuesto-error' : undefined}
                placeholder="18"
              />
              {errors.impuesto && (
                <p id="producto-impuesto-error" className="text-red-500 text-3 mt-1">
                  {errors.impuesto}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="activity-card mb-8">
          <h2 className="activity-title">Inventario</h2>
          <div className="modal-grid">
            <div>
              <label>Stock Inicial</label>
              <input
                type="number"
                name="stock"
                value={formData.stock}
                onChange={handleChange}
                min="0"
                aria-invalid={Boolean(errors.stock)}
                aria-describedby={errors.stock ? 'producto-stock-error' : undefined}
                placeholder="0"
              />
              {errors.stock && (
                <p id="producto-stock-error" className="text-red-500 text-3 mt-1">
                  {errors.stock}
                </p>
              )}
            </div>
            <div>
              <label>Stock Mínimo</label>
              <input
                type="number"
                name="stockMinimo"
                value={formData.stockMinimo}
                onChange={handleChange}
                min="0"
                aria-invalid={Boolean(errors.stockMinimo)}
                aria-describedby={errors.stockMinimo ? 'producto-stock-minimo-error' : undefined}
                placeholder="0"
              />
              {errors.stockMinimo && (
                <p id="producto-stock-minimo-error" className="text-red-500 text-3 mt-1">
                  {errors.stockMinimo}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-4 justify-end">
          <button
            type="button"
            onClick={() => router.push('/dashboard/inventario/productos')}
            className="btn btn-secondary"
            disabled={isLoading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="loading-spinner w-4 h-4"></div>
                Guardando...
              </>
            ) : (
              <>
                <Save size={20} />
                Crear Producto
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
