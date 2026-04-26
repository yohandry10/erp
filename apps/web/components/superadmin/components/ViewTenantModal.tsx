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
      const res = await api.post(`/tenants/${tenant.id}/demo/activate`, {
        email: demoEmail,
        password: demoPassword,
        dias_duracion: demoDays,
      })
      if (res?.success) {
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
      const res = await api.post(`/tenants/${tenant.id}/demo/deactivate`)
      if (res?.success) {
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
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out',
        }}
      />

      {/* Contenedor Modal */}
      <div
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          overflowY: 'auto',
          overflowX: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%)',
            borderRadius: 16,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)',
            width: '100%',
            maxWidth: 900,
            maxHeight: '95vh',
            animation: 'slideUp 0.3s ease-out',
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              padding: '1.75rem 2rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '-50%',
                right: '-10%',
                width: 300, height: 300,
                background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
                borderRadius: '50%',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <div style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '0.5rem', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 style={{ width: 24, height: 24, color: 'white' }} />
                  </div>
                  <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'white', margin: 0, textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                    Detalles de la Empresa
                  </h2>
                </div>
                <p style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.9)', margin: 0, fontWeight: 400 }}>
                  Información completa del tenant
                </p>
              </div>

              <button
                onClick={onClose}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.5rem',
                  cursor: 'pointer',
                  color: 'white',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
              >
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>
          </div>

          {/* Contenido */}
          <div style={{ 
            padding: '2rem', 
            overflowY: 'auto',
            flex: 1,
            minHeight: 0
          }}>
            {/* Información Básica */}
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '2px solid #e5e7eb' }}>
                <div style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', padding: '0.5rem', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Building2 style={{ width: 18, height: 18, color: 'white' }} />
                </div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Información Básica</h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                <InfoField icon={<FileText />} label="RUC" value={tenantState.ruc} />
                <InfoField icon={<Phone />} label="Teléfono" value={tenantState.telefono || '—'} />
                <InfoField label="Razón Social" value={tenantState.razon_social} fullWidth />
                <InfoField label="Nombre Comercial" value={tenantState.nombre_comercial || '—'} fullWidth />
                <InfoField icon={<MapPin />} label="Dirección" value={tenantState.direccion || '—'} fullWidth />
                <InfoField icon={<Mail />} label="Email" value={tenantState.email || '—'} fullWidth />
              </div>
            </div>

            {/* Estado y Plan */}
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '2px solid #e5e7eb' }}>
                <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '0.5rem', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Settings style={{ width: 18, height: 18, color: 'white' }} />
                </div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Estado y Configuración</h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.5rem' }}>
                    ESTADO
                  </label>
                  <div style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    borderRadius: 8,
                    background: tenantState.estado === 'ACTIVO' ? '#d1fae5' : '#fee2e2',
                    color: tenantState.estado === 'ACTIVO' ? '#065f46' : '#991b1b',
                    fontWeight: 700,
                    fontSize: '0.9rem'
                  }}>
                    {tenantState.estado === 'ACTIVO' ? <CheckCircle2 style={{ width: 16, height: 16 }} /> : <XCircle style={{ width: 16, height: 16 }} />}
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
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '2px solid #e5e7eb' }}>
                <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', padding: '0.5rem', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText style={{ width: 18, height: 18, color: 'white' }} />
                </div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Configuración de Ventas</h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                <BooleanField label="Flujo Logístico" value={tenantState.usar_flujo_logistica} />
                <BooleanField label="GRE Obligatorio" value={tenantState.gre_obligatorio} />
                <BooleanField label="GRE Automático" value={tenantState.gre_automatico_habilitado} />
                {tenantState.gre_automatico_habilitado && (
                  <InfoField label="Umbral GRE" value={`S/ ${tenantState.umbral_gre_automatico || 700}`} />
                )}
              </div>
            </div>

            {/* Modo Demo */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '2px solid #e5e7eb' }}>
                <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', padding: '0.5rem', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Settings style={{ width: 18, height: 18, color: 'white' }} />
                </div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Modo Demo</h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.5rem' }}>
                    Email demo
                  </label>
                  <input
                    value={demoEmail}
                    onChange={(e) => setDemoEmail(e.target.value)}
                    placeholder="cliente@empresa.com"
                    style={{
                      width: '100%',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: '0.65rem 0.8rem',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.5rem' }}>
                    Contraseña demo
                  </label>
                  <input
                    type="text"
                    value={demoPassword}
                    onChange={(e) => setDemoPassword(e.target.value)}
                    placeholder="Contraseña temporal"
                    style={{
                      width: '100%',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: '0.65rem 0.8rem',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.5rem' }}>
                    Días de demo
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={demoDays}
                    onChange={(e) => setDemoDays(Number(e.target.value))}
                    style={{
                      width: '100%',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: '0.65rem 0.8rem',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={handleActivateDemo}
                    disabled={demoLoading}
                    style={{
                      padding: '0.65rem 1rem',
                      borderRadius: 10,
                      border: 'none',
                      background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                      color: 'white',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Activar demo
                  </button>
                  <button
                    type="button"
                    onClick={handleDeactivateDemo}
                    disabled={demoLoading}
                    style={{
                      padding: '0.65rem 1rem',
                      borderRadius: 10,
                      border: '1px solid #e2e8f0',
                      background: 'white',
                      color: '#1f2937',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Quitar demo
                  </button>
                </div>
              </div>

              {(demoError || demoSuccess) && (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.75rem 1rem',
                    borderRadius: 8,
                    background: demoError ? '#fee2e2' : '#dcfce7',
                    color: demoError ? '#991b1b' : '#166534',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                  }}
                >
                  {demoError || demoSuccess}
                </div>
              )}
            </div>

            {/* Fecha de Creación */}
            {tenantState.created_at && (
              <div style={{ 
                marginTop: '2rem',
                padding: '1rem',
                background: '#f8fafc',
                borderRadius: 8,
                fontSize: '0.85rem',
                color: '#64748b'
              }}>
                <strong>Creado:</strong> {new Date(tenantState.created_at).toLocaleString('es-PE')}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ 
            padding: '1.5rem 2rem',
            borderTop: '1px solid #e5e7eb',
            background: 'white',
            display: 'flex',
            justifyContent: 'flex-end'
          }}>
            <button
              onClick={onClose}
              style={{
                padding: '0.75rem 2rem',
                border: 'none',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.9rem',
                boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </>
  )

  return createPortal(modalContent, document.body)
}

// Componente auxiliar para campos de información
function InfoField({ icon, label, value, fullWidth }: { icon?: React.ReactNode, label: string, value: string, fullWidth?: boolean }) {
  return (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : 'auto' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.75rem', color: '#64748b' }}>
        {icon && <span style={{ width: 14, height: 14, color: '#64748b' }}>{icon}</span>}
        {label.toUpperCase()}
      </label>
      <div style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '0.75rem 1rem',
        fontSize: '0.9rem',
        color: '#1e293b',
      }}>
        {value}
      </div>
    </div>
  )
}

// Componente auxiliar para campos booleanos
function BooleanField({ label, value }: { label: string, value?: boolean }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.5rem' }}>
        {label.toUpperCase()}
      </label>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        borderRadius: 8,
        background: value ? '#d1fae5' : '#fee2e2',
        color: value ? '#065f46' : '#991b1b',
        fontWeight: 600,
        fontSize: '0.85rem'
      }}>
        {value ? <CheckCircle2 style={{ width: 14, height: 14 }} /> : <XCircle style={{ width: 14, height: 14 }} />}
        {value ? 'Sí' : 'No'}
      </div>
    </div>
  )
}
