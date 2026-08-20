'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Mail, Phone, MapPin, Settings, FileText, X, CheckCircle2, XCircle } from 'lucide-react'
import { useApiCall } from '@/hooks/use-api'

interface Tenant {
  id?: string
  ruc: string
  razon_social: string
  nombre_comercial?: string
  direccion?: string
  email?: string
  telefono?: string
  estado?: 'ACTIVO' | 'INACTIVO'
  tipo_empresa?: string
  usar_flujo_logistica?: boolean
  gre_obligatorio?: boolean
  gre_automatico_habilitado?: boolean
  umbral_gre_automatico?: number
  created_at?: string
  pais?: string
  plan?: string
  is_demo?: boolean
  demo_expires_at?: string
  demo_created_at?: string
}

interface ViewTenantModalProps {
  tenant: Tenant
  onClose: () => void
}

export default function ViewTenantModal({ tenant, onClose }: ViewTenantModalProps) {
  const [mounted, setMounted] = useState(false)
  const api = useApiCall()
  const [tenantState, setTenantState] = useState<Tenant>(tenant)
  const [demoEmail, setDemoEmail] = useState(tenant.email || '')
  const [demoPassword, setDemoPassword] = useState('')
  const [demoDays, setDemoDays] = useState(15)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState('')
  const [demoSuccess, setDemoSuccess] = useState('')

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    setTenantState(tenant)
    setDemoEmail(tenant.email || '')
    setDemoPassword('')
    setDemoDays(15)
    setDemoError('')
    setDemoSuccess('')
  }, [tenant])

  const handleActivateDemo = async () => {
    if (!tenant.id) return
    if (!demoEmail || !demoPassword) {
      setDemoError('Email y contraseña son obligatorios.')
      return
    }
    if (!Number.isFinite(demoDays) || demoDays < 1 || demoDays > 90) {
      setDemoError('Los días de demo deben estar entre 1 y 90.')
      return
    }

    setDemoLoading(true)
    setDemoError('')
    setDemoSuccess('')
    try {
      const intentStorageKey = `tenant-demo-activate-intent:${tenant.id}`
      let idempotencyKey = window.sessionStorage.getItem(intentStorageKey)
      if (!idempotencyKey) {
        idempotencyKey = `tenant-demo-activate-${window.crypto.randomUUID()}`
        window.sessionStorage.setItem(intentStorageKey, idempotencyKey)
      }
      const res = await api.post(`/tenants/${tenant.id}/demo/activate`, {
        email: demoEmail,
        password: demoPassword,
        dias_duracion: demoDays,
      }, { headers: { 'Idempotency-Key': idempotencyKey } })
      if (res?.success) {
        window.sessionStorage.removeItem(intentStorageKey)
        setTenantState((prev) => ({
          ...prev,
          is_demo: true,
          demo_expires_at: res.demo_expires_at,
          demo_created_at: prev.demo_created_at || new Date().toISOString(),
        }))
        setDemoSuccess(`Demo activada por ${demoDays} días.`)
      } else {
        setDemoError(res?.message || 'No se pudo activar la demo.')
      }
    } catch (error: any) {
      setDemoError(error?.message || 'Error activando demo.')
    } finally {
      setDemoLoading(false)
    }
  }

  const handleDeactivateDemo = async () => {
    if (!tenant.id) return
    setDemoLoading(true)
    setDemoError('')
    setDemoSuccess('')
    try {
      const intentStorageKey = `tenant-demo-deactivate-intent:${tenant.id}`
      let idempotencyKey = window.sessionStorage.getItem(intentStorageKey)
      if (!idempotencyKey) {
        idempotencyKey = `tenant-demo-deactivate-${window.crypto.randomUUID()}`
        window.sessionStorage.setItem(intentStorageKey, idempotencyKey)
      }
      const res = await api.post(
        `/tenants/${tenant.id}/demo/deactivate`,
        undefined,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )
      if (res?.success) {
        window.sessionStorage.removeItem(intentStorageKey)
        setTenantState((prev) => ({
          ...prev,
          is_demo: false,
          demo_expires_at: undefined,
        }))
        setDemoSuccess('Modo demo desactivado.')
      } else {
        setDemoError(res?.message || 'No se pudo desactivar la demo.')
      }
    } catch (error: any) {
      setDemoError(error?.message || 'Error desactivando demo.')
    } finally {
      setDemoLoading(false)
    }
  }

  if (!mounted) return null

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose} className="fixed inset-0 bg-[rgba(0,_0,_0,_0.6)] z-[9999]"
      />

      {/* Contenedor Modal */}
      <div className="fixed top-0 left-0 right-0 bottom-0 z-[10000] flex items-center justify-center p-4 overflow-y-auto overflow-x-hidden"
      >
        <div
          onClick={(e) => e.stopPropagation()} className="shadow w-[100%] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="py-7 px-8 border-b relative overflow-hidden"
          >
            <div className="absolute rounded-full"
            />
            <div className="flex justify-between items-start relative z-[1]">
              <div className="flex-[1]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-[rgba(255,_255,_255,_0.2)] p-2 flex items-center justify-center">
                    <Building2 className="text-white" />
                  </div>
                  <h2 className="text-[1.75rem] font-bold text-white m-0">
                    Detalles de la Empresa
                  </h2>
                </div>
                <p className="text-[0.95rem] text-[rgba(255,255,255,0.9)] m-0 font-normal">
                  Información completa del tenant
                </p>
              </div>

              <button
                onClick={onClose} className="border-0 bg-white/20 p-2 cursor-pointer text-white transition flex items-center justify-center hover:bg-white/30"
              >
                <X />
              </button>
            </div>
          </div>

          {/* Contenido */}
          <div className="p-8 overflow-y-auto flex-[1] min-h-0">
            {/* Información Básica */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-5 pb-3">
                <div className="p-2 flex items-center justify-center">
                  <Building2 className="text-white" />
                </div>
                <h3 className="text-[1.125rem] font-bold text-foreground m-0">Información Básica</h3>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,_minmax(280px,_1fr))] gap-5">
                <InfoField icon={<FileText />} label="RUC" value={tenantState.ruc} />
                <InfoField icon={<Phone />} label="Teléfono" value={tenantState.telefono || '—'} />
                <InfoField label="Razón Social" value={tenantState.razon_social} fullWidth />
                <InfoField label="Nombre Comercial" value={tenantState.nombre_comercial || '—'} fullWidth />
                <InfoField icon={<MapPin />} label="Dirección" value={tenantState.direccion || '—'} fullWidth />
                <InfoField icon={<Mail />} label="Email" value={tenantState.email || '—'} fullWidth />
              </div>
            </div>

            {/* Estado y Plan */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-5 pb-3">
                <div className="p-2 flex items-center justify-center">
                  <Settings className="text-white" />
                </div>
                <h3 className="text-[1.125rem] font-bold text-foreground m-0">Estado y Configuración</h3>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,_minmax(280px,_1fr))] gap-5">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-2">
                    ESTADO
                  </label>
                  <div className="inline-flex items-center gap-2 py-2 px-4 font-bold text-sm">
                    {tenantState.estado === 'ACTIVO' ? <CheckCircle2 /> : <XCircle />}
                    {tenantState.estado || 'ACTIVO'}
                  </div>
                </div>

                <InfoField label="Plan" value={tenantState.plan || 'BASICO'} />
                <InfoField label="País" value={tenantState.pais || 'PE'} />
                <InfoField label="Tipo de Empresa" value={tenantState.tipo_empresa || 'MICRO'} />
                <InfoField label="Modo Demo" value={tenantState.is_demo ? 'ACTIVO' : 'NO'} />
                {tenantState.is_demo && (
                  <InfoField
                    label="Expira"
                    value={tenantState.demo_expires_at ? new Date(tenantState.demo_expires_at).toLocaleString('es-PE') : '—'}
                  />
                )}
              </div>
            </div>

            {/* Configuración de Ventas */}
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-5 pb-3">
                <div className="p-2 flex items-center justify-center">
                  <FileText className="text-white" />
                </div>
                <h3 className="text-[1.125rem] font-bold text-foreground m-0">Configuración de Ventas</h3>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,_minmax(280px,_1fr))] gap-5">
                <BooleanField label="Flujo Logístico" value={tenantState.usar_flujo_logistica} />
                <BooleanField label="GRE Obligatorio" value={tenantState.gre_obligatorio} />
                <BooleanField label="GRE Automático" value={tenantState.gre_automatico_habilitado} />
                {tenantState.gre_automatico_habilitado && (
                  <InfoField label="Umbral GRE" value={`S/ ${tenantState.umbral_gre_automatico || 700}`} />
                )}
              </div>
            </div>

            {/* Modo Demo */}
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-5 pb-3">
                <div className="p-2 flex items-center justify-center">
                  <Settings className="text-white" />
                </div>
                <h3 className="text-[1.125rem] font-bold text-foreground m-0">Modo Demo</h3>
              </div>

              {tenantState.is_demo ? (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div>
                    <p className="font-semibold text-foreground">Demo activa</p>
                    <p className="text-sm text-muted-foreground">
                      {tenantState.demo_expires_at ? `Vigente hasta ${new Date(tenantState.demo_expires_at).toLocaleString('es-PE')}` : 'Sin vencimiento informado'}
                    </p>
                  </div>
                  <button type="button" onClick={handleDeactivateDemo} disabled={demoLoading} className="py-[0.65rem] px-4 border bg-card text-foreground font-bold cursor-pointer">
                    Quitar demo
                  </button>
                </div>
              ) : (
              <div className="grid grid-cols-[repeat(auto-fit,_minmax(280px,_1fr))] gap-5">
                <div>
                  <label htmlFor="viewtenantmodal-email-demo" className="block text-xs font-semibold text-muted-foreground mb-2">
                    Email demo
                  </label>
                  <input id="viewtenantmodal-email-demo"
                    type="email"
                    autoComplete="username"
                    value={demoEmail}
                    onChange={(e) => setDemoEmail(e.target.value)}
                    placeholder="cliente@empresa.com" className="w-[100%] border py-[0.65rem] px-[0.8rem] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="viewtenantmodal-contrasena-demo" className="block text-xs font-semibold text-muted-foreground mb-2">
                    Contraseña demo
                  </label>
                  <input id="viewtenantmodal-contrasena-demo"
                    type="password"
                    autoComplete="new-password"
                    value={demoPassword}
                    onChange={(e) => setDemoPassword(e.target.value)}
                    placeholder="Contraseña temporal" className="w-[100%] border py-[0.65rem] px-[0.8rem] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="viewtenantmodal-dias-de-demo" className="block text-xs font-semibold text-muted-foreground mb-2">
                    Días de demo
                  </label>
                  <input id="viewtenantmodal-dias-de-demo"
                    type="number"
                    min={1}
                    max={90}
                    value={demoDays}
                    onChange={(e) => setDemoDays(Number(e.target.value))} className="w-[100%] border py-[0.65rem] px-[0.8rem] text-sm"
                  />
                </div>
                <div>
                  <button
                    type="button"
                    onClick={handleActivateDemo}
                    disabled={demoLoading} className="py-[0.65rem] px-4 border-0 text-white font-bold cursor-pointer"
                  >
                    Activar demo
                  </button>
                </div>
              </div>
              )}

              {(demoError || demoSuccess) && (
                <div className="mt-4 py-3 px-4 font-semibold text-sm"
                >
                  {demoError || demoSuccess}
                </div>
              )}
            </div>

            {/* Fecha de Creación */}
            {tenantState.created_at && (
              <div className="mt-8 p-4 bg-muted/30 text-sm text-muted-foreground">
                <strong>Creado:</strong> {new Date(tenantState.created_at).toLocaleString('es-PE')}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="py-6 px-8 border-t bg-card flex justify-end">
            <button
              onClick={onClose} className="py-3 px-8 border-0 text-white cursor-pointer font-bold text-sm shadow transition hover:-translate-y-px"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </>
  )

  return createPortal(modalContent, document.body)
}

// Componente auxiliar para campos de información
function InfoField({ icon, label, value, fullWidth }: { icon?: React.ReactNode, label: string, value: string, fullWidth?: boolean }) {
  return (
    <div>
      <label className="flex items-center gap-2 mb-2 font-semibold text-xs text-muted-foreground">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        {label.toUpperCase()}
      </label>
      <div className="bg-card border py-3 px-4 text-sm text-foreground">
        {value}
      </div>
    </div>
  )
}

// Componente auxiliar para campos booleanos
function BooleanField({ label, value }: { label: string, value?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground mb-2">
        {label.toUpperCase()}
      </label>
      <div className="inline-flex items-center gap-2 py-2 px-4 font-semibold text-sm">
        {value ? <CheckCircle2 /> : <XCircle />}
        {value ? 'Sí' : 'No'}
      </div>
    </div>
  )
}
