'use client'

import React, { useState, useCallback, useEffect } from 'react';
import { useApi } from '@/hooks/use-api';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { fetchApi } from '@/lib/api-fetch';

const PagosPage = () => {
  const [pagos, setPagos] = useState<any[]>([]);
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [planillas, setPlanillas] = useState<any[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroPeriodo, setFiltroPeriodo] = useState('todos');
  const [loading, setLoading] = useState(true);
  const { get, put } = useApi();

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
      setPagos([]);
      setEmpleados([]);
      setPlanillas([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      
      // Cargar pagos
      console.log('🔍 [Frontend] Cargando pagos desde /api/rrhh/pagos...');
      const pagosResponse = await get('/api/rrhh/pagos');
      console.log('📦 [Frontend] Respuesta pagos:', pagosResponse);
      
      // Verificar si la respuesta tiene la estructura correcta
      let pagosData = [];
      if (pagosResponse?.success && Array.isArray(pagosResponse.data)) {
        pagosData = pagosResponse.data;
        console.log(`✅ [Frontend] Estructura correcta - ${pagosData.length} pagos recibidos`);
      } else if (Array.isArray(pagosResponse)) {
        pagosData = pagosResponse;
        console.log(`✅ [Frontend] Array directo - ${pagosData.length} pagos recibidos`);
      } else {
        console.warn('⚠️ [Frontend] Respuesta no es array:', typeof pagosResponse, pagosResponse);
      }
      
      setPagos(pagosData);
      console.log(`🎯 [Frontend] Estado actualizado con ${pagosData.length} pagos`);

      // Cargar empleados
      const empleadosData = await get('/api/rrhh/empleados');
      if (empleadosData && Array.isArray(empleadosData)) {
        setEmpleados(empleadosData);
      }

      // Cargar planillas
      const planillasData = await get('/api/rrhh/planillas');
      if (planillasData && Array.isArray(planillasData)) {
        setPlanillas(planillasData);
      }
    } catch (error) {
      console.error('Error cargando pagos:', error);
    } finally {
      setLoading(false);
    }
  }, [get, rrhhEnabled]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const procesarPago = async (pagoId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Procesar Pago',
      message: '¿Confirmar el pago?\n\nEsta acción no se puede deshacer.',
      variant: 'warning',
      onConfirm: async () => {
        try {
          await put(`/api/rrhh/pagos/${pagoId}/procesar`);
          loadData();
        } catch (error) {
          console.error('Error procesando pago:', error);
        }
      }
    });
  };

  const generarComprobante = async (pagoId: string) => {
    try {
      const response = await fetchApi(`/api/rrhh/pagos/${pagoId}/comprobante`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `comprobante-pago-${pagoId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error generando comprobante:', error);
    }
  };

  const filtrarPagos = () => {
    let filtrados = pagos;
    
    if (filtroEstado !== 'todos') {
      filtrados = filtrados.filter(p => p.estado === filtroEstado);
    }
    
    if (filtroPeriodo !== 'todos') {
      filtrados = filtrados.filter(p => p.periodo === filtroPeriodo);
    }
    
    return filtrados;
  };

  const getEstadoColor = (estado: string) => {
    const colores: Record<string, string> = {
      'pendiente': 'bg-yellow-100 text-yellow-800',
      'procesado': 'bg-green-100 text-green-800',
      'rechazado': 'bg-red-100 text-red-800'
    };
    return colores[estado] || 'bg-gray-100 text-gray-800';
  };

  const calcularEstadisticas = () => {
    const total = pagos.length;
    const pendientes = pagos.filter(p => p.estado === 'pendiente').length;
    const procesados = pagos.filter(p => p.estado === 'procesado').length;
    const montoTotal = pagos.filter(p => p.estado === 'procesado').reduce((sum, p) => sum + (p.monto_neto || 0), 0);
    
    return { total, pendientes, procesados, montoTotal };
  };

  const getEmpleadoNombre = (empleadoId: string) => {
    const empleado = empleados.find(e => e.id === empleadoId);
    return empleado ? `${empleado.nombres} ${empleado.apellidos}` : 'N/A';
  };

  const getPeriodosUnicos = () => {
    const periodos = [...new Set(pagos.map(p => p.periodo))];
    return periodos.sort().reverse();
  };

  if (!rrhhEnabled) {
    return (
      <div className="dashboard-container">
        <div className="alert alert-warning">
          <h1 className="text-xl font-semibold">RRHH deshabilitado</h1>
          <p className="text-sm text-gray-600">
            {/* // HARDENING: pagos RRHH bloqueados hasta completar la validación legal. */}
            El seguimiento de pagos de planilla estará disponible cuando el módulo de RRHH se habilite en este entorno.
          </p>
        </div>
      </div>
    );
  }

  const stats = calcularEstadisticas();

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">Pagos & Comprobantes</h1>
            <p className="dashboard-subtitle">Cargando pagos de empleados, planillas y comprobantes asociados.</p>
          </div>
        </div>
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando pagos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Pagos & Comprobantes</h1>
          <p className="dashboard-subtitle">Control de pagos mensuales a empleados</p>
        </div>
        <div className="flex gap-4">
          <button className="refresh-btn" onClick={loadData}>
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="stats-grid mb-6">
        <div className="stat-card">
          <div className="stat-header">
            <h3>Total Pagos</h3>
            <div className="stat-icon">💰</div>
          </div>
          <div className="stat-value text-blue-600">{stats.total}</div>
          <div className="stat-subtitle">Registros de pago</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Pendientes</h3>
            <div className="stat-icon">⏳</div>
          </div>
          <div className="stat-value text-yellow-600">{stats.pendientes}</div>
          <div className="stat-subtitle">Por procesar</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Procesados</h3>
            <div className="stat-icon">✅</div>
          </div>
          <div className="stat-value text-green-600">{stats.procesados}</div>
          <div className="stat-subtitle">Pagos completados</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Monto Total</h3>
            <div className="stat-icon">💸</div>
          </div>
          <div className="stat-value text-purple-600">S/ {stats.montoTotal.toLocaleString()}</div>
          <div className="stat-subtitle">Pagos procesados</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-4 mb-6 p-4 bg-[#f8f9fa] rounded-2">
        <div>
          <label className="block mb-2 font-medium">
            Estado:
          </label>
          <select 
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="form-control w-[150px]"
          >
            <option value="todos">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="procesado">Procesado</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </div>

        <div>
          <label className="block mb-2 font-medium">
            Período:
          </label>
          <select 
            value={filtroPeriodo}
            onChange={(e) => setFiltroPeriodo(e.target.value)}
            className="form-control w-[150px]"
          >
            <option value="todos">Todos</option>
            {getPeriodosUnicos().map(periodo => (
              <option key={periodo} value={periodo}>{periodo}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla de pagos */}
      <div className="table-container">
        <div className="table-header">
          <h2>Control de Pagos ({filtrarPagos().length})</h2>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Período</th>
                <th>Sueldo Bruto</th>
                <th>Descuentos</th>
                <th>Monto Neto</th>
                <th>Fecha Pago</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrarPagos().map((pago) => (
                <tr key={pago.id}>
                  <td>
                    <div>
                      <div className="font-medium">{getEmpleadoNombre(pago.empleado_id)}</div>
                      <div className="text-sm text-gray-500">ID: {pago.empleado_id?.substring(0, 8)}...</div>
                    </div>
                  </td>
                  <td>{pago.periodo}</td>
                  <td className="text-right">S/ {(pago.monto_bruto || 0).toLocaleString()}</td>
                  <td className="text-right text-red-600">S/ {(pago.total_descuentos || 0).toLocaleString()}</td>
                  <td className="text-right font-bold text-green-600">S/ {(pago.monto_neto || 0).toLocaleString()}</td>
                  <td>{pago.fecha_pago ? new Date(pago.fecha_pago).toLocaleDateString('es-PE') : '-'}</td>
                  <td>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getEstadoColor(pago.estado)}`}>
                      {pago.estado?.toUpperCase() || 'PENDIENTE'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      {pago.estado === 'pendiente' && (
                        <button
                          onClick={() => procesarPago(pago.id)}
                          className="action-btn bg-green-500 hover:bg-green-600 text-white"
                          title="Procesar Pago"
                        >
                          💰 Pagar
                        </button>
                      )}
                      {pago.estado === 'procesado' && (
                        <button
                          onClick={() => generarComprobante(pago.id)}
                          className="action-btn bg-blue-500 hover:bg-blue-600 text-white"
                          title="Descargar Comprobante"
                        >
                          📄 Comprobante
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const detalles = `
DETALLE DEL PAGO
Empleado: ${getEmpleadoNombre(pago.empleado_id)}
Período: ${pago.periodo}
Sueldo Bruto: S/ ${(pago.monto_bruto || 0).toLocaleString()}
AFP/ONP: S/ ${(pago.descuento_afp || 0).toLocaleString()}
Renta 5ta: S/ ${(pago.descuento_renta || 0).toLocaleString()}
Otros Desc.: S/ ${((pago.total_descuentos || 0) - (pago.descuento_afp || 0) - (pago.descuento_renta || 0)).toLocaleString()}
Total Descuentos: S/ ${(pago.total_descuentos || 0).toLocaleString()}
MONTO NETO: S/ ${(pago.monto_neto || 0).toLocaleString()}
                          `;
                          alert(detalles);
                        }}
                        className="action-btn bg-gray-500 hover:bg-gray-600 text-white"
                        title="Ver Detalles"
                      >
                        👁️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtrarPagos().length === 0 && (
            <div className="text-center p-8 text-gray-500">
              No hay pagos que coincidan con los filtros seleccionados.
            </div>
          )}
        </div>
      </div>

      {/* Resumen por empleado */}
      <div className="table-container mt-6">
        <div className="table-header">
          <h2>Resumen de Pagos por Empleado</h2>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Último Pago</th>
                <th>Estado Último</th>
                <th>Total Pagado (Año)</th>
                <th>Promedio Mensual</th>
              </tr>
            </thead>
            <tbody>
              {empleados.map((empleado) => {
                const pagosEmpleado = pagos.filter(p => p.empleado_id === empleado.id);
                const ultimoPago = pagosEmpleado.sort((a, b) => new Date(b.periodo).getTime() - new Date(a.periodo).getTime())[0];
                const totalPagado = pagosEmpleado.filter(p => p.estado === 'procesado').reduce((sum, p) => sum + (p.monto_neto || 0), 0);
                const promedioMensual = pagosEmpleado.length > 0 ? totalPagado / pagosEmpleado.filter(p => p.estado === 'procesado').length : 0;

                return (
                  <tr key={empleado.id}>
                    <td>
                      <div>
                        <div className="font-medium">{empleado.nombres} {empleado.apellidos}</div>
                        <div className="text-sm text-gray-500">{empleado.puesto || 'N/A'}</div>
                      </div>
                    </td>
                    <td>{ultimoPago?.periodo || 'Sin pagos'}</td>
                    <td>
                      {ultimoPago && (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getEstadoColor(ultimoPago.estado)}`}>
                          {ultimoPago.estado?.toUpperCase() || 'N/A'}
                        </span>
                      )}
                    </td>
                    <td className="text-right font-bold">S/ {totalPagado.toLocaleString()}</td>
                    <td className="text-right">S/ {promedioMensual.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
      />
    </div>
  );
};

export default PagosPage;
