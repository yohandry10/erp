'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useApiCall } from '@/hooks/use-api'
import { usePaises } from '@/hooks/use-paises'
import { Building2, Mail, Phone, MapPin, Settings, FileText, X, AlertCircle } from 'lucide-react'

interface Tenant {
  id?: string
  ruc: string
  razon_social: string
  nombre_comercial?: string
  direccion?: string
  email?: string
  telefono?: string
  pais?: string
  pais_id?: number
  moneda_defecto?: string
  tipo_empresa?: string
  usar_flujo_logistica?: boolean
  gre_obligatorio?: boolean
  gre_automatico_habilitado?: boolean
  umbral_gre_automatico?: number
}

interface CrearTenantModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  tenant?: Tenant | null // Para edición
}

export default function CrearTenantModal({ isOpen, onClose, onSuccess, tenant }: CrearTenantModalProps) {
  const isEditing = !!tenant
  const [mounted, setMounted] = useState(false)
  const [formData, setFormData] = useState<{
    ruc: string
    razon_social: string
    nombre_comercial: string
    direccion: string
    email: string
    telefono: string
    pais: string
    pais_id: number | null
    moneda: string
    tipo_empresa: string
    usar_flujo_logistica: boolean
    gre_obligatorio: boolean
    gre_automatico_habilitado: boolean
    umbral_gre_automatico: number
    admin_password: string
    admin_nombre: string
  }>({
    ruc: '',
    razon_social: '',
    nombre_comercial: '',
    direccion: '',
    email: '',
    telefono: '',
    pais: '',
    pais_id: null,
    moneda: '',
    tipo_empresa: 'MICRO',
    usar_flujo_logistica: false,
    gre_obligatorio: false,
    gre_automatico_habilitado: false,
    umbral_gre_automatico: 700,
    admin_password: '', // Contraseña del admin
    admin_nombre: '', // Nombre del admin
  })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [credentials, setCredentials] = useState<{
    email: string
    temporaryPassword: string
  } | null>(null)

  const api = useApiCall()
  const { paises, loading: paisesLoading } = usePaises()

  const documentoConfigMap: Record<string, {
    label: string
    placeholder: string
    pattern: string
    maxLength: number
    helper: string
  }> = {
    PE: {
      label: 'RUC',
      placeholder: '20123456789',
      pattern: '^[0-9]{11}$',
      maxLength: 11,
      helper: 'Debe tener 11 dígitos',
    },
    CO: {
      label: 'NIT',
      placeholder: '900123456-7',
      pattern: '^[0-9]{9,10}(-[0-9])?$',
      maxLength: 12,
      helper: 'Formato: 9-10 dígitos + dígito de verificación',
    },
    CL: {
      label: 'RUT',
      placeholder: '12345678-9',
      pattern: '^[0-9]{7,9}(-[0-9kK])?$',
      maxLength: 11,
      helper: 'Formato: 7-9 dígitos + dígito verificador',
    },
    MX: {
      label: 'RFC',
      placeholder: 'XAXX010101000',
      pattern: '^[A-Z0-9]{12,13}$',
      maxLength: 13,
      helper: 'Debe tener 12 o 13 caracteres alfanuméricos',
    },
    EC: {
      label: 'RUC',
      placeholder: '1790012345001',
      pattern: '^[0-9]{13}$',
      maxLength: 13,
      helper: 'Debe tener 13 dígitos',
    },
  }

  const documentoConfig = documentoConfigMap[formData.pais] || documentoConfigMap.PE

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Cargar datos del tenant si estamos editando
  useEffect(() => {
    if (tenant) {
      const paisMatch = tenant.pais
        ? paises.find((pais) => pais.codigo_iso === tenant.pais)
        : undefined
      const resolvedPaisId = tenant.pais_id ?? paisMatch?.id ?? null
      const resolvedMoneda = tenant.moneda_defecto || paisMatch?.moneda_codigo || ''

      setFormData({
        ruc: tenant.ruc || '',
        razon_social: tenant.razon_social || '',
        nombre_comercial: tenant.nombre_comercial || '',
        direccion: tenant.direccion || '',
        email: tenant.email || '',
        telefono: tenant.telefono || '',
        pais: tenant.pais || '',
        pais_id: resolvedPaisId,
        moneda: resolvedMoneda,
        tipo_empresa: tenant.tipo_empresa || 'MICRO',
        usar_flujo_logistica: tenant.usar_flujo_logistica ?? false,
        gre_obligatorio: tenant.gre_obligatorio ?? false,
        gre_automatico_habilitado: tenant.gre_automatico_habilitado ?? false,
        umbral_gre_automatico: tenant.umbral_gre_automatico || 700,
        admin_password: '',
        admin_nombre: '',
      })
    }
  }, [tenant, paises])

  const handleTipoEmpresaChange = (tipo: string) => {
    const usarFlujoLogistica = tipo === 'MEDIANA' || tipo === 'GRANDE'
    setFormData(prev => ({ ...prev, tipo_empresa: tipo, usar_flujo_logistica: usarFlujoLogistica }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      if (!formData.pais_id) {
        setError('Debes seleccionar un país válido')
        setIsLoading(false)
        return
      }

      const payload = {
        ...formData,
        pais_id: formData.pais_id,
      }

      const result = isEditing 
        ? await api.put(`/tenants/${tenant.id}`, payload)
        : await api.post('/tenants', payload)

      if (result && result.success) {
        // Mostrar credenciales del usuario administrador
        const adminUser = result.data?.adminUser
        if (adminUser?.email && adminUser?.temporaryPassword) {
          setCredentials({
            email: adminUser.email,
            temporaryPassword: adminUser.temporaryPassword,
          })
        }

        onSuccess()
        if (!adminUser?.email || !adminUser?.temporaryPassword) {
          onClose()
          setFormData({
            ruc: '',
            razon_social: '',
            nombre_comercial: '',
            direccion: '',
            email: '',
            telefono: '',
            pais: '',
            pais_id: null,
            moneda: '',
            tipo_empresa: 'MICRO',
            usar_flujo_logistica: false,
            gre_obligatorio: false,
            gre_automatico_habilitado: false,
            umbral_gre_automatico: 700,
            admin_password: '',
            admin_nombre: '',
          })
        }
      } else {
        setError(result?.message || 'Error al crear la empresa')
      }
    } catch (err: any) {
      setError(err.message || 'Error al crear la empresa')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked
      setFormData(prev => ({ ...prev, [name]: checked }))
    } else if (name === 'pais') {
      const selectedPais = paises.find(pais => pais.codigo_iso === value)
      const moneda = selectedPais?.moneda_codigo || ''
      const paisId = selectedPais?.id ?? null
      setFormData(prev => ({ ...prev, pais: value, pais_id: paisId, moneda }))
    } else if (name === 'umbral_gre_automatico') {
      const parsedValue = Number(value)
      setFormData(prev => ({
        ...prev,
        umbral_gre_automatico: Number.isNaN(parsedValue) ? prev.umbral_gre_automatico : parsedValue
      }))
    } else if (name === 'tipo_empresa') {
      handleTipoEmpresaChange(value)
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleCloseCredentials = () => {
    setCredentials(null)
    onClose()
    setFormData({
      ruc: '',
      razon_social: '',
      nombre_comercial: '',
      direccion: '',
      email: '',
      telefono: '',
      pais: '',
      pais_id: null,
      moneda: '',
      tipo_empresa: 'MICRO',
      usar_flujo_logistica: false,
      gre_obligatorio: false,
      gre_automatico_habilitado: false,
      umbral_gre_automatico: 700,
      admin_password: '',
      admin_nombre: '',
    })
  }

  if ((!isOpen && !credentials) || !mounted) return null

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        onClick={credentials ? undefined : onClose}
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
            maxWidth: 1200,
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
                    {isEditing ? 'Editar Empresa' : 'Nueva Empresa'}
                  </h2>
                </div>
                <p style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.9)', margin: 0, fontWeight: 400 }}>
                  {isEditing ? 'Actualiza la información de la empresa' : 'Configura una nueva empresa en el sistema'}
                </p>
              </div>

              <button
                onClick={onClose}
                disabled={isLoading}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.5rem',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  color: 'white',
                  opacity: isLoading ? 0.5 : 1,
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.background = 'rgba(255,255,255,0.3)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
              >
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                margin: '1.5rem 2rem 0',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 10,
                padding: '1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                animation: 'slideDown 0.3s ease-out',
              }}
            >
              <AlertCircle style={{ width: 20, height: 20, color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <p style={{ color: '#dc2626', fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>{error}</p>
              </div>
            </div>
          )}

          {/* Contenido + Form */}
          <div style={{ 
            padding: '2rem', 
            overflowY: 'auto',
            flex: 1,
            minHeight: 0
          }}>
            <form onSubmit={handleSubmit} id="tenant-form">
              {/* Información Básica */}
              <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '2px solid #e5e7eb' }}>
                  <div style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', padding: '0.5rem', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 style={{ width: 18, height: 18, color: 'white' }} />
                  </div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Información Básica</h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem', color: '#475569' }}>
                      <MapPin style={{ width: 14, height: 14, color: '#64748b' }} />
                      País <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      name="pais"
                      value={formData.pais}
                      onChange={handleChange}
                      required
                      disabled={paisesLoading}
                      style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', transition: 'all 0.2s', background: 'white', cursor: paisesLoading ? 'not-allowed' : 'pointer' }}
                      onFocus={(e) => { if (!paisesLoading) { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)' } }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
                    >
                      {paisesLoading && <option value="">Cargando países...</option>}
                      {!paisesLoading && (
                        <>
                          <option value="">Selecciona un país...</option>
                          {paises.map((pais) => (
                            <option key={pais.codigo_iso} value={pais.codigo_iso}>
                              {pais.nombre} ({pais.codigo_iso})
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem', color: '#475569' }}>
                      <FileText style={{ width: 14, height: 14, color: '#64748b' }} />
                      {documentoConfig.label} <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      name="ruc"
                      value={formData.ruc}
                      onChange={handleChange}
                      required
                      maxLength={documentoConfig.maxLength}
                      pattern={documentoConfig.pattern}
                      placeholder={documentoConfig.placeholder}
                      style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', transition: 'all 0.2s', background: 'white' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                      {documentoConfig.helper}
                    </p>
                  </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem', color: '#475569' }}>
                      <Phone style={{ width: 14, height: 14, color: '#64748b' }} />
                      Teléfono
                    </label>
                    <input
                      type="tel"
                      name="telefono"
                      value={formData.telefono}
                      onChange={handleChange}
                      placeholder="999999999"
                      style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', transition: 'all 0.2s', background: 'white' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem', color: '#475569' }}>
                      <Building2 style={{ width: 14, height: 14, color: '#64748b' }} />
                      Razón Social <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      name="razon_social"
                      value={formData.razon_social}
                      onChange={handleChange}
                      required
                      placeholder="EMPRESA EJEMPLO S.A.C."
                      style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', transition: 'all 0.2s', background: 'white' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem', color: '#475569' }}>
                      <Building2 style={{ width: 14, height: 14, color: '#64748b' }} />
                      Nombre Comercial
                    </label>
                    <input
                      type="text"
                      name="nombre_comercial"
                      value={formData.nombre_comercial}
                      onChange={handleChange}
                      placeholder="Nombre comercial (opcional)"
                      style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', transition: 'all 0.2s', background: 'white' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem', color: '#475569' }}>
                      <MapPin style={{ width: 14, height: 14, color: '#64748b' }} />
                      Dirección <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      name="direccion"
                      value={formData.direccion}
                      onChange={handleChange}
                      required
                      placeholder="Av. Principal 123, Lima"
                      style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', transition: 'all 0.2s', background: 'white' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem', color: '#475569' }}>
                      <Mail style={{ width: 14, height: 14, color: '#64748b' }} />
                      Email <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      placeholder="contacto@empresa.com"
                      style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', transition: 'all 0.2s', background: 'white' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                      Este será el email del usuario administrador
                    </p>
                  </div>
                </div>
              </div>

              {/* Credenciales del Administrador */}
              <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '2px solid #e5e7eb' }}>
                  <div style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', padding: '0.5rem', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Settings style={{ width: 18, height: 18, color: 'white' }} />
                  </div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Credenciales del Administrador</h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem', color: '#475569' }}>
                      <Building2 style={{ width: 14, height: 14, color: '#64748b' }} />
                      Nombre del Administrador <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      name="admin_nombre"
                      value={formData.admin_nombre}
                      onChange={handleChange}
                      required
                      placeholder="Juan Pérez"
                      style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', transition: 'all 0.2s', background: 'white' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem', color: '#475569' }}>
                      <Settings style={{ width: 14, height: 14, color: '#64748b' }} />
                      Contraseña Inicial <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="password"
                      name="admin_password"
                      value={formData.admin_password}
                      onChange={handleChange}
                      required
                      minLength={8}
                      placeholder="Mínimo 8 caracteres"
                      style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', transition: 'all 0.2s', background: 'white' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                      💡 El administrador podrá cambiarla después
                    </p>
                  </div>
                </div>
              </div>

              {/* Configuración de Ventas */}
              <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '2px solid #e5e7eb' }}>
                  <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '0.5rem', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Settings style={{ width: 18, height: 18, color: 'white' }} />
                  </div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Configuración de Ventas</h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem', color: '#475569' }}>
                      Tipo de Empresa <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      name="tipo_empresa"
                      value={formData.tipo_empresa}
                      onChange={handleChange}
                      required
                      style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', transition: 'all 0.2s', background: 'white', cursor: 'pointer' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
                    >
                      <option value="MICRO">Microempresa</option>
                      <option value="PEQUEÑA">Pequeña Empresa</option>
                      <option value="MEDIANA">Mediana Empresa</option>
                      <option value="GRANDE">Gran Empresa</option>
                    </select>
                    <div
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.75rem',
                        background: formData.tipo_empresa === 'MICRO' || formData.tipo_empresa === 'PEQUEÑA'
                          ? 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)'
                          : 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                        borderRadius: 8,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: formData.tipo_empresa === 'MICRO' || formData.tipo_empresa === 'PEQUEÑA' ? '#1e40af' : '#065f46',
                      }}
                    >
                      {formData.tipo_empresa === 'MICRO' || formData.tipo_empresa === 'PEQUEÑA'
                        ? '💡 Flujo simplificado (sin logística)'
                        : '💡 Flujo completo (con logística)'}
                    </div>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                        padding: '1rem',
                        border: '2px solid #e2e8f0',
                        borderRadius: 10,
                        backgroundColor: formData.usar_flujo_logistica ? '#eff6ff' : 'white',
                        transition: 'all 0.2s',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.backgroundColor = '#eff6ff' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; if (!formData.usar_flujo_logistica) e.currentTarget.style.backgroundColor = 'white' }}
                    >
                      <input
                        type="checkbox"
                        name="usar_flujo_logistica"
                        checked={formData.usar_flujo_logistica}
                        onChange={handleChange}
                        style={{ marginRight: '0.75rem', width: 20, height: 20, cursor: 'pointer', accentColor: '#3b82f6' }}
                      />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>Usar Flujo Logístico</span>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
                          Incluye preparación y despacho en almacén
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Configuración de GRE */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '2px solid #e5e7eb' }}>
                  <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', padding: '0.5rem', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText style={{ width: 18, height: 18, color: 'white' }} />
                  </div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Configuración de Guías de Remisión (GRE)</h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                  <div>
                    <label
                      style={{
                        display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '1rem',
                        border: '2px solid #e2e8f0', borderRadius: 10,
                        backgroundColor: formData.gre_obligatorio ? '#fef3c7' : 'white', transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.backgroundColor = '#fef3c7' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; if (!formData.gre_obligatorio) e.currentTarget.style.backgroundColor = 'white' }}
                    >
                      <input
                        type="checkbox"
                        name="gre_obligatorio"
                        checked={formData.gre_obligatorio}
                        onChange={handleChange}
                        style={{ marginRight: '0.75rem', width: 20, height: 20, cursor: 'pointer', accentColor: '#f59e0b' }}
                      />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>GRE Obligatorio</span>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
                          Exigir GRE para todas las ventas
                        </p>
                      </div>
                    </label>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '1rem',
                        border: '2px solid #e2e8f0', borderRadius: 10,
                        backgroundColor: formData.gre_automatico_habilitado ? '#fef3c7' : 'white', transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.backgroundColor = '#fef3c7' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; if (!formData.gre_automatico_habilitado) e.currentTarget.style.backgroundColor = 'white' }}
                    >
                      <input
                        type="checkbox"
                        name="gre_automatico_habilitado"
                        checked={formData.gre_automatico_habilitado}
                        onChange={handleChange}
                        style={{ marginRight: '0.75rem', width: 20, height: 20, cursor: 'pointer', accentColor: '#f59e0b' }}
                      />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>Sugerencia Automática</span>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
                          Sugerir GRE según monto
                        </p>
                      </div>
                    </label>
                  </div>

                  {formData.gre_automatico_habilitado && (
                    <div style={{ gridColumn: '1 / -1', animation: 'slideDown 0.3s ease-out' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem', color: '#475569' }}>
                        Umbral para Sugerencia (S/)
                      </label>
                      <input
                        type="number"
                        name="umbral_gre_automatico"
                        value={formData.umbral_gre_automatico}
                        onChange={handleChange}
                        min={0}
                        step={0.01}
                        style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', transition: 'all 0.2s', background: 'white' }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.1)' }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
                      />
                      <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
                        💡 Sugerir GRE si el monto de venta supera este valor
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ACCIONES (sin footer, dentro del form) */}
              <div
                style={{
                  display: 'flex',
                  gap: '1rem',
                  justifyContent: 'flex-end',
                  marginTop: '1.25rem',
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  style={{
                    padding: '0.75rem 1.75rem',
                    border: '2px solid #e2e8f0',
                    borderRadius: 10,
                    backgroundColor: 'white',
                    color: '#475569',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    opacity: isLoading ? 0.5 : 1,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { if (!isLoading) { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.backgroundColor = '#f8fafc' } }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.backgroundColor = 'white' }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    padding: '0.75rem 2rem',
                    border: 'none',
                    borderRadius: 10,
                    background: isLoading
                      ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
                      : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    boxShadow: isLoading ? 'none' : '0 4px 12px rgba(59,130,246,0.4)',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(59,130,246,0.5)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.4)'
                  }}
                >
                  {isLoading ? (
                    <>
                      <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Creando...
                    </>
                  ) : (
                    <>
                      <Building2 style={{ width: 18, height: 18 }} />
                      Crear Empresa
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {credentials && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 11000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              maxWidth: 500,
              width: '90%',
              padding: '2rem',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  margin: '0 auto 1rem',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                }}
              >
                ✅
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', margin: '0 0 0.5rem 0' }}>
                ¡Empresa Creada!
              </h2>
              <p style={{ color: '#64748b', margin: 0 }}>
                Guarda estas credenciales del administrador
              </p>
            </div>

            <div
              style={{
                background: '#f8fafc',
                border: '2px solid #e2e8f0',
                borderRadius: 12,
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.25rem' }}>
                  EMAIL
                </label>
                <div
                  style={{
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '0.75rem',
                    fontFamily: 'monospace',
                    fontSize: '0.9rem',
                    color: '#1e293b',
                  }}
                >
                  {credentials.email}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.25rem' }}>
                  CONTRASEÑA TEMPORAL
                </label>
                <div
                  style={{
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '0.75rem',
                    fontFamily: 'monospace',
                    fontSize: '0.9rem',
                    color: '#dc2626',
                    fontWeight: 700,
                  }}
                >
                  {credentials.temporaryPassword}
                </div>
              </div>
            </div>

            <div
              style={{
                background: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: 8,
                padding: '0.75rem',
                marginBottom: '1.5rem',
                fontSize: '0.85rem',
                color: '#92400e',
              }}
            >
              ⚠️ <strong>Importante:</strong> El usuario deberá cambiar esta contraseña en su primer inicio de sesión.
            </div>

            <button
              onClick={handleCloseCredentials}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Animaciones y Responsive */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        @media (max-width: 768px) {
          .modal-content-responsive {
            max-width: 100% !important;
            margin: 0.5rem !important;
            max-height: 98vh !important;
          }
        }
      `}</style>
    </>
  )

  // Usar portal para renderizar el modal en el body
  if (typeof document !== 'undefined') {
    const modalRoot = document.getElementById('modal-root') || document.body
    return createPortal(modalContent, modalRoot)
  }

  return null
}
