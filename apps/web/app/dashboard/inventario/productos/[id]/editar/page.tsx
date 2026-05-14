'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { ArrowLeft, Package, Save } from 'lucide-react'

export default function EditarProductoPage() {
  const router = useRouter()
  const params = useParams()
  const { get, put } = useApi()
  const productoId = params.id as string | undefined
  const [isLoading, setIsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    categoria: '',
    precioVenta: '',
    precioCompra: '',
    stockMinimo: '',
    codigoBarras: '',
    impuesto: '18',
    activo: true
  })

  const loadProducto = useCallback(async () => {
    if (!productoId) return

    setLoading(true)
    try {
      const response = await get(`/inventario/productos/${productoId}`)
      if (response?.success && response.data) {
        const p = response.data
        setFormData({
          codigo: p.codigo || '',
          nombre: p.nombre || '',
          descripcion: p.descripcion || '',
          categoria: p.categoria || '',
          precioVenta: p.precio_venta?.toString() || '',
          precioCompra: p.precio_compra?.toString() || '',
          stockMinimo: p.stock_minimo?.toString() || '',
          codigoBarras: p.codigo_barras || '',
          impuesto: p.impuesto?.toString() || '18',
          activo: p.activo !== false
        })
      }
    } catch (error) {
      console.error('Error cargando producto:', error)
      alert('Error al cargar el producto')
    } finally {
      setLoading(false)
    }
  }, [get, productoId])

  useEffect(() => {
    loadProducto()
  }, [loadProducto])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.codigo || !formData.nombre || !formData.categoria) {
      alert('Por favor complete los campos obligatorios')
      return
    }

    setIsLoading(true)
    try {
      const response = await put(`/inventario/productos/${params.id}`, formData)

      if (response?.success) {
        alert('✅ Producto actualizado exitosamente')
        router.push('/dashboard/inventario/productos')
      } else {
        throw new Error(response?.message || 'Error al actualizar producto')
      }
    } catch (error: any) {
      console.error('Error:', error)
      alert(`❌ Error: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando producto...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.push('/dashboard/inventario/productos')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#6b7280',
              fontSize: '0.875rem',
              marginBottom: '0.5rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem 0'
            }}
          >
            <ArrowLeft size={16} />
            Volver a Productos
          </button>
          <h1 className="dashboard-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Package size={32} />
            Editar Producto
          </h1>
          <p className="dashboard-subtitle">Modifique la información del producto</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="activity-card" style={{ marginBottom: '2rem' }}>
          <h2 className="activity-title">Información Básica</h2>
          <div className="modal-grid">
            <div>
              <label>Código <span style={{ color: 'var(--red-500)' }}>*</span></label>
              <input
                type="text"
                name="codigo"
                value={formData.codigo}
                onChange={handleChange}
                required
                placeholder="Ej: PROD001"
              />
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

          <div style={{ marginTop: '1rem' }}>
            <label>Nombre <span style={{ color: 'var(--red-500)' }}>*</span></label>
            <input
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              required
              placeholder="Nombre del producto"
            />
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label>Descripción</label>
            <textarea
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              rows={3}
              placeholder="Descripción detallada del producto"
            />
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label>Categoría <span style={{ color: 'var(--red-500)' }}>*</span></label>
            <select
              name="categoria"
              value={formData.categoria}
              onChange={handleChange}
              required
            >
              <option value="">Seleccione una categoría</option>
              <option value="ELECTRONICA">Electrónica</option>
              <option value="ALIMENTOS">Alimentos</option>
              <option value="ROPA">Ropa</option>
              <option value="HOGAR">Hogar</option>
              <option value="OFICINA">Oficina</option>
              <option value="OTROS">Otros</option>
            </select>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                name="activo"
                checked={formData.activo}
                onChange={handleChange}
              />
              <span>Producto activo</span>
            </label>
          </div>
        </div>

        <div className="activity-card" style={{ marginBottom: '2rem' }}>
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
                placeholder="0.00"
              />
            </div>
            <div>
              <label>Precio de Venta <span style={{ color: 'var(--red-500)' }}>*</span></label>
              <input
                type="number"
                name="precioVenta"
                value={formData.precioVenta}
                onChange={handleChange}
                step="0.01"
                min="0"
                required
                placeholder="0.00"
              />
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
                placeholder="18"
              />
            </div>
          </div>
        </div>

        <div className="activity-card" style={{ marginBottom: '2rem' }}>
          <h2 className="activity-title">Inventario</h2>
          <div style={{
            background: 'var(--amber-50)',
            border: '1px solid var(--amber-200)',
            borderRadius: 'var(--border-radius)',
            padding: '1rem',
            marginBottom: '1rem'
          }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--amber-700)' }}>
              ⚠️ El stock actual no se puede modificar desde aquí. Use movimientos de inventario para ajustar el stock.
            </p>
          </div>
          <div className="modal-grid">
            <div>
              <label>Stock Mínimo</label>
              <input
                type="number"
                name="stockMinimo"
                value={formData.stockMinimo}
                onChange={handleChange}
                min="0"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
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
                <div className="loading-spinner" style={{ width: '16px', height: '16px' }}></div>
                Guardando...
              </>
            ) : (
              <>
                <Save size={20} />
                Guardar Cambios
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
