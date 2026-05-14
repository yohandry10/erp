'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Package, Plus, Edit, Trash2, Search, Filter } from 'lucide-react'

type Producto = {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
  categoria?: string
  precio_venta: number
  precio_compra: number
  stock_actual: number
  stock?: number
  stock_minimo: number
  stock_reservado: number
  codigo_barras?: string
  impuesto: number
  activo: boolean
  created_at: string
  updated_at: string
}

type Filters = {
  search: string
  categoria: string
  estado: 'TODOS' | 'ACTIVO' | 'INACTIVO'
  soloCriticos: boolean
}

export default function ProductosPage() {
  const router = useRouter()
  const { get, del } = useApi()
  const [loading, setLoading] = useState(true)
  const [productos, setProductos] = useState<Producto[]>([])
  const [filters, setFilters] = useState<Filters>({
    search: '',
    categoria: '',
    estado: 'ACTIVO',
    soloCriticos: false
  })

  const loadProductos = useCallback(async () => {
    setLoading(true)
    try {
      const response = await get('/inventario/productos')
      if (response?.success && Array.isArray(response.data)) {
        setProductos(response.data)
      }
    } catch (error) {
      console.error('Error cargando productos:', error)
      alert('Error al cargar productos')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    loadProductos()
  }, [loadProductos])

  const handleDelete = async (id: string, nombre: string) => {
    if (!confirm(`¿Está seguro de eliminar el producto "${nombre}"?`)) return

    try {
      const response = await del(`/inventario/productos/${id}`)
      if (response?.success) {
        alert('✅ Producto eliminado exitosamente')
        loadProductos()
      } else {
        throw new Error(response?.message || 'Error al eliminar')
      }
    } catch (error: any) {
      console.error('Error eliminando producto:', error)
      alert(`❌ Error: ${error.message}`)
    }
  }

  const categorias = Array.from(new Set(productos.map(p => p.categoria).filter(Boolean)))

  const productosFiltrados = productos.filter(p => {
    if (filters.estado !== 'TODOS' && p.activo !== (filters.estado === 'ACTIVO')) return false
    if (filters.categoria && p.categoria !== filters.categoria) return false
    if (filters.soloCriticos && (p.stock_actual || p.stock || 0) > p.stock_minimo) return false
    if (filters.search) {
      const term = filters.search.toLowerCase()
      return p.nombre.toLowerCase().includes(term) ||
             p.codigo?.toLowerCase().includes(term) ||
             p.codigo_barras?.toLowerCase().includes(term)
    }
    return true
  })

  const stockDisponible = (p: Producto) => (p.stock_actual || p.stock || 0) - (p.stock_reservado || 0)

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Package size={32} />
            Gestión de Productos
          </h1>
          <p className="dashboard-subtitle">
            Administra el catálogo de productos del inventario
          </p>
        </div>
        <Link href="/dashboard/inventario/productos/nuevo" className="btn btn-primary">
          <Plus size={20} />
          Nuevo Producto
        </Link>
      </div>

      {/* Filtros */}
      <div className="activity-card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Filter size={20} />
          <h3 style={{ margin: 0, fontWeight: 600 }}>Filtros</h3>
        </div>
        <div className="modal-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
              <Search size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
              Buscar
            </label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              placeholder="Código, nombre o código de barras"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Categoría</label>
            <select
              value={filters.categoria}
              onChange={(e) => setFilters(prev => ({ ...prev, categoria: e.target.value }))}
              style={{ width: '100%' }}
            >
              <option value="">Todas</option>
              {categorias.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Estado</label>
            <select
              value={filters.estado}
              onChange={(e) => setFilters(prev => ({ ...prev, estado: e.target.value as any }))}
              style={{ width: '100%' }}
            >
              <option value="TODOS">Todos</option>
              <option value="ACTIVO">Activos</option>
              <option value="INACTIVO">Inactivos</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filters.soloCriticos}
                onChange={(e) => setFilters(prev => ({ ...prev, soloCriticos: e.target.checked }))}
              />
              <span style={{ fontSize: '0.875rem' }}>Solo stock crítico</span>
            </label>
          </div>
        </div>
      </div>

      {/* Tabla de productos */}
      <div className="activity-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 className="activity-title">Productos ({productosFiltrados.length})</h2>
          <button onClick={loadProductos} className="btn btn-secondary">
            Actualizar
          </button>
        </div>

        {loading ? (
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Cargando productos...</p>
          </div>
        ) : productosFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--primary-500)' }}>
            <Package size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
            <p>No se encontraron productos</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Precio Venta</th>
                  <th>Stock Actual</th>
                  <th>Stock Disponible</th>
                  <th>Stock Mínimo</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productosFiltrados.map(producto => {
                  const disponible = stockDisponible(producto)
                  const stockActual = producto.stock_actual || producto.stock || 0
                  const reservado = producto.stock_reservado || 0
                  const sinStock = disponible <= 0
                  const critico = producto.stock_minimo > 0 && disponible <= producto.stock_minimo

                  const badgeStyle = {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.35rem 0.6rem',
                    borderRadius: '999px',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    color: sinStock ? '#991b1b' : critico ? '#92400e' : '#065f46',
                    background: sinStock
                      ? 'rgba(239, 68, 68, 0.15)'
                      : critico
                        ? 'rgba(245, 158, 11, 0.15)'
                        : 'rgba(16, 185, 129, 0.12)',
                    border: `1px solid ${sinStock ? 'rgba(239, 68, 68, 0.35)' : critico ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
                  } as const

                  return (
                    <tr key={producto.id}>
                      <td>
                        <strong>{producto.codigo}</strong>
                        {producto.codigo_barras && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)' }}>
                            {producto.codigo_barras}
                          </div>
                        )}
                      </td>
                      <td>
                        <div>
                          <strong>{producto.nombre}</strong>
                          {producto.descripcion && (
                            <div style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>
                              {producto.descripcion.substring(0, 50)}
                              {producto.descripcion.length > 50 && '...'}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>{producto.categoria || '—'}</td>
                      <td>
                        S/ {Number(producto.precio_venta || 0).toFixed(2)}
                        <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)' }}>
                          Compra: S/ {Number(producto.precio_compra || 0).toFixed(2)}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <strong style={{ color: critico ? 'var(--red-600)' : 'inherit' }}>{stockActual}</strong>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={badgeStyle}>
                          {sinStock ? '⚠️ Sin stock' : critico ? '⚠️ Crítico' : '✅ Disponible'} {Number(disponible).toFixed(2)}
                        </div>
                        {reservado > 0 && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--amber-600)', marginTop: '0.15rem' }}>
                            ({reservado} reservado)
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', color: critico ? 'var(--red-600)' : 'inherit', fontWeight: critico ? 700 : 400 }}>
                        {producto.stock_minimo || '—'}
                      </td>
                      <td>
                        <span className={producto.activo ? 'status-success' : 'status-error'}>
                          {producto.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => router.push(`/dashboard/inventario/productos/${producto.id}/editar`)}
                            className="btn-icon"
                            title="Editar"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(producto.id, producto.nombre)}
                            className="btn-icon-danger"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
