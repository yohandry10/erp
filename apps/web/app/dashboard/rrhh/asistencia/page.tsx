'use client'

import React, { useState, useEffect } from 'react';
import { useApi } from '@/hooks/use-api';

const AsistenciaPage = () => {
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [asistencias, setAsistencias] = useState<any[]>([]);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const api = useApi();

  useEffect(() => {
    loadData();
  }, [fecha]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Cargar empleados
      const empleadosData = await api.get('/api/rrhh/empleados');
      if (empleadosData && Array.isArray(empleadosData)) {
        setEmpleados(empleadosData);
      }

      // Cargar asistencias del día
      const asistenciasData = await api.get(`/api/rrhh/asistencias?fecha=${fecha}`);
      if (asistenciasData && Array.isArray(asistenciasData)) {
        setAsistencias(asistenciasData);
      }
    } catch (error) {
      console.error('Error cargando asistencias:', error);
    } finally {
      setLoading(false);
    }
  };

  const marcarAsistencia = async (empleadoId: string, tipo: 'entrada' | 'salida') => {
    try {
      await api.post('/api/rrhh/asistencias/marcar', {
        empleado_id: empleadoId,
        fecha,
        tipo,
        hora: new Date().toTimeString().split(' ')[0]
      });
      loadData();
    } catch (error) {
      console.error('Error marcando asistencia:', error);
    }
  };

  const getAsistenciaEmpleado = (empleadoId: string) => {
    return asistencias.find(a => a.empleado_id === empleadoId);
  };

  const calcularEstadisticas = () => {
    const presentes = asistencias.filter(a => a.hora_entrada).length;
    const ausentes = empleados.length - presentes;
    const completaron = asistencias.filter(a => a.hora_entrada && a.hora_salida).length;
    
    return { presentes, ausentes, completaron };
  };

  const stats = calcularEstadisticas();

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando asistencias...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Control de Asistencia</h1>
          <p className="dashboard-subtitle">Marcado de entrada y salida del personal</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="form-control"
            style={{ width: 'auto' }}
          />
          <button className="refresh-btn" onClick={loadData}>
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* Estadísticas del día */}
      <div className="stats-grid mb-6">
        <div className="stat-card">
          <div className="stat-header">
            <h3>Presentes</h3>
            <div className="stat-icon">✅</div>
          </div>
          <div className="stat-value text-green-600">{stats.presentes}</div>
          <div className="stat-subtitle">Con entrada registrada</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Ausentes</h3>
            <div className="stat-icon">❌</div>
          </div>
          <div className="stat-value text-red-600">{stats.ausentes}</div>
          <div className="stat-subtitle">Sin entrada registrada</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Completaron</h3>
            <div className="stat-icon">🎯</div>
          </div>
          <div className="stat-value text-blue-600">{stats.completaron}</div>
          <div className="stat-subtitle">Entrada y salida</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Trabajando</h3>
            <div className="stat-icon">⏰</div>
          </div>
          <div className="stat-value text-orange-600">{stats.presentes - stats.completaron}</div>
          <div className="stat-subtitle">Actualmente en oficina</div>
        </div>
      </div>

      {/* Tabla de asistencias */}
      <div className="table-container">
        <div className="table-header">
          <h2>Asistencia del {new Date(fecha).toLocaleDateString('es-PE', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}</h2>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Departamento</th>
                <th>Hora Entrada</th>
                <th>Hora Salida</th>
                <th>Horas Trabajadas</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empleados.map((empleado) => {
                const asistencia = getAsistenciaEmpleado(empleado.id);
                const horasT = asistencia?.hora_entrada && asistencia?.hora_salida 
                  ? calcularHorasTrabajadas(asistencia.hora_entrada, asistencia.hora_salida)
                  : '-';
                
                let estado = '❌ Ausente';
                let estadoColor = 'text-red-600';
                
                if (asistencia?.hora_entrada && asistencia?.hora_salida) {
                  estado = '✅ Completo';
                  estadoColor = 'text-green-600';
                } else if (asistencia?.hora_entrada) {
                  estado = '⏰ Trabajando';
                  estadoColor = 'text-orange-600';
                }

                return (
                  <tr key={empleado.id}>
                    <td>
                      <div>
                        <div className="font-medium">{empleado.nombres} {empleado.apellidos}</div>
                        <div className="text-sm text-gray-500">{empleado.documento}</div>
                      </div>
                    </td>
                    <td>{empleado.departamento?.nombre || 'N/A'}</td>
                    <td>{asistencia?.hora_entrada || '-'}</td>
                    <td>{asistencia?.hora_salida || '-'}</td>
                    <td>{horasT}</td>
                    <td>
                      <span className={`font-medium ${estadoColor}`}>
                        {estado}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {!asistencia?.hora_entrada ? (
                          <button
                            onClick={() => marcarAsistencia(empleado.id, 'entrada')}
                            className="action-btn bg-green-500 hover:bg-green-600 text-white"
                            title="Marcar Entrada"
                          >
                            ⏰ Entrada
                          </button>
                        ) : !asistencia?.hora_salida ? (
                          <button
                            onClick={() => marcarAsistencia(empleado.id, 'salida')}
                            className="action-btn bg-red-500 hover:bg-red-600 text-white"
                            title="Marcar Salida"
                          >
                            🚪 Salida
                          </button>
                        ) : (
                          <span className="text-sm text-gray-500">Completo</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const calcularHorasTrabajadas = (entrada: string, salida: string) => {
  try {
    const horaEntrada = new Date(`2000-01-01 ${entrada}`);
    const horaSalida = new Date(`2000-01-01 ${salida}`);
    const diffMs = horaSalida.getTime() - horaEntrada.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return `${diffHours.toFixed(1)}h`;
  } catch {
    return '-';
  }
};

export default AsistenciaPage; 