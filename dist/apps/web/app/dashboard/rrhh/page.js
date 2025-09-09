'use client';
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const link_1 = __importDefault(require("next/link"));
const EmpleadoModal_1 = __importDefault(require("@/components/modals/EmpleadoModal"));
const RrhhPage = () => {
    const [empleados, setEmpleados] = (0, react_1.useState)([]);
    const [departamentos, setDepartamentos] = (0, react_1.useState)([]);
    const [isModalOpen, setIsModalOpen] = (0, react_1.useState)(false);
    const [loading, setLoading] = (0, react_1.useState)(true);
    (0, react_1.useEffect)(() => {
        loadData();
    }, []);
    const loadData = async () => {
        try {
            setLoading(true);
            // Cargar empleados
            const empleadosResponse = await fetch('http://localhost:3001/api/rrhh/empleados', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                },
            });
            if (empleadosResponse.ok) {
                const empleadosData = await empleadosResponse.json();
                if (empleadosData && empleadosData.success && Array.isArray(empleadosData.data)) {
                    setEmpleados(empleadosData.data);
                }
                else if (Array.isArray(empleadosData)) {
                    setEmpleados(empleadosData);
                }
                else {
                    setEmpleados([]);
                }
            }
            else {
                setEmpleados([]);
            }
            // Cargar departamentos
            const departamentosResponse = await fetch('http://localhost:3001/api/rrhh/departamentos', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                },
            });
            if (departamentosResponse.ok) {
                const departamentosData = await departamentosResponse.json();
                if (departamentosData && departamentosData.success && Array.isArray(departamentosData.data)) {
                    setDepartamentos(departamentosData.data);
                }
                else if (Array.isArray(departamentosData)) {
                    setDepartamentos(departamentosData);
                }
                else {
                    setDepartamentos([]);
                }
            }
            else {
                setDepartamentos([]);
            }
        }
        catch (error) {
            console.error('Error cargando datos:', error);
            setEmpleados([]);
            setDepartamentos([]);
        }
        finally {
            setLoading(false);
        }
    };
    const handleCreateEmpleado = async (empleadoData) => {
        try {
            const response = await fetch('/api/rrhh/empleados', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify(empleadoData),
            });
            if (response.ok) {
                setIsModalOpen(false);
                loadData(); // Recargar la lista
            }
            else {
                throw new Error('Error al crear empleado');
            }
        }
        catch (error) {
            console.error('Error:', error);
        }
    };
    const formatDate = (dateString) => {
        if (!dateString)
            return 'N/A';
        return new Date(dateString).toLocaleDateString('es-PE');
    };
    if (loading) {
        return (<div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando datos de RRHH...</p>
        </div>
      </div>);
    }
    return (<div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Recursos Humanos</h1>
          <p className="dashboard-subtitle">Gestión de empleados, contratos y planillas</p>
        </div>
        <button className="refresh-btn" onClick={() => setIsModalOpen(true)}>
          <span>👤</span>
          Agregar Empleado
        </button>
      </div>

      {/* Navegación de módulos RRHH */}
      <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1.5rem',
            marginBottom: '2rem'
        }}>
        <link_1.default href="/dashboard/rrhh/planillas" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%)',
            border: '2px solid rgba(16, 185, 129, 0.2)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '1.5rem',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
            e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.2)';
        }}>
            <div style={{ fontSize: '2.5rem' }}>💰</div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: 'var(--emerald-700)' }}>
                Planillas
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--primary-600)' }}>
                Cálculo de sueldos y beneficios
              </p>
            </div>
          </div>
        </link_1.default>

        <link_1.default href="/dashboard/rrhh/asistencia" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.05) 100%)',
            border: '2px solid rgba(59, 130, 246, 0.2)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '1.5rem',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
            e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.2)';
        }}>
            <div style={{ fontSize: '2.5rem' }}>⏰</div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: 'var(--blue-700)' }}>
                Asistencia
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--primary-600)' }}>
                Control de horarios y marcado
              </p>
            </div>
          </div>
        </link_1.default>

        <link_1.default href="/dashboard/rrhh/contratos" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.05) 100%)',
            border: '2px solid rgba(245, 158, 11, 0.2)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '1.5rem',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
            e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.4)';
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.2)';
        }}>
            <div style={{ fontSize: '2.5rem' }}>📄</div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: 'var(--amber-700)' }}>
                Contratos
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--primary-600)' }}>
                Gestión de contratos laborales
              </p>
            </div>
          </div>
        </link_1.default>

        <link_1.default href="/dashboard/rrhh/candidatos" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(147, 51, 234, 0.05) 100%)',
            border: '2px solid rgba(168, 85, 247, 0.2)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '1.5rem',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.4)';
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.2)';
        }}>
            <div style={{ fontSize: '2.5rem' }}>📋</div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: 'var(--purple-700)' }}>
                CVs & Candidatos
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--primary-600)' }}>
                Reclutamiento y selección
              </p>
            </div>
          </div>
        </link_1.default>

        <link_1.default href="/dashboard/rrhh/pagos" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(22, 163, 74, 0.05) 100%)',
            border: '2px solid rgba(34, 197, 94, 0.2)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '1.5rem',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
            e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.4)';
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.2)';
        }}>
            <div style={{ fontSize: '2.5rem' }}>💳</div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: 'var(--green-700)' }}>
                Pagos & Comprobantes
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--primary-600)' }}>
                Control de pagos mensuales
              </p>
            </div>
          </div>
        </link_1.default>

        <link_1.default href="/dashboard/rrhh/reportes" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%)',
            border: '2px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '1.5rem',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
        }}>
            <div style={{ fontSize: '2.5rem' }}>📊</div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: 'var(--red-700)' }}>
                Reportes RRHH
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--primary-600)' }}>
                Análisis y estadísticas
              </p>
            </div>
          </div>
        </link_1.default>
      </div>

      {/* Estadísticas */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <h3>Total Empleados</h3>
            <div className="stat-icon">👥</div>
          </div>
          <div className="stat-value text-blue-600">{Array.isArray(empleados) ? empleados.length : 0}</div>
          <div className="stat-subtitle">Personal registrado</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Empleados Activos</h3>
            <div className="stat-icon">✅</div>
          </div>
          <div className="stat-value text-green-600">
            {Array.isArray(empleados) ? empleados.filter((emp) => emp?.estado === 'activo').length : 0}
          </div>
          <div className="stat-subtitle">Personal en actividad</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Departamentos</h3>
            <div className="stat-icon">🏢</div>
          </div>
          <div className="stat-value text-purple-600">{Array.isArray(departamentos) ? departamentos.length : 0}</div>
          <div className="stat-subtitle">Áreas organizacionales</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Nuevos Ingresos</h3>
            <div className="stat-icon">📈</div>
          </div>
          <div className="stat-value text-indigo-600">
            {Array.isArray(empleados) ? empleados.filter((emp) => {
            if (!emp?.fecha_ingreso)
                return false;
            const fechaIngreso = new Date(emp.fecha_ingreso);
            const haceUnMes = new Date();
            haceUnMes.setMonth(haceUnMes.getMonth() - 1);
            return fechaIngreso > haceUnMes;
        }).length : 0}
          </div>
          <div className="stat-subtitle">Último mes</div>
        </div>
      </div>

      {/* Sección de Empleados */}
      <div className="activity-section">
        <div className="activity-header">
          <h2 className="activity-title">Lista de Empleados</h2>
          <div className="activity-meta">
            <span>Última actualización: {new Date().toLocaleString('es-PE')}</span>
          </div>
        </div>

        <div className="activity-card">
          {!Array.isArray(empleados) || empleados.length === 0 ? (<div className="activity-empty">
              <h3>No hay empleados registrados</h3>
              <p>Comienza agregando el primer empleado al sistema</p>
              <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                Agregar Primer Empleado
              </button>
            </div>) : (<div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Nombre Completo</th>
                    <th>Documento</th>
                    <th>Email</th>
                    <th>Puesto</th>
                    <th>Departamento</th>
                    <th>Fecha Ingreso</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {empleados.map((empleado) => (<tr key={empleado.id}>
                      <td>
                        <strong>{empleado.nombres} {empleado.apellidos}</strong>
                      </td>
                      <td>
                        <span>{empleado.tipo_documento}: {empleado.numero_documento}</span>
                      </td>
                      <td>
                        {empleado.email ? (<a href={`mailto:${empleado.email}`} style={{ color: 'var(--blue-600)' }}>
                            {empleado.email}
                          </a>) : (<span style={{ color: 'var(--primary-400)' }}>Sin email</span>)}
                      </td>
                      <td>
                        <span>{empleado.puesto || 'Sin asignar'}</span>
                      </td>
                      <td>
                        <span>{empleado.departamentos?.nombre || 'Sin departamento'}</span>
                      </td>
                      <td>
                        <span>{formatDate(empleado.fecha_ingreso)}</span>
                      </td>
                      <td>
                        <span className={empleado.estado === 'activo' ? 'status-success' : 'status-error'}>
                          {empleado.estado}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn-icon" title="Ver empleado" onClick={() => {
                    const detalles = `
INFORMACIÓN DEL EMPLEADO
Nombre: ${empleado.nombres} ${empleado.apellidos}
Documento: ${empleado.tipo_documento} ${empleado.numero_documento}
Email: ${empleado.email || 'No registrado'}
Teléfono: ${empleado.telefono || 'No registrado'}
Puesto: ${empleado.puesto || 'Sin asignar'}
Departamento: ${empleado.departamentos?.nombre || 'Sin departamento'}
Fecha Ingreso: ${formatDate(empleado.fecha_ingreso)}
Salario: S/ ${empleado.salario?.toLocaleString() || '0'}
Estado: ${empleado.estado}
Dirección: ${empleado.direccion || 'No registrada'}
                              `;
                    alert(detalles);
                }}>
                            👁️
                          </button>
                          <button className="btn-icon" title="Editar empleado" onClick={() => {
                    // Aquí abrirías el modal de edición
                    console.log('Editando empleado:', empleado.id);
                    alert('Función de edición en desarrollo. Use el modal principal por ahora.');
                }}>
                            ✏️
                          </button>
                          <button className="btn-icon-danger" title="Eliminar empleado" onClick={async () => {
                    if (confirm(`¿Está seguro de eliminar a ${empleado.nombres} ${empleado.apellidos}?`)) {
                        try {
                            const response = await fetch(`http://localhost:3001/api/rrhh/empleados/${empleado.id}`, {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                                },
                            });
                            if (response.ok) {
                                loadData(); // Recargar la lista
                                alert('Empleado eliminado exitosamente');
                            }
                            else {
                                throw new Error('Error al eliminar empleado');
                            }
                        }
                        catch (error) {
                            console.error('Error:', error);
                            alert('Error al eliminar empleado');
                        }
                    }
                }}>
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>)}
        </div>
      </div>

      {/* Modal para agregar empleado */}
      <EmpleadoModal_1.default isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleCreateEmpleado} departamentos={departamentos}/>
    </div>);
};
exports.default = RrhhPage;
