'use client'

import Image from 'next/image'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWizardContext } from '../WizardContext'
import { useCountryContext } from '@/hooks/use-country-context'
import { fetchApi } from '@/lib/api-fetch'

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
  isDemo?: boolean
  certificateConfigured?: boolean
  regimen?: string
  igvPorcentaje?: number
  retencionRentaPorcentaje?: number
  serieFactura?: string
  serieBoleta?: string
  serieNotaCredito?: string
  serieNotaDebito?: string
  serieGuiaRemision?: string
  certificateExpiresAt?: string
  logoUrl?: string
  emisionCpeModo?: string
  sunatEnvironment?: string
  sunatUsernameConfigured?: boolean
  sunatGreTransport?: string
  sunatGreClientConfigured?: boolean
  sireActivo?: boolean
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
  arcaActivo?: boolean
  arcaEnvironment?: string
  arcaWsaaUrl?: string
  arcaWsfeUrl?: string
  arcaCuitRepresentada?: string
  arcaPuntoVenta?: number
  arcaCondicionIva?: string
  ingresosBrutos?: string
  fechaInicioActividades?: string
  provinciaFiscal?: string
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
        const response = await fetchApi('/api/configuration/empresa', {
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
      const intentStorageKey = 'configuration-logo-intent'
      let idempotencyKey = window.sessionStorage.getItem(intentStorageKey)
      if (!idempotencyKey) {
        idempotencyKey = `configuration-logo-${window.crypto.randomUUID()}`
        window.sessionStorage.setItem(intentStorageKey, idempotencyKey)
      }
      const response = await fetchApi('/api/configuration/empresa', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ logoUrl })
      })

      if (!response.ok) throw new Error('Error al guardar')

      const data = await response.json()
      if (data.success) {
        window.sessionStorage.removeItem(intentStorageKey)
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

  const isColombia = country.paisCodigo === 'CO'
  const isPeru = country.paisCodigo === 'PE'
  const isArgentina = country.paisCodigo === 'AR'
  const oseLabel = 'OSE'
  const autoridadLabel = country.servicioFiscal || 'SUNAT'
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
        <h1 className="text-xl font-bold mb-1">
          Configuración Completada
        </h1>
        <p className="text-muted-foreground text-[0.875rem]">
          Tu empresa está configurada y lista para operar. Aquí puedes ver y editar algunos ajustes.
        </p>
      </div>

      {/* Datos de la Empresa */}
      <div className="bg-card/40 border border-cyan-400/20 rounded-lg p-5 mb-4">
        <h2 className="text-[0.875rem] mb-3 text-foreground/90 border-b pb-2">📋 Datos de la Empresa</h2>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-muted-foreground">Tipo de Empresa:</span>
          <span className="text-foreground">{empresaConfig?.tipo_empresa || 'No especificado'}</span>
        </div>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-muted-foreground">País:</span>
          <span className="text-foreground">
            {country.paisNombre || empresaConfig?.pais || 'No definido'}
          </span>
        </div>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-muted-foreground">{country.documentoFiscal || 'RUC'}:</span>
          <span>
            {empresaConfig?.ruc || 'No configurado'}
          </span>
        </div>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-muted-foreground">Razón Social:</span>
          <span>
            {empresaConfig?.razonSocial || 'No configurado'}
          </span>
        </div>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-muted-foreground">Nombre Comercial:</span>
          <span className="text-foreground">{empresaConfig?.nombreComercial || '-'}</span>
        </div>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-muted-foreground">Dirección Fiscal:</span>
          <span>
            {empresaConfig?.direccion || 'No configurado'}
          </span>
        </div>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-muted-foreground">Teléfono:</span>
          <span className="text-foreground">{empresaConfig?.telefono || '-'}</span>
        </div>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-muted-foreground">Email:</span>
          <span className="text-foreground">{empresaConfig?.email || '-'}</span>
        </div>
      </div>

      {/* Configuración Fiscal */}
      <div className="bg-card/40 border border-cyan-400/20 rounded-lg p-5 mb-4">
        <h2 className="text-[0.875rem] mb-3 text-foreground/90 border-b pb-2">💰 Configuración Fiscal</h2>
        {isPeru && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-muted-foreground">Régimen Tributario:</span>
            <span>
              {empresaConfig?.regimen || 'No especificado'}
            </span>
          </div>
        )}
        {isColombia && (
          <>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-muted-foreground">Régimen fiscal DIAN:</span>
              <span>
                {empresaConfig?.dianRegimenFiscal || 'No especificado'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-muted-foreground">Tipo contribuyente DIAN:</span>
              <span>
                {dianTipoContribuyenteLabel}
              </span>
            </div>
          </>
        )}
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-muted-foreground">{country.impuesto || 'Impuesto'}:</span>
          <span className="text-foreground">{empresaConfig?.igvPorcentaje ?? 18}%</span>
        </div>
        {isPeru && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-muted-foreground">Retención Renta:</span>
            <span className="text-foreground">{empresaConfig?.retencionRentaPorcentaje ?? 0}%</span>
          </div>
        )}
      </div>

      {/* Series de Comprobantes */}
      <div className="bg-card/40 border border-cyan-400/20 rounded-lg p-5 mb-4">
        <h2 className="text-[0.875rem] mb-3 text-foreground/90 border-b pb-2">📄 Series de Comprobantes</h2>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-muted-foreground">Serie Factura:</span>
          <span>
            {empresaConfig?.serieFactura || 'Pendiente'}
          </span>
        </div>
        {isPeru && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-muted-foreground">Serie Boleta:</span>
            <span>
              {empresaConfig?.serieBoleta || 'Pendiente'}
            </span>
          </div>
        )}
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-muted-foreground">Serie Nota Crédito:</span>
          <span>
            {empresaConfig?.serieNotaCredito || 'Pendiente'}
          </span>
        </div>
        {isPeru && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-muted-foreground">Serie Guía Remisión:</span>
            <span>
              {empresaConfig?.serieGuiaRemision || 'Pendiente'}
            </span>
          </div>
        )}
      </div>

      {/* Certificado Digital */}
      <div className="bg-card/40 border border-cyan-400/20 rounded-lg p-5 mb-4">
        <h2 className="text-[0.875rem] mb-3 text-foreground/90 border-b pb-2">🔐 Certificado Digital</h2>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-muted-foreground">Estado:</span>
          <span>
            {empresaConfig?.isDemo
              ? '✓ Simulado en modo demo'
              : empresaConfig?.certificateConfigured || state.validationResults.certificate?.isValid
                ? '✓ Configurado'
                : 'Pendiente'}
          </span>
        </div>
        {(state.validationResults.certificate?.expiresAt || empresaConfig?.certificateExpiresAt) && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-muted-foreground">Vence:</span>
            <span className="text-foreground">
              {new Date(
                state.validationResults.certificate?.expiresAt || empresaConfig?.certificateExpiresAt || ''
              ).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>

      {/* Configuración Autoridad Fiscal */}
      <div className="bg-card/40 border border-cyan-400/20 rounded-lg p-5 mb-4">
        <h2 className="text-[0.875rem] mb-3 text-foreground/90 border-b pb-2">🏛️ Configuración {autoridadLabel}</h2>
        <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
          <span className="text-muted-foreground">Modo de emisión:</span>
          <span>
            {modoEmisionLabel}
          </span>
        </div>
        {isPeru && (
          <>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-muted-foreground">Ambiente SUNAT:</span>
              <span className="text-foreground">{empresaConfig?.sunatEnvironment || 'homologacion'}</span>
            </div>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-muted-foreground">SOL secundario:</span>
              <span>{empresaConfig?.sunatUsernameConfigured ? 'Configurado' : 'Pendiente'}</span>
            </div>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-muted-foreground">GRE SUNAT:</span>
              <span className="text-foreground">{(empresaConfig?.sunatGreTransport || 'soap').toUpperCase()}</span>
            </div>
            {empresaConfig?.sunatGreTransport === 'rest' && (
              <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
                <span className="text-muted-foreground">Credenciales GRE REST:</span>
                <span>{empresaConfig?.sunatGreClientConfigured ? 'Configuradas' : 'Pendientes'}</span>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t border-border/20 pt-2">
              <span className="text-muted-foreground">SIRE RVIE/RCE</span>
              <span>{empresaConfig?.sireActivo ? 'Habilitado' : 'No habilitado'}</span>
            </div>
          </>
        )}
        {isArgentina && (
          <>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-muted-foreground">Ambiente ARCA:</span>
              <span>{empresaConfig?.arcaEnvironment || 'homologacion'}</span>
            </div>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-muted-foreground">CUIT representada:</span>
              <span>{empresaConfig?.arcaCuitRepresentada || empresaConfig?.ruc || 'Pendiente'}</span>
            </div>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-muted-foreground">Punto de venta:</span>
              <span>{empresaConfig?.arcaPuntoVenta || 'Pendiente'}</span>
            </div>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-muted-foreground">Condición frente al IVA:</span>
              <span>{empresaConfig?.arcaCondicionIva || 'Pendiente'}</span>
            </div>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-muted-foreground">Ingresos Brutos:</span>
              <span>{empresaConfig?.ingresosBrutos || 'Pendiente'}</span>
            </div>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-muted-foreground">Jurisdicción fiscal:</span>
              <span>{empresaConfig?.provinciaFiscal || 'Pendiente'}</span>
            </div>
          </>
        )}
        {isColombia && (
          <>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-muted-foreground">DIAN Activo:</span>
              <span>
                {empresaConfig?.dianActivo ? '✓ Sí' : 'No'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
              <span className="text-muted-foreground">Ambiente DIAN:</span>
              <span>
                {empresaConfig?.dianEnvironment || 'No definido'}
              </span>
            </div>
            {empresaConfig?.dianUrl && (
              <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
                <span className="text-muted-foreground">URL DIAN:</span>
                <span className="text-foreground">{empresaConfig.dianUrl}</span>
              </div>
            )}
            {empresaConfig?.dianSoftwareId && (
              <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
                <span className="text-muted-foreground">Software ID:</span>
                <span className="text-foreground">{empresaConfig.dianSoftwareId}</span>
              </div>
            )}
            {empresaConfig?.dianTestSetId && (
              <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
                <span className="text-muted-foreground">Test Set ID:</span>
                <span className="text-foreground">{empresaConfig.dianTestSetId}</span>
              </div>
            )}
            {empresaConfig?.dianResolucionNumero && (
              <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
                <span className="text-muted-foreground">Resolución DIAN:</span>
                <span className="text-foreground">{empresaConfig.dianResolucionNumero}</span>
              </div>
            )}
          </>
        )}
        {isPeru && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-muted-foreground">{oseLabel} Activo:</span>
            <span>
              {empresaConfig?.oseActivo ? '✓ Sí' : 'No'}
            </span>
          </div>
        )}
        {empresaConfig?.oseActivo && empresaConfig?.oseUrl && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-muted-foreground">URL {oseLabel}:</span>
            <span className="text-foreground">{empresaConfig.oseUrl}</span>
          </div>
        )}
        {empresaConfig?.oseActivo && empresaConfig?.oseStatusUrl && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-muted-foreground">URL Estado {oseLabel}:</span>
            <span className="text-foreground">{empresaConfig.oseStatusUrl}</span>
          </div>
        )}
        {empresaConfig?.oseActivo && empresaConfig?.oseAuthTipo && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-muted-foreground">Auth {oseLabel}:</span>
            <span className="text-foreground">{empresaConfig.oseAuthTipo}</span>
          </div>
        )}
        {isPeru && (
          <div className="flex justify-between py-1.5 px-0 text-[0.875rem]">
            <span className="text-muted-foreground">GRE Automático:</span>
            <span className="text-foreground">
              {empresaConfig?.gre_automatico_habilitado
                ? `Sí (umbral: S/ ${empresaConfig?.umbral_gre_automatico || 700})`
                : 'No'}
            </span>
          </div>
        )}
      </div>

      {/* Logo de la Empresa */}
      <div className="bg-card/40 border border-cyan-400/20 rounded-lg p-5">
        <h2 className="text-[0.875rem] mb-3 text-foreground/90 border-b pb-2">🖼️ Logo de la Empresa (para tickets y facturas)</h2>

        <div className="mb-3">
          <label htmlFor="configurationsummarystep-url-del-logo" className="block mb-1.5 text-foreground/90 text-[0.8rem]">
            URL del Logo:
          </label>
          <input id="configurationsummarystep-url-del-logo"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://ejemplo.com/mi-logo.png" className="w-[100%] p-2 rounded-[6px] border text-[0.8rem]"
          />
          <p className="text-[0.7rem] text-muted-foreground mt-1">
            Ingresa la URL de tu logo. Se mostrará en tickets y facturas impresas.
          </p>
        </div>

        {logoUrl && (
          <div className="mb-3">
            <p className="text-[0.8rem] text-foreground/90 mb-1.5">Vista previa:</p>
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
          onClick={handleGoToDashboard} className="w-[100%] py-3 px-6 rounded-lg border-0 bg-blue-500 text-white cursor-pointer font-medium text-base"
        >
          Ir al Dashboard
        </button>
      </div>
    </div>
  )
}
