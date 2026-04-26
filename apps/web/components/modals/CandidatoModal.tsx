'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useApi } from '@/hooks/use-api'
import { toast } from '@/components/ui/use-toast'

interface CandidatoModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  candidato?: any
  vacantes?: any[]
}

interface Vacante {
  id: string
  titulo: string
  departamento: string
  salario_min: number
  salario_max: number
  estado: string
}

interface CandidatoData {
  id?: string
  id_vacante: string
  nombres: string
  apellidos: string
  email: string
  telefono: string
  numero_documento: string
  tipo_documento: string
  fecha_nacimiento: string
  direccion: string
  nivel_educacion: string
  experiencia_años: number
  pretension_salarial: number
  estado_civil: string
  cv_url?: string
  linkedin_url?: string
  portfolio_url?: string
  idiomas: string[]
  habilidades_tecnicas: string[]
  experiencia_laboral: ExperienciaLaboral[]
  formacion_academica: FormacionAcademica[]
  estado_proceso: string
  puntuacion_cv: number
  observaciones: string
  disponibilidad_inmediata: boolean
  modalidad_trabajo_preferida: string
}

interface ExperienciaLaboral {
  empresa: string
  puesto: string
  fecha_inicio: string
  fecha_fin: string
  descripcion: string
  actualmente_trabaja: boolean
}

interface FormacionAcademica {
  institucion: string
  titulo: string
  nivel: string
  fecha_inicio: string
  fecha_fin: string
  completado: boolean
}

