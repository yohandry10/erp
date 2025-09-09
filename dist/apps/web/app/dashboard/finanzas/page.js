'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = FinanzasPage;
const react_1 = require("react");
const use_api_1 = require("@/hooks/use-api");
function FinanzasPage() {
    const [dashboard, setDashboard] = (0, react_1.useState)(null);
    const [analisisCredito, setAnalisisCredito] = (0, react_1.useState)(null);
    const [vistaActual, setVistaActual] = (0, react_1.useState)('dashboard');
    const [montoCredito, setMontoCredito] = (0, react_1.useState)('');
    const api = (0, use_api_1.useApiCall)();
    (0, react_1.useEffect)(() => {
        cargarDatos();
    }, []);
    const cargarDatos = async () => {
        try {
            console.log('💰 Cargando dashboard financiero...');
            const response = await api.get('/api/finanzas/dashboard');
            if (response && response.success && response.data) {
                console.log('✅ Dashboard financiero cargado:', response.data);
                setDashboard(response.data);
            }
            else {
                console.log('❌ No se pudo cargar dashboard financiero:', response);
                setDashboard(null);
            }
        }
        catch (error) {
            console.error('❌ Error cargando dashboard financiero:', error);
            setDashboard(null);
        }
    };
    const analizarCredito = async () => {
        if (!montoCredito)
            return;
        try {
            console.log('🔍 Analizando crédito para monto:', montoCredito);
            const response = await api.get(`/api/finanzas/analisis-credito?monto=${parseFloat(montoCredito)}`);
            if (response && response.success && response.data) {
                console.log('✅ Análisis de crédito completado:', response.data);
                setAnalisisCredito(response.data);
            }
            else {
                console.log('❌ No se pudo completar análisis de crédito:', response);
                setAnalisisCredito(null);
            }
        }
        catch (error) {
            console.error('❌ Error analizando crédito:', error);
            setAnalisisCredito(null);
        }
    };
    const formatearMoneda = (valor) => {
        return new Intl.NumberFormat('es-PE', {
            style: 'currency',
            currency: 'PEN'
        }).format(valor);
    };
    const getColorEstado = (estado) => {
        switch (estado) {
            case 'EXCELENTE': return '#10b981';
            case 'BUENA':
            case 'POSITIVO':
            case 'BAJO': return '#3b82f6';
            case 'REGULAR':
            case 'ESTABLE':
            case 'MEDIO': return '#f59e0b';
            case 'MALA':
            case 'ALTO': return '#ef4444';
            case 'CRITICA':
            case 'NEGATIVO': return '#7f1d1d';
            default: return '#6b7280';
        }
    };
    const renderDashboard = () => {
        if (!dashboard)
            return <div>Cargando...</div>;
        return (<div style={{ display: 'grid', gap: '2rem' }}>
        {/* Resumen General */}
        <div className="activity-card">
          <h2 style={{ marginBottom: '2rem' }}>📊 Estado Financiero General</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div style={{
                textAlign: 'center',
                padding: '1.5rem',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: `3px solid ${getColorEstado(dashboard.resumenGeneral.liquidez)}`
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💧</div>
              <div style={{ fontWeight: '700', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Liquidez</div>
              <div style={{
                fontWeight: '600',
                color: getColorEstado(dashboard.resumenGeneral.liquidez),
                fontSize: '1.2rem'
            }}>
                {dashboard.resumenGeneral.liquidez}
              </div>
            </div>

            <div style={{
                textAlign: 'center',
                padding: '1.5rem',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: `3px solid ${getColorEstado(dashboard.resumenGeneral.rentabilidad)}`
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📈</div>
              <div style={{ fontWeight: '700', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Rentabilidad</div>
              <div style={{
                fontWeight: '600',
                color: getColorEstado(dashboard.resumenGeneral.rentabilidad),
                fontSize: '1.2rem'
            }}>
                {dashboard.resumenGeneral.rentabilidad}
              </div>
            </div>

            <div style={{
                textAlign: 'center',
                padding: '1.5rem',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: `3px solid ${getColorEstado(dashboard.resumenGeneral.endeudamiento)}`
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💳</div>
              <div style={{ fontWeight: '700', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Endeudamiento</div>
              <div style={{
                fontWeight: '600',
                color: getColorEstado(dashboard.resumenGeneral.endeudamiento),
                fontSize: '1.2rem'
            }}>
                {dashboard.resumenGeneral.endeudamiento}
              </div>
            </div>

            <div style={{
                textAlign: 'center',
                padding: '1.5rem',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: `3px solid ${getColorEstado(dashboard.resumenGeneral.crecimiento)}`
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🚀</div>
              <div style={{ fontWeight: '700', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Crecimiento</div>
              <div style={{
                fontWeight: '600',
                color: getColorEstado(dashboard.resumenGeneral.crecimiento),
                fontSize: '1.2rem'
            }}>
                {dashboard.resumenGeneral.crecimiento}
              </div>
            </div>
          </div>
        </div>

        {/* Indicadores Clave */}
        <div className="activity-card">
          <h2 style={{ marginBottom: '2rem' }}>💰 Indicadores Financieros Clave</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
            <div style={{ backgroundColor: '#ecfdf5', padding: '1.5rem', borderRadius: '8px', border: '1px solid #10b981' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.9rem', color: '#065f46', fontWeight: '600' }}>💵 Efectivo Disponible</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#10b981' }}>
                    {formatearMoneda(dashboard.indicadores.efectivoDisponible)}
                  </div>
                </div>
                <div style={{ fontSize: '2.5rem' }}>💵</div>
              </div>
            </div>

            <div style={{ backgroundColor: '#eff6ff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.9rem', color: '#1e40af', fontWeight: '600' }}>📊 Ventas (30 días)</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#3b82f6' }}>
                    {formatearMoneda(dashboard.indicadores.ventasUltimos30dias)}
                  </div>
                </div>
                <div style={{ fontSize: '2.5rem' }}>📊</div>
              </div>
            </div>

            <div style={{ backgroundColor: '#fef3c7', padding: '1.5rem', borderRadius: '8px', border: '1px solid #f59e0b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.9rem', color: '#92400e', fontWeight: '600' }}>💸 Gastos (30 días)</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#f59e0b' }}>
                    {formatearMoneda(dashboard.indicadores.gastosUltimos30dias)}
                  </div>
                </div>
                <div style={{ fontSize: '2.5rem' }}>💸</div>
              </div>
            </div>

            <div style={{ backgroundColor: '#f0f9ff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #0ea5e9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.9rem', color: '#0c4a6e', fontWeight: '600' }}>📋 Cuentas por Cobrar</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#0ea5e9' }}>
                    {formatearMoneda(dashboard.indicadores.cuentasPorCobrar)}
                  </div>
                </div>
                <div style={{ fontSize: '2.5rem' }}>📋</div>
              </div>
            </div>

            <div style={{ backgroundColor: '#fef2f2', padding: '1.5rem', borderRadius: '8px', border: '1px solid #ef4444' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.9rem', color: '#991b1b', fontWeight: '600' }}>💳 Cuentas por Pagar</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#ef4444' }}>
                    {formatearMoneda(dashboard.indicadores.cuentasPorPagar)}
                  </div>
                </div>
                <div style={{ fontSize: '2.5rem' }}>💳</div>
              </div>
            </div>

            <div style={{
                backgroundColor: dashboard.indicadores.utilidadUltimos30dias >= 0 ? '#ecfdf5' : '#fef2f2',
                padding: '1.5rem',
                borderRadius: '8px',
                border: `1px solid ${dashboard.indicadores.utilidadUltimos30dias >= 0 ? '#10b981' : '#ef4444'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.9rem', color: dashboard.indicadores.utilidadUltimos30dias >= 0 ? '#065f46' : '#991b1b', fontWeight: '600' }}>
                    📈 Utilidad (30 días)
                  </div>
                  <div style={{
                fontSize: '1.8rem',
                fontWeight: '700',
                color: dashboard.indicadores.utilidadUltimos30dias >= 0 ? '#10b981' : '#ef4444'
            }}>
                    {formatearMoneda(dashboard.indicadores.utilidadUltimos30dias)}
                  </div>
                </div>
                <div style={{ fontSize: '2.5rem' }}>
                  {dashboard.indicadores.utilidadUltimos30dias >= 0 ? '📈' : '📉'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Alertas */}
        {dashboard.alertas.length > 0 && (<div className="activity-card">
            <h2 style={{ marginBottom: '2rem' }}>🚨 Alertas Financieras</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {dashboard.alertas.map((alerta, index) => (<div key={index} style={{
                        padding: '1rem',
                        borderRadius: '8px',
                        border: `1px solid ${alerta.tipo === 'CRITICA' ? '#ef4444' : alerta.tipo === 'ADVERTENCIA' ? '#f59e0b' : '#3b82f6'}`,
                        backgroundColor: alerta.tipo === 'CRITICA' ? '#fef2f2' : alerta.tipo === 'ADVERTENCIA' ? '#fef3c7' : '#eff6ff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem'
                    }}>
                  <div style={{ fontSize: '1.5rem' }}>
                    {alerta.tipo === 'CRITICA' ? '🔴' : alerta.tipo === 'ADVERTENCIA' ? '🟡' : '🔵'}
                  </div>
                  <div style={{
                        color: alerta.tipo === 'CRITICA' ? '#991b1b' : alerta.tipo === 'ADVERTENCIA' ? '#92400e' : '#1e40af',
                        fontWeight: '600'
                    }}>
                    {alerta.mensaje}
                  </div>
                </div>))}
            </div>
          </div>)}
      </div>);
    };
    const renderAnalisisCredito = () => {
        return (<div style={{ display: 'grid', gap: '2rem' }}>
        {/* Formulario de Análisis */}
        <div className="activity-card">
          <h2 style={{ marginBottom: '2rem' }}>🏦 Análisis de Capacidad Crediticia</h2>
          
          <div style={{ maxWidth: '400px', margin: '0 auto 2rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
              Monto del Crédito Solicitado:
            </label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <input type="number" value={montoCredito} onChange={(e) => setMontoCredito(e.target.value)} placeholder="Ejemplo: 50000" style={{
                flex: 1,
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.1)',
                fontSize: '1rem'
            }}/>
              <button onClick={analizarCredito} disabled={!montoCredito || api.loading} style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: api.loading ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: api.loading ? 'not-allowed' : 'pointer',
                fontWeight: '600'
            }}>
                {api.loading ? 'Analizando...' : 'Analizar'}
              </button>
            </div>
          </div>

          {analisisCredito && (<div style={{ display: 'grid', gap: '2rem' }}>
              {/* Resultado del Análisis */}
              <div style={{
                    textAlign: 'center',
                    padding: '2rem',
                    backgroundColor: analisisCredito.recomendacion === 'RECOMENDAR' ? '#ecfdf5' :
                        analisisCredito.recomendacion === 'ANALIZAR' ? '#fef3c7' : '#fef2f2',
                    borderRadius: '12px',
                    border: `3px solid ${analisisCredito.recomendacion === 'RECOMENDAR' ? '#10b981' :
                        analisisCredito.recomendacion === 'ANALIZAR' ? '#f59e0b' : '#ef4444'}`
                }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                  {analisisCredito.recomendacion === 'RECOMENDAR' ? '✅' :
                    analisisCredito.recomendacion === 'ANALIZAR' ? '⚠️' : '❌'}
                </div>
                <div style={{
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    color: analisisCredito.recomendacion === 'RECOMENDAR' ? '#065f46' :
                        analisisCredito.recomendacion === 'ANALIZAR' ? '#92400e' : '#991b1b',
                    marginBottom: '1rem'
                }}>
                  {analisisCredito.recomendacion === 'RECOMENDAR' ? 'CRÉDITO RECOMENDADO' :
                    analisisCredito.recomendacion === 'ANALIZAR' ? 'REQUIERE ANÁLISIS ADICIONAL' : 'NO RECOMENDADO'}
                </div>
                <div style={{ fontSize: '1rem', color: '#6b7280' }}>
                  {analisisCredito.justificacion}
                </div>
              </div>

              {/* Puntuación */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div style={{ textAlign: 'center', padding: '1.5rem', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>💧</div>
                  <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Liquidez</div>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: '#3b82f6' }}>
                    {analisisCredito.puntuacion.liquidez}/100
                  </div>
                </div>

                <div style={{ textAlign: 'center', padding: '1.5rem', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📈</div>
                  <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Rentabilidad</div>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: '#10b981' }}>
                    {analisisCredito.puntuacion.rentabilidad}/100
                  </div>
                </div>

                <div style={{ textAlign: 'center', padding: '1.5rem', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📋</div>
                  <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Historial</div>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: '#f59e0b' }}>
                    {analisisCredito.puntuacion.historialPagos}/100
                  </div>
                </div>

                <div style={{ textAlign: 'center', padding: '1.5rem', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚖️</div>
                  <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Estabilidad</div>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: '#8b5cf6' }}>
                    {analisisCredito.puntuacion.estabilidad}/100
                  </div>
                </div>
              </div>

              {/* Capacidad de Pago */}
              <div className="activity-card" style={{ backgroundColor: '#f8fafc' }}>
                <h3 style={{ marginBottom: '1.5rem' }}>💰 Análisis de Capacidad de Pago</h3>
                
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: 'white', borderRadius: '6px' }}>
                    <span>Ingresos Mensuales:</span>
                    <span style={{ fontWeight: '600', color: '#10b981' }}>
                      {formatearMoneda(analisisCredito.capacidadPago.ingresosMensuales)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: 'white', borderRadius: '6px' }}>
                    <span>Gastos Fijos:</span>
                    <span style={{ fontWeight: '600', color: '#ef4444' }}>
                      {formatearMoneda(analisisCredito.capacidadPago.gastosFijos)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: 'white', borderRadius: '6px' }}>
                    <span>% de Gastos:</span>
                    <span style={{ fontWeight: '600' }}>
                      {analisisCredito.capacidadPago.gastosPorcentaje.toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: '#ecfdf5', borderRadius: '6px', border: '1px solid #10b981' }}>
                    <span style={{ fontWeight: '700' }}>Capacidad Disponible:</span>
                    <span style={{ fontWeight: '700', color: '#10b981' }}>
                      {formatearMoneda(analisisCredito.capacidadPago.capacidadDisponible)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: '#eff6ff', borderRadius: '6px', border: '1px solid #3b82f6' }}>
                    <span style={{ fontWeight: '700' }}>Monto Máximo Recomendado:</span>
                    <span style={{ fontWeight: '700', color: '#3b82f6' }}>
                      {formatearMoneda(analisisCredito.capacidadPago.recomendacionMaxima)}
                    </span>
                  </div>
                </div>
              </div>
            </div>)}
        </div>
      </div>);
    };
    return (<div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">💼 Análisis Financiero</h1>
      </div>

      {/* Navegación */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', backgroundColor: '#f3f4f6', padding: '0.5rem', borderRadius: '8px' }}>
          <button onClick={() => setVistaActual('dashboard')} style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: vistaActual === 'dashboard' ? '#3b82f6' : 'transparent',
            color: vistaActual === 'dashboard' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600'
        }}>
            📊 Dashboard Financiero
          </button>
          <button onClick={() => setVistaActual('credito')} style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: vistaActual === 'credito' ? '#3b82f6' : 'transparent',
            color: vistaActual === 'credito' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600'
        }}>
            🏦 Análisis de Crédito
          </button>
        </div>
      </div>

      {/* Contenido */}
      {vistaActual === 'dashboard' && renderDashboard()}
      {vistaActual === 'credito' && renderAnalisisCredito()}
    </div>);
}
