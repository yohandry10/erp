'use client'

import React, { useState, useEffect } from 'react';
import PlanillaModal from '@/components/modals/PlanillaModal';
import PlanillaCalcularModal from '@/components/modals/PlanillaCalcularModal';
import PlanillaPagarModal from '@/components/modals/PlanillaPagarModal';
import { useApi } from '@/hooks/use-api';

const PlanillasPage = () => {
  const { get } = useApi();
  const [planillas, setPlanillas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detallePlanilla, setDetallePlanilla] = useState<any[]>([]);
  const [showDetalle, setShowDetalle] = useState(false);
  const [showPlanillaModal, setShowPlanillaModal] = useState(false);
  const [showCalcularModal, setShowCalcularModal] = useState(false);
  const [showPagarModal, setShowPagarModal] = useState(false);
  const [planillaSeleccionada, setPlanillaSeleccionada] = useState<any>(null);
  
  console.log('🔥 COMPONENTE RENDERIZADO - showPlanillaModal:', showPlanillaModal);

  useEffect(() => {
    loadPlanillas();
  }, []);

  const loadPlanillas = async () => {
    try {
      setLoading(true);
      const response = await get('/api/rrhh/planillas');
      if (response && response.success && Array.isArray(response.data)) {
        setPlanillas(response.data);
      } else {
        setPlanillas([]);
      }
    } catch (error) {
      console.error('Error cargando planillas:', error);
      setPlanillas([]);
    } finally {
      setLoading(false);
    }
  };

  const abrirModalPlanilla = () => {
    console.log('🔥 ABRIENDO MODAL PLANILLA - llamando setShowPlanillaModal(true)');
    setShowPlanillaModal(true);
    console.log('🔥 showPlanillaModal después de setState:', true);
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
    if (!confirm('¿Está seguro de generar los asientos contables para esta planilla?\n\nEsto creará registros en el módulo de contabilidad.')) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/rrhh/planillas/${planillaId}/generar-asientos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        alert(`✅ Asientos contables generados correctamente\n\n• Total registros: ${data.registros || 'N/A'}\n• Monto total: S/ ${data.monto_total || '0.00'}`);
      } else {
        throw new Error('Error generando asientos contables');
      }
    } catch (error) {
      console.error('Error generando asientos:', error);
      alert('Error generando asientos contables: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanillaSuccess = () => {
    console.log('🔥 handlePlanillaSuccess ejecutado - cerrando modal y recargando planillas');
    setShowPlanillaModal(false);
    loadPlanillas();
  };

  const verDetallePlanilla = async (planillaId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/rrhh/planillas/${planillaId}/detalle`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Detalle planilla:', data);
        setDetallePlanilla(Array.isArray(data) ? data : []);
        setShowDetalle(true);
      } else {
        alert('Error cargando detalle de planilla');
      }
    } catch (error) {
      console.error('Error cargando detalle:', error);
      alert('Error cargando detalle: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const generarReporteProfesional = async (planillaId: string, periodo: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rrhh/planillas/${planillaId}/detalle`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

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
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
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
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .company { font-size: 24px; font-weight: bold; color: #2563eb; }
            .title { font-size: 18px; margin: 10px 0; }
            .summary { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #2563eb; color: white; }
            .number { text-align: right; }
            .total-row { font-weight: bold; background-color: #f9fafb; }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="company">CABIMAS ERP</div>
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
    if (!confirm('¿Está seguro de aprobar esta planilla? Una vez aprobada no se podrá modificar.')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/api/rrhh/planillas/${planillaId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ estado: 'aprobada' }),
      });

      if (response.ok) {
        alert('✅ Planilla aprobada exitosamente');
        loadPlanillas();
      }
    } catch (error) {
      console.error('Error aprobando planilla:', error);
    }
  };

  const descargarBoleta = async (empleadoPlanillaId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/rrhh/planillas/empleado/${empleadoPlanillaId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

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
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
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
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
            .boleta { background: white; padding: 30px; margin: 0 auto; max-width: 600px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
            .company { font-size: 24px; font-weight: bold; color: #2563eb; margin-bottom: 5px; }
            .title { font-size: 18px; color: #666; }
            .empleado { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .section { margin-bottom: 20px; }
            .section-title { font-size: 16px; font-weight: bold; color: #2563eb; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }
            .item { display: flex; justify-content: space-between; padding: 5px 0; }
            .item.total { font-weight: bold; background: #e7f3ff; padding: 10px; border-radius: 5px; }
            .amount { font-weight: bold; }
            .positive { color: #059669; }
            .negative { color: #dc2626; }
        </style>
    </head>
    <body>
        <div class="boleta">
            <div class="header">
                <div class="company">CABIMAS ERP</div>
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

            <div class="item total" style="background: #2563eb; color: white; font-size: 18px;">
                <span>NETO A PAGAR</span>
                <span class="amount">S/ ${(parseFloat(data?.neto_pagar) || 0).toFixed(2)}</span>
            </div>

            <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #666;">
                <p>Este documento es generado automáticamente por el Sistema ERP CABIMAS</p>
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
    } catch (error) {
      return 'N/A';
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando planillas...</p>
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
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚀</div>
              <h3>¡Comienza con tu Primera Planilla!</h3>
              <p>Usa el botón "Crear Nueva Planilla" para configurar y generar tu primera planilla</p>
              <button 
                className="btn btn-primary" 
                onClick={abrirModalPlanilla}
              >
                🚀 Crear Primera Planilla
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
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
                          <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)' }}>
                            {formatDate(planilla?.fecha_inicio)} - {formatDate(planilla?.fecha_fin)}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={
                          planilla?.estado === 'borrador' ? 'status-warning' :
                          planilla?.estado === 'calculada' ? 'status-info' :
                          planilla?.estado === 'aprobada' ? 'status-success' : 'status-error'
                        }>
                          {planilla?.estado === 'borrador' && '📝 Borrador'}
                          {planilla?.estado === 'calculada' && '🧮 Calculada'}
                          {planilla?.estado === 'aprobada' && '✅ Aprobada'}
                          {!planilla?.estado && '❓ Sin estado'}
                        </span>
                      </td>
                      <td>
                        <span style={{ 
                          background: 'var(--blue-100)', 
                          color: 'var(--blue-800)', 
                          padding: '0.25rem 0.5rem', 
                          borderRadius: '12px', 
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}>
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
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          {/* Botón Calcular - Solo para borradores */}
                          {planilla?.estado === 'borrador' && (
                            <button 
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.7rem',
                                fontWeight: '600',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.2s'
                              }}
                              onClick={() => abrirCalcularPlanilla(planilla)}
                              title="Calcular planilla detallada"
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
                            >
                              🧮 Calcular
                            </button>
                          )}

                          {/* Botón Pagar - Para calculadas y aprobadas */}
                          {(planilla?.estado === 'calculada' || planilla?.estado === 'aprobada') && (
                            <button 
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.7rem',
                                fontWeight: '600',
                                backgroundColor: '#059669',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.2s'
                              }}
                              onClick={() => abrirPagarPlanilla(planilla)}
                              title="Pagar planilla"
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#047857'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                            >
                              💰 Pagar
                            </button>
                          )}
                          
                          {/* Botón Ver Detalle */}
                          <button 
                            style={{
                              padding: '4px 8px',
                              fontSize: '0.7rem',
                              fontWeight: '600',
                              backgroundColor: '#6b7280',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              transition: 'all 0.2s'
                            }}
                            onClick={() => verDetallePlanilla(planilla?.id)}
                            title="Ver detalle completo"
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#6b7280'}
                          >
                            👁️ Ver
                          </button>
                          
                          {/* Botón Reporte */}
                          <button 
                            style={{
                              padding: '4px 8px',
                              fontSize: '0.7rem',
                              fontWeight: '600',
                              backgroundColor: '#7c3aed',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              transition: 'all 0.2s'
                            }}
                            onClick={() => generarReporteProfesional(planilla?.id, planilla?.periodo)}
                            title="Generar reporte profesional"
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#6d28d9'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#7c3aed'}
                          >
                            📊 Reporte
                          </button>
                          
                          {/* Botón Generar Asientos - Solo para calculadas */}
                          {planilla?.estado === 'calculada' && (
                            <button 
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.7rem',
                                fontWeight: '600',
                                backgroundColor: '#7c3aed',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.2s'
                              }}
                              onClick={() => generarAsientosContables(planilla?.id)}
                              title="Generar asientos contables"
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#6d28d9'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#7c3aed'}
                            >
                              📊 Asientos
                            </button>
                          )}

                          {/* Botón Aprobar - Solo para calculadas */}
                          {planilla?.estado === 'calculada' && (
                            <button 
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.7rem',
                                fontWeight: '600',
                                backgroundColor: '#059669',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.2s'
                              }}
                              onClick={() => aprobarPlanilla(planilla?.id)}
                              title="Aprobar planilla"
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#047857'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                            >
                              ✅ Aprobar
                            </button>
                          )}
                          
                          {/* Estado Aprobada - Informativo */}
                          {planilla?.estado === 'aprobada' && (
                            <span style={{ 
                              background: 'var(--green-100)', 
                              color: 'var(--green-800)', 
                              padding: '4px 8px', 
                              borderRadius: '6px', 
                              fontSize: '0.7rem',
                              fontWeight: '600'
                            }}>
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
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          zIndex: 1000
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
            backdropFilter: 'blur(20px) saturate(180%)',
            borderRadius: 'var(--border-radius-xl)',
            padding: '2.5rem',
            width: '95%',
            maxWidth: '1200px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: 'var(--shadow-2xl)',
            border: '1px solid rgba(255, 255, 255, 0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2 style={{
                fontSize: '1.75rem',
                fontWeight: '800',
                background: 'var(--gradient-primary)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                margin: 0
              }}>
                👁️ Detalle de Planilla
              </h2>
              <button
                onClick={() => setShowDetalle(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: 'var(--primary-500)'
                }}
              >
                ✕
              </button>
            </div>
            
            {detallePlanilla.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
                <h3>Planilla sin calcular</h3>
                <p>Esta planilla aún no tiene empleados calculados. Use el proceso automático para calcularla.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', marginBottom: '2rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid var(--primary-200)' }}>Empleado</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid var(--primary-200)' }}>Documento</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', borderBottom: '2px solid var(--primary-200)' }}>Días</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', borderBottom: '2px solid var(--primary-200)' }}>Ingresos</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', borderBottom: '2px solid var(--primary-200)' }}>Descuentos</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', borderBottom: '2px solid var(--primary-200)' }}>Neto</th>
                      <th style={{ textAlign: 'center', padding: '0.75rem', borderBottom: '2px solid var(--primary-200)' }}>Boleta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detallePlanilla.map((empleado: any) => (
                      <tr key={empleado?.id || 'unknown'}>
                        <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--primary-100)' }}>
                          <strong>{empleado?.empleados?.nombres || 'N/A'} {empleado?.empleados?.apellidos || ''}</strong>
                        </td>
                        <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--primary-100)' }}>
                          {empleado?.empleados?.numero_documento || 'N/A'}
                        </td>
                        <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--primary-100)', textAlign: 'right' }}>
                          {empleado?.dias_trabajados || 0}
                        </td>
                        <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--primary-100)', textAlign: 'right', color: 'var(--green-600)' }}>
                          <strong>{formatCurrency(parseFloat(empleado?.total_ingresos) || 0)}</strong>
                        </td>
                        <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--primary-100)', textAlign: 'right', color: 'var(--red-600)' }}>
                          <strong>{formatCurrency(parseFloat(empleado?.total_descuentos) || 0)}</strong>
                        </td>
                        <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--primary-100)', textAlign: 'right', color: 'var(--blue-600)' }}>
                          <strong>{formatCurrency(parseFloat(empleado?.neto_pagar) || 0)}</strong>
                        </td>
                        <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--primary-100)', textAlign: 'center' }}>
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

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '1rem'
            }}>
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
      {console.log('🔥 RENDERIZANDO MODAL - showPlanillaModal:', showPlanillaModal)}
      <PlanillaModal
        isOpen={showPlanillaModal}
        onClose={() => {
          console.log('🔥 onClose llamado - cerrando modal')
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
    </div>
  );
};

export default PlanillasPage;