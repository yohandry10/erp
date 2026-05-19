'use client'

import React, { useEffect, useState } from 'react'

interface EmpleadoModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: any) => void
  departamentos: any[]
  initialData?: any | null
}

const createEmptyForm = () => ({
  nombres: '',
  apellidos: '',
  tipo_documento: 'DNI',
  numero_documento: '',
  fecha_nacimiento: '',
  direccion: '',
  telefono: '',
  email: '',
  puesto: '',
  id_departamento: '',
  fecha_ingreso: '',
  estado: 'activo'
})

const EmpleadoModal: React.FC<EmpleadoModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  departamentos,
  initialData = null
}) => {
  const [formData, setFormData] = useState(createEmptyForm)

  useEffect(() => {
    if (!isOpen) return
    if (!initialData) {
      setFormData(createEmptyForm())
      return
    }

    setFormData({
      nombres: initialData.nombres || '',
      apellidos: initialData.apellidos || '',
      tipo_documento: initialData.tipo_documento || 'DNI',
      numero_documento: initialData.numero_documento || '',
      fecha_nacimiento: initialData.fecha_nacimiento || '',
      direccion: initialData.direccion || '',
      telefono: initialData.telefono || '',
      email: initialData.email || '',
      puesto: initialData.puesto || '',
      id_departamento: initialData.id_departamento || '',
      fecha_ingreso: initialData.fecha_ingreso || '',
      estado: initialData.estado || 'activo'
    })
  }, [isOpen, initialData])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
    setFormData(createEmptyForm())
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(15,_23,_42,_0.8)] flex items-center justify-center p-4 z-[1000]">
      <div className="p-10 w-[100%] max-w-[700px] overflow-y-auto shadow border relative">
        {/* Header del Modal */}
        <div className="flex justify-between items-center mb-8 pb-4">
          <h2 className="text-8 font-extrabold bg-[var(--gradient-primary)] m-0">
            👤 {initialData ? 'Editar Empleado' : 'Agregar Nuevo Empleado'}
          </h2>
          <button
            onClick={onClose} className="bg-[var(--gradient-danger)] text-white border-0 p-3 cursor-pointer text-5 font-bold flex items-center justify-center w-10 h-10 transition"
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1) rotate(90deg)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1) rotate(0deg)'
            }}
          >
            ✕
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(300px,_1fr))] gap-6 mb-8">
            {/* Nombres */}
            <div>
              <label className="block mb-2 font-semibold text-[var(--primary-700)]">
                Nombres *
              </label>
              <input
                type="text"
                value={formData.nombres}
                onChange={(e) => handleChange('nombres', e.target.value)}
                required className="w-[100%] p-[0.875rem] text-4 transition bg-[rgba(255,_255,_255,_0.8)]"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Apellidos */}
            <div>
              <label className="block mb-2 font-semibold text-[var(--primary-700)]">
                Apellidos *
              </label>
              <input
                type="text"
                value={formData.apellidos}
                onChange={(e) => handleChange('apellidos', e.target.value)}
                required className="w-[100%] p-[0.875rem] text-4 transition bg-[rgba(255,_255,_255,_0.8)]"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Tipo de Documento */}
            <div>
              <label className="block mb-2 font-semibold text-[var(--primary-700)]">
                Tipo de Documento
              </label>
              <select
                value={formData.tipo_documento}
                onChange={(e) => handleChange('tipo_documento', e.target.value)} className="w-[100%] p-[0.875rem] text-4 transition bg-[rgba(255,_255,_255,_0.8)]"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <option value="DNI">DNI</option>
                <option value="CE">Carnet de Extranjería</option>
                <option value="Pasaporte">Pasaporte</option>
              </select>
            </div>

            {/* Número de Documento */}
            <div>
              <label className="block mb-2 font-semibold text-[var(--primary-700)]">
                Número de Documento *
              </label>
              <input
                type="text"
                value={formData.numero_documento}
                onChange={(e) => handleChange('numero_documento', e.target.value)}
                required className="w-[100%] p-[0.875rem] text-4 transition bg-[rgba(255,_255,_255,_0.8)]"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Email */}
            <div>
              <label className="block mb-2 font-semibold text-[var(--primary-700)]">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)} className="w-[100%] p-[0.875rem] text-4 transition bg-[rgba(255,_255,_255,_0.8)]"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Teléfono */}
            <div>
              <label className="block mb-2 font-semibold text-[var(--primary-700)]">
                Teléfono
              </label>
              <input
                type="tel"
                value={formData.telefono}
                onChange={(e) => handleChange('telefono', e.target.value)} className="w-[100%] p-[0.875rem] text-4 transition bg-[rgba(255,_255,_255,_0.8)]"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Puesto */}
            <div>
              <label className="block mb-2 font-semibold text-[var(--primary-700)]">
                Puesto
              </label>
              <input
                type="text"
                value={formData.puesto}
                onChange={(e) => handleChange('puesto', e.target.value)} className="w-[100%] p-[0.875rem] text-4 transition bg-[rgba(255,_255,_255,_0.8)]"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Departamento */}
            <div>
              <label className="block mb-2 font-semibold text-[var(--primary-700)]">
                Departamento
              </label>
              <select
                value={formData.id_departamento}
                onChange={(e) => handleChange('id_departamento', e.target.value)} className="w-[100%] p-[0.875rem] text-4 transition bg-[rgba(255,_255,_255,_0.8)]"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <option value="">Seleccionar departamento</option>
                {departamentos.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Fecha de Nacimiento */}
            <div>
              <label className="block mb-2 font-semibold text-[var(--primary-700)]">
                Fecha de Nacimiento
              </label>
              <input
                type="date"
                value={formData.fecha_nacimiento}
                onChange={(e) => handleChange('fecha_nacimiento', e.target.value)} className="w-[100%] p-[0.875rem] text-4 transition bg-[rgba(255,_255,_255,_0.8)]"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Fecha de Ingreso */}
            <div>
              <label className="block mb-2 font-semibold text-[var(--primary-700)]">
                Fecha de Ingreso
              </label>
              <input
                type="date"
                value={formData.fecha_ingreso}
                onChange={(e) => handleChange('fecha_ingreso', e.target.value)} className="w-[100%] p-[0.875rem] text-4 transition bg-[rgba(255,_255,_255,_0.8)]"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {initialData ? (
              <div>
                <label className="block mb-2 font-semibold text-[var(--primary-700)]">
                  Estado
                </label>
                <select
                  value={formData.estado}
                  onChange={(e) => handleChange('estado', e.target.value)} className="w-[100%] p-[0.875rem] text-4 transition bg-[rgba(255,_255,_255,_0.8)]"
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>
            ) : null}
          </div>

          {/* Dirección (campo completo) */}
          <div className="mb-8">
            <label className="block mb-2 font-semibold text-[var(--primary-700)]">
              Dirección
            </label>
            <input
              type="text"
              value={formData.direccion}
              onChange={(e) => handleChange('direccion', e.target.value)}
              placeholder="Dirección completa del empleado" className="w-[100%] p-[0.875rem] text-4 transition bg-[rgba(255,_255,_255,_0.8)]"
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--blue-500)'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary-200)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-4 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              💾 {initialData ? 'Actualizar Empleado' : 'Guardar Empleado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EmpleadoModal 
