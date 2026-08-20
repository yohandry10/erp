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
      const intentStorageKey = `tenant-demo-activate-intent:${tenant.id}`
      let idempotencyKey = window.sessionStorage.getItem(intentStorageKey)
      if (!idempotencyKey) {
        idempotencyKey = `tenant-demo-activate-${window.crypto.randomUUID()}`
        window.sessionStorage.setItem(intentStorageKey, idempotencyKey)
      }
      const res = await api.post(`/tenants/${tenant.id}/demo/activate`, {
        email,
        password,
        dias_duracion: days,
      }, { headers: { 'Idempotency-Key': idempotencyKey } })
      if (res?.success) {
        window.sessionStorage.removeItem(intentStorageKey)
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
        onClick={onClose} className="fixed inset-0 bg-[rgba(15,_23,_42,_0.6)] z-[9999]"
      />
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      >
        <div className="w-[100%] bg-card shadow p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4">
            <h3 className="text-xl font-bold m-0">{tenant.is_demo ? 'Administrar demo' : 'Activar demo'}</h3>
            <p className="text-muted-foreground">
              {tenant.razon_social}
            </p>
            {tenant.is_demo && (
              <p className="text-primary font-semibold">
                Demo activa{tenant.demo_expires_at ? ` hasta ${new Date(tenant.demo_expires_at).toLocaleString('es-PE')}` : ''}
              </p>
            )}
          </div>

          {!tenant.is_demo && (
          <div className="grid gap-3">
            <div>
              <label htmlFor="demotenantmodal-email" className="text-xs font-semibold text-muted-foreground">Email</label>
              <input id="demotenantmodal-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@empresa.com" className="w-[100%] border py-[0.65rem] px-[0.8rem] text-sm"
              />
            </div>
            <div>
              <label htmlFor="demotenantmodal-contrasena" className="text-xs font-semibold text-muted-foreground">Contraseña</label>
              <input id="demotenantmodal-contrasena"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña temporal" className="w-[100%] border py-[0.65rem] px-[0.8rem] text-sm"
              />
            </div>
            <div>
              <label htmlFor="demotenantmodal-dias-de-demo" className="text-xs font-semibold text-muted-foreground">Días de demo</label>
              <input id="demotenantmodal-dias-de-demo"
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))} className="w-[100%] border py-[0.65rem] px-[0.8rem] text-sm"
              />
            </div>
          </div>
          )}

          {(error || success) && (
            <div className="mt-4 py-3 px-4 font-semibold text-sm"
            >
              {error || success}
            </div>
          )}

          <div className="flex gap-3 mt-5">
            {tenant.is_demo ? (
              <button type="button" onClick={handleDeactivate} disabled={loading} className="flex-[1] py-3 px-4 border bg-card text-foreground font-bold cursor-pointer">
                Quitar demo
              </button>
            ) : (
              <button type="button" onClick={handleActivate} disabled={loading} className="flex-[1] py-3 px-4 border-0 text-white font-bold cursor-pointer">
                Activar demo
              </button>
            )}
            <button
              type="button"
              onClick={onClose} className="py-3 px-4 border bg-muted/30 text-foreground/80 font-bold cursor-pointer"
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
