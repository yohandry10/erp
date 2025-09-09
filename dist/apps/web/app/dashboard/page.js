'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Dashboard;
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
function Dashboard() {
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    const [isRefreshing, setIsRefreshing] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const [stats, setStats] = (0, react_1.useState)(null);
    const [activities, setActivities] = (0, react_1.useState)([]);
    const [lastUpdate, setLastUpdate] = (0, react_1.useState)('');
    // Función para obtener datos del dashboard
    const fetchDashboardData = (0, react_1.useCallback)(async (showLoading = false) => {
        try {
            if (showLoading) {
                setIsLoading(true);
            }
            else {
                setIsRefreshing(true);
            }
            setError(null);
            console.log('📊 [Dashboard Frontend] Obteniendo datos del dashboard...');
            // Obtener estadísticas y actividades en paralelo
            const [statsResponse, activitiesResponse] = await Promise.all([
                fetch('http://localhost:3001/api/dashboard/stats'),
                fetch('http://localhost:3001/api/dashboard/activities')
            ]);
            if (!statsResponse.ok || !activitiesResponse.ok) {
                throw new Error('Error en la respuesta del servidor');
            }
            const [statsData, activitiesData] = await Promise.all([
                statsResponse.json(),
                activitiesResponse.json()
            ]);
            console.log('📊 [Dashboard Frontend] Estadísticas recibidas:', statsData.data);
            console.log('📋 [Dashboard Frontend] Actividades recibidas:', activitiesData.data);
            if (statsData.success) {
                setStats(statsData.data);
            }
            else {
                throw new Error(statsData.message || 'Error al obtener estadísticas');
            }
            if (activitiesData.success) {
                setActivities(activitiesData.data || []);
            }
            else {
                console.warn('⚠️ [Dashboard Frontend] Error al obtener actividades:', activitiesData.message);
                setActivities([]);
            }
            setLastUpdate(new Date().toLocaleTimeString('es-PE'));
            console.log('✅ [Dashboard Frontend] Datos actualizados exitosamente');
        }
        catch (err) {
            console.error('❌ [Dashboard Frontend] Error cargando datos:', err);
            setError(`Error al cargar los datos: ${err instanceof Error ? err.message : 'Error desconocido'}`);
        }
        finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);
    // Cargar datos iniciales
    (0, react_1.useEffect)(() => {
        fetchDashboardData(true);
    }, [fetchDashboardData]);
    // Configurar actualización automática cada 30 segundos
    (0, react_1.useEffect)(() => {
        const interval = setInterval(() => {
            console.log('🔄 [Dashboard Frontend] Actualización automática...');
            fetchDashboardData(false);
        }, 30000); // 30 segundos
        return () => clearInterval(interval);
    }, [fetchDashboardData]);
    // Función para refrescar manualmente
    const handleRefresh = () => {
        console.log('🔄 [Dashboard Frontend] Actualización manual solicitada');
        fetchDashboardData(false);
    };
    // Función para obtener el icono según el tipo de actividad
    const getActivityIcon = (type) => {
        switch (type) {
            case 'VENTA': return <lucide_react_1.DollarSign size={16} className="text-green-600"/>;
            case 'COMPRA': return <lucide_react_1.ShoppingCart size={16} className="text-blue-600"/>;
            case 'CPE': return <lucide_react_1.FileText size={16} className="text-purple-600"/>;
            case 'GRE': return <lucide_react_1.Truck size={16} className="text-orange-600"/>;
            case 'COTIZACION': return <lucide_react_1.FileSpreadsheet size={16} className="text-indigo-600"/>;
            default: return <lucide_react_1.Activity size={16} className="text-gray-600"/>;
        }
    };
    // Función para obtener el color del estado
    const getStatusColor = (status) => {
        switch (status) {
            case 'success': return 'text-green-600 bg-green-100';
            case 'warning': return 'text-yellow-600 bg-yellow-100';
            case 'error': return 'text-red-600 bg-red-100';
            case 'pending': return 'text-gray-600 bg-gray-100';
            default: return 'text-gray-600 bg-gray-100';
        }
    };
    if (error) {
        return (<div className="dashboard-container">
        <div style={{
                background: 'linear-gradient(135deg, #fef2f2, #fee2e2)',
                border: '1px solid #fca5a5',
                borderRadius: '16px',
                padding: '2rem',
                textAlign: 'center',
                color: '#dc2626'
            }}>
          <lucide_react_1.AlertTriangle size={48} style={{ margin: '0 auto 1rem', color: '#dc2626' }}/>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>Error en el Dashboard</h2>
          <p style={{ marginBottom: '1.5rem' }}>{error}</p>
          <button onClick={handleRefresh} className="btn btn-primary" disabled={isRefreshing}>
            <lucide_react_1.RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''}/>
            {isRefreshing ? 'Actualizando...' : 'Reintentar'}
          </button>
        </div>
      </div>);
    }
    if (isLoading) {
        return (<div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p style={{ color: 'var(--primary-600)', fontSize: '1.1rem', fontWeight: '500' }}>
            Cargando datos del dashboard...
          </p>
        </div>
      </div>);
    }
    return (<div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">CABIMAS ERP Business Intelligence</h1>
          <p className="dashboard-subtitle">
            Panel de control ejecutivo y análisis empresarial
            {lastUpdate && ` • Última actualización: ${lastUpdate}`}
          </p>
        </div>
        <button className="refresh-btn" onClick={handleRefresh} disabled={isRefreshing}>
          <lucide_react_1.RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''}/>
          {isRefreshing ? 'Actualizando...' : 'Actualizar datos'}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <h3>INGRESOS MENSUALES</h3>
            <lucide_react_1.DollarSign className="stat-icon" style={{ color: '#10b981' }}/>
          </div>
          <div className="stat-value">
            S/ {stats?.ventasMes?.toLocaleString('es-PE', { minimumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="stat-subtitle">
            {stats?.crecimientoVentas !== undefined && stats.crecimientoVentas >= 0 ? (<lucide_react_1.TrendingUp size={18} style={{ color: '#10b981' }}/>) : (<lucide_react_1.TrendingDown size={18} style={{ color: '#ef4444' }}/>)}
            {stats?.crecimientoVentas !== undefined ? `${stats.crecimientoVentas > 0 ? '+' : ''}${stats.crecimientoVentas}%` : '--'} vs mes anterior
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>INVERSIÓN EN COMPRAS</h3>
            <lucide_react_1.ShoppingCart className="stat-icon" style={{ color: '#3b82f6' }}/>
          </div>
          <div className="stat-value">
            S/ {stats?.comprasMes?.toLocaleString('es-PE', { minimumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="stat-subtitle">
            <lucide_react_1.BarChart3 size={18} style={{ color: '#3b82f6' }}/>
            Total del período actual
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>TASA DE CONVERSIÓN</h3>
            <lucide_react_1.Target className="stat-icon" style={{ color: '#059669' }}/>
          </div>
          <div className="stat-value conversion">
            {stats?.tasaConversionCotizaciones ? `${stats.tasaConversionCotizaciones.toFixed(1)}%` : '0.0%'}
          </div>
          <div className="stat-subtitle">
            <lucide_react_1.TrendingUp size={18} style={{ color: '#10b981' }}/>
            De cotizaciones a ventas
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>ALERTAS CRÍTICAS</h3>
            <lucide_react_1.AlertTriangle className="stat-icon" style={{ color: '#f59e0b' }}/>
          </div>
          <div className="stat-value alerts">
            {(stats?.productosConStockBajo || 0) + (stats?.ordenesCompraPendientes || 0)}
          </div>
          <div className="stat-subtitle">
            <lucide_react_1.AlertTriangle size={18} style={{ color: '#f59e0b' }}/>
            Productos con stock bajo
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>DOCUMENTOS FISCALES</h3>
            <lucide_react_1.FileText className="stat-icon" style={{ color: '#8b5cf6' }}/>
          </div>
          <div className="stat-value">
            {stats?.totalCpe || 0}
          </div>
          <div className="stat-subtitle">
            <lucide_react_1.CheckCircle size={18} style={{ color: '#10b981' }}/>
            CPE emitidos este mes
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>LOGÍSTICA EMPRESARIAL</h3>
            <lucide_react_1.Truck className="stat-icon" style={{ color: '#f97316' }}/>
          </div>
          <div className="stat-value">
            {stats?.totalGre || 0}
          </div>
          <div className="stat-subtitle">
            <lucide_react_1.Truck size={18} style={{ color: '#f97316' }}/>
            Guías de remisión generadas
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>REPORTES TRIBUTARIOS</h3>
            <lucide_react_1.Download className="stat-icon" style={{ color: '#06b6d4' }}/>
          </div>
          <div className="stat-value">
            {stats?.totalSire || 0}
          </div>
          <div className="stat-subtitle">
            <lucide_react_1.Download size={18} style={{ color: '#06b6d4' }}/>
            Reportes SIRE generados
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>INVENTARIO TOTAL</h3>
            <lucide_react_1.Package className="stat-icon" style={{ color: '#84cc16' }}/>
          </div>
          <div className="stat-value">
            {stats?.totalInventario || 0}
          </div>
          <div className="stat-subtitle">
            <lucide_react_1.Package size={18} style={{ color: '#84cc16' }}/>
            Productos en stock
          </div>
        </div>
      </div>

      {/* Actividad Empresarial Reciente */}
      <div className="activity-section">
        <div className="activity-header">
          <h2 className="activity-title">Actividad Empresarial Reciente</h2>
          <div className="activity-meta">
            <lucide_react_1.Clock size={16}/>
            Últimas 24 horas
          </div>
        </div>

        <div className="activity-content">
          {activities.length > 0 ? (<div className="activity-list">
              {activities.map((activity) => (<div key={activity.id} className="activity-item">
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
                      {activity.amount && (<span className="activity-amount">
                          S/ {activity.amount.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </span>)}
                    </div>
                  </div>
                  <div className={`activity-status ${getStatusColor(activity.status)}`}>
                    {activity.status === 'success' && '✓'}
                    {activity.status === 'warning' && '⚠'}
                    {activity.status === 'error' && '✗'}
                    {activity.status === 'pending' && '◐'}
                  </div>
                </div>))}
            </div>) : (<div className="activity-empty">
              <lucide_react_1.Activity size={48} style={{ color: '#94a3b8', margin: '0 auto 1rem' }}/>
              <h3 style={{ color: '#64748b', marginBottom: '0.5rem' }}>No hay actividad reciente para mostrar</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                Los eventos empresariales aparecerán aquí cuando se generen
              </p>
            </div>)}
        </div>
      </div>

      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && stats && (<div style={{
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
        </div>)}
    </div>);
}
