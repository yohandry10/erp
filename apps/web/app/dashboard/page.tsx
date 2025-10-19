'use client'

import { useEffect, useState, useCallback } from 'react'
import { 
  Building2, 
  FileText, 
  Truck, 
  Download, 
  Package,
  ShoppingCart,
  FileSpreadsheet,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Users,
  Calendar,
  BarChart3,
  RefreshCw,
  Activity,
  Clock,
  Target
} from 'lucide-react'
import { useConfigurationStatus } from './hooks/useConfigurationStatus'
import { ConfigurationBanner } from './components/ConfigurationBanner'
import { ConfigurationModal } from './components/ConfigurationModal'
import { DashboardNotificationBanners, NotificationBell } from '@/components/notifications'

interface DashboardStats {
  totalCpe: number
  totalGre: number
  totalSire: number
  totalUsers: number
  totalInventario: number
  totalCompras: number
  totalCotizaciones: number
  ventasMes: number
  ventasHoy: number
  comprasMes: number
  valorInventario: number
  productosConStockBajo: number
  cotizacionesPendientes: number
  ordenesCompraPendientes: number
  movimientosHoy: number
  tasaConversionCotizaciones: number
  crecimientoVentas: number
  ultimaActualizacion?: string
  periodoCalculado?: {
    inicio: string
    fin: string
  }
}

