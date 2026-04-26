'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWizardContext } from '../WizardContext'
import { useCountryContext } from '@/hooks/use-country-context'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

interface EmpresaConfig {
  ruc?: string
  razonSocial?: string
  nombreComercial?: string
  direccion?: string
  pais?: string
  pais_id?: string
  ubigeo?: string
  telefono?: string
  email?: string
  tipo_empresa?: string
  usar_flujo_logistica?: boolean
  regimen?: string
  igvPorcentaje?: number
  retencionRentaPorcentaje?: number
  serieFactura?: string
  serieBoleta?: string
  serieNotaCredito?: string
  serieNotaDebito?: string
  serieGuiaRemision?: string
  logoUrl?: string
  emisionCpeModo?: string
  oseActivo?: boolean
  oseUrl?: string
  oseStatusUrl?: string
  oseAuthTipo?: string
  dianActivo?: boolean
  dianUrl?: string
  dianEnvironment?: string
  dianSoftwareId?: string
  dianTestSetId?: string
  dianRegimenFiscal?: string
  dianTipoContribuyente?: string
  dianResolucionNumero?: string
  dianResolucionPrefijo?: string
  dianResolucionDesde?: number
  dianResolucionHasta?: number
  dianResolucionFechaInicio?: string
  dianResolucionFechaFin?: string
  gre_obligatorio?: boolean
  gre_automatico_habilitado?: boolean
  umbral_gre_automatico?: number
}

