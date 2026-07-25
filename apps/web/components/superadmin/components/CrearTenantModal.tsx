'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useApiCall } from '@/hooks/use-api'
import { usePaises } from '@/hooks/use-paises'
import { Building2, Mail, Phone, MapPin, Settings, FileText, X, AlertCircle, Eye, EyeOff, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { INITIAL_ACTIVE_COUNTRY, INITIAL_ACTIVE_COUNTRY_CODE } from '@/lib/initial-country'

const sectionClass = 'mb-8'
const sectionHeaderClass = 'mb-5 flex items-center gap-3 border-b-2 border-border pb-3'
const sectionIconClass = 'flex items-center justify-center rounded-lg bg-blue-600 p-2 text-white'
const sectionTitleClass = 'm-0 text-lg font-bold text-foreground'
const formGridClass = 'grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]'
const labelClass = 'mb-2 flex items-center gap-2 text-sm font-semibold text-foreground/80'
const labelIconClass = 'size-3.5 text-muted-foreground'
const requiredClass = 'text-muted-foreground'
const inputClass = 'w-full rounded-[10px] border-2 border-border bg-card px-4 py-3 text-[0.9rem] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60'
const helperClass = 'mt-1 text-xs text-muted-foreground'
const fullSpanClass = 'md:col-span-full'
const optionCardClass = 'flex cursor-pointer items-center rounded-[10px] border-2 border-border bg-card p-4 transition hover:border-blue-500 hover:bg-primary/10'
const optionCardActiveClass = 'border-blue-500 bg-primary/10'
const checkboxClass = 'mr-3 size-5 cursor-pointer accent-blue-600'

const defaultTenantFormData = {
  ruc: '',
  razon_social: '',
  nombre_comercial: '',
  direccion: '',
  email: '',
  telefono: '',
  pais: INITIAL_ACTIVE_COUNTRY.codigo_iso,
  pais_id: INITIAL_ACTIVE_COUNTRY.id,
  moneda: INITIAL_ACTIVE_COUNTRY.moneda_codigo,
  tipo_empresa: 'MICRO',
  usar_flujo_logistica: false,
  gre_obligatorio: false,
  gre_automatico_habilitado: false,
  umbral_gre_automatico: 700,
  admin_password: '',
  admin_nombre: '',
}

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
  }>({ ...defaultTenantFormData })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [credentials, setCredentials] = useState<{
    email: string
    temporaryPassword: string
  } | null>(null)

  const api = useApiCall()
  const { paises } = usePaises()

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
  }

  const documentoConfig = documentoConfigMap[formData.pais] || documentoConfigMap.PE

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Cargar datos del tenant si estamos editando
  useEffect(() => {
    if (tenant) {
      const paisMatch = paises.find((pais) => pais.codigo_iso === INITIAL_ACTIVE_COUNTRY_CODE) ?? INITIAL_ACTIVE_COUNTRY
      const resolvedPaisId = paisMatch.id
      const resolvedMoneda = paisMatch.moneda_codigo

      setFormData({
        ruc: tenant.ruc || '',
        razon_social: tenant.razon_social || '',
        nombre_comercial: tenant.nombre_comercial || '',
        direccion: tenant.direccion || '',
        email: tenant.email || '',
        telefono: tenant.telefono || '',
        pais: INITIAL_ACTIVE_COUNTRY_CODE,
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
    } else {
      const paisMatch = paises.find((pais) => pais.codigo_iso === INITIAL_ACTIVE_COUNTRY_CODE) ?? INITIAL_ACTIVE_COUNTRY
      setFormData((prev) => ({
        ...prev,
        pais: paisMatch.codigo_iso,
        pais_id: paisMatch.id,
        moneda: paisMatch.moneda_codigo,
      }))
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

      if (formData.ruc && !/^\d{11}$/.test(formData.ruc)) {
        setError('El RUC debe tener exactamente 11 dígitos numéricos')
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
          setFormData({ ...defaultTenantFormData })
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
    setFormData({ ...defaultTenantFormData })
  }

  if ((!isOpen && !credentials) || !mounted) return null

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        onClick={credentials ? undefined : onClose}
        className="fixed inset-0 z-[9999] animate-in fade-in duration-200 bg-black/60 backdrop-blur-sm"
      />

      {/* Contenedor Modal */}
      <div
        className="pointer-events-none fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto overflow-x-hidden p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto flex max-h-[95vh] w-full max-w-[1200px] animate-in slide-in-from-bottom-4 flex-col overflow-hidden rounded-2xl bg-gradient-to-b from-white to-slate-50 shadow-2xl ring-1 ring-black/5 duration-300"
        >
          {/* Header */}
          <div
            className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-blue-500 to-blue-600 px-8 py-7"
          >
            <div
              className="absolute -right-[10%] -top-1/2 size-[300px] rounded-full bg-white/10"
            />
            <div className="relative z-[1] flex items-start justify-between">
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex items-center justify-center rounded-[10px] bg-white/20 p-2">
                    <Building2 className="size-6 text-white" />
                  </div>
                  <h2 className="m-0 text-3xl font-bold text-white drop-shadow-sm">
                    {isEditing ? 'Editar Empresa' : 'Nueva Empresa'}
                  </h2>
                </div>
                <p className="m-0 text-sm font-normal text-white/90">
                  {isEditing ? 'Actualiza la información de la empresa' : 'Configura una nueva empresa en el sistema'}
                </p>
              </div>

              <button
                onClick={onClose}
                disabled={isLoading}
                className="flex items-center justify-center rounded-lg border-0 bg-white/20 p-2 text-white transition-colors hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              className="mx-8 mt-6 flex animate-in slide-in-from-top-2 items-start gap-3 rounded-[10px] border border-border bg-muted/30 p-4 duration-300"
            >
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-foreground/80" />
              <div className="flex-1">
                <p className="m-0 text-sm font-semibold text-foreground/85">{error}</p>
              </div>
            </div>
          )}

          {/* Contenido + Form */}
          <div className="min-h-0 flex-1 overflow-y-auto p-8">
            <form onSubmit={handleSubmit} id="tenant-form">
              {/* Información Básica */}
              <div className={sectionClass}>
                <div className={sectionHeaderClass}>
                  <div className={sectionIconClass}>
                    <Building2 className="size-[18px]" />
                  </div>
                  <h3 className={sectionTitleClass}>Información Básica</h3>
                </div>

                <div className={formGridClass}>
                  <div>
                    <label className={labelClass}>
                      <MapPin className={labelIconClass} />
                      País <span className={requiredClass}>*</span>
                    </label>
                    <select
                      name="pais"
                      value={formData.pais}
                      onChange={handleChange}
                      required
                      disabled
                      className={inputClass}
                    >
                      <option value={INITIAL_ACTIVE_COUNTRY.codigo_iso}>
                        {INITIAL_ACTIVE_COUNTRY.nombre} ({INITIAL_ACTIVE_COUNTRY.codigo_iso})
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>
                      <FileText className={labelIconClass} />
                      {documentoConfig.label} <span className={requiredClass}>*</span>
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
                      className={inputClass}
                    />
                    <p className={helperClass}>
                      {documentoConfig.helper}
                    </p>
                  </div>

                  <div>
                    <label className={labelClass}>
                      <Phone className={labelIconClass} />
                      Teléfono
                    </label>
                    <input
                      type="tel"
                      name="telefono"
                      value={formData.telefono}
                      onChange={handleChange}
                      placeholder="999999999"
                      className={inputClass}
                    />
                  </div>

                  <div className={fullSpanClass}>
                    <label className={labelClass}>
                      <Building2 className={labelIconClass} />
                      Razón Social <span className={requiredClass}>*</span>
                    </label>
                    <input
                      type="text"
                      name="razon_social"
                      value={formData.razon_social}
                      onChange={handleChange}
                      required
                      placeholder="EMPRESA EJEMPLO S.A.C."
                      className={inputClass}
                    />
                  </div>

                  <div className={fullSpanClass}>
                    <label className={labelClass}>
                      <Building2 className={labelIconClass} />
                      Nombre Comercial
                    </label>
                    <input
                      type="text"
                      name="nombre_comercial"
                      value={formData.nombre_comercial}
                      onChange={handleChange}
                      placeholder="Nombre comercial (opcional)"
                      className={inputClass}
                    />
                  </div>

                  <div className={fullSpanClass}>
                    <label className={labelClass}>
                      <MapPin className={labelIconClass} />
                      Dirección <span className={requiredClass}>*</span>
                    </label>
                    <input
                      type="text"
                      name="direccion"
                      value={formData.direccion}
                      onChange={handleChange}
                      required
                      placeholder="Av. Principal 123, Lima"
                      className={inputClass}
                    />
                  </div>

                  <div className={fullSpanClass}>
                    <label className={labelClass}>
                      <Mail className={labelIconClass} />
                      Email <span className={requiredClass}>*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      placeholder="contacto@empresa.com"
                      className={inputClass}
                    />
                    <p className={helperClass}>
                      Este será el email del usuario administrador
                    </p>
                  </div>
                </div>
              </div>

              {/* Credenciales del Administrador */}
              <div className={sectionClass}>
                <div className={sectionHeaderClass}>
                  <div className={sectionIconClass}>
                    <Settings className="size-[18px]" />
                  </div>
                  <h3 className={sectionTitleClass}>Credenciales del Administrador</h3>
                </div>

                <div className={formGridClass}>
                  <div>
                    <label className={labelClass}>
                      <Building2 className={labelIconClass} />
                      Nombre del Administrador <span className={requiredClass}>*</span>
                    </label>
                    <input
                      type="text"
                      name="admin_nombre"
                      value={formData.admin_nombre}
                      onChange={handleChange}
                      required
                      placeholder="Juan Pérez"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>
                      <Settings className={labelIconClass} />
                      Contraseña Inicial <span className={requiredClass}>*</span>
                    </label>
                    <input
                      type="password"
                      name="admin_password"
                      value={formData.admin_password}
                      onChange={handleChange}
                      required
                      minLength={8}
                      placeholder="Mínimo 8 caracteres"
                      className={inputClass}
                    />
                    <p className={helperClass}>
                      💡 El administrador podrá cambiarla después
                    </p>
                  </div>
                </div>
              </div>

              {/* Configuración de Ventas */}
              <div className={sectionClass}>
                <div className={sectionHeaderClass}>
                  <div className={sectionIconClass}>
                    <Settings className="size-[18px]" />
                  </div>
                  <h3 className={sectionTitleClass}>Configuración de Ventas</h3>
                </div>

                <div className={formGridClass}>
                  <div className={fullSpanClass}>
                    <label className="mb-2 block text-sm font-semibold text-foreground/80">
                      Tipo de Empresa <span className={requiredClass}>*</span>
                    </label>
                    <select
                      name="tipo_empresa"
                      value={formData.tipo_empresa}
                      onChange={handleChange}
                      required
                      className={cn(inputClass, 'cursor-pointer')}
                    >
                      <option value="MICRO">Microempresa</option>
                      <option value="PEQUEÑA">Pequeña Empresa</option>
                      <option value="MEDIANA">Mediana Empresa</option>
                      <option value="GRANDE">Gran Empresa</option>
                    </select>
                    <div className="mt-2 rounded-lg border border-blue-200 bg-primary/10 p-3 text-xs font-semibold text-primary">
                      {formData.tipo_empresa === 'MICRO' || formData.tipo_empresa === 'PEQUEÑA'
                        ? '💡 Flujo simplificado (sin logística)'
                        : '💡 Flujo completo (con logística)'}
                    </div>
                  </div>

                  <div className={fullSpanClass}>
                    <label
                      className={cn(optionCardClass, formData.usar_flujo_logistica && optionCardActiveClass)}
                    >
                      <input
                        type="checkbox"
                        name="usar_flujo_logistica"
                        checked={formData.usar_flujo_logistica}
                        onChange={handleChange}
                        className={checkboxClass}
                      />
                      <div className="flex-1">
                        <span className="text-[0.95rem] font-bold text-foreground">Usar Flujo Logístico</span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Incluye preparación y despacho en almacén
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Configuración de GRE */}
              <div className="mb-4">
                <div className={sectionHeaderClass}>
                  <div className={sectionIconClass}>
                    <FileText className="size-[18px]" />
                  </div>
                  <h3 className={sectionTitleClass}>Configuración de Guías de Remisión (GRE)</h3>
                </div>

                <div className={formGridClass}>
                  <div>
                    <label
                      className={cn(optionCardClass, formData.gre_obligatorio && optionCardActiveClass)}
                    >
                      <input
                        type="checkbox"
                        name="gre_obligatorio"
                        checked={formData.gre_obligatorio}
                        onChange={handleChange}
                        className={checkboxClass}
                      />
                      <div className="flex-1">
                        <span className="text-[0.95rem] font-bold text-foreground">GRE Obligatorio</span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Exigir GRE para todas las ventas
                        </p>
                      </div>
                    </label>
                  </div>

                  <div>
                    <label
                      className={cn(optionCardClass, formData.gre_automatico_habilitado && optionCardActiveClass)}
                    >
                      <input
                        type="checkbox"
                        name="gre_automatico_habilitado"
                        checked={formData.gre_automatico_habilitado}
                        onChange={handleChange}
                        className={checkboxClass}
                      />
                      <div className="flex-1">
                        <span className="text-[0.95rem] font-bold text-foreground">Sugerencia Automática</span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Sugerir GRE según monto
                        </p>
                      </div>
                    </label>
                  </div>

                  {formData.gre_automatico_habilitado && (
                    <div className={cn(fullSpanClass, 'animate-in slide-in-from-top-2 duration-300')}>
                      <label className="mb-2 block text-sm font-semibold text-foreground/80">
                        Umbral para Sugerencia (S/)
                      </label>
                      <input
                        type="number"
                        name="umbral_gre_automatico"
                        value={formData.umbral_gre_automatico}
                        onChange={handleChange}
                        min={0}
                        step={0.01}
                        className={inputClass}
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        💡 Sugerir GRE si el monto de venta supera este valor
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ACCIONES (sin footer, dentro del form) */}
              <div className="mt-5 flex justify-end gap-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="rounded-[10px] border-2 border-border bg-card px-7 py-3 text-[0.9rem] font-semibold text-foreground/80 transition hover:border-border hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center gap-2 rounded-[10px] bg-gradient-to-br from-blue-500 to-blue-600 px-8 py-3 text-[0.9rem] font-bold text-white shadow-lg shadow-blue-500/30 transition hover:-translate-y-0.5 hover:shadow-blue-500/40 disabled:cursor-not-allowed disabled:from-slate-400 disabled:to-slate-500 disabled:shadow-none"
                >
                  {isLoading ? (
                    <>
                      <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <Building2 className="size-[18px]" />
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
          className="fixed inset-0 z-[11000] flex animate-in fade-in items-center justify-center bg-black/60 backdrop-blur-sm duration-200"
        >
          <div
            className="w-[90%] max-w-[500px] rounded-2xl bg-card p-8 shadow-2xl"
          >
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-2xl text-white">
                <Building2 className="size-8" />
              </div>
              <h2 className="mb-2 text-2xl font-bold text-foreground">
                ¡Empresa Creada!
              </h2>
              <p className="m-0 text-muted-foreground">
                Guarda estas credenciales del administrador
              </p>
            </div>

            <div className="mb-6 rounded-xl border-2 border-border bg-muted/30 p-5">
              <div className="mb-4">
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  EMAIL
                </label>
                <div className="rounded-lg border border-border bg-card p-3 font-mono text-[0.9rem] text-foreground">
                  {credentials.email}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  CONTRASEÑA TEMPORAL
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
                  <span className="flex-1 font-mono text-[0.9rem] font-bold text-foreground">
                    {showPassword ? credentials.temporaryPassword : '••••••••••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-muted-foreground hover:text-foreground/80 transition"
                    title={showPassword ? 'Ocultar' : 'Mostrar'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(credentials.temporaryPassword)}
                    className="text-muted-foreground hover:text-foreground/80 transition"
                    title="Copiar"
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-6 rounded-lg border border-blue-200 bg-primary/10 p-3 text-[0.85rem] text-primary">
              ⚠️ <strong>Importante:</strong> El usuario deberá cambiar esta contraseña en su primer inicio de sesión.
            </div>

            <button
              onClick={handleCloseCredentials}
              className="w-full rounded-[10px] bg-gradient-to-br from-blue-500 to-blue-600 p-3 text-[0.95rem] font-bold text-white shadow-lg shadow-blue-500/30 transition hover:-translate-y-px"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

    </>
  )

  // Usar portal para renderizar el modal en el body
  if (typeof document !== 'undefined') {
    const modalRoot = document.getElementById('modal-root') || document.body
    return createPortal(modalContent, modalRoot)
  }

  return null
}
