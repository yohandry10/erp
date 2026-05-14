'use client'

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import EmpleadoModal from '@/components/modals/EmpleadoModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useApi } from '@/hooks/use-api';

const RrhhPage = () => {
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [departamentos, setDepartamentos] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [empleadoEditando, setEmpleadoEditando] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const { get, post, put, delete: del } = useApi();

  // Estado para diálogo de confirmación
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void | Promise<void>
    variant?: 'default' | 'danger' | 'warning'
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'default'
  });

  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED === 'true';

  const loadData = useCallback(async () => {
    if (!rrhhEnabled) {
      setLoading(false);
      setEmpleados([]);
      setDepartamentos([]);
      return;
    }
    try {
      setLoading(true);
      
      // ✅ Cargar empleados usando useApi
      const empleadosData = await get('/rrhh/empleados');
      if (empleadosData && empleadosData.success && Array.isArray(empleadosData.data)) {
        setEmpleados(empleadosData.data);
      } else if (Array.isArray(empleadosData)) {
        setEmpleados(empleadosData);
      } else {
        setEmpleados([]);
      }

      // ✅ Cargar departamentos usando useApi
      const departamentosData = await get('/rrhh/departamentos');
      if (departamentosData && departamentosData.success && Array.isArray(departamentosData.data)) {
        setDepartamentos(departamentosData.data);
      } else if (Array.isArray(departamentosData)) {
        setDepartamentos(departamentosData);
      } else {
        setDepartamentos([]);
      }
      
    } catch (error) {
      console.error('Error cargando datos:', error);
      setEmpleados([]);
      setDepartamentos([]);
    } finally {
      setLoading(false);
    }
  }, [get, rrhhEnabled]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateEmpleado = () => {
    setEmpleadoEditando(null);
    setIsModalOpen(true);
  };

  const handleSubmitEmpleado = async (empleadoData: any) => {
    try {
      const response = empleadoEditando?.id
        ? await put(`/rrhh/empleados/${empleadoEditando.id}`, empleadoData)
        : await post('/rrhh/empleados', empleadoData);

      if (response) {
        setIsModalOpen(false);
        setEmpleadoEditando(null);
        loadData(); // Recargar la lista
      } else {
        throw new Error(empleadoEditando ? 'Error al actualizar empleado' : 'Error al crear empleado');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-PE');
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando datos de RRHH...</p>
        </div>
      </div>
    );
  }

  if (!rrhhEnabled) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          {/* // HARDENING: RRHH deshabilitado por feature flag. */}
          <p>El módulo de RRHH está deshabilitado en este entorno.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Recursos Humanos</h1>
          <p className="dashboard-subtitle">Gestión de empleados, contratos y planillas</p>
        </div>
        <button className="refresh-btn" onClick={openCreateEmpleado}>
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
        <Link href="/dashboard/rrhh/planillas" style={{ textDecoration: 'none' }}>
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
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
            e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.2)';
          }}
          >
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
        </Link>

        <Link href="/dashboard/rrhh/asistencia" style={{ textDecoration: 'none' }}>
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
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
            e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
          }}
          onMouseLeave={(e) => {
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
        </Link>

        <Link href="/dashboard/rrhh/contratos" style={{ textDecoration: 'none' }}>
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
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
            e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.4)';
          }}
          onMouseLeave={(e) => {
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
        </Link>

        <Link href="/dashboard/rrhh/candidatos" style={{ textDecoration: 'none' }}>
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
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.4)';
          }}
          onMouseLeave={(e) => {
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
        </Link>

        <Link href="/dashboard/rrhh/pagos" style={{ textDecoration: 'none' }}>
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
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
            e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.4)';
          }}
          onMouseLeave={(e) => {
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
        </Link>

        <Link href="/dashboard/rrhh/reportes" style={{ textDecoration: 'none' }}>
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
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
          }}
          onMouseLeave={(e) => {
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
        </Link>
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
            {Array.isArray(empleados) ? empleados.filter((emp: any) => emp?.estado === 'activo').length : 0}
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
            {Array.isArray(empleados) ? empleados.filter((emp: any) => {
              if (!emp?.fecha_ingreso) return false;
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
          {!Array.isArray(empleados) || empleados.length === 0 ? (
            <div className="activity-empty">
              <h3>No hay empleados registrados</h3>
              <p>Comienza agregando el primer empleado al sistema</p>
              <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                Agregar Primer Empleado
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
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
                  {empleados.map((empleado: any) => (
                    <tr key={empleado.id}>
                      <td>
                        <strong>{empleado.nombres} {empleado.apellidos}</strong>
                      </td>
                      <td>
                        <span>{empleado.tipo_documento}: {empleado.numero_documento}</span>
                      </td>
                      <td>
                        {empleado.email ? (
                          <a href={`mailto:${empleado.email}`} style={{ color: 'var(--blue-600)' }}>
                            {empleado.email}
                          </a>
                        ) : (
                          <span style={{ color: 'var(--primary-400)' }}>Sin email</span>
                        )}
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
                          <button 
                            className="btn-icon" 
                            title="Ver empleado"
                            onClick={() => {
                              const detalles = `
INFORMACIÓN DEL EMPLEADO
Nombre: ${empleado.nombres} ${empleado.apellidos}
Documento: ${empleado.tipo_documento} ${empleado.numero_documento}
Email: ${empleado.email || 'No registrado'}
Teléfono: ${empleado.telefono || 'No registrado'}
Puesto: ${empleado.puesto || 'Sin asignar'}
Departamento: ${empleado.departamentos?.nombre || 'Sin departamento'}
Fecha Ingreso: ${formatDate(empleado.fecha_ingreso)}
Estado: ${empleado.estado}
Dirección: ${empleado.direccion || 'No registrada'}
                              `;
                              alert(detalles);
                            }}
                          >
                            👁️
                          </button>
                          <button 
                            className="btn-icon" 
                            title="Editar empleado"
                            onClick={() => {
                              setEmpleadoEditando(empleado);
                              setIsModalOpen(true);
                            }}
                          >
                            ✏️
                          </button>
                          <button 
                            className="btn-icon-danger" 
                            title="Inactivar empleado"
                            onClick={() => {
                              setConfirmDialog({
                                isOpen: true,
                                title: 'Inactivar Empleado',
                                message: `¿Está seguro de inactivar a ${empleado.nombres} ${empleado.apellidos}?\n\nEl historial se conserva para planillas, pagos y contabilidad.`,
                                variant: 'warning',
                                onConfirm: async () => {
                                  try {
                                    const response = await del(`/rrhh/empleados/${empleado.id}`);
                                    
                                    if (response) {
                                      loadData();
                                      alert('Empleado inactivado exitosamente');
                                    } else {
                                      throw new Error('Error al inactivar empleado');
                                    }
                                  } catch (error) {
                                    console.error('Error:', error);
                                    alert('Error al inactivar empleado');
                                  }
                                }
                              });
                            }}
                          >
                            🚫
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <EmpleadoModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEmpleadoEditando(null);
        }}
        onSubmit={handleSubmitEmpleado}
        departamentos={departamentos}
        initialData={empleadoEditando}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={async () => {
          await confirmDialog.onConfirm();
          setConfirmDialog({ ...confirmDialog, isOpen: false });
        }}
      />
    </div>
  );
};

export default RrhhPage;
