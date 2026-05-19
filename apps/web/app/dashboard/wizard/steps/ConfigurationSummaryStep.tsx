'use client'

import Image from 'next/image'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWizardContext } from '../WizardContext'
import { useCountryContext } from '@/hooks/use-country-context'

const API_BASE_URL = '/backend'

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
        const response = await fetch(`${API_BASE_URL}/api/configuration/empresa`, {
          credentials: 'include',
          headers: {
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
      const response = await fetch(`${API_BASE_URL}/api/configuration/empresa`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
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
      <div className="p-8 text-center">
        <p>Cargando configuración...</p>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-[800px] my-0 mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-[60px] h-[60px] rounded-full bg-[#10b981] flex items-center justify-center">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h1 className="text-5 font-bold mb-1">
          Configuración Completada
        </h1>
        <p className="text-gray-500 text-[0.875rem]">
          Tu empresa está configurada y lista para operar. Aquí puedes ver y editar algunos ajustes.
        </p>
      </div>

      {/* Datos de la Empresa */}
      <div className="bg-[#f9fafb] rounded-2 p-5 mb-4">
        <h2 className="text-[0.875rem] mb-3 text-gray-700 border-b pb-2">📋 Datos de la Empresa</h2>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">Tipo de Empresa:</span>
          <span className="text-gray-900">{empresaConfig?.tipo_empresa || 'No especificado'}</span>
        </div>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">País:</span>
          <span className="text-gray-900">
            {country.paisNombre || empresaConfig?.pais || 'No definido'}
          </span>
        </div>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">{country.documentoFiscal || 'RUC'}:</span>
          <span>
            {empresaConfig?.ruc || 'No configurado'}
          </span>
        </div>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">Razón Social:</span>
          <span>
            {empresaConfig?.razonSocial || 'No configurado'}
          </span>
        </div>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">Nombre Comercial:</span>
          <span className="text-gray-900">{empresaConfig?.nombreComercial || '-'}</span>
        </div>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">Dirección Fiscal:</span>
          <span>
            {empresaConfig?.direccion || 'No configurado'}
          </span>
        </div>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">Teléfono:</span>
          <span className="text-gray-900">{empresaConfig?.telefono || '-'}</span>
        </div>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">Email:</span>
          <span className="text-gray-900">{empresaConfig?.email || '-'}</span>
        </div>
      </div>

      {/* Configuración Fiscal */}
      <div className="bg-[#f9fafb] rounded-2 p-5 mb-4">
        <h2 className="text-[0.875rem] mb-3 text-gray-700 border-b pb-2">💰 Configuración Fiscal</h2>
        {isPeru && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-gray-500">Régimen Tributario:</span>
            <span>
              {empresaConfig?.regimen || 'No especificado'}
            </span>
          </div>
        )}
        {isColombia && (
          <>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-gray-500">Régimen fiscal DIAN:</span>
              <span>
                {empresaConfig?.dianRegimenFiscal || 'No especificado'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-gray-500">Tipo contribuyente DIAN:</span>
              <span>
                {dianTipoContribuyenteLabel}
              </span>
            </div>
          </>
        )}
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">{country.impuesto || 'Impuesto'}:</span>
          <span className="text-gray-900">{empresaConfig?.igvPorcentaje ?? 18}%</span>
        </div>
        {isPeru && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-gray-500">Retención Renta:</span>
            <span className="text-gray-900">{empresaConfig?.retencionRentaPorcentaje ?? 0}%</span>
          </div>
        )}
      </div>

      {/* Series de Comprobantes */}
      <div className="bg-[#f9fafb] rounded-2 p-5 mb-4">
        <h2 className="text-[0.875rem] mb-3 text-gray-700 border-b pb-2">📄 Series de Comprobantes</h2>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">Serie Factura:</span>
          <span>
            {empresaConfig?.serieFactura || 'Pendiente'}
          </span>
        </div>
        {isPeru && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-gray-500">Serie Boleta:</span>
            <span>
              {empresaConfig?.serieBoleta || 'Pendiente'}
            </span>
          </div>
        )}
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">Serie Nota Crédito:</span>
          <span>
            {empresaConfig?.serieNotaCredito || 'Pendiente'}
          </span>
        </div>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">Serie Guía Remisión:</span>
          <span>
            {empresaConfig?.serieGuiaRemision || 'Pendiente'}
          </span>
        </div>
      </div>

      {/* Certificado Digital */}
      <div className="bg-[#f9fafb] rounded-2 p-5 mb-4">
        <h2 className="text-[0.875rem] mb-3 text-gray-700 border-b pb-2">🔐 Certificado Digital</h2>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">Estado:</span>
          <span>
            {state.validationResults.certificate?.isValid ? '✓ Válido' : 'Pendiente'}
          </span>
        </div>
        {state.validationResults.certificate?.expiresAt && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-gray-500">Vence:</span>
            <span className="text-gray-900">
              {new Date(state.validationResults.certificate.expiresAt).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>

      {/* Configuración Autoridad Fiscal */}
      <div className="bg-[#f9fafb] rounded-2 p-5 mb-4">
        <h2 className="text-[0.875rem] mb-3 text-gray-700 border-b pb-2">🏛️ Configuración {autoridadLabel}</h2>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">Modo de emisión:</span>
          <span>
            {modoEmisionLabel}
          </span>
        </div>
        {isColombia && (
          <>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-gray-500">DIAN Activo:</span>
              <span>
                {empresaConfig?.dianActivo ? '✓ Sí' : 'No'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-gray-500">Ambiente DIAN:</span>
              <span>
                {empresaConfig?.dianEnvironment || 'No definido'}
              </span>
            </div>
            {empresaConfig?.dianUrl && (
              <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
                <span className="text-gray-500">URL DIAN:</span>
                <span className="text-gray-900">{empresaConfig.dianUrl}</span>
              </div>
            )}
            {empresaConfig?.dianSoftwareId && (
              <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
                <span className="text-gray-500">Software ID:</span>
                <span className="text-gray-900">{empresaConfig.dianSoftwareId}</span>
              </div>
            )}
            {empresaConfig?.dianTestSetId && (
              <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
                <span className="text-gray-500">Test Set ID:</span>
                <span className="text-gray-900">{empresaConfig.dianTestSetId}</span>
              </div>
            )}
            {empresaConfig?.dianResolucionNumero && (
              <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
                <span className="text-gray-500">Resolución DIAN:</span>
                <span className="text-gray-900">{empresaConfig.dianResolucionNumero}</span>
              </div>
            )}
          </>
        )}
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">{oseLabel} Activo:</span>
          <span>
            {empresaConfig?.oseActivo ? '✓ Sí' : 'No'}
          </span>
        </div>
        {empresaConfig?.oseActivo && empresaConfig?.oseUrl && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-gray-500">URL {oseLabel}:</span>
            <span className="text-gray-900">{empresaConfig.oseUrl}</span>
          </div>
        )}
        {empresaConfig?.oseActivo && empresaConfig?.oseStatusUrl && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-gray-500">URL Estado {oseLabel}:</span>
            <span className="text-gray-900">{empresaConfig.oseStatusUrl}</span>
          </div>
        )}
        {empresaConfig?.oseActivo && empresaConfig?.oseAuthTipo && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-gray-500">Auth {oseLabel}:</span>
            <span className="text-gray-900">{empresaConfig.oseAuthTipo}</span>
          </div>
        )}
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-gray-500">GRE Automático:</span>
          <span className="text-gray-900">
            {empresaConfig?.gre_automatico_habilitado ? `Sí (umbral: S/ ${empresaConfig?.umbral_gre_automatico || 700})` : 'No'}
          </span>
        </div>
      </div>

      {/* Logo de la Empresa */}
      <div className="bg-[#fff] border">
        <h2 className="text-[0.875rem] mb-3 text-gray-700 border-b pb-2">🖼️ Logo de la Empresa (para tickets y facturas)</h2>

        <div className="mb-3">
          <label className="block mb-1.5 text-gray-700 text-[0.8rem]">
            URL del Logo:
          </label>
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://ejemplo.com/mi-logo.png" className="w-[100%] p-2 rounded-[6px] border text-[0.8rem]"
          />
          <p className="text-[0.7rem] text-gray-500 mt-1">
            Ingresa la URL de tu logo. Se mostrará en tickets y facturas impresas.
          </p>
        </div>

        {logoUrl && (
          <div className="mb-3">
            <p className="text-[0.8rem] text-gray-700 mb-1.5">Vista previa:</p>
            <Image
              src={logoUrl}
              alt="Logo preview"
              width={180}
              height={60}
              unoptimized className="max-h-[60px] max-w-[180px] object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}

        <button
          onClick={handleSaveLogoUrl}
          disabled={saving} className="py-1.5 px-[0.8rem] rounded-[6px] border-0 bg-blue-500 text-white font-medium text-[0.8rem]"
        >
          {saving ? 'Guardando...' : 'Guardar Logo'}
        </button>

        {message && (
          <p className="mt-2 text-[0.8rem]">
            {message.text}
          </p>
        )}
      </div>

      {/* Botón de acción */}
      <div className="mt-6">
        <button
          onClick={handleGoToDashboard} className="w-[100%] py-3 px-6 rounded-2 border-0 bg-blue-500 text-white cursor-pointer font-medium text-4"
        >
          Ir al Dashboard
        </button>
      </div>
    </div>
  )
}
