'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'

// Estilos CSS para mejorar la visibilidad
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
  '::placeholder': {
    color: 'rgba(255,255,255,0.6)',
    fontStyle: 'italic'
  },
  ':focus': {
    border: '1px solid rgba(255,255,255,0.6)',
    background: 'rgba(255,255,255,0.12)',
    boxShadow: '0 0 0 2px rgba(255,255,255,0.1)'
  }
}

const selectStyles = {
  width: '100%',
  padding: '0.6rem',
  borderRadius: '6px',
  border: '1px solid rgba(255,255,255,0.4)',
  background: 'rgba(255,255,255,0.08)',
  color: '#ffffff',
  fontSize: '0.85rem',
  outline: 'none',
  cursor: 'pointer'
}

export default function ConfiguracionPage() {
  const { get, put } = useApi()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [empresaConfig, setEmpresaConfig] = useState({
    razon_social: '',
    ruc: '',
    direccion_fiscal: '',
    telefono: '',
    email: '',
    sitio_web: '',
    representante_legal: '',
    tipo_contribuyente: 'PERSONA_JURIDICA',
    regimen_tributario: 'GENERAL',
    igv_porcentaje: 18,
    retencion_renta_porcentaje: 3,
    serie_factura: 'F001',
    serie_boleta: 'B001',
    serie_nota_credito: 'NC01',
    serie_nota_debito: 'ND01',
    serie_guia_remision: 'T001',
    ose_activo: false,
    ose_url: '',
    ose_username: '',
    ose_password: ''
  })

  useEffect(() => {
    loadEmpresaConfig()
  }, [])

  const loadEmpresaConfig = async () => {
    try {
      setLoading(true)
      const response = await get('/api/configuracion/empresa')
      
      if (response && response.success && response.data) {
        setEmpresaConfig(response.data)
        console.log('✅ Configuración cargada:', response.data)
      } else {
        console.error('❌ Error cargando configuración:', response)
      }
    } catch (error) {
      console.error('❌ Error:', error)
      alert('Error cargando configuración: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: any) => {
    setEmpresaConfig(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      console.log('💾 Guardando configuración...', empresaConfig)
      
      const response = await put('/api/configuracion/empresa', empresaConfig)
      
      if (response && response.success) {
        alert('✅ Configuración guardada exitosamente')
        console.log('✅ Configuración guardada:', response.data)
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
        <h1 className="dashboard-title">Configuración del Sistema</h1>
        <p className="dashboard-subtitle">Configura tu empresa y parámetros del sistema</p>
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

      {/* Company Information */}
      <div className="activity-section">
        <h2 className="activity-title">Información de la Empresa</h2>
        <div className="activity-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                Razón Social
              </label>
              <input 
                type="text" 
                value={empresaConfig.razon_social || ''}
                onChange={(e) => handleInputChange('razon_social', e.target.value)}
                placeholder="Ej: MI EMPRESA S.A.C."
                style={inputStyles}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                RUC
              </label>
              <input 
                type="text" 
                value={empresaConfig.ruc || ''}
                onChange={(e) => handleInputChange('ruc', e.target.value)}
                placeholder="Ej: 20123456789"
                style={inputStyles}
              />
            </div>
            
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                Dirección Fiscal
              </label>
              <input 
                type="text" 
                value={empresaConfig.direccion_fiscal || ''}
                onChange={(e) => handleInputChange('direccion_fiscal', e.target.value)}
                placeholder="Ej: Av. Principal 123, Lima, Perú"
                style={inputStyles}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                Teléfono
              </label>
              <input 
                type="text" 
                value={empresaConfig.telefono || ''}
                onChange={(e) => handleInputChange('telefono', e.target.value)}
                placeholder="Ej: +51 1 234-5678"
                style={inputStyles}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                Email
              </label>
              <input 
                type="email" 
                value={empresaConfig.email || ''}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="Ej: contacto@miempresa.com"
                style={inputStyles}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                Sitio Web
              </label>
              <input 
                type="url" 
                value={empresaConfig.sitio_web || ''}
                onChange={(e) => handleInputChange('sitio_web', e.target.value)}
                placeholder="Ej: www.miempresa.com"
                style={inputStyles}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                Representante Legal
              </label>
              <input 
                type="text" 
                value={empresaConfig.representante_legal || ''}
                onChange={(e) => handleInputChange('representante_legal', e.target.value)}
                placeholder="Ej: Juan Pérez García"
                style={inputStyles}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tax Settings */}
      <div className="activity-section">
        <h2 className="activity-title">Configuración Fiscal</h2>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <div className="activity-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📊 Parámetros Tributarios
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                  Régimen Tributario
                </label>
                <select 
                  value={empresaConfig.regimen_tributario || 'GENERAL'}
                  onChange={(e) => handleInputChange('regimen_tributario', e.target.value)}
                  style={selectStyles}
                >
                  <option value="GENERAL">Régimen General</option>
                  <option value="MYPE">Régimen MYPE</option>
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                  IGV (%)
                </label>
                <input 
                  type="number" 
                  value={empresaConfig.igv_porcentaje || 18}
                  onChange={(e) => handleInputChange('igv_porcentaje', parseFloat(e.target.value))}
                  placeholder="18"
                  style={selectStyles}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                  Retención Renta (%)
                </label>
                <input 
                  type="number" 
                  value={empresaConfig.retencion_renta_porcentaje || 3}
                  onChange={(e) => handleInputChange('retencion_renta_porcentaje', parseFloat(e.target.value))}
                  placeholder="3"
                  style={selectStyles}
                />
              </div>
            </div>
          </div>
          
          <div className="activity-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📄 Numeración Comprobantes
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                  Serie Facturas
                </label>
                <input 
                  type="text" 
                  value={empresaConfig.serie_factura || 'F001'}
                  onChange={(e) => handleInputChange('serie_factura', e.target.value)}
                  placeholder="F001"
                  style={selectStyles}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                  Serie Boletas
                </label>
                <input 
                  type="text" 
                  value={empresaConfig.serie_boleta || 'B001'}
                  onChange={(e) => handleInputChange('serie_boleta', e.target.value)}
                  placeholder="B001"
                  style={selectStyles}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                  Serie Notas de Crédito
                </label>
                <input 
                  type="text" 
                  value={empresaConfig.serie_nota_credito || 'NC01'}
                  onChange={(e) => handleInputChange('serie_nota_credito', e.target.value)}
                  placeholder="NC01"
                  style={selectStyles}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SUNAT Configuration */}
      <div className="activity-section">
        <h2 className="activity-title">Configuración SUNAT</h2>
        <div className="activity-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ 
              width: '60px',
              height: '60px',
              borderRadius: '12px',
              background: empresaConfig.ose_activo ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem'
            }}>
              🏛️
            </div>
            <div>
              <h3 style={{ fontWeight: '600', marginBottom: '0.25rem' }}>Conexión con SUNAT</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ 
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: empresaConfig.ose_activo ? '#10b981' : '#ef4444'
                }}></span>
                <span style={{ fontSize: '0.9rem', opacity: '0.8' }}>
                  {empresaConfig.ose_activo ? 'Conectado - Sistema activo' : 'Desconectado - Configuración pendiente'}
                </span>
              </div>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                URL OSE
              </label>
              <input 
                type="text" 
                value={empresaConfig.ose_url || ''}
                onChange={(e) => handleInputChange('ose_url', e.target.value)}
                placeholder="https://api.ose.com/v1"
                style={inputStyles}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                Usuario OSE
              </label>
              <input 
                type="text" 
                value={empresaConfig.ose_username || ''}
                onChange={(e) => handleInputChange('ose_username', e.target.value)}
                placeholder="usuario_ose"
                style={inputStyles}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                Contraseña OSE
              </label>
              <input 
                type="password" 
                value={empresaConfig.ose_password || ''}
                onChange={(e) => handleInputChange('ose_password', e.target.value)}
                placeholder="••••••••"
                style={inputStyles}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', opacity: '0.8' }}>
                Estado Conexión
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="checkbox"
                  checked={empresaConfig.ose_activo || false}
                  onChange={(e) => handleInputChange('ose_activo', e.target.checked)}
                  style={{ width: '20px', height: '20px' }}
                />
                <span style={{ color: 'white', fontSize: '0.9rem' }}>
                  Activar conexión OSE
                </span>
              </div>
            </div>
          </div>
          
          <div style={{ 
            marginTop: '1.5rem',
            padding: '1rem',
            background: empresaConfig.ose_activo ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${empresaConfig.ose_activo ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '0.85rem', opacity: '0.9' }}>
              <strong>
                {empresaConfig.ose_activo ? '✅ Estado: Activo' : '⚠️ Estado: Inactivo'}
              </strong>
              <p style={{ margin: '0.5rem 0 0 0' }}>
                {empresaConfig.ose_activo 
                  ? 'La conexión con el OSE está habilitada. Los comprobantes se enviarán automáticamente.'
                  : 'Configure los datos del OSE y active la conexión para enviar comprobantes electrónicos.'
                }
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* CSS personalizado para placeholders */}
      <style jsx>{`
        .config-input::placeholder {
          color: rgba(255, 255, 255, 0.6) !important;
          font-style: italic;
        }
        .config-input:focus {
          border: 1px solid rgba(255, 255, 255, 0.6) !important;
          background: rgba(255, 255, 255, 0.12) !important;
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1) !important;
        }
        input[type="text"], input[type="email"], input[type="url"], input[type="number"], select {
          outline: none !important;
        }
        input[type="text"]::placeholder, 
        input[type="email"]::placeholder, 
        input[type="url"]::placeholder,
        input[type="number"]::placeholder {
          color: rgba(255, 255, 255, 0.6) !important;
          font-style: italic;
        }
        select option {
          background: #1f2937 !important;
          color: #ffffff !important;
        }
      `}</style>
    </div>
  );
} 
