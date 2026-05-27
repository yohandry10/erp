'use client'

import React, { useState, useCallback, useEffect } from 'react';
import PlanillaModal from '@/components/modals/PlanillaModal';
import PlanillaCalcularModal from '@/components/modals/PlanillaCalcularModal';
import PlanillaPagarModal from '@/components/modals/PlanillaPagarModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useApi } from '@/hooks/use-api';
import { apiSucceeded, unwrapApiArray } from '@/lib/api-contract';
import { fetchApi } from '@/lib/api-fetch';

const PlanillasPage = () => {
  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED === 'true';
  const { get } = useApi();
  const [planillas, setPlanillas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detallePlanilla, setDetallePlanilla] = useState<any[]>([]);
  const [showDetalle, setShowDetalle] = useState(false);
  const [showPlanillaModal, setShowPlanillaModal] = useState(false);
  const [showCalcularModal, setShowCalcularModal] = useState(false);
  const [showPagarModal, setShowPagarModal] = useState(false);
  const [planillaSeleccionada, setPlanillaSeleccionada] = useState<any>(null);

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
  
  const loadPlanillas = useCallback(async () => {
    if (!rrhhEnabled) {
      setPlanillas([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await get('/api/rrhh/planillas');
      if (apiSucceeded(response)) {
        setPlanillas(unwrapApiArray(response));
      } else {
        setPlanillas([]);
      }
    } catch (error: any) {
      console.error('Error cargando planillas:', error);
      setPlanillas([]);
    } finally {
      setLoading(false);
    }
  }, [get, rrhhEnabled]);

  useEffect(() => {
    loadPlanillas();
  }, [loadPlanillas]);

  const abrirModalPlanilla = () => {
    setShowPlanillaModal(true);
  };

  const editarPlanilla = (planilla: any) => {
    // TODO: Implementar modal de edición de planilla
    alert(`🚧 Función en desarrollo\n\nPronto podrás editar la planilla ${planilla?.periodo}\n\nPor ahora puedes:\n• Ver el detalle\n• Generar reportes\n• Aprobar si está calculada`);
  };

  const abrirCalcularPlanilla = (planilla: any) => {
    setPlanillaSeleccionada(planilla);
    setShowCalcularModal(true);
  };

  const abrirPagarPlanilla = (planilla: any) => {
    setPlanillaSeleccionada(planilla);
    setShowPagarModal(true);
  };

  const handleCalcularSuccess = () => {
    setShowCalcularModal(false);
    setPlanillaSeleccionada(null);
    loadPlanillas();
  };

  const handlePagarSuccess = () => {
    setShowPagarModal(false);
    setPlanillaSeleccionada(null);
    loadPlanillas();
  };

  const generarAsientosContables = async (planillaId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Generar Asientos Contables',
      message: '¿Está seguro de generar los asientos contables para esta planilla?\n\nEsto creará registros en el módulo de contabilidad.',
      variant: 'warning',
      onConfirm: async () => {
        try {
          setLoading(true);
          const response = await fetchApi(`/api/rrhh/planillas/${planillaId}/generar-asientos`, {
            method: 'POST',
          });

          if (response.ok) {
            const data = await response.json();
            alert(`✅ Asientos contables generados correctamente\n\n• Total registros: ${data.registros || 'N/A'}\n• Monto total: S/ ${data.monto_total || '0.00'}`);
          } else {
            throw new Error('Error generando asientos contables');
          }
        } catch (error: any) {
          console.error('Error generando asientos:', error);
          alert('Error generando asientos contables: ' + error.message);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handlePlanillaSuccess = () => {
    setShowPlanillaModal(false);
    loadPlanillas();
  };

  const verDetallePlanilla = async (planillaId: string) => {
    try {
      setLoading(true);
      const response = await fetchApi(`/api/rrhh/planillas/${planillaId}/detalle`);

      if (response.ok) {
        const data = await response.json();
        console.log('Detalle planilla:', data);
        setDetallePlanilla(Array.isArray(data) ? data : []);
        setShowDetalle(true);
      } else {
        alert('Error cargando detalle de planilla');
      }
    } catch (error: any) {
      console.error('Error cargando detalle:', error);
      alert('Error cargando detalle: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const generarReporteProfesional = async (planillaId: string, periodo: string) => {
    try {
      const response = await fetchApi(`/api/rrhh/planillas/${planillaId}/detalle`);

      if (response.ok) {
        const data = await response.json();
        
        if (!data || !Array.isArray(data) || data.length === 0) {
          alert('⚠️ Esta planilla no tiene empleados calculados. Primero calcule la planilla.');
          return;
        }

        // Generar reporte HTML profesional
        const html = generarReporteHTML(data, periodo);
        
        // Crear y descargar
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `reporte_planilla_${periodo}.html`);
        link.className = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error: any) {
      console.error('Error generando reporte:', error);
      alert('Error generando reporte: ' + error.message);
    }
  };

  const generarReporteHTML = (empleados: any[], periodo: string) => {
    if (!Array.isArray(empleados)) {
      empleados = [];
    }
    
    const totalIngresos = empleados.reduce((sum, emp) => sum + (parseFloat(emp?.total_ingresos) || 0), 0);
    const totalDescuentos = empleados.reduce((sum, emp) => sum + (parseFloat(emp?.total_descuentos) || 0), 0);
    const totalNeto = empleados.reduce((sum, emp) => sum + (parseFloat(emp?.neto_pagar) || 0), 0);

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Reporte de Planilla ${periodo}</title>
    </head>
    <body>
        <div class="header">
            <div class="company">NEON SYSTEM</div>
            <div class="title">Reporte de Planilla - Período ${periodo}</div>
            <div>Generado el: ${new Date().toLocaleDateString('es-PE')}</div>
        </div>

        <div class="summary">
            <h3>Resumen Ejecutivo</h3>
            <p><strong>Total Empleados:</strong> ${empleados.length}</p>
            <p><strong>Total Ingresos:</strong> S/ ${totalIngresos.toFixed(2)}</p>
            <p><strong>Total Descuentos:</strong> S/ ${totalDescuentos.toFixed(2)}</p>
            <p><strong>Total Neto a Pagar:</strong> S/ ${totalNeto.toFixed(2)}</p>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Empleado</th>
                    <th>Documento</th>
                    <th class="number">Días</th>
                    <th class="number">Ingresos</th>
                    <th class="number">Descuentos</th>
                    <th class="number">Neto</th>
                </tr>
            </thead>
            <tbody>
                ${empleados.map(emp => `
                    <tr>
                        <td>${emp?.empleados?.nombres || 'N/A'} ${emp?.empleados?.apellidos || ''}</td>
                        <td>${emp?.empleados?.numero_documento || 'N/A'}</td>
                        <td class="number">${emp?.dias_trabajados || 0}</td>
                        <td class="number">S/ ${(parseFloat(emp?.total_ingresos) || 0).toFixed(2)}</td>
                        <td class="number">S/ ${(parseFloat(emp?.total_descuentos) || 0).toFixed(2)}</td>
                        <td class="number">S/ ${(parseFloat(emp?.neto_pagar) || 0).toFixed(2)}</td>
                    </tr>
                `).join('')}
                <tr class="total-row">
                    <td colspan="3">TOTALES</td>
                    <td class="number">S/ ${totalIngresos.toFixed(2)}</td>
                    <td class="number">S/ ${totalDescuentos.toFixed(2)}</td>
                    <td class="number">S/ ${totalNeto.toFixed(2)}</td>
                </tr>
            </tbody>
        </table>
    </body>
    </html>`;
  };

  const aprobarPlanilla = async (planillaId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Aprobar Planilla',
      message: '¿Está seguro de aprobar esta planilla?\n\nUna vez aprobada no se podrá modificar.',
      variant: 'warning',
      onConfirm: async () => {
        try {
          const response = await fetchApi(`/api/rrhh/planillas/${planillaId}`, {
            method: 'PUT',
            body: JSON.stringify({ estado: 'aprobada' }),
          });

          if (response.ok) {
            alert('✅ Planilla aprobada exitosamente');
            loadPlanillas();
          }
        } catch (error: any) {
          console.error('Error aprobando planilla:', error);
        }
      }
    });
  };

  const descargarBoleta = async (empleadoPlanillaId: string) => {
    try {
      const response = await fetchApi(`/api/rrhh/planillas/empleado/${empleadoPlanillaId}`);

      if (response.ok) {
        const data = await response.json();
        console.log('Datos empleado para boleta:', data);
        
        // Generar boleta HTML
        const html = generarBoletaHTML(data);
        
        // Crear y descargar
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `boleta_${data?.empleados?.nombres}_${data?.empleados?.apellidos}.html`);
        link.className = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error: any) {
      console.error('Error descargando boleta:', error);
      alert('Error descargando boleta: ' + error.message);
    }
  };

  const generarBoletaHTML = (data: any) => {
    if (!data) {
      data = {};
    }
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Boleta de Pago</title>
    </head>
    <body>
        <div class="boleta">
            <div class="header">
                <div class="company">NEON SYSTEM</div>
                <div class="title">Boleta de Pago</div>
                <div>Período: ${data?.planillas?.periodo || 'N/A'}</div>
            </div>
            
            <div class="empleado">
                <strong>Empleado:</strong> ${data?.empleados?.nombres || 'N/A'} ${data?.empleados?.apellidos || ''}<br>
                <strong>Documento:</strong> ${data?.empleados?.numero_documento || 'N/A'}<br>
                <strong>Puesto:</strong> ${data?.empleados?.puesto || 'N/A'}<br>
                <strong>Fecha de Pago:</strong> ${data?.planillas?.fecha_pago ? new Date(data.planillas.fecha_pago).toLocaleDateString('es-PE') : 'N/A'}
            </div>

            <div class="section">
                <div class="section-title">💰 INGRESOS</div>
                <div class="item">
                    <span>Sueldo Base</span>
                    <span class="amount positive">S/ ${(parseFloat(data?.sueldo_base) || 0).toFixed(2)}</span>
                </div>
                <div class="item">
                    <span>Horas Extras 25%</span>
                    <span class="amount positive">S/ ${(parseFloat(data?.horas_extras_25) || 0).toFixed(2)}</span>
                </div>
                <div class="item">
                    <span>Horas Extras 35%</span>
                    <span class="amount positive">S/ ${(parseFloat(data?.horas_extras_35) || 0).toFixed(2)}</span>
                </div>
                <div class="item">
                    <span>Bonos Adicionales</span>
                    <span class="amount positive">S/ ${(parseFloat(data?.bonos_adicionales) || 0).toFixed(2)}</span>
                </div>
                <div class="item total">
                    <span>TOTAL INGRESOS</span>
                    <span class="amount positive">S/ ${(parseFloat(data?.total_ingresos) || 0).toFixed(2)}</span>
                </div>
            </div>

            <div class="section">
                <div class="section-title">📉 DESCUENTOS</div>
                <div class="item">
                    <span>AFP/ONP (13%)</span>
                    <span class="amount negative">S/ ${(parseFloat(data?.descuento_afp) || 0).toFixed(2)}</span>
                </div>
                <div class="item">
                    <span>ESSALUD (9%)</span>
                    <span class="amount negative">S/ ${(parseFloat(data?.descuento_essalud) || 0).toFixed(2)}</span>
                </div>
                <div class="item">
                    <span>Tardanzas</span>
                    <span class="amount negative">S/ ${(parseFloat(data?.descuento_tardanzas) || 0).toFixed(2)}</span>
                </div>
                <div class="item">
                    <span>Faltas</span>
                    <span class="amount negative">S/ ${(parseFloat(data?.descuento_faltas) || 0).toFixed(2)}</span>
                </div>
                <div class="item total">
                    <span>TOTAL DESCUENTOS</span>
                    <span class="amount negative">S/ ${(parseFloat(data?.total_descuentos) || 0).toFixed(2)}</span>
                </div>
            </div>

            <div class="item total">
                <span>NETO A PAGAR</span>
                <span class="amount">S/ ${(parseFloat(data?.neto_pagar) || 0).toFixed(2)}</span>
            </div>

            <div>
                <p>Este documento es generado automáticamente por NEON SYSTEM</p>
                <p>Fecha de generación: ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE')}</p>
            </div>
        </div>
    </body>
    </html>`;
  };

  const formatCurrency = (amount: number) => {
    if (isNaN(amount)) amount = 0;
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('es-PE');
    } catch (error: any) {
      return 'N/A';
    }
  };

  if (!rrhhEnabled) {
    return (
      <div className="dashboard-container">
        <div className="alert alert-warning">
          <h1 className="text-xl font-semibold">RRHH deshabilitado</h1>
          <p className="text-sm text-gray-600">
            {/* // HARDENING: bloquear planillas cuando RRHH no está habilitado. */}
            Las funciones de planilla estarán disponibles cuando el módulo de RRHH se active en este entorno.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">Planillas</h1>
            <p className="dashboard-subtitle">Cargando nómina, periodos, cálculos y estado de pagos de RRHH.</p>
          </div>
        </div>
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando planillas...</p>
        </div>
      </div>
    );
  }

  if (!rrhhEnabled) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <p>El módulo de RRHH está deshabilitado en este entorno.</p>
        </div>
      </div>
    );
  }

  // Variables calculadas con protecciones
  const planillasArray = Array.isArray(planillas) ? planillas : [];
  const planillasCalculadas = planillasArray.filter((p: any) => p?.estado === 'calculada' || p?.estado === 'aprobada');
  const totalNomina = planillasCalculadas.reduce((sum: number, p: any) => sum + (parseFloat(p?.total_neto) || 0), 0);
  const planillasEnProceso = planillasArray.filter((p: any) => p?.estado === 'borrador').length;

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">💰 Planillas</h1>
          <p className="dashboard-subtitle">Gestión de nómina</p>
        </div>
        <button 
          className="refresh-btn"
          onClick={abrirModalPlanilla}
        >
          <span>🚀</span>
          Crear Nueva Planilla
        </button>
      </div>

      {/* Estadísticas */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <h3>Total Planillas</h3>
            <div className="stat-icon">📊</div>
          </div>
          <div className="stat-value text-blue-600">{planillasArray.length}</div>
          <div className="stat-subtitle">Períodos registrados</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Planillas Listas</h3>
            <div className="stat-icon">✅</div>
          </div>
          <div className="stat-value text-green-600">{planillasCalculadas.length}</div>
          <div className="stat-subtitle">Calculadas y aprobadas</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>En Proceso</h3>
            <div className="stat-icon">⏳</div>
          </div>
          <div className="stat-value text-amber-600">{planillasEnProceso}</div>
          <div className="stat-subtitle">Pendientes de cálculo</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Total Nómina</h3>
            <div className="stat-icon">💵</div>
          </div>
          <div className="stat-value text-purple-600">{formatCurrency(totalNomina)}</div>
          <div className="stat-subtitle">Monto total calculado</div>
        </div>
      </div>

      {/* Lista de Planillas */}
      <div className="activity-section">
        <div className="activity-header">
          <h2 className="activity-title">Períodos de Planilla</h2>
          <div className="activity-meta">
            <span>Total: {planillasArray.length} planillas | {planillasCalculadas.length} procesadas</span>
          </div>
        </div>

        <div className="activity-card">
          {planillasArray.length === 0 ? (
            <div className="activity-empty">
              <div className="text-16 mb-4">🚀</div>
              <h3>¡Comienza con tu Primera Planilla!</h3>
              <p>Usa el botón &quot;Crear Nueva Planilla&quot; para configurar y generar tu primera planilla</p>
              <button 
                className="btn btn-primary" 
                onClick={abrirModalPlanilla}
              >
                🚀 Crear Primera Planilla
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Estado</th>
                    <th>Empleados</th>
                    <th>Total Ingresos</th>
                    <th>Total Descuentos</th>
                    <th>Neto a Pagar</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {planillasArray.map((planilla: any) => (
                    <tr key={planilla?.id || 'unknown'}>
                      <td>
                        <div>
                          <strong>{planilla?.periodo || 'N/A'}</strong>
                          <div className="text-3 text-[var(--primary-500)]">
                            {formatDate(planilla?.fecha_inicio)} - {formatDate(planilla?.fecha_fin)}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={
                          planilla?.estado === 'borrador' ? 'status-warning' :
                          planilla?.estado === 'calculada' ? 'status-info' :
                          planilla?.estado === 'aprobada' || planilla?.estado === 'pagada' ? 'status-success' : 'status-error'
                        }>
                          {planilla?.estado === 'borrador' && '📝 Borrador'}
                          {planilla?.estado === 'calculada' && '🧮 Calculada'}
                          {planilla?.estado === 'aprobada' && '✅ Aprobada'}
                          {planilla?.estado === 'pagada' && '💰 Pagada'}
                          {!planilla?.estado && '❓ Sin estado'}
                        </span>
                      </td>
                      <td>
                        <span className="bg-[var(--blue-100)] text-[var(--blue-800)] py-1 px-2 rounded-3 text-3 font-bold">
                          👥 Ver detalle
                        </span>
                      </td>
                      <td className="text-green-600">
                        <strong>{formatCurrency(parseFloat(planilla?.total_ingresos) || 0)}</strong>
                      </td>
                      <td className="text-red-600">
                        <strong>{formatCurrency(parseFloat(planilla?.total_descuentos) || 0)}</strong>
                      </td>
                      <td className="text-blue-600">
                        <strong>{formatCurrency(parseFloat(planilla?.total_neto) || 0)}</strong>
                      </td>
                      <td>
                        <div className="flex gap-2 items-center flex-wrap">
                          {/* Botón Calcular - Solo para borradores */}
                          {planilla?.estado === 'borrador' && (
                            <button className="py-[4px] px-2 text-[0.7rem] font-semibold bg-blue-500 text-white border-0 rounded-[6px] cursor-pointer flex items-center gap-[4px] transition hover:bg-blue-600"
                              onClick={() => abrirCalcularPlanilla(planilla)}
                              title="Calcular planilla detallada"
                            >
                              🧮 Calcular
                            </button>
                          )}

                          {/* Botón Pagar - Para calculadas y aprobadas */}
                          {(planilla?.estado === 'calculada' || planilla?.estado === 'aprobada') && (
                            <button className="py-[4px] px-2 text-[0.7rem] font-semibold bg-emerald-600 text-white border-0 rounded-[6px] cursor-pointer flex items-center gap-[4px] transition hover:bg-emerald-700"
                              onClick={() => abrirPagarPlanilla(planilla)}
                              title="Pagar planilla"
                            >
                              💰 Pagar
                            </button>
                          )}
                          
                          {/* Botón Ver Detalle */}
                          <button className="py-[4px] px-2 text-[0.7rem] font-semibold bg-gray-500 text-white border-0 rounded-[6px] cursor-pointer flex items-center gap-[4px] transition hover:bg-gray-600"
                            onClick={() => verDetallePlanilla(planilla?.id)}
                            title="Ver detalle completo"
                          >
                            👁️ Ver
                          </button>
                          
                          {/* Botón Reporte */}
                          <button className="py-[4px] px-2 text-[0.7rem] font-semibold bg-blue-700 text-white border-0 rounded-[6px] cursor-pointer flex items-center gap-[4px] transition hover:bg-blue-800"
                            onClick={() => generarReporteProfesional(planilla?.id, planilla?.periodo)}
                            title="Generar reporte profesional"
                          >
                            📊 Reporte
                          </button>
                          
                          {/* Botón Generar Asientos - Solo para calculadas */}
                          {planilla?.estado === 'calculada' && (
                            <button className="py-[4px] px-2 text-[0.7rem] font-semibold bg-blue-700 text-white border-0 rounded-[6px] cursor-pointer flex items-center gap-[4px] transition hover:bg-blue-800"
                              onClick={() => generarAsientosContables(planilla?.id)}
                              title="Generar asientos contables"
                            >
                              📊 Asientos
                            </button>
                          )}

                          {/* Botón Aprobar - Solo para calculadas */}
                          {planilla?.estado === 'calculada' && (
                            <button className="py-[4px] px-2 text-[0.7rem] font-semibold bg-emerald-600 text-white border-0 rounded-[6px] cursor-pointer flex items-center gap-[4px] transition hover:bg-emerald-700"
                              onClick={() => aprobarPlanilla(planilla?.id)}
                              title="Aprobar planilla"
                            >
                              ✅ Aprobar
                            </button>
                          )}
                          
                          {/* Estado Aprobada - Informativo */}
                          {planilla?.estado === 'aprobada' && (
                            <span className="bg-[var(--green-100)] text-[var(--green-800)] py-[4px] px-2 rounded-[6px] text-[0.7rem] font-semibold">
                              ✅ Oficial
                            </span>
                          )}
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

      {/* Modal para ver detalle de planilla */}
      {showDetalle && Array.isArray(detallePlanilla) && (
        <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(15,_23,_42,_0.8)] flex items-center justify-center p-4 z-[1000]">
          <div className="p-10 w-[95%] max-w-[1200px] overflow-auto shadow border">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-7 font-extrabold bg-[var(--gradient-primary)] m-0">
                👁️ Detalle de Planilla
              </h2>
              <button
                onClick={() => setShowDetalle(false)} className="border-0 text-6 cursor-pointer text-[var(--primary-500)]"
              >
                ✕
              </button>
            </div>
            
            {detallePlanilla.length === 0 ? (
              <div className="text-center p-8">
                <div className="text-12 mb-4">📝</div>
                <h3>Planilla sin calcular</h3>
                <p>Esta planilla aún no tiene empleados calculados. Use el proceso automático para calcularla.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-[100%] mb-8">
                  <thead>
                    <tr>
                      <th className="text-left p-3">Empleado</th>
                      <th className="text-left p-3">Documento</th>
                      <th className="text-right p-3">Días</th>
                      <th className="text-right p-3">Ingresos</th>
                      <th className="text-right p-3">Descuentos</th>
                      <th className="text-right p-3">Neto</th>
                      <th className="text-center p-3">Boleta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detallePlanilla.map((empleado: any) => (
                      <tr key={empleado?.id || 'unknown'}>
                        <td className="p-3 border-b">
                          <strong>{empleado?.empleados?.nombres || 'N/A'} {empleado?.empleados?.apellidos || ''}</strong>
                        </td>
                        <td className="p-3 border-b">
                          {empleado?.empleados?.numero_documento || 'N/A'}
                        </td>
                        <td className="p-3 border-b text-right">
                          {empleado?.dias_trabajados || 0}
                        </td>
                        <td className="p-3 border-b text-right text-[var(--green-600)]">
                          <strong>{formatCurrency(parseFloat(empleado?.total_ingresos) || 0)}</strong>
                        </td>
                        <td className="p-3 border-b text-right text-[var(--red-600)]">
                          <strong>{formatCurrency(parseFloat(empleado?.total_descuentos) || 0)}</strong>
                        </td>
                        <td className="p-3 border-b text-right text-[var(--blue-600)]">
                          <strong>{formatCurrency(parseFloat(empleado?.neto_pagar) || 0)}</strong>
                        </td>
                        <td className="p-3 border-b text-center">
                          <button 
                            className="btn-icon"
                            onClick={() => descargarBoleta(empleado?.id)}
                            title="Descargar boleta profesional"
                          >
                            📄
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowDetalle(false)}
                className="btn btn-secondary"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Planilla */}
      <PlanillaModal
        isOpen={showPlanillaModal}
        onClose={() => {
          setShowPlanillaModal(false)
        }}
        onSuccess={handlePlanillaSuccess}
      />

      {/* Modal de Calcular Planilla */}
      <PlanillaCalcularModal
        isOpen={showCalcularModal}
        onClose={() => {
          setShowCalcularModal(false)
          setPlanillaSeleccionada(null)
        }}
        onSuccess={handleCalcularSuccess}
        planilla={planillaSeleccionada}
      />

      {/* Modal de Pagar Planilla */}
      <PlanillaPagarModal
        isOpen={showPagarModal}
        onClose={() => {
          setShowPagarModal(false)
          setPlanillaSeleccionada(null)
        }}
        onSuccess={handlePagarSuccess}
        planilla={planillaSeleccionada}
      />

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

export default PlanillasPage;