export function ConfigurationSummaryStep() {
  const { state } = useWizardContext()
  const router = useRouter()
  const country = useCountryContext()
  const [empresaConfig, setEmpresaConfig] = useState<EmpresaConfig | null>(null)
  const [logoUrl, setLogoUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        setLoading(true)
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
        if (!token) {
          setLoading(false)
          return
        }

        const response = await fetch(`${API_BASE_URL}/api/configuration/empresa`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data) {
            setEmpresaConfig(data.data)
            setLogoUrl(data.data.logoUrl || '')
          }
        }
      } catch (error) {
        console.error('Error loading config:', error)
      } finally {
        setLoading(false)
      }
    }
    loadConfig()
  }, [])

  const handleGoToDashboard = () => {
    router.push('/dashboard')
  }

  const handleSaveLogoUrl = async () => {
    setSaving(true)
    setMessage(null)
    
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
      if (!token) throw new Error('No hay sesión activa')

      const response = await fetch(`${API_BASE_URL}/api/configuration/empresa`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ logoUrl })
      })

      if (!response.ok) throw new Error('Error al guardar')

      const data = await response.json()
      if (data.success) {
        setEmpresaConfig(prev => prev ? { ...prev, logoUrl } : null)
        setMessage({ type: 'success', text: 'Logo URL guardado correctamente' })
      } else {
        throw new Error(data.message || 'Error al guardar')
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Error al guardar' })
    } finally {
      setSaving(false)
    }
  }

  const sectionStyle = {
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    padding: '1.25rem',
    marginBottom: '1rem'
  }

  const sectionTitleStyle = {
    fontSize: '0.875rem',
    fontWeight: '600' as const,
    marginBottom: '0.75rem',
    color: '#374151',
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: '0.5rem'
  }

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.375rem 0',
    fontSize: '0.875rem'
  }

  const labelStyle = { color: '#6b7280' }
  const valueStyle = { fontWeight: '500' as const, color: '#111827', textAlign: 'right' as const }
  const pendingStyle = { fontWeight: '500' as const, color: '#f59e0b' }
  const successStyle = { fontWeight: '500' as const, color: '#10b981' }
  const isColombia = country.paisCodigo === 'CO'
  const isPeru = country.paisCodigo === 'PE'
  const oseLabel = isColombia ? 'Proveedor' : 'OSE'
  const autoridadLabel = country.servicioFiscal || (isColombia ? 'DIAN' : 'SUNAT')
  const dianTipoContribuyenteLabel = (() => {
    if (empresaConfig?.dianTipoContribuyente === '1') return 'Persona jurídica'
    if (empresaConfig?.dianTipoContribuyente === '2') return 'Persona natural'
    return empresaConfig?.dianTipoContribuyente || 'No especificado'
  })()

  const modoEmisionLabel = (() => {
    if (!empresaConfig?.emisionCpeModo) return 'No definido'
    if (empresaConfig.emisionCpeModo === 'OSE_API') {
      return `${oseLabel} API`
    }
    return `${autoridadLabel} directo`
  })()

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Cargando configuración...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ 
          width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#10b981', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem'
        }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
          Configuración Completada
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          Tu empresa está configurada y lista para operar. Aquí puedes ver y editar algunos ajustes.
        </p>
      </div>

      {/* Datos de la Empresa */}
      <div style={sectionStyle}>
        <h2 style={sectionTitleStyle}>📋 Datos de la Empresa</h2>
        <div style={rowStyle}>
          <span style={labelStyle}>Tipo de Empresa:</span>
          <span style={valueStyle}>{empresaConfig?.tipo_empresa || 'No especificado'}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>País:</span>
          <span style={valueStyle}>
            {country.paisNombre || empresaConfig?.pais || 'No definido'}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>{country.documentoFiscal || 'RUC'}:</span>
          <span style={empresaConfig?.ruc ? valueStyle : pendingStyle}>
            {empresaConfig?.ruc || 'No configurado'}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Razón Social:</span>
          <span style={empresaConfig?.razonSocial ? valueStyle : pendingStyle}>
            {empresaConfig?.razonSocial || 'No configurado'}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Nombre Comercial:</span>
          <span style={valueStyle}>{empresaConfig?.nombreComercial || '-'}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Dirección Fiscal:</span>
          <span style={empresaConfig?.direccion ? valueStyle : pendingStyle}>
            {empresaConfig?.direccion || 'No configurado'}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Teléfono:</span>
          <span style={valueStyle}>{empresaConfig?.telefono || '-'}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Email:</span>
          <span style={valueStyle}>{empresaConfig?.email || '-'}</span>
        </div>
      </div>

      {/* Configuración Fiscal */}
      <div style={sectionStyle}>
        <h2 style={sectionTitleStyle}>💰 Configuración Fiscal</h2>
        {isPeru && (
          <div style={rowStyle}>
            <span style={labelStyle}>Régimen Tributario:</span>
            <span style={empresaConfig?.regimen ? valueStyle : pendingStyle}>
              {empresaConfig?.regimen || 'No especificado'}
            </span>
          </div>
        )}
        {isColombia && (
          <>
            <div style={rowStyle}>
              <span style={labelStyle}>Régimen fiscal DIAN:</span>
              <span style={empresaConfig?.dianRegimenFiscal ? valueStyle : pendingStyle}>
                {empresaConfig?.dianRegimenFiscal || 'No especificado'}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Tipo contribuyente DIAN:</span>
              <span style={empresaConfig?.dianTipoContribuyente ? valueStyle : pendingStyle}>
                {dianTipoContribuyenteLabel}
              </span>
            </div>
          </>
        )}
        <div style={rowStyle}>
          <span style={labelStyle}>{country.impuesto || 'Impuesto'}:</span>
          <span style={valueStyle}>{empresaConfig?.igvPorcentaje ?? 18}%</span>
        </div>
        {isPeru && (
          <div style={rowStyle}>
            <span style={labelStyle}>Retención Renta:</span>
            <span style={valueStyle}>{empresaConfig?.retencionRentaPorcentaje ?? 0}%</span>
          </div>
        )}
      </div>

      {/* Series de Comprobantes */}
      <div style={sectionStyle}>
        <h2 style={sectionTitleStyle}>📄 Series de Comprobantes</h2>
        <div style={rowStyle}>
          <span style={labelStyle}>Serie Factura:</span>
          <span style={empresaConfig?.serieFactura ? valueStyle : pendingStyle}>
            {empresaConfig?.serieFactura || 'Pendiente'}
          </span>
        </div>
        {isPeru && (
          <div style={rowStyle}>
            <span style={labelStyle}>Serie Boleta:</span>
            <span style={empresaConfig?.serieBoleta ? valueStyle : pendingStyle}>
              {empresaConfig?.serieBoleta || 'Pendiente'}
            </span>
          </div>
        )}
        <div style={rowStyle}>
          <span style={labelStyle}>Serie Nota Crédito:</span>
          <span style={empresaConfig?.serieNotaCredito ? valueStyle : pendingStyle}>
            {empresaConfig?.serieNotaCredito || 'Pendiente'}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Serie Guía Remisión:</span>
          <span style={empresaConfig?.serieGuiaRemision ? valueStyle : pendingStyle}>
            {empresaConfig?.serieGuiaRemision || 'Pendiente'}
          </span>
        </div>
      </div>

      {/* Certificado Digital */}
      <div style={sectionStyle}>
        <h2 style={sectionTitleStyle}>🔐 Certificado Digital</h2>
        <div style={rowStyle}>
          <span style={labelStyle}>Estado:</span>
          <span style={state.validationResults.certificate?.isValid ? successStyle : pendingStyle}>
            {state.validationResults.certificate?.isValid ? '✓ Válido' : 'Pendiente'}
          </span>
        </div>
        {state.validationResults.certificate?.expiresAt && (
          <div style={rowStyle}>
            <span style={labelStyle}>Vence:</span>
            <span style={valueStyle}>
              {new Date(state.validationResults.certificate.expiresAt).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>

      {/* Configuración Autoridad Fiscal */}
      <div style={sectionStyle}>
        <h2 style={sectionTitleStyle}>🏛️ Configuración {autoridadLabel}</h2>
        <div style={rowStyle}>
          <span style={labelStyle}>Modo de emisión:</span>
          <span style={empresaConfig?.emisionCpeModo ? valueStyle : pendingStyle}>
            {modoEmisionLabel}
          </span>
        </div>
        {isColombia && (
          <>
            <div style={rowStyle}>
              <span style={labelStyle}>DIAN Activo:</span>
              <span style={empresaConfig?.dianActivo ? successStyle : pendingStyle}>
                {empresaConfig?.dianActivo ? '✓ Sí' : 'No'}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Ambiente DIAN:</span>
              <span style={empresaConfig?.dianEnvironment ? valueStyle : pendingStyle}>
                {empresaConfig?.dianEnvironment || 'No definido'}
              </span>
            </div>
            {empresaConfig?.dianUrl && (
              <div style={rowStyle}>
                <span style={labelStyle}>URL DIAN:</span>
                <span style={valueStyle}>{empresaConfig.dianUrl}</span>
              </div>
            )}
            {empresaConfig?.dianSoftwareId && (
              <div style={rowStyle}>
                <span style={labelStyle}>Software ID:</span>
                <span style={valueStyle}>{empresaConfig.dianSoftwareId}</span>
              </div>
            )}
            {empresaConfig?.dianTestSetId && (
              <div style={rowStyle}>
                <span style={labelStyle}>Test Set ID:</span>
                <span style={valueStyle}>{empresaConfig.dianTestSetId}</span>
              </div>
            )}
            {empresaConfig?.dianResolucionNumero && (
              <div style={rowStyle}>
                <span style={labelStyle}>Resolución DIAN:</span>
                <span style={valueStyle}>{empresaConfig.dianResolucionNumero}</span>
              </div>
            )}
          </>
        )}
        <div style={rowStyle}>
          <span style={labelStyle}>{oseLabel} Activo:</span>
          <span style={empresaConfig?.oseActivo ? successStyle : pendingStyle}>
            {empresaConfig?.oseActivo ? '✓ Sí' : 'No'}
          </span>
        </div>
        {empresaConfig?.oseActivo && empresaConfig?.oseUrl && (
          <div style={rowStyle}>
            <span style={labelStyle}>URL {oseLabel}:</span>
            <span style={valueStyle}>{empresaConfig.oseUrl}</span>
          </div>
        )}
        {empresaConfig?.oseActivo && empresaConfig?.oseStatusUrl && (
          <div style={rowStyle}>
            <span style={labelStyle}>URL Estado {oseLabel}:</span>
            <span style={valueStyle}>{empresaConfig.oseStatusUrl}</span>
          </div>
        )}
        {empresaConfig?.oseActivo && empresaConfig?.oseAuthTipo && (
          <div style={rowStyle}>
            <span style={labelStyle}>Auth {oseLabel}:</span>
            <span style={valueStyle}>{empresaConfig.oseAuthTipo}</span>
          </div>
        )}
        <div style={rowStyle}>
          <span style={labelStyle}>GRE Automático:</span>
          <span style={valueStyle}>
            {empresaConfig?.gre_automatico_habilitado ? `Sí (umbral: S/ ${empresaConfig?.umbral_gre_automatico || 700})` : 'No'}
          </span>
        </div>
      </div>

      {/* Logo de la Empresa */}
      <div style={{ ...sectionStyle, backgroundColor: '#fff', border: '1px solid #e5e7eb' }}>
        <h2 style={sectionTitleStyle}>🖼️ Logo de la Empresa (para tickets y facturas)</h2>
        
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', marginBottom: '0.375rem', color: '#374151', fontSize: '0.8rem' }}>
            URL del Logo:
          </label>
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://ejemplo.com/mi-logo.png"
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.8rem'
            }}
          />
          <p style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.25rem' }}>
            Ingresa la URL de tu logo. Se mostrará en tickets y facturas impresas.
          </p>
        </div>

        {logoUrl && (
          <div style={{ marginBottom: '0.75rem' }}>
            <p style={{ fontSize: '0.8rem', color: '#374151', marginBottom: '0.375rem' }}>Vista previa:</p>
            <img 
              src={logoUrl} 
              alt="Logo preview" 
              style={{ maxHeight: '60px', maxWidth: '180px', objectFit: 'contain' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}

        <button
          onClick={handleSaveLogoUrl}
          disabled={saving}
          style={{
            padding: '0.4rem 0.8rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: '#3b82f6',
            color: 'white',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: '500',
            fontSize: '0.8rem',
            opacity: saving ? 0.7 : 1
          }}
        >
          {saving ? 'Guardando...' : 'Guardar Logo'}
        </button>

        {message && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: message.type === 'success' ? '#10b981' : '#ef4444' }}>
            {message.text}
          </p>
        )}
      </div>

      {/* Botón de acción */}
      <div style={{ marginTop: '1.5rem' }}>
        <button
          onClick={handleGoToDashboard}
          style={{
            width: '100%',
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#3b82f6',
            color: 'white',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '1rem'
          }}
        >
          Ir al Dashboard
        </button>
      </div>
    </div>
  )
}
