'use client';
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = GREPage;
const react_1 = require("react");
const use_api_1 = require("@/hooks/use-api");
const GreModal_1 = __importDefault(require("@/components/modals/GreModal"));
const GreViewModal_1 = __importDefault(require("@/components/modals/GreViewModal"));
function GREPage() {
    const [documents, setDocuments] = (0, react_1.useState)([]);
    const [stats, setStats] = (0, react_1.useState)(null);
    const [isModalOpen, setIsModalOpen] = (0, react_1.useState)(false);
    const [isViewModalOpen, setIsViewModalOpen] = (0, react_1.useState)(false);
    const [selectedDocumentId, setSelectedDocumentId] = (0, react_1.useState)('');
    const [filters, setFilters] = (0, react_1.useState)({
        modalidad: '',
        estado: '',
        fechaDesde: '',
        fechaHasta: ''
    });
    const api = (0, use_api_1.useApiCall)();
    const statsApi = (0, use_api_1.useApiCall)();
    (0, react_1.useEffect)(() => {
        loadData();
    }, [filters]);
    const loadData = async () => {
        await Promise.all([
            loadDocuments(),
            loadStats()
        ]);
    };
    const loadDocuments = async () => {
        const queryParams = new URLSearchParams();
        if (filters.modalidad)
            queryParams.append('modalidad', filters.modalidad);
        if (filters.estado)
            queryParams.append('estado', filters.estado);
        if (filters.fechaDesde)
            queryParams.append('fechaDesde', filters.fechaDesde);
        if (filters.fechaHasta)
            queryParams.append('fechaHasta', filters.fechaHasta);
        const response = await api.get(`/api/gre/guias?${queryParams}`);
        if (response && response.success && response.data) {
            console.log('📋 GRE Data recibida:', response.data);
            setDocuments(response.data);
        }
        else {
            console.log('❌ No hay datos de GRE o respuesta incorrecta:', response);
            setDocuments([]);
        }
    };
    const loadStats = async () => {
        const response = await statsApi.get('/api/gre/stats');
        if (response && response.success && response.data) {
            console.log('📊 GRE Stats recibidas:', response.data);
            setStats(response.data);
        }
        else {
            console.log('❌ No hay estadísticas de GRE o respuesta incorrecta:', response);
            setStats({
                greEmitidas: 0,
                totalGre: 0,
                enTransito: 0,
                completados: 0
            });
        }
    };
    const generateReport = async () => {
        const data = await api.get('/api/gre/reporte');
        if (data) {
            // Create and download the report
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `reporte-gre-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }
    };
    const getStatusColor = (estado) => {
        switch (estado) {
            case 'ACEPTADO':
                return { background: '#10b981', color: 'white' };
            case 'EMITIDO':
                return { background: '#f59e0b', color: 'white' };
            case 'PENDIENTE':
                return { background: '#6b7280', color: 'white' };
            case 'RECHAZADO':
                return { background: '#ef4444', color: 'white' };
            case 'ANULADO':
                return { background: '#dc2626', color: 'white' };
            default:
                return { background: '#6b7280', color: 'white' };
        }
    };
    const getStatusText = (estado) => {
        switch (estado) {
            case 'ACEPTADO':
                return 'Aceptado';
            case 'EMITIDO':
                return 'Emitido';
            case 'PENDIENTE':
                return 'Pendiente';
            case 'RECHAZADO':
                return 'Rechazado';
            case 'ANULADO':
                return 'Anulado';
            default:
                return estado;
        }
    };
    const getModalidadText = (modalidad) => {
        return modalidad === 'TRANSPORTE_PUBLICO' ? 'Transporte Público' : 'Transporte Privado';
    };
    const handleGreCreated = () => {
        loadData(); // Reload all data when a new GRE is created
    };
    const viewDocument = (documentId) => {
        console.log(`🚚 Abriendo vista de GRE: ${documentId}`);
        setSelectedDocumentId(documentId);
        setIsViewModalOpen(true);
    };
    if (api.loading && documents.length === 0) {
        return (<div className="dashboard-container">
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
            <p>Cargando guías de remisión...</p>
          </div>
        </div>
      </div>);
    }
    return (<div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">Guías de Remisión Electrónica (GRE)</h1>
        <p className="dashboard-subtitle">Gestiona guías de remisión y transportes</p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="refresh-btn" onClick={generateReport} style={{ background: 'rgba(16, 185, 129, 0.2)', borderColor: '#10b981' }}>
            + Generar Reporte
          </button>
          <button className="refresh-btn" onClick={() => setIsModalOpen(true)}>
            + Nueva GRE
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>GRE EMITIDAS HOY</h3>
            <span className="stat-icon">🚚</span>
          </div>
          <div className="stat-value">{stats?.greEmitidas || 0}</div>
          <div className="stat-subtitle">Guías hoy</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL GRE</h3>
            <span className="stat-icon">📋</span>
          </div>
          <div className="stat-value">{stats?.totalGre || 0}</div>
          <div className="stat-subtitle">Guías del mes</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>EN TRÁNSITO</h3>
            <span className="stat-icon">🚛</span>
          </div>
          <div className="stat-value">{stats?.enTransito || 0}</div>
          <div className="stat-subtitle">Transportes activos</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>COMPLETADOS</h3>
            <span className="stat-icon">✅</span>
          </div>
          <div className="stat-value">{stats?.completados || 0}</div>
          <div className="stat-subtitle">Entregas exitosas</div>
        </div>
      </div>

      {/* Filters */}
      <div className="activity-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 className="activity-title">Lista de Guías de Remisión</h2>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <select value={filters.modalidad} onChange={(e) => setFilters(prev => ({ ...prev, modalidad: e.target.value }))} style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.1)',
            color: 'white'
        }}>
              <option value="">Todas las modalidades</option>
              <option value="TRANSPORTE_PUBLICO">Transporte Público</option>
              <option value="TRANSPORTE_PRIVADO">Transporte Privado</option>
            </select>
            
            <select value={filters.estado} onChange={(e) => setFilters(prev => ({ ...prev, estado: e.target.value }))} style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.1)',
            color: 'white'
        }}>
              <option value="">Todos los estados</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="EN_TRANSITO">En Tránsito</option>
              <option value="COMPLETADO">Completado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>

            <input type="date" value={filters.fechaDesde} onChange={(e) => setFilters(prev => ({ ...prev, fechaDesde: e.target.value }))} style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.1)',
            color: 'white'
        }}/>

            <input type="date" value={filters.fechaHasta} onChange={(e) => setFilters(prev => ({ ...prev, fechaHasta: e.target.value }))} style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.1)',
            color: 'white'
        }}/>

            <button onClick={loadData} style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            background: 'rgba(59, 130, 246, 0.1)',
            color: '#3b82f6',
            cursor: 'pointer'
        }}>
              🔄 Actualizar
            </button>
          </div>
        </div>

        {/* Documents Table */}
        <div className="activity-card">
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Serie-Número</th>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Destinatario</th>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Fecha Traslado</th>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Modalidad</th>
                  <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600' }}>Peso Total</th>
                  <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600' }}>Estado</th>
                  <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(documents) && documents.map((doc) => {
            const statusColor = getStatusColor(doc.estado);
            return (<tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }} key={doc.id}>
                      <td style={{ padding: '1rem', fontWeight: '600', fontFamily: 'monospace' }}>
                        {doc.numero}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div>
                          <div style={{ fontWeight: '600' }}>{doc.destinatario}</div>
                          <div style={{ fontSize: '0.8rem', opacity: '0.7' }}>
                            {doc.direccionDestino}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {new Date(doc.fechaTraslado).toLocaleDateString('es-PE')}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div>
                          <div>{getModalidadText(doc.modalidad)}</div>
                          {doc.transportista && (<div style={{ fontSize: '0.8rem', opacity: '0.7' }}>
                              {doc.transportista}
                            </div>)}
                          {doc.placaVehiculo && (<div style={{ fontSize: '0.8rem', opacity: '0.7' }}>
                              Placa: {doc.placaVehiculo}
                            </div>)}
                        </div>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>
                        {doc.pesoTotal} Kg
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <span style={{
                    background: statusColor.background,
                    color: statusColor.color,
                    padding: '0.25rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: '500'
                }}>
                          {getStatusText(doc.estado)}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          <button onClick={() => viewDocument(doc.id)} style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    color: '#3b82f6',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                }}>
                            Ver
                          </button>
                          <button style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    color: '#10b981',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                }}>
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>);
        })}
              </tbody>
            </table>

            {Array.isArray(documents) && documents.length === 0 && !api.loading && (<div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚚</div>
                <h3 style={{ marginBottom: '0.5rem' }}>No hay guías de remisión</h3>
                <p style={{ marginBottom: '1.5rem' }}>Comienza creando tu primera guía de remisión electrónica</p>
                <button onClick={() => setIsModalOpen(true)} style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
                fontWeight: '600'
            }}>
                  + Crear Primera GRE
                </button>
              </div>)}
          </div>
        </div>
      </div>

      {/* GRE Modal */}
      <GreModal_1.default isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={handleGreCreated}/>

      {/* GRE View Modal */}
      <GreViewModal_1.default isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} documentId={selectedDocumentId}/>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>);
}
