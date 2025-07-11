'use client'

import { useState, useEffect } from 'react'
import OrdenCompraModal from '../../../components/modals/OrdenCompraModal'
import ProveedorModal from '../../../components/modals/ProveedorModal'
import { useToast } from '@/components/ui/use-toast'

export default function ComprasPage() {
  const { toast } = useToast()
  const [ordenes, setOrdenes] = useState([])
  const [stats, setStats] = useState({
    comprasDelMes: 0,
    totalCompras: 0,
    montoTotalMes: 0,
    ordenesActivas: 0,
    proveedoresActivos: 0,
    ordenesVencidas: 0
  })
  const [proveedores, setProveedores] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isProveedorModalOpen, setIsProveedorModalOpen] = useState(false)
  const [selectedOrden, setSelectedOrden] = useState(null)
  const [selectedProveedor, setSelectedProveedor] = useState(null)
  const [filters, setFilters] = useState({
    estado: '',
    proveedor_id: ''
  })

  // DEBUG: Observar cambios en el estado del modal
  useEffect(() => {
    console.log('🔄 Estado del modal cambió a:', isModalOpen)
  }, [isModalOpen])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    loadOrdenes()
  }, [filters])

  const loadData = async () => {
    try {
      setIsLoading(true)
      await Promise.all([
        loadStats(),
        loadOrdenes(),
        loadProveedores()
      ])
    } catch (error) {
      console.error('Error loading data:', error)
      toast({
        title: "Error",
        description: "Error al cargar los datos",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      // Agregar timestamp para evitar caché
      const timestamp = new Date().getTime()
      console.log('📊 [Frontend] Cargando stats desde:', `${API_URL}/api/compras/stats?_t=${timestamp}`)
      
      const response = await fetch(`${API_URL}/api/compras/stats?_t=${timestamp}`, {
        cache: 'no-store', // Evitar caché
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
      
      console.log('📊 [Frontend] Response status:', response.status)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      console.log('📊 [Frontend] Stats recibidas:', data)
      
      if (data.success && data.data) {
        setStats(data.data)
        console.log('📊 [Frontend] Stats actualizadas en estado:', data.data)
        console.log('💰 [Frontend] Monto total que debería mostrarse:', data.data.montoTotalMes)
      } else {
        console.error('📊 [Frontend] Error en respuesta:', data)
        toast({
          title: "Error",
          description: "Error al cargar estadísticas de compras",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('📊 [Frontend] Error loading stats:', error)
      toast({
        title: "Error de conexión",
        description: "No se pudo conectar con el servidor para cargar estadísticas",
        variant: "destructive"
      })
    }
  }

  const loadOrdenes = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const queryParams = new URLSearchParams()
      if (filters.estado) queryParams.append('estado', filters.estado)
      if (filters.proveedor_id) queryParams.append('proveedor_id', filters.proveedor_id)

      const response = await fetch(`${API_URL}/api/compras/ordenes?${queryParams.toString()}`)
      const data = await response.json()
      if (data.success) {
        setOrdenes(data.data)
      }
    } catch (error) {
      console.error('Error loading ordenes:', error)
    }
  }

  const loadProveedores = async () => {
    try {
      console.log('🔥 [COMPRAS PAGE] CARGANDO PROVEEDORES...')
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/compras/proveedores`)
      console.log('🔥 [COMPRAS PAGE] Response status:', response.status)
      
      const data = await response.json()
      console.log('🔥 [COMPRAS PAGE] Response data:', JSON.stringify(data, null, 2))
      
      if (data.success) {
        console.log('🔥 [COMPRAS PAGE] Proveedores recibidos:', data.data.length)
        setProveedores(data.data)
        console.log('🔥 [COMPRAS PAGE] Estado proveedores actualizado')
      } else {
        console.error('🔥 [COMPRAS PAGE] Error en respuesta:', data.error)
      }
    } catch (error) {
      console.error('🔥 [COMPRAS PAGE] Error loading proveedores:', error)
    }
  }

  const handleEditOrden = (orden: any) => {
    setSelectedOrden(orden)
    setIsModalOpen(true)
  }

  const handleDeleteOrden = async (id: string) => {
    if (!confirm('¿Está seguro que desea eliminar esta orden de compra?')) {
      return
    }

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/compras/ordenes/${id}`, {
        method: 'DELETE'
      })
      const data = await response.json()

      if (data.success) {
        toast({
          title: "Éxito",
          description: "Orden eliminada correctamente"
        })
        loadOrdenes()
        loadStats()
      } else {
        throw new Error(data.message || 'Error al eliminar')
      }
    } catch (error) {
      console.error('Error deleting orden:', error)
      toast({
        title: "Error",
        description: "Error al eliminar la orden",
        variant: "destructive"
      })
    }
  }

  const handleMarcarEntregado = async (id: string) => {
    if (!confirm('¿Marcar esta orden como entregada?\n\nEsto actualizará automáticamente:\n• Stock de productos\n• Registros contables\n• Cuentas por pagar')) {
      return
    }

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/compras/ordenes/${id}/estado`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ estado: 'ENTREGADO' })
      })

      const result = await response.json()

      if (result.success) {
        toast({
          title: "✅ Orden Entregada",
          description: "🔄 Actualizaciones automáticas realizadas:\n• Stock actualizado\n• Asientos contables creados\n• Cuentas por pagar registradas",
          duration: 6000
        })
        
        // Forzar actualización completa de datos
        await Promise.all([
          loadOrdenes(),
          loadStats()
        ])
        
        // Actualizar el estado local inmediatamente para UX responsiva
        setOrdenes(prev => prev.map(orden => 
          orden.id === id 
            ? { ...orden, estado: 'ENTREGADO' }
            : orden
        ))
      } else {
        toast({
          title: "Error",
          description: "Error al actualizar el estado: " + (result.message || 'Error desconocido'),
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Error updating order status:', error)
      toast({
        title: "Error",
        description: "Error al actualizar el estado de la orden",
        variant: "destructive"
      })
    }
  }

  const handleModalSuccess = async (ordenData?: any) => {
    // Actualizar datos inmediatamente
    await Promise.all([
      loadOrdenes(),
      loadStats()
    ])
    setSelectedOrden(null)
    
    // Mostrar mensaje especial si se marca como ENTREGADO
    if (ordenData?.estado === 'ENTREGADO') {
      toast({
        title: "🚚 Orden Entregada",
        description: "La orden ha sido marcada como entregada. El inventario se actualizará automáticamente.",
        duration: 5000
      })
    } else {
      toast({
        title: "Éxito",
        description: "Orden guardada correctamente - Estadísticas actualizadas"
      })
    }
    
    console.log('🔄 [Compras] Datos actualizados después de modal success')
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setSelectedOrden(null)
  }

  const handleProveedorModalClose = () => {
    setIsProveedorModalOpen(false)
    setSelectedProveedor(null)
  }

  const handleProveedorModalSuccess = async () => {
    console.log('🔥 [COMPRAS] PROVEEDOR CREADO - RECARGANDO TODO...')
    
    // RECARGAR PROVEEDORES INMEDIATAMENTE
    await loadProveedores()
    
    // RECARGAR ESTADÍSTICAS TAMBIÉN
    await loadStats()
    
    console.log('🔥 [COMPRAS] DATOS ACTUALIZADOS DESPUÉS DE CREAR PROVEEDOR')
    
    toast({
      title: "✅ Proveedor Creado", 
      description: "El proveedor se ha agregado correctamente"
    })
  }

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case 'PENDIENTE':
        return { background: '#f59e0b', color: 'white' }
      case 'ENTREGADO':
        return { background: '#10b981', color: 'white' }
      case 'FACTURADO':
        return { background: '#3b82f6', color: 'white' }
      case 'CANCELADO':
        return { background: '#ef4444', color: 'white' }
      default:
        return { background: '#6b7280', color: 'white' }
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE')
  }

  if (isLoading) {
    return (
      <div className="dashboard-container">
        <div className="flex items-center justify-center h-64">
          <div className="text-white">Cargando...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">Gestión de Compras</h1>
        <p className="dashboard-subtitle">Administra tus compras y proveedores</p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            className="refresh-btn"
            onClick={async () => {
              console.log('🔄 Refrescando datos...')
              await loadData()
              toast({
                title: "Datos actualizados",
                description: "Los datos han sido actualizados correctamente"
              })
            }}
            style={{ backgroundColor: '#10b981' }}
          >
            🔄 Actualizar
          </button>
          <button 
            className="refresh-btn"
            onClick={() => {
              console.log('🔥 Botón Nueva Orden clickeado!')
              console.log('Estado actual isModalOpen:', isModalOpen)
              setIsModalOpen(true)
              console.log('Estado después setIsModalOpen(true):', true)
            }}
          >
            + Nueva Orden
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>COMPRAS DEL MES</h3>
            <span className="stat-icon">🛒</span>
          </div>
          <div className="stat-value">{formatCurrency(stats.montoTotalMes)}</div>
          <div className="stat-subtitle">Total del mes</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>ÓRDENES ACTIVAS</h3>
            <span className="stat-icon">📋</span>
          </div>
          <div className="stat-value">{stats.ordenesActivas}</div>
          <div className="stat-subtitle">Órdenes pendientes</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>PROVEEDORES</h3>
            <span className="stat-icon">🏢</span>
          </div>
          <div className="stat-value">{stats.proveedoresActivos}</div>
          <div className="stat-subtitle">Proveedores activos</div>
        </div>

        <div className="stat-card alert">
          <div className="stat-header">
            <h3>VENCIDAS</h3>
            <span className="stat-icon">⚠️</span>
          </div>
          <div className="stat-value warning">{stats.ordenesVencidas}</div>
          <div className="stat-subtitle">Órdenes vencidas</div>
        </div>
      </div>

      {/* Purchase Orders Section */}
      <div className="activity-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 className="activity-title">Órdenes de Compra</h2>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <select 
              style={{ 
                padding: '0.5rem 1rem', 
                borderRadius: '8px', 
                border: '1px solid rgba(255,255,255,0.2)', 
                background: 'rgba(255,255,255,0.1)',
                color: 'white'
              }}
              value={filters.estado}
              onChange={(e) => setFilters({...filters, estado: e.target.value})}
            >
              <option value="">Todos los estados</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="ENTREGADO">Entregado</option>
              <option value="FACTURADO">Facturado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
            
            <select 
              style={{ 
                padding: '0.5rem 1rem', 
                borderRadius: '8px', 
                border: '1px solid rgba(255,255,255,0.2)', 
                background: 'rgba(255,255,255,0.1)',
                color: 'white'
              }}
              value={filters.proveedor_id}
              onChange={(e) => setFilters({...filters, proveedor_id: e.target.value})}
            >
              <option value="">Todos los proveedores</option>
              {proveedores.map((proveedor: any) => (
                <option key={proveedor.id} value={proveedor.id}>
                  {proveedor.razon_social || proveedor.nombre_comercial || proveedor.nombre || 'Sin nombre'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Orders Table */}
        <div className="activity-card">
          {ordenes.length === 0 ? (
            <div className="activity-empty" style={{ padding: '3rem', textAlign: 'center' }}>
              <div style={{ 
                fontSize: '4rem', 
                marginBottom: '1rem',
                filter: 'grayscale(0.3)',
                opacity: 0.6
              }}>📋</div>
              <h3 style={{ 
                fontSize: '1.5rem', 
                fontWeight: '600', 
                color: 'var(--primary-700)',
                marginBottom: '0.5rem'
              }}>
                Listo para gestionar compras
              </h3>
              <p style={{ 
                color: 'var(--primary-500)', 
                fontSize: '1rem',
                marginBottom: '0'
              }}>
                Comienza creando tu primera orden de compra
              </p>
            </div>
          ) : (
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>N° Orden</th>
                    <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Proveedor</th>
                    <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Fecha</th>
                    <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Entrega</th>
                    <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600' }}>Items</th>
                    <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600' }}>Total</th>
                    <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600' }}>Estado</th>
                    <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenes.map((orden: any) => {
                    const statusStyle = getStatusColor(orden.estado)
                    const itemsCount = Array.isArray(orden.items) ? orden.items.length : 0
                    
                    return (
                      <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }} key={orden.id}>
                        <td style={{ padding: '1rem', fontWeight: '600', fontFamily: 'monospace' }}>
                          {orden.numero}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div>
                            <div style={{ fontWeight: '600' }}>
                              {orden.proveedores?.nombre || 'N/A'}
                            </div>
                            <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                              RUC: {orden.proveedores?.ruc || 'N/A'}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          {formatDate(orden.fecha_orden)}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          {formatDate(orden.fecha_entrega)}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>
                          {itemsCount}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>
                          {formatCurrency(parseFloat(orden.total) || 0)}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <span style={{
                            ...statusStyle,
                            padding: '0.4rem 0.8rem',
                            borderRadius: '20px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            textTransform: 'uppercase'
                          }}>
                            {orden.estado}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <button 
                              style={{
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                padding: '0.4rem 0.8rem',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                cursor: 'pointer'
                              }}
                              onClick={() => handleEditOrden(orden)}
                            >
                              Ver
                            </button>
                            <button 
                              style={{
                                background: '#10b981',
                                color: 'white',
                                border: 'none',
                                padding: '0.4rem 0.8rem',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                cursor: 'pointer'
                              }}
                              onClick={() => handleEditOrden(orden)}
                            >
                              Editar
                            </button>
                            {/* Botón para marcar como ENTREGADO - Solo aparece si está PENDIENTE */}
                            {orden.estado === 'PENDIENTE' && (
                              <button 
                                style={{
                                  background: '#f59e0b',
                                  color: 'white',
                                  border: 'none',
                                  padding: '0.4rem 0.8rem',
                                  borderRadius: '4px',
                                  fontSize: '0.8rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}
                                onClick={() => handleMarcarEntregado(orden.id)}
                                title="Marcar como entregado - Actualizará automáticamente el inventario"
                              >
                                📦 Entregar
                              </button>
                            )}
                            {/* Indicador visual si ya está entregado */}
                            {orden.estado === 'ENTREGADO' && (
                              <span 
                                style={{
                                  background: '#10b981',
                                  color: 'white',
                                  padding: '0.4rem 0.8rem',
                                  borderRadius: '4px',
                                  fontSize: '0.8rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}
                                title="Esta orden ya fue entregada"
                              >
                                ✅ Entregada
                              </span>
                            )}
                            <button 
                              style={{
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                padding: '0.4rem 0.8rem',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                cursor: 'pointer'
                              }}
                              onClick={() => handleDeleteOrden(orden.id)}
                            >
                              Eliminar
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

      {/* Proveedores Principales */}
      <div className="activity-section">
        <div className="activity-header" style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
          padding: '1.5rem 2rem',
          borderRadius: 'var(--border-radius-lg)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div>
            <h2 className="activity-title" style={{ marginBottom: '0.5rem' }}>Proveedores Principales</h2>
            <p style={{ color: 'var(--primary-400)', fontSize: '0.95rem' }}>
              Gestiona tu red de proveedores estratégicos
            </p>
          </div>
          <button 
            className="refresh-btn"
            onClick={() => setIsProveedorModalOpen(true)}
            style={{
              background: 'var(--gradient-success)',
              fontSize: '0.95rem',
              padding: '0.875rem 1.5rem'
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>+</span> 
            Agregar Proveedor
          </button>
        </div>
        
        <div className="activity-card">
          {(() => {
            console.log('🔥 [PROVEEDORES RENDER] Total proveedores:', proveedores.length)
            console.log('🔥 [PROVEEDORES RENDER] Datos proveedores:', proveedores)
            return null
          })()}
          
          {proveedores.length === 0 ? (
            <div className="activity-empty" style={{ padding: '3rem', textAlign: 'center' }}>
              <div style={{ 
                fontSize: '4rem', 
                marginBottom: '1rem',
                filter: 'grayscale(0.3)',
                opacity: 0.6
              }}>🏢</div>
              <h3 style={{ 
                fontSize: '1.5rem', 
                fontWeight: '600', 
                color: 'var(--primary-700)',
                marginBottom: '0.5rem'
              }}>
                Construye tu red de proveedores
              </h3>
              <p style={{ 
                color: 'var(--primary-500)', 
                fontSize: '1rem',
                marginBottom: '1.5rem'
              }}>
                Agrega proveedores para gestionar tus compras de manera eficiente
              </p>
              <button 
                className="refresh-btn"
                onClick={() => setIsProveedorModalOpen(true)}
                style={{
                  background: 'var(--gradient-success)',
                  fontSize: '0.95rem',
                  padding: '0.875rem 1.5rem'
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>+</span> 
                Crear Primer Proveedor
              </button>
            </div>
          ) : (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
              gap: '1.5rem',
              padding: '1rem'
            }}>
              {proveedores.slice(0, 6).map((proveedor: any) => (
                <div 
                  key={proveedor.id}
                  className="stat-card"
                  style={{
                    padding: '1.5rem',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onClick={() => {
                    setSelectedProveedor(proveedor)
                    setIsProveedorModalOpen(true)
                  }}
                >
                  <div style={{ 
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '60px',
                    height: '60px',
                    background: 'linear-gradient(135deg, var(--emerald-500), var(--emerald-600))',
                    borderRadius: '0 0 0 60px',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'flex-end',
                    padding: '0.5rem',
                    opacity: 0.1
                  }}>
                    <span style={{ fontSize: '1.2rem' }}>🏢</span>
                  </div>
                  
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ 
                          fontWeight: '700', 
                          color: 'var(--primary-800)',
                          fontSize: '1.1rem',
                          marginBottom: '0.25rem',
                          lineHeight: '1.3'
                        }}>
                          {proveedor.razon_social || proveedor.nombre_comercial || proveedor.nombre || 'Sin nombre'}
                        </h3>
                        <span style={{
                          background: 'var(--gradient-success)',
                          color: 'white',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '20px',
                          fontSize: '0.7rem',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          Activo
                        </span>
                      </div>
                    </div>
                    
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        fontSize: '0.9rem', 
                        color: 'var(--primary-600)', 
                        marginBottom: '0.4rem',
                        fontWeight: '500'
                      }}>
                        <span style={{ fontSize: '1rem' }}>🆔</span>
                        RUC: {proveedor.ruc}
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        fontSize: '0.9rem', 
                        color: 'var(--primary-600)',
                        fontWeight: '400'
                      }}>
                        <span style={{ fontSize: '1rem' }}>👤</span>
                        {proveedor.contacto || proveedor.email || proveedor.telefono || 'Sin contacto'}
                      </div>
                    </div>
                    
                    <div style={{ 
                      display: 'flex', 
                      gap: '0.5rem',
                      justifyContent: 'flex-end',
                      marginTop: '1rem'
                    }}>
                      <button 
                        className="btn-icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedProveedor(proveedor)
                          setIsProveedorModalOpen(true)
                        }}
                        style={{
                          padding: '0.5rem 1rem',
                          fontSize: '0.8rem',
                          fontWeight: '600'
                        }}
                        title="Editar proveedor"
                      >
                        ✏️ Editar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {console.log('🚀 Rendering modal with isOpen:', isModalOpen)}
      <OrdenCompraModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
        orden={selectedOrden}
      />

      {/* Modal de Proveedores */}
      <ProveedorModal
        isOpen={isProveedorModalOpen}
        onClose={handleProveedorModalClose}
        onSuccess={handleProveedorModalSuccess}
        proveedor={selectedProveedor}
      />
    </div>
  )
}