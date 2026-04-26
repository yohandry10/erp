'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApiCall } from '@/hooks/use-api'

interface Tenant {
  id?: string
  razon_social: string
  email?: string
  is_demo?: boolean
  demo_expires_at?: string
}

interface DemoTenantModalProps {
  tenant: Tenant
  onClose: () => void
  onSuccess: () => void
}

export default function DemoTenantModal({ tenant, onClose, onSuccess }: DemoTenantModalProps) {
  const api = useApiCall()
  const [mounted, setMounted] = useState(false)
  const [email, setEmail] = useState(tenant.email || '')
  const [password, setPassword] = useState('')
  const [days, setDays] = useState(15)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    setEmail(tenant.email || '')
    setPassword('')
    setDays(15)
    setError('')
    setSuccess('')
  }, [tenant])

  const handleActivate = async () => {
    if (!tenant.id) return
    if (!email || !password) {
      setError('Email y contraseña son obligatorios.')
      return
    }
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      setError('Los días de demo deben estar entre 1 y 90.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const res = await api.post(`/tenants/${tenant.id}/demo/activate`, {
        email,
        password,
        dias_duracion: days,
      })
      if (res?.success) {
        setSuccess(`Demo activada por ${days} días.`)
        onSuccess()
      } else {
        setError(res?.message || 'No se pudo activar la demo.')
      }
    } catch (err: any) {
      setError(err?.message || 'Error activando demo.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeactivate = async () => {
    if (!tenant.id) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const res = await api.post(`/tenants/${tenant.id}/demo/deactivate`)
      if (res?.success) {
        setSuccess('Modo demo desactivado.')
        onSuccess()
      } else {
        setError(res?.message || 'No se pudo desactivar la demo.')
      }
    } catch (err: any) {
      setError(err?.message || 'Error desactivando demo.')
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  const modalContent = (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          zIndex: 9999,
        }}
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 520,
            background: 'white',
            borderRadius: 16,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            padding: '1.5rem',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Activar demo</h3>
            <p style={{ margin: '0.25rem 0 0', color: '#64748b' }}>
              {tenant.razon_social}
            </p>
            {tenant.is_demo && (
              <p style={{ margin: '0.35rem 0 0', color: '#2563eb', fontWeight: 600 }}>
                Demo activa{tenant.demo_expires_at ? ` hasta ${new Date(tenant.demo_expires_at).toLocaleString('es-PE')}` : ''}
              </p>
            )}
          </div>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Contraseña</label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Días de demo</label>
              <input
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                style={{
                  width: '100%',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '0.65rem 0.8rem',
                  fontSize: '0.9rem',
                }}
              />
            </div>
          </div>

          {(error || success) && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: 8,
                background: error ? '#fee2e2' : '#dcfce7',
                color: error ? '#991b1b' : '#166534',
                fontWeight: 600,
                fontSize: '0.85rem',
              }}
            >
              {error || success}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button
              type="button"
              onClick={handleActivate}
              disabled={loading}
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
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
              onClick={handleDeactivate}
              disabled={loading}
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
                borderRadius: 10,
                border: '1px solid #e2e8f0',
                background: 'white',
                color: '#0f172a',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Quitar demo
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 10,
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                color: '#475569',
                fontWeight: 700,
                cursor: 'pointer',
              }}
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
