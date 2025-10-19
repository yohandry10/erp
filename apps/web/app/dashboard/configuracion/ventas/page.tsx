'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import { useEmpresaConfig } from '@/hooks/use-empresa-config'
import { Building2, Truck, FileText, AlertTriangle } from 'lucide-react'

type TipoEmpresa = 'MICRO' | 'PEQUEÑA' | 'MEDIANA' | 'GRANDE'

interface VentasConfig {
  tipo_empresa: TipoEmpresa
  usar_flujo_logistica: boolean
  gre_obligatorio: boolean
  gre_automatico_habilitado: boolean
  umbral_gre_automatico: number
}

const inputStyles = {
  width: '100%',
  padding: '0.75rem',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.4)',
  background: 'rgba(255,255,255,0.08)',
  color: '#ffffff',
  fontSize: '0.9rem',
  outline: 'none',
  transition: 'all 0.2s ease',
}

export default function ConfiguracionVentasPage() {
  const { get, put } = useApi()
  const { config: empresaConfig, refreshConfig } = useEmpresaConfig()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [config, setConfig] = useState<VentasConfig>({
    tipo_empresa: 'MICRO',
    usar_flujo_logistica: false,
    gre_obligatorio: false,
    gre_automatico_habilitado: true,
    umbral_gre_automatico: 700,
  })
  const [originalFlujoLogistica, setOriginalFlujoLogistica] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  useEffect(() => {
    // Initialize from context if available
    if (empresaConfig) {
      setConfig({
        tipo_empresa: empresaConfig.tipo_empresa,
        usar_flujo_logistica: empresaConfig.usar_flujo_logistica,
        gre_obligatorio: empresaConfig.gre_obligatorio,
        gre_automatico_habilitado: empresaConfig.gre_automatico_habilitado,
        umbral_gre_automatico: empresaConfig.umbral_gre_automatico,
      })
      setOriginalFlujoLogistica(empresaConfig.usar_flujo_logistica)
    }
  }, [empresaConfig])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const response = await get('/api/configuracion/empresa')
      
      if (response && response.success && response.data) {
        const data = response.data
        const ventasConfig: VentasConfig = {
          tipo_empresa: data.tipo_empresa || 'MICRO',
          usar_flujo_logistica: data.usar_flujo_logistica !== undefined ? data.usar_flujo_logistica : false,
          gre_obligatorio: data.gre_obligatorio !== undefined ? data.gre_obligatorio : false,
          gre_automatico_habilitado: data.gre_automatico_habilitado !== undefined ? data.gre_automatico_habilitado : true,
          umbral_gre_automatico: data.umbral_gre_automatico || 700,
        }
        setConfig(ventasConfig)
        setOriginalFlujoLogistica(ventasConfig.usar_flujo_logistica)
      }
    } catch (error) {
      console.error('❌ Error cargando configuración:', error)
      alert('Error cargando configuración: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleTipoEmpresaChange = (tipo: TipoEmpresa) => {
    // Auto-configure usar_flujo_logistica based on company type
    const usarFlujo = tipo === 'MEDIANA' || tipo === 'GRANDE'
    setConfig(prev => ({
      ...prev,
      tipo_empresa: tipo,
      usar_flujo_logistica: usarFlujo,
    }))
    
    // Show warning if changing flujo_logistica
    if (usarFlujo !== originalFlujoLogistica) {
      setShowWarning(true)
    } else {
      setShowWarning(false)
    }
  }

  const handleFlujoLogisticaChange = (value: boolean) => {
    setConfig(prev => ({ ...prev, usar_flujo_logistica: value }))
    
    // Show warning if changing from original value
    if (value !== originalFlujoLogistica) {
      setShowWarning(true)
    } else {
      setShowWarning(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      
      const response = await put('/api/configuracion/empresa', {
        tipo_empresa: config.tipo_empresa,
        usar_flujo_logistica: config.usar_flujo_logistica,
        gre_obligatorio: config.gre_obligatorio,
        gre_automatico_habilitado: config.gre_automatico_habilitado,
        umbral_gre_automatico: config.umbral_gre_automatico,
      })
      
      if (response && response.success) {
        alert('✅ Configuración de ventas guardada exitosamente')
        setOriginalFlujoLogistica(config.usar_flujo_logistica)
        setShowWarning(false)
        // Refresh the cached config in context
        await refreshConfig()
      } else {
        throw new Error(response?.message || 'Error desconocido')
      }
    } catch (error) {
      console.error('❌ Error guardando:', error)
      alert('❌ Error guardando configuración: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '400px',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div style={{ fontSize: '3rem' }}>⚙️</div>
          <h3>Cargando configuración...</h3>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">Configuración de Ventas</h1>
        <p className="dashboard-subtitle">Configura los flujos de trabajo y políticas de ventas</p>
        <button 
          className="refresh-btn"
          onClick={handleSave}
          disabled={saving}
          style={{
            background: saving ? '#6b7280' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? '⏳ Guardando...' : '💾 Guardar Cambios'}
        </button>
      </div>

      {/* Warning Banner */}
      {showWarning && (
        <div style={{
          marginBottom: '2rem',
          padding: '1.5rem',
          background: 'rgba(251, 191, 36, 0.1)',
          border: '2px solid rgba(251, 191, 36, 0.3)',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '1rem',
        }}>
          <AlertTriangle size={24} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h3 style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#f59e0b' }}>
              ⚠️ Advertencia: Cambio de Flujo de Trabajo
            </h3>
            <p style={{ fontSize: '0.9rem', lineHeight: '1.5', margin: 0 }}>
              Estás cambiando el flujo de trabajo de ventas. Esto afectará cómo se procesan los pedidos:
            </p>
            <ul style={{ marginTop: '0.5rem', marginBottom: 0, paddingLeft: '1.5rem' }}>
              <li>Los pedidos existentes mantendrán su flujo actual</li>
              <li>Los nuevos pedidos usarán el flujo configurado aquí</li>
              <li>Asegúrate de comunicar este cambio a tu equipo</li>
            </ul>
          </div>
        </div>
      )}

      {/* Tipo de Empresa */}
      <div className="activity-section">
        <h2 className="activity-title">Tipo de Empresa</h2>
        <div className="activity-card" style={{ padding: '2rem' }}>
          <p style={{ marginBottom: '1.5rem', opacity: 0.9 }}>
            Selecciona el tipo de empresa para configurar automáticamente los flujos de trabajo apropiados
          </p>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1rem',
          }}>
            {[
              { value: 'MICRO' as TipoEmpresa, label: 'Microempresa', icon: <Building2 size={24} />, flujo: false },
              { value: 'PEQUEÑA' as TipoEmpresa, label: 'Pequeña Empresa', icon: <Building2 size={24} />, flujo: false },
              { value: 'MEDIANA' as TipoEmpresa, label: 'Mediana Empresa', icon: <Truck size={24} />, flujo: true },
              { value: 'GRANDE' as TipoEmpresa, label: 'Gran Empresa', icon: <FileText size={24} />, flujo: true },
            ].map((tipo) => (
              <button
                key={tipo.value}
                type="button"
                onClick={() => handleTipoEmpresaChange(tipo.value)}
                style={{
                  padding: '1.5rem',
                  borderRadius: '12px',
                  border: config.tipo_empresa === tipo.value
                    ? '2px solid rgba(59, 130, 246, 0.8)'
                    : '2px solid rgba(255, 255, 255, 0.2)',
                  background: config.tipo_empresa === tipo.value
                    ? 'rgba(59, 130, 246, 0.15)'
                    : 'rgba(255, 255, 255, 0.05)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  color: config.tipo_empresa === tipo.value ? '#3b82f6' : '#ffffff',
                }}>
                  {tipo.icon}
                  <span style={{ fontWeight: '600', fontSize: '1rem' }}>
                    {tipo.label}
                  </span>
                </div>
                <p style={{
                  fontSize: '0.875rem',
                  opacity: 0.8,
                  margin: 0,
                  lineHeight: '1.4',
                }}>
                  {tipo.flujo ? 'Flujo completo con logística' : 'Flujo simplificado'}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Flujo de Trabajo */}
      <div className="activity-section">
        <h2 className="activity-title">Flujo de Trabajo</h2>
        <div className="activity-card" style={{ padding: '2rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '1rem',
            padding: '1.5rem',
            background: config.usar_flujo_logistica 
              ? 'rgba(16, 185, 129, 0.1)' 
              : 'rgba(251, 191, 36, 0.1)',
            borderRadius: '12px',
            border: config.usar_flujo_logistica
              ? '1px solid rgba(16, 185, 129, 0.3)'
              : '1px solid rgba(251, 191, 36, 0.3)',
            marginBottom: '1.5rem',
          }}>
            <input
              type="checkbox"
              id="usar_flujo_logistica"
              checked={config.usar_flujo_logistica}
              onChange={(e) => handleFlujoLogisticaChange(e.target.checked)}
              style={{
                width: '24px',
                height: '24px',
                marginTop: '2px',
                cursor: 'pointer',
              }}
            />
            <div style={{ flex: 1 }}>
              <label htmlFor="usar_flujo_logistica" style={{ 
                cursor: 'pointer', 
                fontWeight: '600',
                fontSize: '1.1rem',
                display: 'block',
                marginBottom: '0.5rem',
              }}>
                Usar Flujo Logístico Completo
              </label>
              <p style={{
                fontSize: '0.9rem',
                opacity: 0.9,
                margin: 0,
                lineHeight: '1.5',
              }}>
                {config.usar_flujo_logistica
                  ? 'Los pedidos pasarán por etapas de preparación y despacho en el módulo de Inventario antes de facturar. Ideal para empresas con almacén y control logístico.'
                  : 'Los pedidos irán directamente de confirmación a facturación. Ideal para operaciones ágiles sin necesidad de control de almacén.'
                }
              </p>
            </div>
          </div>

          {/* Flow Diagram */}
          <div style={{
            padding: '1.5rem',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <h3 style={{ fontWeight: '600', marginBottom: '1rem', fontSize: '1rem' }}>
              {config.usar_flujo_logistica ? '📦 Flujo Completo' : '⚡ Flujo Simplificado'}
            </h3>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
              fontSize: '0.9rem',
            }}>
              <span style={{ padding: '0.5rem 1rem', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '6px' }}>
                Pedido
              </span>
              <span>→</span>
              <span style={{ padding: '0.5rem 1rem', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '6px' }}>
                Confirmado
              </span>
              {config.usar_flujo_logistica && (
                <>
                  <span>→</span>
                  <span style={{ padding: '0.5rem 1rem', background: 'rgba(16, 185, 129, 0.2)', borderRadius: '6px' }}>
                    Preparación
                  </span>
                  <span>→</span>
                  <span style={{ padding: '0.5rem 1rem', background: 'rgba(16, 185, 129, 0.2)', borderRadius: '6px' }}>
                    Despacho
                  </span>
                </>
              )}
              <span>→</span>
              <span style={{ padding: '0.5rem 1rem', background: 'rgba(34, 197, 94, 0.2)', borderRadius: '6px' }}>
                Facturación
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Configuración GRE */}
      <div className="activity-section">
        <h2 className="activity-title">Guías de Remisión Electrónica (GRE)</h2>
        <div className="activity-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* GRE Obligatorio */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '1rem',
              padding: '1.5rem',
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}>
              <input
                type="checkbox"
                id="gre_obligatorio"
                checked={config.gre_obligatorio}
                onChange={(e) => setConfig(prev => ({ ...prev, gre_obligatorio: e.target.checked }))}
                style={{
                  width: '24px',
                  height: '24px',
                  marginTop: '2px',
                  cursor: 'pointer',
                }}
              />
              <div style={{ flex: 1 }}>
                <label htmlFor="gre_obligatorio" style={{ 
                  cursor: 'pointer', 
                  fontWeight: '600',
                  fontSize: '1rem',
                  display: 'block',
                  marginBottom: '0.5rem',
                }}>
                  GRE Obligatorio
                </label>
                <p style={{
                  fontSize: '0.875rem',
                  opacity: 0.8,
                  margin: 0,
                }}>
                  Exigir generación de GRE antes de completar pedidos
                </p>
              </div>
            </div>

            {/* GRE Automático */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '1rem',
              padding: '1.5rem',
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}>
              <input
                type="checkbox"
                id="gre_automatico"
                checked={config.gre_automatico_habilitado}
                onChange={(e) => setConfig(prev => ({ ...prev, gre_automatico_habilitado: e.target.checked }))}
                style={{
                  width: '24px',
                  height: '24px',
                  marginTop: '2px',
                  cursor: 'pointer',
                }}
              />
              <div style={{ flex: 1 }}>
                <label htmlFor="gre_automatico" style={{ 
                  cursor: 'pointer', 
                  fontWeight: '600',
                  fontSize: '1rem',
                  display: 'block',
                  marginBottom: '0.5rem',
                }}>
                  Sugerencia Automática de GRE
                </label>
                <p style={{
                  fontSize: '0.875rem',
                  opacity: 0.8,
                  margin: 0,
                }}>
                  Sugerir generación de GRE cuando el monto supere el umbral configurado
                </p>
              </div>
            </div>

            {/* Umbral GRE */}
            {config.gre_automatico_habilitado && (
              <div style={{
                padding: '1.5rem',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}>
                <label htmlFor="umbral_gre" style={{ 
                  display: 'block', 
                  fontWeight: '600',
                  fontSize: '1rem',
                  marginBottom: '1rem',
                }}>
                  Umbral para Sugerencia de GRE (S/)
                </label>
                <input
                  type="number"
                  id="umbral_gre"
                  value={config.umbral_gre_automatico}
                  onChange={(e) => setConfig(prev => ({ ...prev, umbral_gre_automatico: parseFloat(e.target.value) || 0 }))}
                  min="0"
                  step="0.01"
                  style={inputStyles}
                />
                <p style={{
                  fontSize: '0.875rem',
                  opacity: 0.7,
                  marginTop: '0.75rem',
                  marginBottom: 0,
                }}>
                  Monto mínimo (en soles) para sugerir la generación de GRE. Por defecto: S/ 700.00
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
