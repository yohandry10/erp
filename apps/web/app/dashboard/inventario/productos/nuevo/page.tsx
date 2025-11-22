'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { ArrowLeft, Package, Save } from 'lucide-react'

export default function NuevoProductoPage() {
  const router = useRouter()
  const { post } = useApi()
  const [isLoading, setIsLoading] = useState(false)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.codigo || !formData.nombre || !formData.categoria) {
      alert('Por favor complete los campos obligatorios')
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
      alert(`❌ Error: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
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
            Nuevo Producto
          </h1>
          <p className="dashboard-subtitle">Complete la información del nuevo producto</p>
        </div>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        color: 'white',
        padding: '1rem 1.5rem',
        borderRadius: '12px',
        marginBottom: '2rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '2rem' }}>ℹ️</div>
        <div>
          <h3 style={{ fontWeight: '600', marginBottom: '0.25rem' }}>Información Importante</h3>
          <p style={{ fontSize: '0.875rem', opacity: 0.95 }}>
            Los campos marcados con <span style={{ color: '#fbbf24' }}>*</span> son obligatorios.
          </p>
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
          <div className="modal-grid">
            <div>
              <label>Stock Inicial</label>
              <input
                type="number"
                name="stock"
                value={formData.stock}
                onChange={handleChange}
                min="0"
                placeholder="0"
              />
            </div>
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
                Crear Producto
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
