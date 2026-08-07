'use client'

import React, { useEffect, useState } from 'react'
import { useCountryContext } from '@/hooks/use-country-context'

interface EmpleadoModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: any) => void
  departamentos: any[]
  initialData?: any | null
}

const createEmptyForm = (countryCode = 'PE') => ({
  nombres: '',
  apellidos: '',
  tipo_documento: countryCode === 'AR' ? 'CUIL' : countryCode === 'CO' ? 'CC' : 'DNI',
  numero_documento: '',
  fecha_nacimiento: '',
  direccion: '',
  telefono: '',
  email: '',
  puesto: '',
  id_departamento: '',
  fecha_ingreso: '',
  estado: 'activo',
  tiene_hijos: false,
  cantidad_hijos: '',
  obra_social_codigo: '',
  sindicato_codigo: '',
  situacion_revista_codigo: countryCode === 'AR' ? '01' : '',
  modalidad_contratacion_codigo: '',
  eps_codigo: '',
  fondo_pension_codigo: '',
  arl_codigo: '',
  caja_compensacion_codigo: '',
})

const EmpleadoModal: React.FC<EmpleadoModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  departamentos,
  initialData = null
}) => {
  const country = useCountryContext()
  const isArgentina = country.paisCodigo === 'AR'
  const isColombia = country.paisCodigo === 'CO'
  const isPeru = country.paisCodigo === 'PE'
  const [formData, setFormData] = useState(() => createEmptyForm('PE'))

  useEffect(() => {
    if (!isOpen) return
    if (!initialData) {
      setFormData(createEmptyForm(country.paisCodigo))
      return
    }

    setFormData({
      nombres: initialData.nombres || '',
      apellidos: initialData.apellidos || '',
      tipo_documento: initialData.tipo_documento || (isArgentina ? 'CUIL' : isColombia ? 'CC' : 'DNI'),
      numero_documento: initialData.numero_documento || '',
      fecha_nacimiento: initialData.fecha_nacimiento || '',
      direccion: initialData.direccion || '',
      telefono: initialData.telefono || '',
      email: initialData.email || '',
      puesto: initialData.puesto || '',
      id_departamento: initialData.id_departamento || '',
      fecha_ingreso: initialData.fecha_ingreso || '',
      estado: initialData.estado || 'activo',
      tiene_hijos: initialData.tiene_hijos === true,
      cantidad_hijos:
        initialData.cantidad_hijos === null || initialData.cantidad_hijos === undefined
          ? ''
          : String(initialData.cantidad_hijos),
      obra_social_codigo: initialData.obra_social_codigo || '',
      sindicato_codigo: initialData.sindicato_codigo || '',
      situacion_revista_codigo: initialData.situacion_revista_codigo || (isArgentina ? '01' : ''),
      modalidad_contratacion_codigo: initialData.modalidad_contratacion_codigo || '',
      eps_codigo: initialData.eps_codigo || '',
      fondo_pension_codigo: initialData.fondo_pension_codigo || '',
      arl_codigo: initialData.arl_codigo || '',
      caja_compensacion_codigo: initialData.caja_compensacion_codigo || '',
    })
  }, [country.paisCodigo, isOpen, initialData, isArgentina, isColombia])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      ...formData,
      ...(isArgentina ? { cuil: formData.numero_documento.replace(/\D/g, '') } : {}),
      cantidad_hijos: formData.tiene_hijos ? Number(formData.cantidad_hijos) || 0 : 0
    })
    setFormData(createEmptyForm(country.paisCodigo))
  }

  const handleChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(15,_23,_42,_0.8)] flex items-center justify-center p-4 z-[1100]">
      <div className="bg-card rounded-xl p-10 w-[100%] max-w-[700px] max-h-[90vh] overflow-y-auto shadow border relative">
        {/* Header del Modal */}
        <div className="flex justify-between items-center mb-8 pb-4">
          <h2 className="text-[2rem] font-extrabold bg-[var(--gradient-primary)] m-0">
            👤 {initialData ? 'Editar Empleado' : 'Agregar Nuevo Empleado'}
          </h2>
          <button
            onClick={onClose} className="bg-[var(--gradient-danger)] text-white border-0 p-3 cursor-pointer text-xl font-bold flex items-center justify-center w-10 h-10 transition"
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
              <label htmlFor="empleado-modal-nombres" className="block mb-2 font-semibold text-[var(--primary-700)]">
                Nombres *
              </label>
              <input id="empleado-modal-nombres"
                type="text"
                value={formData.nombres}
                onChange={(e) => handleChange('nombres', e.target.value)}
                required className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
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
              <label htmlFor="empleado-modal-apellidos" className="block mb-2 font-semibold text-[var(--primary-700)]">
                Apellidos *
              </label>
              <input id="empleado-modal-apellidos"
                type="text"
                value={formData.apellidos}
                onChange={(e) => handleChange('apellidos', e.target.value)}
                required className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
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
              <label htmlFor="empleado-modal-tipo-documento" className="block mb-2 font-semibold text-[var(--primary-700)]">
                Tipo de Documento
              </label>
              <select id="empleado-modal-tipo-documento"
                value={formData.tipo_documento}
                onChange={(e) => handleChange('tipo_documento', e.target.value)} className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                {isArgentina ? (
                  <>
                    <option value="CUIL">CUIL</option>
                    <option value="DNI">DNI argentino</option>
                    <option value="PASAPORTE">Pasaporte</option>
                  </>
                ) : isColombia ? (
                  <>
                    <option value="CC">Cédula de ciudadanía</option>
                    <option value="CE">Cédula de extranjería</option>
                    <option value="TI">Tarjeta de identidad</option>
                    <option value="PASAPORTE">Pasaporte</option>
                  </>
                ) : (
                  <>
                    <option value="DNI">DNI</option>
                    <option value="CE">Carnet de Extranjería</option>
                    <option value="PASAPORTE">Pasaporte</option>
                  </>
                )}
              </select>
            </div>

            {/* Número de Documento */}
            <div>
              <label htmlFor="empleado-modal-numero-documento" className="block mb-2 font-semibold text-[var(--primary-700)]">
                {isArgentina ? 'CUIL *' : isColombia ? 'Cédula / documento *' : 'Número de Documento *'}
              </label>
              <input id="empleado-modal-numero-documento"
                type="text"
                value={formData.numero_documento}
                onChange={(e) => handleChange('numero_documento', e.target.value)}
                required className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
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

            {isArgentina ? (
              <>
                <div>
                  <label htmlFor="empleado-modal-obra-social" className="block mb-2 font-semibold text-[var(--primary-700)]">
                    Código de obra social
                  </label>
                  <input id="empleado-modal-obra-social"
                    value={formData.obra_social_codigo}
                    onChange={(e) => handleChange('obra_social_codigo', e.target.value)}
                    className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
                    placeholder="Código ARCA"
                  />
                </div>
                <div>
                  <label htmlFor="empleado-modal-sindicato" className="block mb-2 font-semibold text-[var(--primary-700)]">
                    Sindicato
                  </label>
                  <input id="empleado-modal-sindicato"
                    value={formData.sindicato_codigo}
                    onChange={(e) => handleChange('sindicato_codigo', e.target.value)}
                    className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
                  />
                </div>
                <div>
                  <label htmlFor="empleado-modal-situacion-revista" className="block mb-2 font-semibold text-[var(--primary-700)]">
                    Situación de revista
                  </label>
                  <input id="empleado-modal-situacion-revista"
                    value={formData.situacion_revista_codigo}
                    onChange={(e) => handleChange('situacion_revista_codigo', e.target.value)}
                    className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
                  />
                </div>
              </>
            ) : isColombia ? (
              <>
                <div>
                  <label htmlFor="empleado-modal-eps" className="block mb-2 font-semibold text-[var(--primary-700)]">EPS</label>
                  <input id="empleado-modal-eps" value={formData.eps_codigo} onChange={(e) => handleChange('eps_codigo', e.target.value)} className="w-[100%] p-[0.875rem] text-base transition bg-card/80" />
                </div>
                <div>
                  <label htmlFor="empleado-modal-pension-co" className="block mb-2 font-semibold text-[var(--primary-700)]">Fondo de pensión</label>
                  <input id="empleado-modal-pension-co" value={formData.fondo_pension_codigo} onChange={(e) => handleChange('fondo_pension_codigo', e.target.value)} className="w-[100%] p-[0.875rem] text-base transition bg-card/80" />
                </div>
                <div>
                  <label htmlFor="empleado-modal-arl" className="block mb-2 font-semibold text-[var(--primary-700)]">ARL</label>
                  <input id="empleado-modal-arl" value={formData.arl_codigo} onChange={(e) => handleChange('arl_codigo', e.target.value)} className="w-[100%] p-[0.875rem] text-base transition bg-card/80" />
                </div>
                <div>
                  <label htmlFor="empleado-modal-caja-co" className="block mb-2 font-semibold text-[var(--primary-700)]">Caja de compensación</label>
                  <input id="empleado-modal-caja-co" value={formData.caja_compensacion_codigo} onChange={(e) => handleChange('caja_compensacion_codigo', e.target.value)} className="w-[100%] p-[0.875rem] text-base transition bg-card/80" />
                </div>
              </>
            ) : null}

            {/* Email */}
            <div>
              <label htmlFor="empleado-modal-email" className="block mb-2 font-semibold text-[var(--primary-700)]">
                Email
              </label>
              <input id="empleado-modal-email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)} className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
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
              <label htmlFor="empleado-modal-telefono" className="block mb-2 font-semibold text-[var(--primary-700)]">
                Teléfono
              </label>
              <input id="empleado-modal-telefono"
                type="tel"
                value={formData.telefono}
                onChange={(e) => handleChange('telefono', e.target.value)} className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
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
              <label htmlFor="empleado-modal-puesto" className="block mb-2 font-semibold text-[var(--primary-700)]">
                Puesto
              </label>
              <input id="empleado-modal-puesto"
                type="text"
                value={formData.puesto}
                onChange={(e) => handleChange('puesto', e.target.value)} className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
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
              <label htmlFor="empleado-modal-id-departamento" className="block mb-2 font-semibold text-[var(--primary-700)]">
                Departamento
              </label>
              <select id="empleado-modal-id-departamento"
                value={formData.id_departamento}
                onChange={(e) => handleChange('id_departamento', e.target.value)} className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
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
              <label htmlFor="empleado-modal-fecha-nacimiento" className="block mb-2 font-semibold text-[var(--primary-700)]">
                Fecha de Nacimiento
              </label>
              <input id="empleado-modal-fecha-nacimiento"
                type="date"
                value={formData.fecha_nacimiento}
                onChange={(e) => handleChange('fecha_nacimiento', e.target.value)} className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
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
              <label htmlFor="empleado-modal-fecha-ingreso" className="block mb-2 font-semibold text-[var(--primary-700)]">
                Fecha de Ingreso
              </label>
              <input id="empleado-modal-fecha-ingreso"
                type="date"
                value={formData.fecha_ingreso}
                onChange={(e) => handleChange('fecha_ingreso', e.target.value)} className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
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
                <label htmlFor="empleado-modal-estado" className="block mb-2 font-semibold text-[var(--primary-700)]">
                  Estado
                </label>
                <select id="empleado-modal-estado"
                  value={formData.estado}
                  onChange={(e) => handleChange('estado', e.target.value)} className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>
            ) : null}
          </div>

          {/* Dirección (campo completo) */}
          <div className="mb-8">
            <label htmlFor="empleado-modal-direccion" className="block mb-2 font-semibold text-[var(--primary-700)]">
              Dirección
            </label>
            <input id="empleado-modal-direccion"
              type="text"
              value={formData.direccion}
              onChange={(e) => handleChange('direccion', e.target.value)}
              placeholder="Dirección completa del empleado" className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
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

          {/* Carga familiar peruana: habilita la asignación familiar (10% de la RMV). */}
          {isPeru ? (
          <div className="mb-8">
            <label htmlFor="empleado-modal-tiene-hijos" className="flex items-center gap-3 font-semibold text-[var(--primary-700)]">
              <input id="empleado-modal-tiene-hijos"
                type="checkbox"
                checked={formData.tiene_hijos}
                onChange={(e) => handleChange('tiene_hijos', e.target.checked)}
                className="size-4"
              />
              Tiene hijos menores de 18 años (o hasta 24 cursando estudios superiores)
            </label>
            <p className="mt-2 text-sm text-muted-foreground">
              Da derecho a la asignación familiar equivalente al 10% de la RMV vigente.
            </p>
            {formData.tiene_hijos ? (
              <div className="mt-4">
                <label htmlFor="empleado-modal-cantidad-hijos" className="block mb-2 font-semibold text-[var(--primary-700)]">
                  Cantidad de hijos
                </label>
                <input id="empleado-modal-cantidad-hijos"
                  type="number"
                  min="1"
                  step="1"
                  value={formData.cantidad_hijos}
                  onChange={(e) => handleChange('cantidad_hijos', e.target.value)}
                  placeholder="1"
                  className="w-[100%] p-[0.875rem] text-base transition bg-card/80"
                />
              </div>
            ) : null}
          </div>
          ) : null}

          {/* Botones */}
          <div className="flex justify-end gap-4 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold leading-5 text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
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