export default function CandidatoModal({ isOpen, onClose, onSuccess, candidato, vacantes: vacantesProps }: CandidatoModalProps) {
  const { get, post, put } = useApi()
  const [loading, setLoading] = useState(false)
  const [vacantes, setVacantes] = useState<Vacante[]>([])
  const [currentStep, setCurrentStep] = useState(1)
  const [uploadingCV, setUploadingCV] = useState(false)

  const [formData, setFormData] = useState<CandidatoData>({
    id_vacante: '',
    nombres: '',
    apellidos: '',
    email: '',
    telefono: '',
    numero_documento: '',
    tipo_documento: 'DNI',
    fecha_nacimiento: '',
    direccion: '',
    nivel_educacion: 'universitario',
    experiencia_años: 0,
    pretension_salarial: 0,
    estado_civil: 'soltero',
    cv_url: '',
    linkedin_url: '',
    portfolio_url: '',
    idiomas: ['español'],
    habilidades_tecnicas: [],
    experiencia_laboral: [],
    formacion_academica: [],
    estado_proceso: 'postulante',
    puntuacion_cv: 0,
    observaciones: '',
    disponibilidad_inmediata: true,
    modalidad_trabajo_preferida: 'presencial'
  })

  useEffect(() => {
    console.log('🚀 CandidatoModal - isOpen:', isOpen, 'candidato:', candidato)
    
    if (isOpen) {
      if (vacantesProps) {
        setVacantes(vacantesProps)
      } else {
        loadVacantes()
      }
      
      if (candidato) {
        setFormData(candidato)
      } else {
        resetForm()
      }
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, candidato, vacantesProps])

  const loadVacantes = async () => {
    try {
      const response = await get('/api/rrhh/vacantes')
      if (response?.success) {
        const vacantesActivas = response.data.filter((v: any) => v.estado === 'activa')
        setVacantes(vacantesActivas)
      }
    } catch (error) {
      console.error('Error cargando vacantes:', error)
    }
  }



  const resetForm = () => {
    setFormData({
      id_vacante: '',
      nombres: '',
      apellidos: '',
      email: '',
      telefono: '',
      numero_documento: '',
      tipo_documento: 'DNI',
      fecha_nacimiento: '',
      direccion: '',
      nivel_educacion: 'universitario',
      experiencia_años: 0,
      pretension_salarial: 0,
      estado_civil: 'soltero',
      cv_url: '',
      linkedin_url: '',
      portfolio_url: '',
      idiomas: ['español'],
      habilidades_tecnicas: [],
      experiencia_laboral: [],
      formacion_academica: [],
      estado_proceso: 'postulante',
      puntuacion_cv: 0,
      observaciones: '',
      disponibilidad_inmediata: true,
      modalidad_trabajo_preferida: 'presencial'
    })
    setCurrentStep(1)
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const agregarExperiencia = () => {
    const nuevaExperiencia: ExperienciaLaboral = {
      empresa: '',
      puesto: '',
      fecha_inicio: '',
      fecha_fin: '',
      descripcion: '',
      actualmente_trabaja: false
    }
    setFormData(prev => ({
      ...prev,
      experiencia_laboral: [...prev.experiencia_laboral, nuevaExperiencia]
    }))
  }

  const actualizarExperiencia = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      experiencia_laboral: prev.experiencia_laboral.map((exp, i) => 
        i === index ? { ...exp, [field]: value } : exp
      )
    }))
  }

  const eliminarExperiencia = (index: number) => {
    setFormData(prev => ({
      ...prev,
      experiencia_laboral: prev.experiencia_laboral.filter((_, i) => i !== index)
    }))
  }

  const agregarFormacion = () => {
    const nuevaFormacion: FormacionAcademica = {
      institucion: '',
      titulo: '',
      nivel: 'universitario',
      fecha_inicio: '',
      fecha_fin: '',
      completado: true
    }
    setFormData(prev => ({
      ...prev,
      formacion_academica: [...prev.formacion_academica, nuevaFormacion]
    }))
  }

  const actualizarFormacion = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      formacion_academica: prev.formacion_academica.map((form, i) => 
        i === index ? { ...form, [field]: value } : form
      )
    }))
  }

  const eliminarFormacion = (index: number) => {
    setFormData(prev => ({
      ...prev,
      formacion_academica: prev.formacion_academica.filter((_, i) => i !== index)
    }))
  }

  const agregarHabilidad = (habilidad: string) => {
    if (habilidad.trim() && !formData.habilidades_tecnicas.includes(habilidad.trim())) {
      setFormData(prev => ({
        ...prev,
        habilidades_tecnicas: [...prev.habilidades_tecnicas, habilidad.trim()]
      }))
    }
  }

  const eliminarHabilidad = (habilidad: string) => {
    setFormData(prev => ({
      ...prev,
      habilidades_tecnicas: prev.habilidades_tecnicas.filter(h => h !== habilidad)
    }))
  }

  const handleSubmit = async () => {
    try {
      setLoading(true)

      // Validaciones básicas
      if (!formData.nombres.trim() || !formData.apellidos.trim()) {
        toast({
          title: "⚠️ Datos incompletos",
          description: "Ingrese nombres y apellidos del candidato",
          variant: "destructive",
        })
        return
      }

      if (!formData.email.trim() || !formData.email.includes('@')) {
        toast({
          title: "⚠️ Email inválido",
          description: "Ingrese un email válido",
          variant: "destructive",
        })
        return
      }

      if (!formData.id_vacante) {
        toast({
          title: "⚠️ Vacante requerida",
          description: "Seleccione la vacante a la que postula",
          variant: "destructive",
        })
        return
      }

      // Calcular puntuación automática del CV
      let puntuacion = 0
      if (formData.experiencia_años > 0) puntuacion += 20
      if (formData.experiencia_años >= 3) puntuacion += 20
      if (formData.formacion_academica.length > 0) puntuacion += 20
      if (formData.habilidades_tecnicas.length >= 3) puntuacion += 20
      if (formData.cv_url) puntuacion += 10
      if (formData.linkedin_url) puntuacion += 5
      if (formData.idiomas.length > 1) puntuacion += 5

      const candidatoData = {
        ...formData,
        puntuacion_cv: Math.min(puntuacion, 100)
      }

      const response = candidato?.id 
        ? await put(`/api/rrhh/candidatos/${candidato.id}`, candidatoData)
        : await post('/api/rrhh/candidatos', candidatoData)

      if (response?.success) {
        toast({
          title: `✅ ${candidato?.id ? 'Candidato actualizado' : 'Candidato registrado'}`,
          description: `${formData.nombres} ${formData.apellidos} ha sido ${candidato?.id ? 'actualizado' : 'registrado'} exitosamente`,
          variant: "default",
        })
        onSuccess()
        handleClose()
      } else {
        throw new Error(response?.message || 'Error en el servidor')
      }

    } catch (error: any) {
      console.error('Error guardando candidato:', error)
      toast({
        title: "❌ Error",
        description: error.message || "Error guardando candidato. Intente nuevamente.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const nextStep = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  if (!isOpen) return null

  const vacanteSeleccionada = vacantes.find(v => v.id === formData.id_vacante)

  const modalContent = (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '1rem'
      }}
      onClick={handleClose}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          width: '100%',
          maxWidth: '900px',
          maxHeight: '90vh',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '2rem 2rem 1rem 2rem',
          borderBottom: '2px solid #e5e7eb'
        }}>
          <div>
            <h2 style={{ 
              fontSize: '1.75rem', 
              fontWeight: 'bold', 
              margin: 0,
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              👤 {candidato?.id ? 'Editar Candidato' : 'Nuevo Candidato'}
            </h2>
            <p style={{ 
              fontSize: '0.875rem', 
              color: '#6b7280', 
              margin: '0.5rem 0 0 0' 
            }}>
              {candidato?.id ? 'Actualizar información del candidato' : 'Registrar nueva postulación'}
            </p>
          </div>
          
          {/* Indicador de pasos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {[1, 2, 3, 4].map((step) => (
              <div 
                key={step} 
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  backgroundColor: step === currentStep 
                    ? '#10b981' 
                    : step < currentStep 
                      ? '#d1fae5'
                      : '#e5e7eb',
                  color: step === currentStep 
                    ? 'white' 
                    : step < currentStep 
                      ? '#065f46'
                      : '#6b7280'
                }}
              >
                {step}
              </div>
            ))}
          </div>

          <button
            onClick={handleClose}
            style={{
              width: '2rem',
              height: '2rem',
              borderRadius: '50%',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '1rem'
            }}
          >
            ✕
          </button>
        </div>
        
        {/* Información de vacante seleccionada */}
        {vacanteSeleccionada && (
          <div style={{ 
            margin: '1rem 2rem',
            padding: '1rem',
            backgroundColor: '#d1fae5',
            borderRadius: '8px',
            border: '1px solid #10b981'
          }}>
            <div style={{ fontSize: '0.875rem', color: '#065f46' }}>
              <strong>📋 Vacante:</strong> {vacanteSeleccionada.titulo} • 
              <strong> 🏢 Depto:</strong> {vacanteSeleccionada.departamento} •
              <strong> 💰 Salario:</strong> S/ {vacanteSeleccionada.salario_min} - S/ {vacanteSeleccionada.salario_max}
            </div>
          </div>
        )}

        {/* Contenido */}
        <div style={{ 
          padding: '2rem', 
          overflowY: 'auto', 
          maxHeight: 'calc(90vh - 200px)' 
        }}>
          
          {/* PASO 1: Información personal */}
          {currentStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ 
                backgroundColor: '#dbeafe', 
                border: '1px solid #3b82f6', 
                borderRadius: '8px', 
                padding: '1.5rem' 
              }}>
                <h3 style={{ 
                  fontSize: '1.125rem', 
                  fontWeight: '600', 
                  color: '#1e40af', 
                  margin: '0 0 1rem 0' 
                }}>
                  👤 Información Personal
                </h3>
                
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
                  gap: '1rem' 
                }}>
                  <div>
                    <label style={{ 
                      display: 'block', 
                      fontSize: '0.875rem', 
                      fontWeight: '600', 
                      color: '#374151', 
                      marginBottom: '0.5rem' 
                    }}>
                      📋 Vacante *
                    </label>
                    <select
                      value={formData.id_vacante}
                      onChange={(e) => handleInputChange('id_vacante', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        outline: 'none',
                        backgroundColor: 'white'
                      }}
                      required
                    >
                      <option value="">Seleccionar vacante...</option>
                      {vacantes.map(vacante => (
                        <option key={vacante.id} value={vacante.id}>
                          {vacante.titulo} - {vacante.departamento}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Estado del proceso</label>
                    <select
                      value={formData.estado_proceso}
                      onChange={(e) => handleInputChange('estado_proceso', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="postulante">📝 Postulante</option>
                      <option value="revision_cv">👀 Revisión CV</option>
                      <option value="entrevista_rrhh">🤝 Entrevista RRHH</option>
                      <option value="entrevista_tecnica">🔧 Entrevista Técnica</option>
                      <option value="entrevista_final">👔 Entrevista Final</option>
                      <option value="proceso_seleccion">✅ En proceso de selección</option>
                      <option value="contratado">🎉 Contratado</option>
                      <option value="descartado">❌ Descartado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nombres *</label>
                    <input
                      type="text"
                      value={formData.nombres}
                      onChange={(e) => handleInputChange('nombres', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Nombres del candidato"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Apellidos *</label>
                    <input
                      type="text"
                      value={formData.apellidos}
                      onChange={(e) => handleInputChange('apellidos', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Apellidos del candidato"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="candidato@email.com"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Teléfono</label>
                    <input
                      type="tel"
                      value={formData.telefono}
                      onChange={(e) => handleInputChange('telefono', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="+51 999 999 999"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tipo documento</label>
                    <select
                      value={formData.tipo_documento}
                      onChange={(e) => handleInputChange('tipo_documento', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="DNI">DNI</option>
                      <option value="CE">Carnet de Extranjería</option>
                      <option value="PASAPORTE">Pasaporte</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Número de documento</label>
                    <input
                      type="text"
                      value={formData.numero_documento}
                      onChange={(e) => handleInputChange('numero_documento', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="12345678"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fecha de nacimiento</label>
                    <input
                      type="date"
                      value={formData.fecha_nacimiento}
                      onChange={(e) => handleInputChange('fecha_nacimiento', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Estado civil</label>
                    <select
                      value={formData.estado_civil}
                      onChange={(e) => handleInputChange('estado_civil', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="soltero">Soltero(a)</option>
                      <option value="casado">Casado(a)</option>
                      <option value="divorciado">Divorciado(a)</option>
                      <option value="viudo">Viudo(a)</option>
                      <option value="conviviente">Conviviente</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Dirección</label>
                  <textarea
                    value={formData.direccion}
                    onChange={(e) => handleInputChange('direccion', e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={2}
                    placeholder="Dirección completa del candidato"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PASO 2: Información profesional */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-green-800 mb-4">💼 Información Profesional</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nivel de educación</label>
                    <select
                      value={formData.nivel_educacion}
                      onChange={(e) => handleInputChange('nivel_educacion', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    >
                      <option value="secundaria">Secundaria</option>
                      <option value="tecnico">Técnico</option>
                      <option value="universitario">Universitario</option>
                      <option value="postgrado">Postgrado</option>
                      <option value="maestria">Maestría</option>
                      <option value="doctorado">Doctorado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Años de experiencia</label>
                    <input
                      type="number"
                      value={formData.experiencia_años}
                      onChange={(e) => handleInputChange('experiencia_años', parseInt(e.target.value) || 0)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      min="0"
                      max="50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Pretensión salarial (S/)</label>
                    <input
                      type="number"
                      value={formData.pretension_salarial}
                      onChange={(e) => handleInputChange('pretension_salarial', parseFloat(e.target.value) || 0)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      min="0"
                      step="100"
                      placeholder="3000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Modalidad de trabajo preferida</label>
                    <select
                      value={formData.modalidad_trabajo_preferida}
                      onChange={(e) => handleInputChange('modalidad_trabajo_preferida', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    >
                      <option value="presencial">🏢 Presencial</option>
                      <option value="remoto">🏠 Remoto</option>
                      <option value="hibrido">🔄 Híbrido</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mt-8">
                      <input
                        type="checkbox"
                        id="disponibilidad"
                        checked={formData.disponibilidad_inmediata}
                        onChange={(e) => handleInputChange('disponibilidad_inmediata', e.target.checked)}
                        className="w-4 h-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                      />
                      <label htmlFor="disponibilidad" className="text-sm text-gray-700">
                        ⚡ Disponibilidad inmediata
                      </label>
                    </div>
                  </div>
                </div>

                {/* URLs profesionales */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">📄 URL del CV</label>
                    <input
                      type="url"
                      value={formData.cv_url || ''}
                      onChange={(e) => handleInputChange('cv_url', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder="https://..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">💼 LinkedIn</label>
                    <input
                      type="url"
                      value={formData.linkedin_url || ''}
                      onChange={(e) => handleInputChange('linkedin_url', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder="https://linkedin.com/in/..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">🎨 Portfolio</label>
                    <input
                      type="url"
                      value={formData.portfolio_url || ''}
                      onChange={(e) => handleInputChange('portfolio_url', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder="https://portfolio.com"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PASO 3: Experiencia y formación */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {/* Experiencia laboral */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-purple-800">💼 Experiencia Laboral</h3>
                  <button
                    onClick={agregarExperiencia}
                    className="bg-purple-500 text-white px-3 py-1 rounded-lg hover:bg-purple-600 transition-colors text-sm"
                  >
                    + Agregar
                  </button>
                </div>
                
                {formData.experiencia_laboral.map((exp, index) => (
                  <div key={index} className="border border-purple-300 rounded-lg p-4 mb-4 bg-white">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-medium text-purple-800">Experiencia #{index + 1}</h4>
                      <button
                        onClick={() => eliminarExperiencia(index)}
                        className="text-red-500 hover:text-red-700 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={exp.empresa}
                        onChange={(e) => actualizarExperiencia(index, 'empresa', e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg"
                        placeholder="Empresa"
                      />
                      <input
                        type="text"
                        value={exp.puesto}
                        onChange={(e) => actualizarExperiencia(index, 'puesto', e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg"
                        placeholder="Puesto"
                      />
                      <input
                        type="date"
                        value={exp.fecha_inicio}
                        onChange={(e) => actualizarExperiencia(index, 'fecha_inicio', e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg"
                      />
                      <input
                        type="date"
                        value={exp.fecha_fin}
                        onChange={(e) => actualizarExperiencia(index, 'fecha_fin', e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg"
                        disabled={exp.actualmente_trabaja}
                      />
                    </div>
                    
                    <div className="mt-3">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={exp.actualmente_trabaja}
                          onChange={(e) => actualizarExperiencia(index, 'actualmente_trabaja', e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Actualmente trabajo aquí</span>
                      </label>
                    </div>
                    
                    <textarea
                      value={exp.descripcion}
                      onChange={(e) => actualizarExperiencia(index, 'descripcion', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg mt-3"
                      rows={2}
                      placeholder="Descripción de responsabilidades y logros..."
                    />
                  </div>
                ))}
              </div>

              {/* Formación académica */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-indigo-800">🎓 Formación Académica</h3>
                  <button
                    onClick={agregarFormacion}
                    className="bg-indigo-500 text-white px-3 py-1 rounded-lg hover:bg-indigo-600 transition-colors text-sm"
                  >
                    + Agregar
                  </button>
                </div>
                
                {formData.formacion_academica.map((form, index) => (
                  <div key={index} className="border border-indigo-300 rounded-lg p-4 mb-4 bg-white">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-medium text-indigo-800">Formación #{index + 1}</h4>
                      <button
                        onClick={() => eliminarFormacion(index)}
                        className="text-red-500 hover:text-red-700 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input
                        type="text"
                        value={form.institucion}
                        onChange={(e) => actualizarFormacion(index, 'institucion', e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg"
                        placeholder="Institución"
                      />
                      <input
                        type="text"
                        value={form.titulo}
                        onChange={(e) => actualizarFormacion(index, 'titulo', e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg"
                        placeholder="Título obtenido"
                      />
                      <select
                        value={form.nivel}
                        onChange={(e) => actualizarFormacion(index, 'nivel', e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg"
                      >
                        <option value="secundaria">Secundaria</option>
                        <option value="tecnico">Técnico</option>
                        <option value="universitario">Universitario</option>
                        <option value="postgrado">Postgrado</option>
                        <option value="maestria">Maestría</option>
                        <option value="doctorado">Doctorado</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PASO 4: Habilidades y observaciones */}
          {currentStep === 4 && (
            <div className="space-y-6">
              {/* Habilidades técnicas */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-orange-800 mb-4">🔧 Habilidades Técnicas</h3>
                
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Escriba una habilidad y presione Enter"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        agregarHabilidad(e.currentTarget.value)
                        e.currentTarget.value = ''
                      }
                    }}
                  />
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {formData.habilidades_tecnicas.map((habilidad, index) => (
                    <span
                      key={index}
                      className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm flex items-center gap-2"
                    >
                      {habilidad}
                      <button
                        onClick={() => eliminarHabilidad(habilidad)}
                        className="text-orange-600 hover:text-orange-800 font-bold"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Idiomas */}
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-teal-800 mb-4">🌍 Idiomas</h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {['español', 'inglés', 'portugués', 'francés', 'alemán', 'italiano', 'japonés', 'chino'].map(idioma => (
                    <label key={idioma} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.idiomas.includes(idioma)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData(prev => ({
                              ...prev,
                              idiomas: [...prev.idiomas, idioma]
                            }))
                          } else {
                            setFormData(prev => ({
                              ...prev,
                              idiomas: prev.idiomas.filter(i => i !== idioma)
                            }))
                          }
                        }}
                        className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                      />
                      <span className="text-sm capitalize">{idioma}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Observaciones */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">📝 Observaciones del proceso</h3>
                <textarea
                  value={formData.observaciones}
                  onChange={(e) => handleInputChange('observaciones', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={4}
                  placeholder="Observaciones sobre el candidato, entrevistas realizadas, fortalezas, áreas de mejora, etc."
                />
              </div>

              {/* Puntuación calculada */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-800 mb-2">🎯 Puntuación del candidato</h3>
                <div className="text-sm text-blue-700">
                  <p>La puntuación se calcula automáticamente basada en:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Experiencia laboral ({formData.experiencia_años > 0 ? '✅' : '❌'} {formData.experiencia_años >= 3 ? '+' : ''})</li>
                    <li>Formación académica ({formData.formacion_academica.length > 0 ? '✅' : '❌'})</li>
                    <li>Habilidades técnicas ({formData.habilidades_tecnicas.length >= 3 ? '✅' : '❌'})</li>
                    <li>CV disponible ({formData.cv_url ? '✅' : '❌'})</li>
                    <li>Perfil LinkedIn ({formData.linkedin_url ? '✅' : '❌'})</li>
                    <li>Idiomas adicionales ({formData.idiomas.length > 1 ? '✅' : '❌'})</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <div>
            {currentStep > 1 && (
              <button
                onClick={prevStep}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                ← Anterior
              </button>
            )}
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="px-6 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancelar
            </button>
            
            {currentStep < 4 ? (
              <button
                onClick={nextStep}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Siguiente →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-8 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <>⏳ Guardando...</>
                ) : (
                  <>{candidato?.id ? '✅ Actualizar' : '✅ Registrar'} Candidato</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return typeof window !== 'undefined' 
    ? createPortal(modalContent, document.body)
    : null
} 
