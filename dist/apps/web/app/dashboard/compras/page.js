'use client';
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ComprasPage;
const react_1 = require("react");
const OrdenCompraModal_1 = __importDefault(require("../../../components/modals/OrdenCompraModal"));
const use_toast_1 = require("@/components/ui/use-toast");
function ComprasPage() {
    const { toast } = (0, use_toast_1.useToast)();
    const [ordenes, setOrdenes] = (0, react_1.useState)([]);
    const [stats, setStats] = (0, react_1.useState)({
        comprasDelMes: 0,
        totalCompras: 0,
        montoTotalMes: 0,
        ordenesActivas: 0,
        proveedoresActivos: 0,
        ordenesVencidas: 0
    });
    const [proveedores, setProveedores] = (0, react_1.useState)([]);
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    const [isModalOpen, setIsModalOpen] = (0, react_1.useState)(false);
    const [selectedOrden, setSelectedOrden] = (0, react_1.useState)(null);
    const [filters, setFilters] = (0, react_1.useState)({
        estado: '',
        proveedor_id: ''
    });
    // DEBUG: Observar cambios en el estado del modal
    (0, react_1.useEffect)(() => {
        console.log('🔄 Estado del modal cambió a:', isModalOpen);
    }, [isModalOpen]);
    (0, react_1.useEffect)(() => {
        loadData();
    }, []);
    (0, react_1.useEffect)(() => {
        loadOrdenes();
    }, [filters]);
    const loadData = async () => {
        try {
            setIsLoading(true);
            await Promise.all([
                loadStats(),
                loadOrdenes(),
                loadProveedores()
            ]);
        }
        catch (error) {
            console.error('Error loading data:', error);
            toast({
                title: "Error",
                description: "Error al cargar los datos",
                variant: "destructive"
            });
        }
        finally {
            setIsLoading(false);
        }
    };
    const loadStats = async () => {
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            // Agregar timestamp para evitar caché
            const timestamp = new Date().getTime();
            console.log('📊 [Frontend] Cargando stats desde:', `${API_URL}/api/compras/stats?_t=${timestamp}`);
            const response = await fetch(`${API_URL}/api/compras/stats?_t=${timestamp}`, {
                cache: 'no-store', // Evitar caché
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });
            console.log('📊 [Frontend] Response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log('📊 [Frontend] Stats recibidas:', data);
            if (data.success && data.data) {
                setStats(data.data);
                console.log('📊 [Frontend] Stats actualizadas en estado:', data.data);
                console.log('💰 [Frontend] Monto total que debería mostrarse:', data.data.montoTotalMes);
            }
            else {
                console.error('📊 [Frontend] Error en respuesta:', data);
                toast({
                    title: "Error",
                    description: "Error al cargar estadísticas de compras",
                    variant: "destructive"
                });
            }
        }
        catch (error) {
            console.error('📊 [Frontend] Error loading stats:', error);
            toast({
                title: "Error de conexión",
                description: "No se pudo conectar con el servidor para cargar estadísticas",
                variant: "destructive"
            });
        }
    };
    const loadOrdenes = async () => {
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            const queryParams = new URLSearchParams();
            if (filters.estado)
                queryParams.append('estado', filters.estado);
            if (filters.proveedor_id)
                queryParams.append('proveedor_id', filters.proveedor_id);
            const response = await fetch(`${API_URL}/api/compras/ordenes?${queryParams.toString()}`);
            const data = await response.json();
            if (data.success) {
                setOrdenes(data.data);
            }
        }
        catch (error) {
            console.error('Error loading ordenes:', error);
        }
    };
    const loadProveedores = async () => {
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            const response = await fetch(`${API_URL}/api/compras/proveedores`);
            const data = await response.json();
            if (data.success) {
                setProveedores(data.data);
            }
        }
        catch (error) {
            console.error('Error loading proveedores:', error);
        }
    };
    const handleEditOrden = (orden) => {
        setSelectedOrden(orden);
        setIsModalOpen(true);
    };
    const handleDeleteOrden = async (id) => {
        if (!confirm('¿Está seguro que desea eliminar esta orden de compra?')) {
            return;
        }
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            const response = await fetch(`${API_URL}/api/compras/ordenes/${id}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (data.success) {
                toast({
                    title: "Éxito",
                    description: "Orden eliminada correctamente"
                });
                loadOrdenes();
                loadStats();
            }
            else {
                throw new Error(data.message || 'Error al eliminar');
            }
        }
        catch (error) {
            console.error('Error deleting orden:', error);
            toast({
                title: "Error",
                description: "Error al eliminar la orden",
                variant: "destructive"
            });
        }
    };
    const handleMarcarEntregado = async (id) => {
        if (!confirm('¿Marcar esta orden como entregada?\n\nEsto actualizará automáticamente:\n• Stock de productos\n• Registros contables\n• Cuentas por pagar')) {
            return;
        }
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            const response = await fetch(`${API_URL}/api/compras/ordenes/${id}/estado`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ estado: 'ENTREGADO' })
            });
            const result = await response.json();
            if (result.success) {
                toast({
                    title: "✅ Orden Entregada",
                    description: "🔄 Actualizaciones automáticas realizadas:\n• Stock actualizado\n• Asientos contables creados\n• Cuentas por pagar registradas",
                    duration: 6000
                });
                // Forzar actualización completa de datos
                await Promise.all([
                    loadOrdenes(),
                    loadStats()
                ]);
                // Actualizar el estado local inmediatamente para UX responsiva
                setOrdenes(prev => prev.map(orden => orden.id === id
                    ? { ...orden, estado: 'ENTREGADO' }
                    : orden));
            }
            else {
                toast({
                    title: "Error",
                    description: "Error al actualizar el estado: " + (result.message || 'Error desconocido'),
                    variant: "destructive"
                });
            }
        }
        catch (error) {
            console.error('Error updating order status:', error);
            toast({
                title: "Error",
                description: "Error al actualizar el estado de la orden",
                variant: "destructive"
            });
        }
    };
    const handleModalSuccess = async (ordenData) => {
        // Actualizar datos inmediatamente
        await Promise.all([
            loadOrdenes(),
            loadStats()
        ]);
        setSelectedOrden(null);
        // Mostrar mensaje especial si se marca como ENTREGADO
        if (ordenData?.estado === 'ENTREGADO') {
            toast({
                title: "🚚 Orden Entregada",
                description: "La orden ha sido marcada como entregada. El inventario se actualizará automáticamente.",
                duration: 5000
            });
        }
        else {
            toast({
                title: "Éxito",
                description: "Orden guardada correctamente - Estadísticas actualizadas"
            });
        }
        console.log('🔄 [Compras] Datos actualizados después de modal success');
    };
    const handleModalClose = () => {
        setIsModalOpen(false);
        setSelectedOrden(null);
    };
    const getStatusColor = (estado) => {
        switch (estado) {
            case 'PENDIENTE':
                return { background: '#f59e0b', color: 'white' };
            case 'ENTREGADO':
                return { background: '#10b981', color: 'white' };
            case 'FACTURADO':
                return { background: '#3b82f6', color: 'white' };
            case 'CANCELADO':
                return { background: '#ef4444', color: 'white' };
            default:
                return { background: '#6b7280', color: 'white' };
        }
    };
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-PE', {
            style: 'currency',
            currency: 'PEN'
        }).format(amount);
    };
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('es-PE');
    };
    if (isLoading) {
        return (<div className="dashboard-container">
        <div className="flex items-center justify-center h-64">
          <div className="text-white">Cargando...</div>
        </div>
      </div>);
    }
    return (<div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">Gestión de Compras</h1>
        <p className="dashboard-subtitle">Administra tus compras y proveedores</p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="refresh-btn" onClick={async () => {
            console.log('🔄 Refrescando datos...');
            await loadData();
            toast({
                title: "Datos actualizados",
                description: "Los datos han sido actualizados correctamente"
            });
        }} style={{ backgroundColor: '#10b981' }}>
            🔄 Actualizar
          </button>
          <button className="refresh-btn" onClick={() => {
            console.log('🔥 Botón Nueva Orden clickeado!');
            console.log('Estado actual isModalOpen:', isModalOpen);
            setIsModalOpen(true);
            console.log('Estado después setIsModalOpen(true):', true);
        }}>
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
            <select style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.1)',
            color: 'white'
        }} value={filters.estado} onChange={(e) => setFilters({ ...filters, estado: e.target.value })}>
              <option value="">Todos los estados</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="ENTREGADO">Entregado</option>
              <option value="FACTURADO">Facturado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
            
            <select style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.1)',
            color: 'white'
        }} value={filters.proveedor_id} onChange={(e) => setFilters({ ...filters, proveedor_id: e.target.value })}>
              <option value="">Todos los proveedores</option>
              {proveedores.map((proveedor) => (<option key={proveedor.id} value={proveedor.id}>
                  {proveedor.nombre}
                </option>))}
            </select>
          </div>
        </div>

        {/* Orders Table */}
        <div className="activity-card">
          {ordenes.length === 0 ? (<div className="text-center py-8">
              <p className="text-gray-500 mb-4">No hay órdenes de compra registradas</p>
              <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg" onClick={() => setIsModalOpen(true)}>
                Crear Primera Orden
              </button>
            </div>) : (<div style={{ overflow: 'auto' }}>
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
                  {ordenes.map((orden) => {
                const statusStyle = getStatusColor(orden.estado);
                const itemsCount = Array.isArray(orden.items) ? orden.items.length : 0;
                return (<tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }} key={orden.id}>
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
                            <button style={{
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        padding: '0.4rem 0.8rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                    }} onClick={() => handleEditOrden(orden)}>
                              Ver
                            </button>
                            <button style={{
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        padding: '0.4rem 0.8rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                    }} onClick={() => handleEditOrden(orden)}>
                              Editar
                            </button>
                            {/* Botón para marcar como ENTREGADO - Solo aparece si está PENDIENTE */}
                            {orden.estado === 'PENDIENTE' && (<button style={{
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
                        }} onClick={() => handleMarcarEntregado(orden.id)} title="Marcar como entregado - Actualizará automáticamente el inventario">
                                📦 Entregar
                              </button>)}
                            {/* Indicador visual si ya está entregado */}
                            {orden.estado === 'ENTREGADO' && (<span style={{
                            background: '#10b981',
                            color: 'white',
                            padding: '0.4rem 0.8rem',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                        }} title="Esta orden ya fue entregada">
                                ✅ Entregada
                              </span>)}
                            <button style={{
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        padding: '0.4rem 0.8rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                    }} onClick={() => handleDeleteOrden(orden.id)}>
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>);
            })}
                </tbody>
              </table>
            </div>)}
        </div>
      </div>

      {/* Proveedores Principales */}
      <div className="activity-section">
        <h2 className="activity-title">Proveedores Principales</h2>
        <div className="activity-card">
          {proveedores.length === 0 ? (<div className="text-center py-8">
              <p className="text-gray-500">No hay proveedores registrados</p>
            </div>) : (<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
              {proveedores.slice(0, 6).map((proveedor) => (<div key={proveedor.id} style={{
                    background: 'rgba(255,255,255,0.05)',
                    padding: '1rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                    <h3 style={{ fontWeight: '600', color: 'white' }}>{proveedor.nombre}</h3>
                    <span style={{
                    background: '#10b981',
                    color: 'white',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '12px',
                    fontSize: '0.7rem',
                    fontWeight: '600'
                }}>
                      Activo
                    </span>
                  </div>
                  <div style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '0.3rem' }}>
                    RUC: {proveedor.ruc}
                  </div>
                  <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                    {proveedor.contacto || 'Sin contacto'}
                  </div>
                </div>))}
            </div>)}
        </div>
      </div>

      {/* Modal */}
      {console.log('🚀 Rendering modal with isOpen:', isModalOpen)}
      <OrdenCompraModal_1.default isOpen={isModalOpen} onClose={handleModalClose} onSuccess={handleModalSuccess} orden={selectedOrden}/>
    </div>);
}
