'use client'

import { useState, useEffect } from 'react'
import { useApiCall } from '@/hooks/use-api'
import ProductModal from '@/components/modals/ProductModal'

interface Product {
  id?: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  unidadMedida: string;
  precio: number;
  stock: number;
  stock_minimo: number;
  activo: boolean;
  proveedor: string;
  codigo_barras: string;
}

interface StockMovement {
  id: string
  productoId: string
  producto: string
  tipoMovimiento: 'ENTRADA' | 'SALIDA' | 'AJUSTE'
  cantidad: number
  motivo: string
  usuario: string
  fecha: string
}

interface InventoryStats {
  totalProductos: number
  valorInventario: number
  productosStockBajo: number
  movimientosHoy: number
}

export default function InventarioPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [stats, setStats] = useState<InventoryStats | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [filters, setFilters] = useState({
    categoria: '',
    estado: '',
    stockBajo: false
  })

  const api = useApiCall<Product[]>()
  const movementsApi = useApiCall<StockMovement[]>()
  const statsApi = useApiCall<InventoryStats>()
  const deleteApi = useApiCall<any>()

  useEffect(() => {
    loadData()
  }, [filters])

  const loadData = async () => {
    await Promise.all([
      loadProducts(),
      loadMovements(),
      loadStats()
    ])
  }

  const loadProducts = async () => {
    const queryParams = new URLSearchParams()
    if (filters.categoria) queryParams.append('categoria', filters.categoria)
    if (filters.estado) queryParams.append('estado', filters.estado)
    if (filters.stockBajo) queryParams.append('stockBajo', 'true')

    console.log('📦 Cargando productos con filtros:', filters)
    const response = await api.get(`/api/inventario/productos?${queryParams}`)
    if (response && response.success && response.data) {
      console.log('✅ Productos cargados:', response.data)
      setProducts(response.data)
    } else {
      console.log('❌ No se pudieron cargar productos:', response)
      setProducts([])
    }
  }

  const loadMovements = async () => {
    console.log('📊 Cargando movimientos de inventario...')
    const response = await movementsApi.get('/api/inventario/movimientos?limit=10')
    if (response && response.success && response.data) {
      console.log('✅ Movimientos cargados:', response.data)
      setMovements(response.data)
    } else {
      console.log('❌ No se pudieron cargar movimientos:', response)
      setMovements([])
    }
  }

  const loadStats = async () => {
    console.log('📈 Cargando estadísticas de inventario...')
    const response = await statsApi.get('/api/inventario/stats')
    if (response && response.success && response.data) {
      console.log('✅ Estadísticas cargadas:', response.data)
      setStats(response.data)
    } else {
      console.log('❌ No se pudieron cargar estadísticas:', response)
      setStats({
        totalProductos: 0,
        valorInventario: 0,
        productosStockBajo: 0,
        movimientosHoy: 0
      })
    }
  }

  const getStockStatus = (stock: number, stockMinimo: number) => {
    if (!stock || !stockMinimo) {
      return { status: 'S/D', color: '#9ca3af', bgColor: 'rgba(156, 163, 175, 0.1)' };
    }
    if (stock <= stockMinimo) {
      return { status: 'CRÍTICO', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.1)' };
    } else if (stock <= stockMinimo * 2) {
      return { status: 'BAJO', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)' }
    } else {
      return { status: 'NORMAL', color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.1)' }
    }
  }

  const getMovementColor = (tipo: string) => {
    return tipo === 'ENTRADA' 
      ? { background: '#10b981', color: 'white' }
      : { background: '#ef4444', color: 'white' }
  }

  const handleProductCreated = () => {
    loadData() // Reload all data when a new product is created
  }

  const handleDeleteProduct = async (product: Product) => {
    try {
      console.log('🗑️ Eliminando producto:', product.nombre);
      
      // Buscar el producto actual en la lista para obtener el ID
      const productData = products.find(p => p.codigo === product.codigo);
      
      if (!productData || !(productData as any).id) {
        console.error('❌ No se pudo encontrar el ID del producto');
        // Como fallback, intentar obtener el ID desde el API
        const productResponse = await api.get(`/api/inventario/productos?codigo=${encodeURIComponent(product.codigo)}`);
        
        if (!productResponse?.success || !productResponse?.data?.length) {
          console.error('❌ No se pudo encontrar el producto para eliminar');
          return;
        }

        const productId = productResponse.data[0].id;
        
        if (!productId) {
          console.error('❌ No se pudo obtener el ID del producto');
          return;
        }

        // Llamar al endpoint de eliminación
        const deleteResponse = await deleteApi.delete(`/api/inventario/productos/${productId}`);
        
        if (deleteResponse?.success) {
          console.log('✅ Producto eliminado exitosamente');
          await loadData();
        } else {
          console.error('❌ Error eliminando producto:', deleteResponse?.message);
        }
      } else {
        // Usar el ID que ya tenemos
        const productId = (productData as any).id;
        
        // Llamar al endpoint de eliminación
        const deleteResponse = await deleteApi.delete(`/api/inventario/productos/${productId}`);
        
        if (deleteResponse?.success) {
          console.log('✅ Producto eliminado exitosamente');
          await loadData();
        } else {
          console.error('❌ Error eliminando producto:', deleteResponse?.message);
        }
      }
    } catch (error) {
      console.error('❌ Error en eliminación:', error);
    }
  }

  if (api.loading && products.length === 0) {
    return (
      <div className="dashboard-container">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              border: '4px solid #f3f4f6', 
              borderTop: '4px solid #3b82f6', 
              borderRadius: '50%', 
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem'
            }}></div>
            <p>Cargando inventario...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">Gestión de Inventario</h1>
        <p className="dashboard-subtitle">Controla el stock de tus productos</p>
        <button 
          className="refresh-btn"
          onClick={() => setIsModalOpen(true)}
        >
          + Nuevo Producto
        </button>
      </div>

      {/* Quick Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>PRODUCTOS TOTALES</h3>
            <span className="stat-icon">📦</span>
          </div>
          <div className="stat-value">{stats?.totalProductos || 0}</div>
          <div className="stat-subtitle">Productos registrados</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>VALOR INVENTARIO</h3>
            <span className="stat-icon">💰</span>
          </div>
          <div className="stat-value">S/ {stats?.valorInventario?.toLocaleString() || '0'}</div>
          <div className="stat-subtitle">Valor total del stock</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>MOVIMIENTOS HOY</h3>
            <span className="stat-icon">📊</span>
          </div>
          <div className="stat-value">{stats?.movimientosHoy || 0}</div>
          <div className="stat-subtitle">Entradas y salidas</div>
        </div>

        <div className="stat-card alert">
          <div className="stat-header">
            <h3>STOCK CRÍTICO</h3>
            <span className="stat-icon">⚠️</span>
          </div>
          <div className="stat-value warning">{stats?.productosStockBajo || 0}</div>
          <div className="stat-subtitle">Productos por reponer</div>
        </div>
      </div>

      {/* Products Section */}
      <div className="activity-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 className="activity-title">Productos en Inventario</h2>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => setIsModalOpen(true)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                background: '#10b981',
                color: 'white',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.875rem'
              }}
            >
              + Nuevo Producto
            </button>
            <select 
              value={filters.categoria}
              onChange={(e) => setFilters(prev => ({ ...prev, categoria: e.target.value }))}
              style={{ 
                padding: '0.5rem 1rem', 
                borderRadius: '8px', 
                border: '1px solid #d1d5db', 
                background: 'white',
                color: '#374151'
              }}
            >
              <option value="">Todas las categorías</option>
              <option value="Tecnología">Tecnología</option>
              <option value="Oficina">Oficina</option>
              <option value="Accesorios">Accesorios</option>
              <option value="Materiales">Materiales</option>
              <option value="Herramientas">Herramientas</option>
            </select>
            
            <select 
              value={filters.estado}
              onChange={(e) => setFilters(prev => ({ ...prev, estado: e.target.value }))}
              style={{ 
                padding: '0.5rem 1rem', 
                borderRadius: '8px', 
                border: '1px solid #d1d5db', 
                background: 'white',
                color: '#374151'
              }}
            >
              <option value="">Todos los estados</option>
              <option value="ACTIVO">Activo</option>
              <option value="INACTIVO">Inactivo</option>
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#374151', fontWeight: '500' }}>
              <input
                type="checkbox"
                checked={filters.stockBajo}
                onChange={(e) => setFilters(prev => ({ ...prev, stockBajo: e.target.checked }))}
              />
              Solo stock bajo
            </label>

            <button
              onClick={loadData}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid #3b82f6',
                background: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              🔄 Actualizar
            </button>
          </div>
        </div>

        {/* Products Table */}
        <div className="activity-card">
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Código</th>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Producto</th>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Categoría</th>
                  <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600' }}>Stock</th>
                  <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600' }}>Precio</th>
                  <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600' }}>Estado</th>
                  <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(products) && products.map((product) => {
                  const stockStatus = getStockStatus(product.stock, product.stock_minimo)
                  return (
                    <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }} key={product.codigo}>
                      <td style={{ padding: '1rem', fontWeight: '600', fontFamily: 'monospace' }}>
                        {product.codigo}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div>
                          <div style={{ fontWeight: '600' }}>{product.nombre}</div>
                          <div style={{ fontSize: '0.8rem', opacity: '0.7' }}>
                            {product.proveedor} • {product.unidadMedida}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '1rem' }}>{product.categoria}</td>
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        <div style={{ fontWeight: '600' }}>{product.stock || 0}</div>
                        <div style={{ fontSize: '0.8rem', opacity: '0.7' }}>
                          Min: {product.stock_minimo}
                        </div>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>
                        S/ {(product.precio || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <span style={{ 
                          padding: '0.25rem 0.75rem', 
                          borderRadius: '9999px', 
                          fontSize: '0.8rem',
                          color: product.activo ? '#10b981' : '#f59e0b',
                          backgroundColor: product.activo ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)'
                        }}>
                          {product.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          <button 
                            onClick={() => {
                              console.log('Editando producto:', product.nombre);
                              // TODO: Abrir modal de edición con datos del producto
                            }}
                            style={{ 
                              background: '#3b82f6', 
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '0.5rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem'
                            }}
                            title="Editar producto"
                          >
                            ✏️
                          </button>
                          <button 
                            onClick={() => {
                              if (confirm(`¿Estás seguro de eliminar "${product.nombre}"?`)) {
                                handleDeleteProduct(product);
                              }
                            }}
                            style={{ 
                              background: '#ef4444', 
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '0.5rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem'
                            }}
                            title="Eliminar producto"
                            disabled={deleteApi.loading}
                          >
                            {deleteApi.loading ? '⏳' : '🗑️'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {Array.isArray(products) && products.length === 0 && !api.loading && (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
                <h3 style={{ marginBottom: '0.5rem' }}>No hay productos</h3>
                <p style={{ marginBottom: '1.5rem' }}>Comienza agregando productos a tu inventario</p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#3b82f6',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  + Crear Primer Producto
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Movements */}
      <div className="activity-section">
        <h2 className="activity-title">Movimientos Recientes</h2>
        <div className="activity-card">
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Producto</th>
                  <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600' }}>Tipo</th>
                  <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600' }}>Cantidad</th>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Motivo</th>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Usuario</th>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(movements) && movements.map((mov) => {
                  const movColor = getMovementColor(mov.tipoMovimiento)
                  return (
                    <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }} key={mov.id}>
                      <td style={{ padding: '1rem', fontWeight: '600' }}>
                        {mov.producto}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <span style={{ 
                          background: movColor.background, 
                          color: movColor.color, 
                          padding: '0.25rem 0.75rem', 
                          borderRadius: '20px', 
                          fontSize: '0.8rem',
                          fontWeight: '500'
                        }}>
                          {mov.tipoMovimiento}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>
                        {mov.tipoMovimiento === 'ENTRADA' ? '+' : '-'}{mov.cantidad}
                      </td>
                      <td style={{ padding: '1rem' }}>{mov.motivo}</td>
                      <td style={{ padding: '1rem' }}>{mov.usuario}</td>
                      <td style={{ padding: '1rem' }}>
                        {new Date(mov.fecha).toLocaleDateString('es-PE')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {movements.length === 0 && !movementsApi.loading && (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                <p>No hay movimientos recientes</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product Modal */}
      <ProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleProductCreated}
      />

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}