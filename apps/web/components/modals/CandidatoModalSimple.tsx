'use client';

import React, { useState, useEffect } from 'react';
import { X, User, Mail, Phone, MapPin, Briefcase, GraduationCap, Star } from 'lucide-react';
import { fetchApi } from '@/lib/api-fetch';

interface CandidatoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  candidato?: any;
  vacantes: any[];
}

export default function CandidatoModalSimple({
  isOpen,
  onClose,
  onSuccess,
  candidato,
  vacantes
}: CandidatoModalProps) {
  const [formData, setFormData] = useState({
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
    experiencia_anos: 0,
    pretension_salarial: 0,
    cv_url: '',
    linkedin_url: '',
    estado: 'postulante',
    observaciones: ''
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    console.log('🚀 CandidatoModalSimple - isOpen:', isOpen, 'candidato:', candidato)

    if (!isOpen) {
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
        experiencia_anos: 0,
        pretension_salarial: 0,
        cv_url: '',
        linkedin_url: '',
        estado: 'postulante',
        observaciones: ''
      });
      setErrors({});
    } else if (candidato) {
      setFormData({
        id_vacante: candidato.id_vacante || '',
        nombres: candidato.nombres || '',
        apellidos: candidato.apellidos || '',
        email: candidato.email || '',
        telefono: candidato.telefono || '',
        numero_documento: candidato.numero_documento || '',
        tipo_documento: candidato.tipo_documento || 'DNI',
        fecha_nacimiento: candidato.fecha_nacimiento || '',
        direccion: candidato.direccion || '',
        nivel_educacion: candidato.nivel_educacion || 'universitario',
        experiencia_anos: candidato.experiencia_anos || 0,
        pretension_salarial: candidato.pretension_salarial || 0,
        cv_url: candidato.cv_url || '',
        linkedin_url: candidato.linkedin_url || '',
        estado: candidato.estado || 'postulante',
        observaciones: candidato.observaciones || ''
      });
    }
  }, [isOpen, candidato]);

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!formData.nombres.trim()) newErrors.nombres = 'El nombre es requerido';
    if (!formData.apellidos.trim()) newErrors.apellidos = 'Los apellidos son requeridos';
    if (!formData.email.trim()) newErrors.email = 'El email es requerido';
    if (!formData.email.includes('@')) newErrors.email = 'Email inválido';
    if (!formData.id_vacante) newErrors.id_vacante = 'La vacante es requerida';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    try {
      // Calcular puntuación automática
      let puntuacion = 40; // Base
      if (formData.experiencia_anos > 0) puntuacion += 20;
      if (formData.experiencia_anos >= 3) puntuacion += 15;
      if (formData.cv_url) puntuacion += 15;
      if (formData.linkedin_url) puntuacion += 10;

      const candidatoData = {
        ...formData,
        puntuacion_cv: Math.min(puntuacion, 100),
        fecha_postulacion: candidato?.fecha_postulacion || new Date().toISOString()
      };

      const response = await fetchApi(candidato?.id ? `/api/rrhh/candidatos/${candidato.id}` : '/api/rrhh/candidatos', {
        method: candidato?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(candidatoData),
      });

      if (response.ok) {
        onSuccess();
        onClose();
      } else {
        throw new Error('Error al guardar el candidato');
      }
    } catch (error) {
      console.error('❌ Error:', error);
      alert('Error al guardar el candidato');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Limpiar error del campo
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  if (!isOpen) return null;

  const vacanteSeleccionada = vacantes.find(v => v.id === formData.id_vacante);

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.75)] flex items-center justify-center z-[99999] p-4"
      onClick={onClose}
    >
      <div className="bg-card rounded-xl p-0 w-[100%] max-w-[800px] overflow-y-auto shadow"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center pt-8 pr-8 pb-4 pl-8 text-white">
          <div>
            <h2 className="text-[1.75rem] font-bold m-0 flex items-center gap-3">
              <User size={28} />
              {candidato?.id ? 'Editar Candidato' : 'Nuevo Candidato'}
            </h2>
            <p className="text-[0.875rem] opacity-[0.9] mt-2 mr-0 mb-0 ml-0">
              {candidato?.id ? 'Actualizar información del postulante' : 'Registrar nueva postulación de CV'}
            </p>
          </div>

          <button
            onClick={onClose} className="w-10 h-10 rounded-full bg-[rgba(255,_255,_255,_0.2)] text-white border-0 cursor-pointer flex items-center justify-center font-bold text-xl transition"
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
          >
            <X size={20} />
          </button>
        </div>

        {/* Información de vacante seleccionada */}
        {vacanteSeleccionada && (
          <div className="mt-6 mr-8 mb-0 ml-8 p-4 bg-[#dbeafe] rounded-lg border">
            <div className="text-[0.875rem] text-[#1e40af] flex items-center gap-2 flex-wrap">
              <Briefcase size={16} />
              <strong>Vacante:</strong> {vacanteSeleccionada.titulo}
              {vacanteSeleccionada.departamento && (
                <>• <strong>Depto:</strong> {vacanteSeleccionada.departamento}</>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-8">
          {/* Sección 1: Datos Básicos */}
          <div className="mb-8 p-6 bg-muted/30 rounded-lg border">
            <h3 className="text-[1.125rem] font-semibold text-foreground mt-0 mr-0 mb-6 ml-0 flex items-center gap-2">
              <User size={20} className="text-blue-500" />
              Información Personal
            </h3>

            <div className="grid grid-cols-[1fr_1fr] gap-4 mb-4">
              <div>
                <label className="block text-[0.875rem] font-semibold text-foreground/85 mb-2">
                  Nombres *
                </label>
                <input
                  type="text"
                  name="nombres"
                  value={formData.nombres}
                  onChange={handleInputChange} className="w-[100%] p-3 rounded-[6px] text-[0.875rem]"
                  placeholder="Juan Carlos"
                />
                {errors.nombres && (
                  <p className="text-red-500 text-xs mt-1 mr-0 mb-0 ml-0">
                    {errors.nombres}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[0.875rem] font-semibold text-foreground/85 mb-2">
                  Apellidos *
                </label>
                <input
                  type="text"
                  name="apellidos"
                  value={formData.apellidos}
                  onChange={handleInputChange} className="w-[100%] p-3 rounded-[6px] text-[0.875rem]"
                  placeholder="Pérez García"
                />
                {errors.apellidos && (
                  <p className="text-red-500 text-xs mt-1 mr-0 mb-0 ml-0">
                    {errors.apellidos}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[1fr_1fr] gap-4 mb-4">
              <div>
                <label className="block text-[0.875rem] font-semibold text-foreground/85 mb-2">
                  <Mail size={16} className="mr-2" />
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange} className="w-[100%] p-3 rounded-[6px] text-[0.875rem]"
                  placeholder="juan.perez@gmail.com"
                />
                {errors.email && (
                  <p className="text-red-500 text-xs mt-1 mr-0 mb-0 ml-0">
                    {errors.email}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[0.875rem] font-semibold text-foreground/85 mb-2">
                  <Phone size={16} className="mr-2" />
                  Teléfono
                </label>
                <input
                  type="tel"
                  name="telefono"
                  value={formData.telefono}
                  onChange={handleInputChange} className="w-[100%] p-3 border rounded-[6px] text-[0.875rem]"
                  placeholder="+51 999 888 777"
                />
              </div>
            </div>

            <div className="grid grid-cols-[2fr_1fr_1fr] gap-4">
              <div>
                <label className="block text-[0.875rem] font-semibold text-foreground/85 mb-2">
                  <MapPin size={16} className="mr-2" />
                  Dirección
                </label>
                <input
                  type="text"
                  name="direccion"
                  value={formData.direccion}
                  onChange={handleInputChange} className="w-[100%] p-3 border rounded-[6px] text-[0.875rem]"
                  placeholder="Av. Javier Prado 123, San Isidro"
                />
              </div>

              <div>
                <label className="block text-[0.875rem] font-semibold text-foreground/85 mb-2">
                  Tipo Doc.
                </label>
                <select
                  name="tipo_documento"
                  value={formData.tipo_documento}
                  onChange={handleInputChange} className="w-[100%] p-3 border rounded-[6px] text-[0.875rem] bg-card"
                >
                  <option value="DNI">DNI</option>
                  <option value="CE">CE</option>
                  <option value="PASAPORTE">Pasaporte</option>
                </select>
              </div>

              <div>
                <label className="block text-[0.875rem] font-semibold text-foreground/85 mb-2">
                  Número Doc.
                </label>
                <input
                  type="text"
                  name="numero_documento"
                  value={formData.numero_documento}
                  onChange={handleInputChange} className="w-[100%] p-3 border rounded-[6px] text-[0.875rem]"
                  placeholder="12345678"
                />
              </div>
            </div>
          </div>

          {/* Sección 2: Información Profesional */}
          <div className="mb-8 p-6 bg-muted rounded-lg border">
            <h3 className="text-[1.125rem] font-semibold text-[#14532d] mt-0 mr-0 mb-6 ml-0 flex items-center gap-2">
              <Briefcase size={20} className="text-[#16a34a]" />
              Información Profesional
            </h3>

            <div className="grid grid-cols-[1fr] gap-4 mb-4">
              <div>
                <label className="block text-[0.875rem] font-semibold text-foreground/85 mb-2">
                  Vacante que Postula *
                </label>
                <select
                  name="id_vacante"
                  value={formData.id_vacante}
                  onChange={handleInputChange} className="w-[100%] p-3 rounded-[6px] text-[0.875rem] bg-card"
                >
                  <option value="">Seleccionar vacante...</option>
                  {vacantes.map(vacante => (
                    <option key={vacante.id} value={vacante.id}>
                      {vacante.titulo}
                    </option>
                  ))}
                </select>
                {errors.id_vacante && (
                  <p className="text-red-500 text-xs mt-1 mr-0 mb-0 ml-0">
                    {errors.id_vacante}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 mb-4">
              <div>
                <label className="block text-[0.875rem] font-semibold text-foreground/85 mb-2">
                  <GraduationCap size={16} className="mr-2" />
                  Nivel Educación
                </label>
                <select
                  name="nivel_educacion"
                  value={formData.nivel_educacion}
                  onChange={handleInputChange} className="w-[100%] p-3 border rounded-[6px] text-[0.875rem] bg-card"
                >
                  <option value="secundaria">Secundaria</option>
                  <option value="tecnico">Técnico</option>
                  <option value="universitario">Universitario</option>
                  <option value="postgrado">Postgrado</option>
                </select>
              </div>

              <div>
                <label className="block text-[0.875rem] font-semibold text-foreground/85 mb-2">
                  Experiencia (años)
                </label>
                <input
                  type="number"
                  name="experiencia_anos"
                  value={formData.experiencia_anos}
                  onChange={handleInputChange} className="w-[100%] p-3 border rounded-[6px] text-[0.875rem]"
                  min="0"
                  max="50"
                  placeholder="3"
                />
              </div>

              <div>
                <label className="block text-[0.875rem] font-semibold text-foreground/85 mb-2">
                  Pretensión Salarial (S/)
                </label>
                <input
                  type="number"
                  name="pretension_salarial"
                  value={formData.pretension_salarial}
                  onChange={handleInputChange} className="w-[100%] p-3 border rounded-[6px] text-[0.875rem]"
                  min="0"
                  step="100"
                  placeholder="3500"
                />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_1fr] gap-4">
              <div>
                <label className="block text-[0.875rem] font-semibold text-foreground/85 mb-2">
                  URL del CV
                </label>
                <input
                  type="url"
                  name="cv_url"
                  value={formData.cv_url}
                  onChange={handleInputChange} className="w-[100%] p-3 border rounded-[6px] text-[0.875rem]"
                  placeholder="https://drive.google.com/..."
                />
              </div>

              <div>
                <label className="block text-[0.875rem] font-semibold text-foreground/85 mb-2">
                  LinkedIn
                </label>
                <input
                  type="url"
                  name="linkedin_url"
                  value={formData.linkedin_url}
                  onChange={handleInputChange} className="w-[100%] p-3 border rounded-[6px] text-[0.875rem]"
                  placeholder="https://linkedin.com/in/..."
                />
              </div>
            </div>
          </div>

          {/* Sección 3: Estado y Observaciones */}
          <div className="mb-8 p-6 bg-[#fef3c7] rounded-lg border">
            <h3 className="text-[1.125rem] font-semibold text-[#92400e] mt-0 mr-0 mb-6 ml-0 flex items-center gap-2">
              <Star size={20} className="text-amber-500" />
              Estado del Proceso
            </h3>

            <div className="grid grid-cols-[1fr_2fr] gap-4">
              <div>
                <label className="block text-[0.875rem] font-semibold text-foreground/85 mb-2">
                  Estado
                </label>
                <select
                  name="estado"
                  value={formData.estado}
                  onChange={handleInputChange} className="w-[100%] p-3 border rounded-[6px] text-[0.875rem] bg-card"
                >
                  <option value="postulante">📝 Postulante</option>
                  <option value="entrevista">🤝 En Entrevista</option>
                  <option value="seleccionado">✅ Seleccionado</option>
                  <option value="contratado">🎉 Contratado</option>
                  <option value="rechazado">❌ Rechazado</option>
                </select>
              </div>

              <div>
                <label className="block text-[0.875rem] font-semibold text-foreground/85 mb-2">
                  Observaciones
                </label>
                <textarea
                  name="observaciones"
                  value={formData.observaciones}
                  onChange={handleInputChange}
                  rows={3} className="w-[100%] p-3 border rounded-[6px] text-[0.875rem]"
                  placeholder="Notas sobre entrevistas, fortalezas, etc..."
                />
              </div>
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-4 pt-4 border-t">
            <button
              type="button"
              onClick={onClose} className="py-3 px-6 border rounded-[6px] bg-card text-foreground/85 text-[0.875rem] font-medium cursor-pointer transition"
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading} className="py-3 px-6 border-0 rounded-[6px] text-white text-[0.875rem] font-medium flex items-center gap-2 transition"
              onMouseOver={(e) => {
                if (!loading) e.currentTarget.style.backgroundColor = '#2563eb'
              }}
              onMouseOut={(e) => {
                if (!loading) e.currentTarget.style.backgroundColor = '#3b82f6'
              }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full" />
                  Guardando...
                </>
              ) : (
                <>
                  <User size={16} />
                  {candidato?.id ? 'Actualizar' : 'Registrar'} Candidato
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
