'use client'

import React, { useState, useEffect } from 'react';
import { useApi } from '@/hooks/use-api';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import PromptDialog from '@/components/ui/PromptDialog';

const ContratosPage = () => {
  const [contratos, setContratos] = useState<any[]>([]);
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [contratoEdit, setContratoEdit] = useState<any>(null);
  const [contratoDetail, setContratoDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const api = useApi();
  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED === 'true';

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

  // Estado para diálogo de prompt
  const [promptDialog, setPromptDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    placeholder?: string
    onConfirm: (value: string) => void | Promise<void>
    variant?: 'default' | 'danger' | 'warning'
    multiline?: boolean
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'default'
  });

  useEffect(() => {
    if (!rrhhEnabled) {
      // HARDENING: evitar llamadas a RRHH cuando la función está deshabilitada.
      setContratos([]);
      setEmpleados([]);
      setLoading(false);
      return;
    }
    loadData();
  }, [rrhhEnabled]);

  const loadData = async () => {
    if (!rrhhEnabled) {
      return;
    }
    try {
      setLoading(true);
      
      // Cargar contratos
      const contratosData = await api.get('/api/rrhh/contratos');
      if (contratosData && Array.isArray(contratosData)) {
        setContratos(contratosData);
      }

      // Cargar empleados
      const empleadosData = await api.get('/api/rrhh/empleados');
      if (empleadosData && Array.isArray(empleadosData)) {
        setEmpleados(empleadosData);
      }
    } catch (error) {
      console.error('Error cargando contratos:', error);
    } finally {
      setLoading(false);
    }
  };

  const renovarContrato = async (contratoId: string) => {
    setPromptDialog({
      isOpen: true,
      title: 'Renovar Contrato',
      message: '¿Por cuántos meses desea renovar el contrato?',
      placeholder: '12',
      variant: 'default',
      onConfirm: async (meses: string) => {
        if (!isNaN(Number(meses))) {
          try {
            await api.post(`/api/rrhh/contratos/${contratoId}/renovar`, {
              meses: parseInt(meses)
            });
            loadData();
          } catch (error) {
            console.error('Error renovando contrato:', error);
          }
        }
      }
    });
  };

  const finalizarContrato = async (contratoId: string) => {
    setPromptDialog({
      isOpen: true,
      title: 'Finalizar Contrato',
      message: 'Ingrese el motivo de finalización del contrato:',
      placeholder: 'Ej: Renuncia voluntaria, término de proyecto, etc.',
      variant: 'warning',
      multiline: true,
      onConfirm: async (motivo: string) => {
        try {
          await api.put(`/api/rrhh/contratos/${contratoId}/finalizar`, {
            motivo_finalizacion: motivo,
            fecha_finalizacion: new Date().toISOString().split('T')[0]
          });
          loadData();
        } catch (error) {
          console.error('Error finalizando contrato:', error);
        }
      }
    });
  };

  const generarContrato = async (contratoId: string) => {
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
      const response = await fetch(`${API_BASE_URL}/api/rrhh/contratos/${contratoId}/generar`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contrato-${contratoId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error generando contrato:', error);
    }
  };

  const filtrarContratos = () => {
    let filtrados = contratos;
    
    if (filtroEstado !== 'todos') {
      filtrados = filtrados.filter(c => c.estado === filtroEstado);
    }
    
    if (filtroTipo !== 'todos') {
      filtrados = filtrados.filter(c => c.tipo_contrato === filtroTipo);
    }
    
    return filtrados;
  };

  const getEstadoColor = (estado: string) => {
    const colores: Record<string, string> = {
      'activo': 'bg-green-100 text-green-800',
      'vencido': 'bg-red-100 text-red-800',
      'renovado': 'bg-blue-100 text-blue-800',
      'finalizado': 'bg-gray-100 text-gray-800',
      'en_periodo_prueba': 'bg-yellow-100 text-yellow-800'
    };
    return colores[estado] || 'bg-gray-100 text-gray-800';
  };

  const getTipoColor = (tipo: string) => {
    const colores: Record<string, string> = {
      'indefinido': 'bg-blue-100 text-blue-800',
      'temporal': 'bg-orange-100 text-orange-800',
      'practicas': 'bg-purple-100 text-purple-800',
      'locacion_servicios': 'bg-pink-100 text-pink-800'
    };
    return colores[tipo] || 'bg-gray-100 text-gray-800';
  };

  const calcularEstadisticas = () => {
    const total = contratos.length;
    const activos = contratos.filter(c => c.estado === 'activo').length;
    const vencidos = contratos.filter(c => c.estado === 'vencido').length;
    const porVencer = contratos.filter(c => {
      if (!c.fecha_fin) return false;
      const fechaFin = new Date(c.fecha_fin);
      const hoy = new Date();
      const diasParaVencer = Math.ceil((fechaFin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      return diasParaVencer <= 30 && diasParaVencer > 0;
    }).length;
    
    return { total, activos, vencidos, porVencer };
  };

  const getEmpleadoNombre = (empleadoId: string) => {
    const empleado = empleados.find(e => e.id === empleadoId);
    return empleado ? `${empleado.nombres} ${empleado.apellidos}` : 'N/A';
  };

  const calcularDiasRestantes = (fechaFin: string) => {
    if (!fechaFin) return null;
    const fin = new Date(fechaFin);
    const hoy = new Date();
    const dias = Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
    return dias;
  };

  if (!rrhhEnabled) {
    return (
      <div className="dashboard-container">
        <div className="alert alert-warning">
          <h1 className="text-xl font-semibold">RRHH deshabilitado</h1>
          <p className="text-sm text-gray-600">
            {/* // HARDENING: contratos bloqueados hasta finalizar validaciones legales. */}
            La gestión de contratos estará disponible cuando el módulo de RRHH se habilite en este entorno.
          </p>
        </div>
      </div>
    );
  }

  const stats = calcularEstadisticas();

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando contratos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Gestión de Contratos</h1>
          <p className="dashboard-subtitle">Control de contratos laborales y renovaciones</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            className="refresh-btn"
            onClick={() => setShowModal(true)}
          >
            📄 Nuevo Contrato
          </button>
          <button className="refresh-btn" onClick={loadData}>
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="stats-grid mb-6">
        <div className="stat-card">
          <div className="stat-header">
            <h3>Total Contratos</h3>
            <div className="stat-icon">📋</div>
          </div>
          <div className="stat-value text-blue-600">{stats.total}</div>
          <div className="stat-subtitle">Contratos registrados</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Activos</h3>
            <div className="stat-icon">✅</div>
          </div>
          <div className="stat-value text-green-600">{stats.activos}</div>
          <div className="stat-subtitle">Contratos vigentes</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Por Vencer</h3>
            <div className="stat-icon">⚠️</div>
          </div>
          <div className="stat-value text-yellow-600">{stats.porVencer}</div>
          <div className="stat-subtitle">Próximos 30 días</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Vencidos</h3>
            <div className="stat-icon">❌</div>
          </div>
          <div className="stat-value text-red-600">{stats.vencidos}</div>
          <div className="stat-subtitle">Requieren renovación</div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '1.5rem',
        padding: '1rem',
        background: '#f8f9fa',
        borderRadius: '8px'
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Estado:
          </label>
          <select 
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="form-control"
            style={{ width: '150px' }}
          >
            <option value="todos">Todos</option>
            <option value="activo">Activo</option>
            <option value="vencido">Vencido</option>
            <option value="renovado">Renovado</option>
            <option value="finalizado">Finalizado</option>
            <option value="en_periodo_prueba">En Período Prueba</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Tipo:
          </label>
          <select 
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="form-control"
            style={{ width: '180px' }}
          >
            <option value="todos">Todos</option>
            <option value="indefinido">Indefinido</option>
            <option value="temporal">Temporal</option>
            <option value="practicas">Prácticas</option>
            <option value="locacion_servicios">Locación Servicios</option>
          </select>
        </div>
      </div>

      {/* Tabla de contratos */}
      <div className="table-container">
        <div className="table-header">
          <h2>Lista de Contratos ({filtrarContratos().length})</h2>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Tipo Contrato</th>
                <th>Salario</th>
                <th>Fecha Inicio</th>
                <th>Fecha Fin</th>
                <th>Días Restantes</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrarContratos().map((contrato) => {
                const diasRestantes = calcularDiasRestantes(contrato.fecha_fin);
                let alertaVencimiento = '';
                if (diasRestantes !== null) {
                  if (diasRestantes < 0) alertaVencimiento = 'text-red-600 font-bold';
                  else if (diasRestantes <= 30) alertaVencimiento = 'text-yellow-600 font-bold';
                }

                return (
                  <tr key={contrato.id}>
                    <td>
                      <div>
                        <div className="font-medium">{getEmpleadoNombre(contrato.empleado_id)}</div>
                        <div className="text-sm text-gray-500">ID: {contrato.id.substring(0, 8)}...</div>
                      </div>
                    </td>
                    <td>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getTipoColor(contrato.tipo_contrato)}`}>
                        {contrato.tipo_contrato?.replace('_', ' ').toUpperCase() || 'N/A'}
                      </span>
                    </td>
                    <td className="text-right font-medium">S/ {(contrato.salario || 0).toLocaleString()}</td>
                    <td>{new Date(contrato.fecha_inicio).toLocaleDateString('es-PE')}</td>
                    <td>{contrato.fecha_fin ? new Date(contrato.fecha_fin).toLocaleDateString('es-PE') : 'Indefinido'}</td>
                    <td className={alertaVencimiento}>
                      {diasRestantes !== null ? (
                        diasRestantes < 0 ? 
                          `Vencido hace ${Math.abs(diasRestantes)} días` :
                          `${diasRestantes} días`
                      ) : 'Indefinido'}
                    </td>
                    <td>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getEstadoColor(contrato.estado)}`}>
                        {contrato.estado?.replace('_', ' ').toUpperCase() || 'ACTIVO'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => generarContrato(contrato.id)}
                          className="action-btn bg-blue-500 hover:bg-blue-600 text-white"
                          title="Generar PDF"
                        >
                          📄
                        </button>
                        
                        {contrato.estado === 'activo' && (
                          <>
                            <button
                              onClick={() => renovarContrato(contrato.id)}
                              className="action-btn bg-green-500 hover:bg-green-600 text-white"
                              title="Renovar"
                            >
                              🔄
                            </button>
                            <button
                              onClick={() => finalizarContrato(contrato.id)}
                              className="action-btn bg-red-500 hover:bg-red-600 text-white"
                              title="Finalizar"
                            >
                              ❌
                            </button>
                          </>
                        )}
                        
                        <button
                          onClick={() => {
                            setContratoDetail(contrato);
                            setShowDetailModal(true);
                          }}
                          className="action-btn bg-gray-500 hover:bg-gray-600 text-white"
                          title="Ver Detalles"
                        >
                          👁️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtrarContratos().length === 0 && (
            <div style={{ 
              textAlign: 'center', 
              padding: '2rem',
              color: '#6b7280'
            }}>
              No hay contratos que coincidan con los filtros seleccionados.
            </div>
          )}
        </div>
      </div>

      {/* Alertas de vencimiento */}
      {stats.porVencer > 0 && (
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          background: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '8px'
        }}>
          <h3 style={{ color: '#92400e', margin: '0 0 0.5rem 0' }}>
            ⚠️ Contratos por Vencer
          </h3>
          <p style={{ color: '#92400e', margin: 0 }}>
            Hay {stats.porVencer} contrato(s) que vencen en los próximos 30 días. 
            Revisar la tabla para tomar las acciones necesarias.
          </p>
        </div>
      )}

      {/* Resumen por tipo */}
      <div className="table-container mt-6">
        <div className="table-header">
          <h2>Resumen por Tipo de Contrato</h2>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tipo de Contrato</th>
                <th>Total</th>
                <th>Activos</th>
                <th>Vencidos</th>
                <th>Salario Promedio</th>
              </tr>
            </thead>
            <tbody>
              {['indefinido', 'temporal', 'practicas', 'locacion_servicios'].map(tipo => {
                const contratosTipo = contratos.filter(c => c.tipo_contrato === tipo);
                const activos = contratosTipo.filter(c => c.estado === 'activo').length;
                const vencidos = contratosTipo.filter(c => c.estado === 'vencido').length;
                const salarioPromedio = contratosTipo.length > 0 
                  ? contratosTipo.reduce((sum, c) => sum + (c.salario || 0), 0) / contratosTipo.length 
                  : 0;

                return (
                  <tr key={tipo}>
                    <td>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getTipoColor(tipo)}`}>
                        {tipo.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="text-center">{contratosTipo.length}</td>
                    <td className="text-center text-green-600">{activos}</td>
                    <td className="text-center text-red-600">{vencidos}</td>
                    <td className="text-right">S/ {salarioPromedio.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalle del Contrato */}
      {showDetailModal && contratoDetail && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem'
          }}
          onClick={() => {
            setShowDetailModal(false);
            setContratoDetail(null);
          }}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '700px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ 
              padding: '2rem 2rem 1rem 2rem',
              borderBottom: '2px solid #e5e7eb',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: 'white',
              borderRadius: '12px 12px 0 0'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', margin: 0 }}>
                    📄 Detalle del Contrato
                  </h2>
                  <p style={{ fontSize: '0.875rem', opacity: 0.9, margin: '0.5rem 0 0 0' }}>
                    Información completa del contrato laboral
                  </p>
                </div>
                
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setContratoDetail(null);
                  }}
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1.25rem'
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Contenido */}
            <div style={{ padding: '2rem' }}>
              {/* Información del Empleado */}
              <div style={{ 
                marginBottom: '1.5rem',
                padding: '1.5rem',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0'
              }}>
                <h3 style={{ 
                  fontSize: '1.125rem', 
                  fontWeight: '600', 
                  color: '#1e293b', 
                  margin: '0 0 1rem 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  👤 Información del Empleado
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', marginBottom: '0.25rem' }}>
                      EMPLEADO
                    </label>
                    <div style={{ fontSize: '1rem', fontWeight: '600', color: '#374151' }}>
                      {getEmpleadoNombre(contratoDetail?.empleado_id || '')}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', marginBottom: '0.25rem' }}>
                      ID CONTRATO
                    </label>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', fontFamily: 'monospace' }}>
                      {contratoDetail?.id}
                    </div>
                  </div>
                </div>
              </div>

              {/* Detalles del Contrato */}
              <div style={{ 
                marginBottom: '1.5rem',
                padding: '1.5rem',
                backgroundColor: '#f0fdf4',
                borderRadius: '8px',
                border: '1px solid #bbf7d0'
              }}>
                <h3 style={{ 
                  fontSize: '1.125rem', 
                  fontWeight: '600', 
                  color: '#14532d', 
                  margin: '0 0 1rem 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  📋 Detalles del Contrato
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', marginBottom: '0.25rem' }}>
                      TIPO DE CONTRATO
                    </label>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      backgroundColor: contratoDetail.tipo_contrato === 'indefinido' ? '#dbeafe' : 
                                     contratoDetail.tipo_contrato === 'temporal' ? '#fed7aa' :
                                     contratoDetail?.tipo_contrato === 'practicas' ? '#e9d5ff' : '#fce7f3',
                      color: contratoDetail.tipo_contrato === 'indefinido' ? '#1e40af' : 
                             contratoDetail.tipo_contrato === 'temporal' ? '#ea580c' :
                             contratoDetail.tipo_contrato === 'practicas' ? '#7c3aed' : '#be185d'
                    }}>
                      {contratoDetail.tipo_contrato?.replace('_', ' ').toUpperCase() || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', marginBottom: '0.25rem' }}>
                      ESTADO
                    </label>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      backgroundColor: contratoDetail.estado === 'activo' ? '#d1fae5' : 
                                     contratoDetail.estado === 'vencido' ? '#fee2e2' :
                                     contratoDetail.estado === 'renovado' ? '#dbeafe' : '#f3f4f6',
                      color: contratoDetail.estado === 'activo' ? '#065f46' : 
                             contratoDetail.estado === 'vencido' ? '#dc2626' :
                             contratoDetail.estado === 'renovado' ? '#1e40af' : '#374151'
                    }}>
                      {contratoDetail.estado?.replace('_', ' ').toUpperCase() || 'ACTIVO'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', marginBottom: '0.25rem' }}>
                      FECHA INICIO
                    </label>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                      {new Date(contratoDetail.fecha_inicio).toLocaleDateString('es-PE', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', marginBottom: '0.25rem' }}>
                      FECHA FIN
                    </label>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                      {contratoDetail.fecha_fin ? 
                        new Date(contratoDetail.fecha_fin).toLocaleDateString('es-PE', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        }) : 
                        'Indefinido'
                      }
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', marginBottom: '0.25rem' }}>
                      DÍAS RESTANTES
                    </label>
                    <div style={{ 
                      fontSize: '0.875rem', 
                      fontWeight: '600',
                      color: (() => {
                        const dias = calcularDiasRestantes(contratoDetail.fecha_fin);
                        if (dias === null) return '#374151';
                        if (dias < 0) return '#dc2626';
                        if (dias <= 30) return '#f59e0b';
                        return '#16a34a';
                      })()
                    }}>
                      {(() => {
                        const dias = calcularDiasRestantes(contratoDetail.fecha_fin);
                        if (dias === null) return 'Indefinido';
                        if (dias < 0) return `Vencido hace ${Math.abs(dias)} días`;
                        return `${dias} días`;
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Información Económica */}
              <div style={{ 
                marginBottom: '1.5rem',
                padding: '1.5rem',
                backgroundColor: '#fef3c7',
                borderRadius: '8px',
                border: '1px solid #f59e0b'
              }}>
                <h3 style={{ 
                  fontSize: '1.125rem', 
                  fontWeight: '600', 
                  color: '#92400e', 
                  margin: '0 0 1rem 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  💰 Información Económica
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', marginBottom: '0.25rem' }}>
                      SALARIO MENSUAL
                    </label>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#16a34a' }}>
                      S/ {(contratoDetail.salario || 0).toLocaleString('es-PE')}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', marginBottom: '0.25rem' }}>
                      BENEFICIOS
                    </label>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                      {contratoDetail.beneficios || 'Beneficios estándar según ley'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Observaciones */}
              {contratoDetail.observaciones && (
                <div style={{ 
                  marginBottom: '1.5rem',
                  padding: '1.5rem',
                  backgroundColor: '#f1f5f9',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1'
                }}>
                  <h3 style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: '600', 
                    color: '#475569', 
                    margin: '0 0 1rem 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    📝 Observaciones
                  </h3>
                  <div style={{ fontSize: '0.875rem', color: '#475569', lineHeight: '1.5' }}>
                    {contratoDetail.observaciones}
                  </div>
                </div>
              )}

              {/* Botones de Acción */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'flex-end', 
                gap: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid #e5e7eb'
              }}>
                <button
                  onClick={() => generarContrato(contratoDetail.id)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  📄 Descargar PDF
                </button>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setContratoDetail(null);
                  }}
                  style={{
                    padding: '0.75rem 1.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: 'white',
                    color: '#374151',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
      />

      <PromptDialog
        isOpen={promptDialog.isOpen}
        onClose={() => setPromptDialog({ ...promptDialog, isOpen: false })}
        onConfirm={promptDialog.onConfirm}
        title={promptDialog.title}
        message={promptDialog.message}
        placeholder={promptDialog.placeholder}
        variant={promptDialog.variant}
        multiline={promptDialog.multiline}
      />
    </div>
  );
};

export default ContratosPage;
