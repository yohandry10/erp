'use client';

import React, { useState, useEffect } from 'react';
import { X, User, Mail, Phone, MapPin, Briefcase, GraduationCap, Star } from 'lucide-react';

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

      const response = await fetch(candidato?.id ? `/api/rrhh/candidatos/${candidato.id}` : '/api/rrhh/candidatos', {
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
      onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '0',
          width: '100%',
          maxWidth: '800px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '2rem 2rem 1rem 2rem',
          borderBottom: '2px solid #e5e7eb',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          borderRadius: '12px 12px 0 0'
        }}>
          <div>
            <h2 style={{ 
              fontSize: '1.75rem', 
              fontWeight: 'bold', 
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <User size={28} />
              {candidato?.id ? 'Editar Candidato' : 'Nuevo Candidato'}
            </h2>
            <p style={{ 
              fontSize: '0.875rem', 
              opacity: 0.9, 
              margin: '0.5rem 0 0 0' 
            }}>
              {candidato?.id ? 'Actualizar información del postulante' : 'Registrar nueva postulación de CV'}
            </p>
          </div>
          
          <button
            onClick={onClose}
            style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '1.25rem',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Información de vacante seleccionada */}
        {vacanteSeleccionada && (
          <div style={{ 
            margin: '1.5rem 2rem 0 2rem',
            padding: '1rem',
            backgroundColor: '#dbeafe',
            borderRadius: '8px',
            border: '1px solid #3b82f6'
          }}>
            <div style={{ 
              fontSize: '0.875rem', 
              color: '#1e40af',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap'
            }}>
              <Briefcase size={16} />
              <strong>Vacante:</strong> {vacanteSeleccionada.titulo}
              {vacanteSeleccionada.departamento && (
                <>• <strong>Depto:</strong> {vacanteSeleccionada.departamento}</>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: '2rem' }}>
          {/* Sección 1: Datos Básicos */}
          <div style={{ 
            marginBottom: '2rem',
            padding: '1.5rem',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0'
          }}>
            <h3 style={{ 
              fontSize: '1.125rem', 
              fontWeight: '600', 
              color: '#1e293b', 
              margin: '0 0 1.5rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <User size={20} style={{ color: '#3b82f6' }} />
              Información Personal
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Nombres *
                </label>
                <input
                  type="text"
                  name="nombres"
                  value={formData.nombres}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errors.nombres ? '2px solid #ef4444' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none'
                  }}
                  placeholder="Juan Carlos"
                />
                {errors.nombres && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>
                    {errors.nombres}
                  </p>
                )}
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Apellidos *
                </label>
                <input
                  type="text"
                  name="apellidos"
                  value={formData.apellidos}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errors.apellidos ? '2px solid #ef4444' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none'
                  }}
                  placeholder="Pérez García"
                />
                {errors.apellidos && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>
                    {errors.apellidos}
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  <Mail size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errors.email ? '2px solid #ef4444' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none'
                  }}
                  placeholder="juan.perez@gmail.com"
                />
                {errors.email && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>
                    {errors.email}
                  </p>
                )}
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  <Phone size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
                  Teléfono
                </label>
                <input
                  type="tel"
                  name="telefono"
                  value={formData.telefono}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none'
                  }}
                  placeholder="+51 999 888 777"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  <MapPin size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
                  Dirección
                </label>
                <input
                  type="text"
                  name="direccion"
                  value={formData.direccion}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none'
                  }}
                  placeholder="Av. Javier Prado 123, San Isidro"
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Tipo Doc.
                </label>
                <select
                  name="tipo_documento"
                  value={formData.tipo_documento}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="DNI">DNI</option>
                  <option value="CE">CE</option>
                  <option value="PASAPORTE">Pasaporte</option>
                </select>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Número Doc.
                </label>
                <input
                  type="text"
                  name="numero_documento"
                  value={formData.numero_documento}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none'
                  }}
                  placeholder="12345678"
                />
              </div>
            </div>
          </div>

          {/* Sección 2: Información Profesional */}
          <div style={{ 
            marginBottom: '2rem',
            padding: '1.5rem',
            backgroundColor: '#f0fdf4',
            borderRadius: '8px',
            border: '1px solid #bbf7d0'
          }}>
            <h3 style={{ 
              fontSize: '1.125rem', 
              fontWeight: '600', 
              color: '#14532d', 
              margin: '0 0 1.5rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <Briefcase size={20} style={{ color: '#16a34a' }} />
              Información Profesional
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Vacante que Postula *
                </label>
                <select
                  name="id_vacante"
                  value={formData.id_vacante}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errors.id_vacante ? '2px solid #ef4444' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">Seleccionar vacante...</option>
                  {vacantes.map(vacante => (
                    <option key={vacante.id} value={vacante.id}>
                      {vacante.titulo}
                    </option>
                  ))}
                </select>
                {errors.id_vacante && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>
                    {errors.id_vacante}
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  <GraduationCap size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
                  Nivel Educación
                </label>
                <select
                  name="nivel_educacion"
                  value={formData.nivel_educacion}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="secundaria">Secundaria</option>
                  <option value="tecnico">Técnico</option>
                  <option value="universitario">Universitario</option>
                  <option value="postgrado">Postgrado</option>
                </select>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Experiencia (años)
                </label>
                <input
                  type="number"
                  name="experiencia_anos"
                  value={formData.experiencia_anos}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none'
                  }}
                  min="0"
                  max="50"
                  placeholder="3"
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Pretensión Salarial (S/)
                </label>
                <input
                  type="number"
                  name="pretension_salarial"
                  value={formData.pretension_salarial}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none'
                  }}
                  min="0"
                  step="100"
                  placeholder="3500"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  URL del CV
                </label>
                <input
                  type="url"
                  name="cv_url"
                  value={formData.cv_url}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none'
                  }}
                  placeholder="https://drive.google.com/..."
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  LinkedIn
                </label>
                <input
                  type="url"
                  name="linkedin_url"
                  value={formData.linkedin_url}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none'
                  }}
                  placeholder="https://linkedin.com/in/..."
                />
              </div>
            </div>
          </div>

          {/* Sección 3: Estado y Observaciones */}
          <div style={{ 
            marginBottom: '2rem',
            padding: '1.5rem',
            backgroundColor: '#fef3c7',
            borderRadius: '8px',
            border: '1px solid #f59e0b'
          }}>
            <h3 style={{ 
              fontSize: '1.125rem', 
              fontWeight: '600', 
              color: '#92400e', 
              margin: '0 0 1.5rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <Star size={20} style={{ color: '#f59e0b' }} />
              Estado del Proceso
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Estado
                </label>
                <select
                  name="estado"
                  value={formData.estado}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="postulante">📝 Postulante</option>
                  <option value="entrevista">🤝 En Entrevista</option>
                  <option value="seleccionado">✅ Seleccionado</option>
                  <option value="contratado">🎉 Contratado</option>
                  <option value="rechazado">❌ Rechazado</option>
                </select>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Observaciones
                </label>
                <textarea
                  name="observaciones"
                  value={formData.observaciones}
                  onChange={handleInputChange}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                  placeholder="Notas sobre entrevistas, fortalezas, etc..."
                />
              </div>
            </div>
          </div>

          {/* Botones */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            gap: '1rem',
            paddingTop: '1rem',
            borderTop: '1px solid #e5e7eb'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: 'white',
                color: '#374151',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: loading ? '#9ca3af' : '#3b82f6',
                color: 'white',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                if (!loading) e.currentTarget.style.backgroundColor = '#2563eb'
              }}
              onMouseOut={(e) => {
                if (!loading) e.currentTarget.style.backgroundColor = '#3b82f6'
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid transparent',
                    borderTop: '2px solid currentColor',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
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

        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
} 