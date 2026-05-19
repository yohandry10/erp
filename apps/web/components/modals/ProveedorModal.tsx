'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'

interface Proveedor {
  id?: number | string
  ruc?: string
  razon_social?: string
  nombre?: string
  nombre_comercial?: string
  direccion?: string
  telefono?: string
  email?: string
  contacto?: string
  condiciones_pago?: string
}

interface ProveedorModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  proveedor?: Proveedor
}

/** Todos los campos del formulario son string para simplificar el tipado */
type FormData = {
  ruc: string
  razon_social: string
  nombre_comercial: string
  direccion: string
  telefono: string
  email: string
  contacto: string
  condiciones_pago: string
}

/** Errores: clave = campo del formulario, valor = mensaje o undefined (sin error) */
type FormErrors = Partial<Record<keyof FormData, string | undefined>>

const INITIAL_FORM: FormData = {
  ruc: '',
  razon_social: '',
  nombre_comercial: '',
  direccion: '',
  telefono: '',
  email: '',
  contacto: '',
  condiciones_pago: 'CONTADO',
}

export default function ProveedorModal({
  isOpen,
  onClose,
  onSuccess,
  proveedor,
}: ProveedorModalProps) {
  const { post, put } = useApi()
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  // Cargar datos del proveedor si se está editando
  useEffect(() => {
    if (!isOpen) return

    if (proveedor) {
      setFormData({
        ruc: proveedor.ruc ?? '',
        razon_social: proveedor.razon_social ?? proveedor.nombre ?? '',
        nombre_comercial: proveedor.nombre_comercial ?? '',
        direccion: proveedor.direccion ?? '',
        telefono: proveedor.telefono ?? '',
        email: proveedor.email ?? '',
        contacto: proveedor.contacto ?? '',
        condiciones_pago: proveedor.condiciones_pago ?? 'CONTADO',
      })
    } else {
      resetForm()
    }
    setErrors({})
  }, [isOpen, proveedor])

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.ruc.trim()) {
      newErrors.ruc = 'RUC es obligatorio'
    } else if (!/^\d{11}$/.test(formData.ruc)) {
      newErrors.ruc = 'RUC debe tener 11 dígitos'
    }

    if (!formData.razon_social.trim()) {
      newErrors.razon_social = 'Razón Social es obligatoria'
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email no válido'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsLoading(true)
    try {
      // ✅ Usar useApi en lugar de fetch directo
      const result = proveedor
        ? await put(`/compras/proveedores/${proveedor.id}`, formData)
        : await post('/compras/proveedores', formData)

      if (result?.success) {
        onSuccess()
        onClose()
        resetForm()
      } else {
        alert('Error: ' + (result?.error || 'Error al procesar el proveedor'))
      }
    } catch (error) {
      console.error('Error submitting proveedor:', error)
      alert('Error al procesar el proveedor')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setFormData(INITIAL_FORM)
    setErrors({})
  }

  /** Update helper tipado: evita errores con prev en setState */
  const handleInputChange = <K extends keyof FormData>(field: K, value: string) => {
    // Actualiza el valor del campo
    setFormData(prev => ({ ...prev, [field]: value } as FormData))
    // Limpia el error del campo si lo hubiera
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.5)] flex items-center justify-center z-[1000]"
    >
      <div className="bg-white rounded-2 p-8 w-[90%] max-w-[600px] overflow-auto"
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6"
        >
          <h2 className="m-0 text-6 font-semibold">
            {proveedor ? 'Editar Proveedor' : 'Nuevo Proveedor'}
          </h2>
          <button
            onClick={onClose} className="border-0 text-6 cursor-pointer text-gray-500"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Información fiscal */}
          <div className="mb-6">
            <h3 className="text-4 font-semibold mb-4 text-gray-700">
              Información Fiscal
            </h3>
            <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4"
            >
              <div>
                <label className="block text-[0.875rem] font-medium text-gray-700 mb-2"
                >
                  RUC *
                </label>
                <input
                  type="text"
                  value={formData.ruc}
                  onChange={(e) => handleInputChange('ruc', e.target.value)}
                  maxLength={11} className="w-[100%] p-2 rounded-1.5 bg-white"
                  placeholder="Ingrese RUC (11 dígitos)"
                />
                {errors.ruc && (
                  <p className="text-red-500 text-3 mt-1">{errors.ruc}</p>
                )}
              </div>

              <div>
                <label className="block text-[0.875rem] font-medium text-gray-700 mb-2"
                >
                  Razón Social *
                </label>
                <input
                  type="text"
                  value={formData.razon_social}
                  onChange={(e) => handleInputChange('razon_social', e.target.value)} className="w-[100%] p-2 rounded-1.5 bg-white"
                  placeholder="Razón social completa"
                />
                {errors.razon_social && (
                  <p className="text-red-500 text-3 mt-1">{errors.razon_social}</p>
                )}
              </div>

              <div>
                <label className="block text-[0.875rem] font-medium text-gray-700 mb-2"
                >
                  Nombre Comercial
                </label>
                <input
                  type="text"
                  value={formData.nombre_comercial}
                  onChange={(e) => handleInputChange('nombre_comercial', e.target.value)} className="w-[100%] p-2 border rounded-1.5 bg-white"
                  placeholder="Nombre comercial (opcional)"
                />
              </div>

              <div>
                <label className="block text-[0.875rem] font-medium text-gray-700 mb-2"
                >
                  Condiciones de Pago
                </label>
                <select
                  value={formData.condiciones_pago}
                  onChange={(e) => handleInputChange('condiciones_pago', e.target.value)} className="w-[100%] p-2 border rounded-1.5 bg-white"
                >
                  <option value="CONTADO">Contado</option>
                  <option value="CREDITO_15">Crédito 15 días</option>
                  <option value="CREDITO_30">Crédito 30 días</option>
                  <option value="CREDITO_45">Crédito 45 días</option>
                  <option value="CREDITO_60">Crédito 60 días</option>
                </select>
              </div>
            </div>
          </div>

          {/* Información de contacto */}
          <div className="mb-6">
            <h3 className="text-4 font-semibold mb-4 text-gray-700">
              Información de Contacto
            </h3>
            <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4"
            >
              <div>
                <label className="block text-[0.875rem] font-medium text-gray-700 mb-2"
                >
                  Teléfono
                </label>
                <input
                  type="text"
                  value={formData.telefono}
                  onChange={(e) => handleInputChange('telefono', e.target.value)} className="w-[100%] p-2 border rounded-1.5 bg-white"
                  placeholder="Teléfono principal"
                />
              </div>

              <div>
                <label className="block text-[0.875rem] font-medium text-gray-700 mb-2"
                >
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)} className="w-[100%] p-2 rounded-1.5 bg-white"
                  placeholder="email@ejemplo.com"
                />
                {errors.email && (
                  <p className="text-red-500 text-3 mt-1">{errors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-[0.875rem] font-medium text-gray-700 mb-2"
                >
                  Persona de Contacto
                </label>
                <input
                  type="text"
                  value={formData.contacto}
                  onChange={(e) => handleInputChange('contacto', e.target.value)} className="w-[100%] p-2 border rounded-1.5 bg-white"
                  placeholder="Nombre del contacto"
                />
              </div>
            </div>
          </div>

          {/* Dirección */}
          <div className="mb-6">
            <label className="block text-[0.875rem] font-medium text-gray-700 mb-2"
            >
              Dirección
            </label>
            <textarea
              value={formData.direccion}
              onChange={(e) => handleInputChange('direccion', e.target.value)}
              rows={3} className="w-[100%] p-2 border rounded-1.5 bg-white"
              placeholder="Dirección completa del proveedor"
            />
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-4 pt-4 border-t"
          >
            <button
              type="button"
              onClick={onClose} className="py-2 px-4 border rounded-1.5 bg-white text-gray-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading} className="py-2 px-4 border-0 rounded-1.5 text-white font-medium"
            >
              {isLoading ? 'Guardando...' : proveedor ? 'Actualizar' : 'Crear Proveedor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
