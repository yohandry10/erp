'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  CheckCircle, 
  Building2, 
  FileKey, 
  Receipt, 
  Settings, 
  Edit3, 
  ArrowLeft,
  Shield,
  AlertTriangle,
  Image as ImageIcon,
  Sparkles,
  Calendar,
  ExternalLink
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LogoUploader } from '@/components/configuracion/LogoUploader'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

interface ConfigurationData {
  ruc?: string
  razonSocial?: string
  direccion?: string
  logoUrl?: string
  tipoEmpresa?: string
  regimenTributario?: string
  igvPorcentaje?: number
  serieFactura?: string
  serieBoleta?: string
  serieNotaCredito?: string
  certificateExpiry?: string
  certificateSubject?: string
  oseActivo?: boolean
  greAutomaticoHabilitado?: boolean
  umbralGreAutomatico?: number
}

export function ConfigurationSummaryStep() {
  const router = useRouter()
  const [config, setConfig] = useState<ConfigurationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingLogo, setEditingLogo] = useState(false)
  const [savingLogo, setSavingLogo] = useState(false)

  useEffect(() => {
    loadConfiguration()
  }, [])

  const loadConfiguration = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('access_token')
      
      const response = await fetch(`${API_BASE_URL}/api/configuration/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) throw new Error('Error cargando configuración')

      const data = await response.json()
      
      if (data.success && data.data) {
        const empresaResponse = await fetch(`${API_BASE_URL}/api/pos/empresa-config`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })

        let empresaData: any = {}
        if (empresaResponse.ok) {
          const empresaResult = await empresaResponse.json()
          empresaData = empresaResult.data || {}
        }

        setConfig({
          ruc: data.data.ruc?.ruc || empresaData.ruc,
          razonSocial: data.data.ruc?.razonSocial || empresaData.razon_social,
          direccion: empresaData.direccion_fiscal,
          logoUrl: empresaData.logo_url,
          tipoEmpresa: empresaData.tipo_empresa,
          regimenTributario: empresaData.regimen_tributario,
          igvPorcentaje: empresaData.igv_porcentaje || 18,
          serieFactura: empresaData.serie_factura,
          serieBoleta: empresaData.serie_boleta,
          serieNotaCredito: empresaData.serie_nota_credito,
          certificateExpiry: data.data.certificate?.expiresAt,
          certificateSubject: data.data.certificate?.subject,
          oseActivo: empresaData.ose_activo,
          greAutomaticoHabilitado: empresaData.gre_automatico_habilitado,
          umbralGreAutomatico: empresaData.umbral_gre_automatico,
        })
      }
    } catch (err) {
      console.error('Error loading configuration:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  const handleLogoChange = async (file: File | null, previewUrl: string | null) => {
    if (!previewUrl) {
      setConfig(prev => prev ? { ...prev, logoUrl: undefined } : null)
      return
    }

    try {
      setSavingLogo(true)
      const token = localStorage.getItem('access_token')

      const response = await fetch(`${API_BASE_URL}/api/configuration/empresa`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          logoUrl: previewUrl
        })
      })

      if (!response.ok) throw new Error('Error guardando logo')

      setConfig(prev => prev ? { ...prev, logoUrl: previewUrl } : null)
      setEditingLogo(false)
    } catch (err) {
      console.error('Error saving logo:', err)
      alert('Error al guardar el logo')
    } finally {
      setSavingLogo(false)
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'No disponible'
    return new Date(dateStr).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getDaysUntilExpiry = (dateStr?: string) => {
    if (!dateStr) return null
    const expiry = new Date(dateStr)
    const now = new Date()
    return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <p style={{ color: 'var(--primary-600)', fontWeight: 500 }}>Cargando configuración...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{
          width: '80px',
          height: '80px',
          margin: '0 auto 1.5rem',
          borderRadius: '50%',
          background: 'var(--red-100)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <AlertTriangle size={40} style={{ color: 'var(--red-500)' }} />
        </div>
        <h3 style={{ color: 'var(--primary-800)', marginBottom: '0.5rem' }}>Error al cargar</h3>
        <p style={{ color: 'var(--primary-600)', marginBottom: '1.5rem' }}>{error}</p>
        <Button onClick={loadConfiguration} className="btn btn-primary">Reintentar</Button>
      </div>
    )
  }

  const daysUntilExpiry = getDaysUntilExpiry(config?.certificateExpiry)
  const isExpiryWarning = daysUntilExpiry !== null && daysUntilExpiry <= 30
  const isExpiryCritical = daysUntilExpiry !== null && daysUntilExpiry <= 7

  return (
    <div style={{ padding: '0.5rem 0' }}>
      {/* Success Banner */}
      <div className="stat-card" style={{
        marginBottom: '2rem',
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
        borderLeft: '4px solid var(--emerald-500)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', position: 'relative', zIndex: 1 }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'var(--gradient-success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(16, 185, 129, 0.3)',
            flexShrink: 0
          }}>
            <CheckCircle size={32} style={{ color: 'white' }} />
          </div>
          <div>
            <h3 style={{
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 800,
              color: 'var(--primary-900)',
              letterSpacing: '-0.02em'
            }}>
              ¡Sistema Configurado!
            </h3>
            <p style={{
              margin: '0.25rem 0 0',
              fontSize: '0.95rem',
              color: 'var(--primary-600)',
              fontWeight: 500
            }}>
              Tu empresa está lista para emitir comprobantes electrónicos
            </p>
          </div>
          <Sparkles size={24} style={{ 
            color: 'var(--amber-500)', 
            marginLeft: 'auto',
            animation: 'pulse 2s ease-in-out infinite'
          }} />
        </div>
      </div>

      {/* Configuration Sections Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        
        {/* Datos de la Empresa */}
        <div className="stat-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'var(--gradient-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-md)'
            }}>
              <Building2 size={22} style={{ color: 'white' }} />
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-800)' }}>
                Datos de la Empresa
              </h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--primary-500)' }}>Información fiscal registrada</span>
            </div>
            <div className="status-success" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
              <Shield size={12} style={{ marginRight: '0.25rem' }} />
              Protegido
            </div>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '1rem',
            background: 'var(--primary-50)',
            borderRadius: 'var(--border-radius)',
            padding: '1rem'
          }}>
            <ConfigField label="RUC" value={config?.ruc} />
            <ConfigField label="Razón Social" value={config?.razonSocial} />
            <ConfigField label="Dirección Fiscal" value={config?.direccion} fullWidth />
            <ConfigField label="Tipo de Empresa" value={config?.tipoEmpresa} />
          </div>
        </div>

        {/* Logo de la Empresa - EDITABLE */}
        <div className="stat-card" style={{ 
          padding: '1.5rem',
          borderLeft: editingLogo ? '4px solid var(--blue-500)' : undefined
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--amber-500) 0%, var(--amber-600) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-md)'
            }}>
              <ImageIcon size={22} style={{ color: 'white' }} />
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-800)' }}>
                Logo de la Empresa
              </h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--primary-500)' }}>Aparece en facturas y tickets</span>
            </div>
            {!editingLogo && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingLogo(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Edit3 size={14} />
                {config?.logoUrl ? 'Cambiar' : 'Agregar Logo'}
              </Button>
            )}
          </div>

          {editingLogo ? (
            <div style={{ 
              background: 'var(--blue-50)', 
              borderRadius: 'var(--border-radius)', 
              padding: '1.25rem',
              border: '1px solid var(--blue-200)'
            }}>
              <LogoUploader
                currentLogoUrl={config?.logoUrl}
                onLogoChange={handleLogoChange}
                disabled={savingLogo}
              />
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingLogo(false)}
                  disabled={savingLogo}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : config?.logoUrl ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1.25rem',
              padding: '1rem',
              background: 'var(--primary-50)',
              borderRadius: 'var(--border-radius)',
            }}>
              <div style={{
                width: '80px',
                height: '60px',
                borderRadius: '8px',
                overflow: 'hidden',
                background: 'white',
                border: '1px solid var(--primary-200)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <img
                  src={config.logoUrl}
                  alt="Logo"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              </div>
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--emerald-700)' }}>
                  ✓ Logo configurado
                </span>
                <p style={{ fontSize: '0.75rem', color: 'var(--primary-500)', margin: '0.25rem 0 0' }}>
                  Se mostrará en todos los documentos
                </p>
              </div>
            </div>
          ) : (
            <div style={{
              padding: '1.5rem',
              background: 'var(--primary-50)',
              borderRadius: 'var(--border-radius)',
              textAlign: 'center',
              border: '2px dashed var(--primary-300)'
            }}>
              <ImageIcon size={32} style={{ color: 'var(--primary-400)', marginBottom: '0.5rem' }} />
              <p style={{ fontSize: '0.875rem', color: 'var(--primary-600)', margin: 0 }}>
                No hay logo configurado
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--primary-500)', margin: '0.25rem 0 0' }}>
                Haz clic en "Agregar Logo" para personalizar tus documentos
              </p>
            </div>
          )}
        </div>

        {/* Certificado Digital */}
        <div className="stat-card" style={{ 
          padding: '1.5rem',
          borderLeft: isExpiryCritical ? '4px solid var(--red-500)' : isExpiryWarning ? '4px solid var(--amber-500)' : undefined
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: isExpiryCritical 
                ? 'var(--gradient-danger)' 
                : isExpiryWarning 
                  ? 'var(--gradient-warning)' 
                  : 'var(--gradient-success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-md)'
            }}>
              <FileKey size={22} style={{ color: 'white' }} />
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-800)' }}>
                Certificado Digital
              </h4>
              {isExpiryWarning && (
                <span style={{ 
                  fontSize: '0.75rem', 
                  color: isExpiryCritical ? 'var(--red-600)' : 'var(--amber-600)',
                  fontWeight: 600
                }}>
                  ⚠️ {isExpiryCritical ? 'Vence muy pronto' : `Vence en ${daysUntilExpiry} días`}
                </span>
              )}
            </div>
            <div className={isExpiryCritical ? 'status-error' : isExpiryWarning ? 'status-warning' : 'status-success'} 
                 style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
              <Shield size={12} style={{ marginRight: '0.25rem' }} />
              {isExpiryCritical ? 'Crítico' : isExpiryWarning ? 'Atención' : 'Válido'}
            </div>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '1rem',
            background: isExpiryCritical ? 'var(--red-50)' : isExpiryWarning ? 'rgba(251, 191, 36, 0.1)' : 'var(--primary-50)',
            borderRadius: 'var(--border-radius)',
            padding: '1rem'
          }}>
            <ConfigField label="Titular" value={config?.certificateSubject} />
            <ConfigField 
              label="Vencimiento" 
              value={formatDate(config?.certificateExpiry)} 
              icon={<Calendar size={14} />}
            />
          </div>
          
          <p style={{
            fontSize: '0.75rem',
            color: 'var(--primary-500)',
            marginTop: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <Shield size={12} />
            El certificado no puede ser modificado por seguridad
          </p>
        </div>

        {/* Configuración Fiscal */}
        <div className="stat-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--emerald-500) 0%, var(--emerald-700) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-md)'
            }}>
              <Receipt size={22} style={{ color: 'white' }} />
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-800)' }}>
                Configuración Fiscal
              </h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--primary-500)' }}>Series y parámetros tributarios</span>
            </div>
            <div className="status-success" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
              <Shield size={12} style={{ marginRight: '0.25rem' }} />
              Protegido
            </div>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
            gap: '1rem',
            background: 'var(--primary-50)',
            borderRadius: 'var(--border-radius)',
            padding: '1rem'
          }}>
            <ConfigField label="Régimen" value={config?.regimenTributario} />
            <ConfigField label="IGV" value={`${config?.igvPorcentaje || 18}%`} />
            <ConfigField label="Serie Factura" value={config?.serieFactura} />
            <ConfigField label="Serie Boleta" value={config?.serieBoleta} />
          </div>
        </div>

        {/* GRE */}
        <div className="stat-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--blue-500) 0%, var(--blue-700) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-md)'
            }}>
              <Settings size={22} style={{ color: 'white' }} />
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-800)' }}>
                Guías de Remisión
              </h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--primary-500)' }}>Configuración GRE automática</span>
            </div>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
            gap: '1rem',
            background: 'var(--primary-50)',
            borderRadius: 'var(--border-radius)',
            padding: '1rem'
          }}>
            <ConfigField 
              label="GRE Automático" 
              value={config?.greAutomaticoHabilitado ? '✓ Habilitado' : '✗ Deshabilitado'} 
            />
            <ConfigField 
              label="Umbral" 
              value={config?.umbralGreAutomatico ? `S/ ${config.umbralGreAutomatico}` : 'No configurado'} 
            />
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div style={{ 
        marginTop: '2rem', 
        display: 'flex', 
        justifyContent: 'center',
        gap: '1rem'
      }}>
        <Button
          onClick={() => router.push('/dashboard')}
          className="btn btn-primary"
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            padding: '1rem 2rem',
            fontSize: '1rem'
          }}
        >
          <ArrowLeft size={18} />
          Volver al Dashboard
        </Button>
      </div>
    </div>
  )
}

// Componente auxiliar para campos
function ConfigField({ 
  label, 
  value, 
  icon,
  fullWidth 
}: { 
  label: string
  value?: string
  icon?: React.ReactNode
  fullWidth?: boolean 
}) {
  return (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <span style={{ 
        fontSize: '0.7rem', 
        fontWeight: 600, 
        color: 'var(--primary-500)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem'
      }}>
        {icon}
        {label}
      </span>
      <span style={{ 
        fontSize: '0.95rem', 
        fontWeight: 600, 
        color: 'var(--primary-800)',
        display: 'block',
        marginTop: '0.25rem'
      }}>
        {value || 'No configurado'}
      </span>
    </div>
  )
}

export default ConfigurationSummaryStep