interface RecentActivity {
  id: string
  type: 'CPE' | 'GRE' | 'COMPRA' | 'COTIZACION' | 'VENTA'
  description: string
  amount?: number
  date: string
  status: 'success' | 'warning' | 'error' | 'pending'
}

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [activities, setActivities] = useState<RecentActivity[]>([])
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const [showConfigModal, setShowConfigModal] = useState(false)
  const { status: configStatus, isLoading: isLoadingConfig } = useConfigurationStatus()

  // Función para obtener datos del dashboard
  const fetchDashboardData = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
      
      setError(null)
      
      console.log('📊 [Dashboard Frontend] Obteniendo datos del dashboard...')
      
      // Obtener estadísticas y actividades en paralelo
      const [statsResponse, activitiesResponse] = await Promise.all([
        fetch('http://localhost:3002/api/dashboard/stats'),
        fetch('http://localhost:3002/api/dashboard/activities')
      ])

      if (!statsResponse.ok || !activitiesResponse.ok) {
        throw new Error('Error en la respuesta del servidor')
      }

      const [statsData, activitiesData] = await Promise.all([
        statsResponse.json(),
        activitiesResponse.json()
      ])

      console.log('📊 [Dashboard Frontend] Estadísticas recibidas:', statsData.data)
      console.log('📋 [Dashboard Frontend] Actividades recibidas:', activitiesData.data)

      if (statsData.success) {
        setStats(statsData.data)
      } else {
        throw new Error(statsData.message || 'Error al obtener estadísticas')
      }

      if (activitiesData.success) {
        setActivities(activitiesData.data || [])
      } else {
        console.warn('⚠️ [Dashboard Frontend] Error al obtener actividades:', activitiesData.message)
        setActivities([])
      }

      setLastUpdate(new Date().toLocaleTimeString('es-PE'))
      console.log('✅ [Dashboard Frontend] Datos actualizados exitosamente')
      
    } catch (err) {
      console.error('❌ [Dashboard Frontend] Error cargando datos:', err)
      setError(`Error al cargar los datos: ${err instanceof Error ? err.message : 'Error desconocido'}`)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  // Cargar datos iniciales
  useEffect(() => {
    fetchDashboardData(true)
  }, [fetchDashboardData])

  // Check configuration status and show modal if incomplete
  useEffect(() => {
    if (!isLoadingConfig && configStatus && !configStatus.isComplete) {
      // Show modal after a short delay to avoid overwhelming the user
      const timer = setTimeout(() => {
        setShowConfigModal(true)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [isLoadingConfig, configStatus])

  // Configurar actualización automática cada 30 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('🔄 [Dashboard Frontend] Actualización automática...')
      fetchDashboardData(false)
    }, 30000) // 30 segundos

    return () => clearInterval(interval)
  }, [fetchDashboardData])

  // Función para refrescar manualmente
  const handleRefresh = () => {
    console.log('🔄 [Dashboard Frontend] Actualización manual solicitada')
    fetchDashboardData(false)
  }

  // Función para obtener el icono según el tipo de actividad
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'VENTA': return <DollarSign size={16} className="text-green-600" />
      case 'COMPRA': return <ShoppingCart size={16} className="text-blue-600" />
      case 'CPE': return <FileText size={16} className="text-purple-600" />
      case 'GRE': return <Truck size={16} className="text-orange-600" />
      case 'COTIZACION': return <FileSpreadsheet size={16} className="text-indigo-600" />
      default: return <Activity size={16} className="text-gray-600" />
    }
  }

  // Función para obtener el color del estado
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-600 bg-green-100'
      case 'warning': return 'text-yellow-600 bg-yellow-100'
      case 'error': return 'text-red-600 bg-red-100'
      case 'pending': return 'text-gray-600 bg-gray-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div style={{ 
          background: 'linear-gradient(135deg, #fef2f2, #fee2e2)', 
          border: '1px solid #fca5a5',
          borderRadius: '16px',
          padding: '2rem',
          textAlign: 'center',
          color: '#dc2626'
        }}>
          <AlertTriangle size={48} style={{ margin: '0 auto 1rem', color: '#dc2626' }} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>Error en el Dashboard</h2>
          <p style={{ marginBottom: '1.5rem' }}>{error}</p>
          <button 
            onClick={handleRefresh} 
            className="btn btn-primary"
            disabled={isRefreshing}
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Actualizando...' : 'Reintentar'}
          </button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p style={{ color: 'var(--primary-600)', fontSize: '1.1rem', fontWeight: '500' }}>
            Cargando datos del dashboard...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Configuration Modal */}
      {configStatus && !configStatus.isComplete && (
        <ConfigurationModal
          isOpen={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          missingItems={configStatus.missingItems}
        />
      )}

      {/* Configuration Banner */}
      {configStatus && !configStatus.isComplete && (
        <ConfigurationBanner
          missingItems={configStatus.missingItems}
          completionPercentage={configStatus.completionPercentage}
        />
      )}

      {/* Notification Bell - Fixed position top right */}
      <div style={{
        position: 'fixed',
        top: '2rem',
        right: '2rem',
        zIndex: 1000
      }}>
        <NotificationBell />
      </div>

      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">
            Panel de control ejecutivo
            {lastUpdate && ` • Última actualización: ${lastUpdate}`}
          </p>
        </div>
        <button 
          className="refresh-btn" 
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
          {isRefreshing ? 'Actualizando...' : 'Actualizar datos'}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <h3>INGRESOS MENSUALES</h3>
            <DollarSign className="stat-icon" style={{ color: '#10b981' }} />
          </div>
          <div className="stat-value">
            S/ {stats?.ventasMes?.toLocaleString('es-PE', { minimumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="stat-subtitle">
            {stats?.crecimientoVentas !== undefined && stats.crecimientoVentas >= 0 ? (
              <TrendingUp size={18} style={{ color: '#10b981' }} />
            ) : (
              <TrendingDown size={18} style={{ color: '#ef4444' }} />
            )}
            {stats?.crecimientoVentas !== undefined ? `${stats.crecimientoVentas > 0 ? '+' : ''}${stats.crecimientoVentas}%` : '--'} vs mes anterior
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>INVERSIÓN EN COMPRAS</h3>
            <ShoppingCart className="stat-icon" style={{ color: '#3b82f6' }} />
          </div>
          <div className="stat-value">
            S/ {stats?.comprasMes?.toLocaleString('es-PE', { minimumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="stat-subtitle">
            <BarChart3 size={18} style={{ color: '#3b82f6' }} />
            Total del período actual
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>TASA DE CONVERSIÓN</h3>
            <Target className="stat-icon" style={{ color: '#059669' }} />
          </div>
          <div className="stat-value conversion">
            {stats?.tasaConversionCotizaciones ? `${stats.tasaConversionCotizaciones.toFixed(1)}%` : '0.0%'}
          </div>
          <div className="stat-subtitle">
            <TrendingUp size={18} style={{ color: '#10b981' }} />
            De cotizaciones a ventas
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>ALERTAS CRÍTICAS</h3>
            <AlertTriangle className="stat-icon" style={{ color: '#f59e0b' }} />
          </div>
          <div className="stat-value alerts">
            {(stats?.productosConStockBajo || 0) + (stats?.ordenesCompraPendientes || 0)}
          </div>
          <div className="stat-subtitle">
            <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
            Productos con stock bajo
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>DOCUMENTOS FISCALES</h3>
            <FileText className="stat-icon" style={{ color: '#8b5cf6' }} />
          </div>
          <div className="stat-value">
            {stats?.totalCpe || 0}
          </div>
          <div className="stat-subtitle">
            <CheckCircle size={18} style={{ color: '#10b981' }} />
            CPE emitidos este mes
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>LOGÍSTICA EMPRESARIAL</h3>
            <Truck className="stat-icon" style={{ color: '#f97316' }} />
          </div>
          <div className="stat-value">
            {stats?.totalGre || 0}
          </div>
          <div className="stat-subtitle">
            <Truck size={18} style={{ color: '#f97316' }} />
            Guías de remisión generadas
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>REPORTES TRIBUTARIOS</h3>
            <Download className="stat-icon" style={{ color: '#06b6d4' }} />
          </div>
          <div className="stat-value">
            {stats?.totalSire || 0}
          </div>
          <div className="stat-subtitle">
            <Download size={18} style={{ color: '#06b6d4' }} />
            Reportes SIRE generados
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>INVENTARIO TOTAL</h3>
            <Package className="stat-icon" style={{ color: '#84cc16' }} />
          </div>
          <div className="stat-value">
            {stats?.totalInventario || 0}
          </div>
          <div className="stat-subtitle">
            <Package size={18} style={{ color: '#84cc16' }} />
            Productos en stock
          </div>
        </div>
      </div>

      {/* Actividad Empresarial Reciente */}
      <div className="activity-section">
        <div className="activity-header">
          <h2 className="activity-title">Actividad Empresarial Reciente</h2>
          <div className="activity-meta">
            <Clock size={16} />
            Últimas 24 horas
          </div>
        </div>

        <div className="activity-content">
          {activities.length > 0 ? (
            <div className="activity-list">
              {activities.map((activity) => (
                <div key={activity.id} className="activity-item">
                  <div className="activity-icon">
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="activity-details">
                    <div className="activity-description">
                      {activity.description}
                    </div>
                    <div className="activity-meta-info">
                      <span className="activity-date">
                        {new Date(activity.date).toLocaleDateString('es-PE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      {activity.amount && (
                        <span className="activity-amount">
                          S/ {activity.amount.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={`activity-status ${getStatusColor(activity.status)}`}>
                    {activity.status === 'success' && '✓'}
                    {activity.status === 'warning' && '⚠'}
                    {activity.status === 'error' && '✗'}
                    {activity.status === 'pending' && '◐'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="activity-empty">
              <Activity size={48} style={{ color: '#94a3b8', margin: '0 auto 1rem' }} />
              <h3 style={{ color: '#64748b', marginBottom: '0.5rem' }}>No hay actividad reciente para mostrar</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                Los eventos empresariales aparecerán aquí cuando se generen
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && stats && (
        <div style={{ 
          marginTop: '2rem', 
          padding: '1rem', 
          backgroundColor: '#f8fafc', 
          borderRadius: '8px',
          fontSize: '0.875rem',
          color: '#475569'
        }}>
          <strong>Debug Info:</strong>
          <br />
          Período: {stats.periodoCalculado?.inicio} → {stats.periodoCalculado?.fin}
          <br />
          Última actualización: {stats.ultimaActualizacion ? new Date(stats.ultimaActualizacion).toLocaleString('es-PE') : 'N/A'}
          <br />
          Actividades: {activities.length} elementos
        </div>
      )}
    </div>
  )
}
