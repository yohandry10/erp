'use client'

import React, { useState, useEffect } from 'react';
import { useApi } from '@/hooks/use-api';

import VacanteModal from '@/components/modals/VacanteModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Search, Download, Eye, Edit2, Trash2, MapPin, Mail, Phone, Briefcase } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const CandidatosPage = () => {
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [vacantes, setVacantes] = useState<any[]>([]);
  const [departamentos, setDepartamentos] = useState<any[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroVacante, setFiltroVacante] = useState('todas');
  const [showModal, setShowModal] = useState(false);
  const [candidatoEdit, setCandidatoEdit] = useState(null);
  const [loading, setLoading] = useState(true);
  const api = useApi();
  const { toast } = useToast();
  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED === 'true';

  useEffect(() => {
    if (!rrhhEnabled) {
      // HARDENING: evitar llamadas RRHH cuando el feature está deshabilitado.
      setCandidatos([]);
      setVacantes([]);
      setDepartamentos([]);
      setLoading(false);
      return;
    }
    loadData();
  }, [rrhhEnabled]);

  const loadData = async () => {
    if (!rrhhEnabled) {
      return;
    }
    try {
      setLoading(true);
      
      // Cargar candidatos
      const candidatosData = await api.get('/api/rrhh/candidatos');
      if (candidatosData && Array.isArray(candidatosData)) {
        setCandidatos(candidatosData);
      }

      // Cargar vacantes
      const vacantesData = await api.get('/api/rrhh/vacantes');
      if (vacantesData && Array.isArray(vacantesData)) {
        setVacantes(vacantesData);
      }

      // Cargar departamentos
      const departamentosData = await api.get('/api/rrhh/departamentos');
      if (departamentosData && Array.isArray(departamentosData)) {
        setDepartamentos(departamentosData);
      }
    } catch (error) {
      console.error('Error cargando candidatos:', error);
    } finally {
      setLoading(false);
    }
  };

  const [showVacanteModal, setShowVacanteModal] = useState(false);
  const [vacanteData, setVacanteData] = useState({
    titulo: '',
    descripcion: '',
    salario_min: '',
    salario_max: '',
    puesto_solicitado: '',
    departamento_id: ''
  });

  const handleCreateVacante = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/rrhh/vacantes', {
        ...vacanteData,
        salario_min: parseFloat(vacanteData.salario_min),
        salario_max: parseFloat(vacanteData.salario_max),
        estado: 'activa',
        fecha_publicacion: new Date().toISOString().split('T')[0],
        fecha_cierre: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 30 días
      });
      setShowVacanteModal(false);
      setVacanteData({
        titulo: '',
        descripcion: '',
        salario_min: '',
        salario_max: '',
        puesto_solicitado: '',
        departamento_id: ''
      });
      loadData();
    } catch (error) {
      console.error('Error creando vacante:', error);
    }
  };

  const filtrarCandidatos = () => {
    let filtrados = candidatos;
    
    if (filtroEstado !== 'todos') {
      filtrados = filtrados.filter(c => c.estado === filtroEstado);
    }
    
    if (filtroVacante !== 'todas') {
      filtrados = filtrados.filter(c => c.vacante_id === filtroVacante);
    }
    
    return filtrados;
  };

  const getEstadoColor = (estado: string) => {
    const colores: Record<string, string> = {
      'postulante': 'bg-blue-100 text-blue-800',
      'entrevista': 'bg-yellow-100 text-yellow-800',
      'seleccionado': 'bg-green-100 text-green-800',
      'rechazado': 'bg-red-100 text-red-800',
      'contratado': 'bg-purple-100 text-purple-800'
    };
    return colores[estado] || 'bg-gray-100 text-gray-800';
  };

  const calcularEstadisticas = () => {
    const total = candidatos.length;
    const postulantes = candidatos.filter(c => c.estado === 'postulante').length;
    const entrevistas = candidatos.filter(c => c.estado === 'entrevista').length;
    const contratados = candidatos.filter(c => c.estado === 'contratado').length;
    
    return { total, postulantes, entrevistas, contratados };
  };

  if (!rrhhEnabled) {
    return (
      <div className="dashboard-container">
        <div className="alert alert-warning">
          <h1 className="text-xl font-semibold">RRHH deshabilitado</h1>
          <p className="text-sm text-gray-600">
            {/* // HARDENING: RRHH bloqueado hasta culminar procesos legales. */}
            Las funciones de reclutamiento estarán disponibles cuando el módulo de RRHH se habilite en este entorno.
          </p>
        </div>
      </div>
    );
  }

  const stats = calcularEstadisticas();

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando candidatos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">CVs & Candidatos</h1>
          <p className="dashboard-subtitle">Gestión de reclutamiento y selección</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            className="refresh-btn"
            onClick={() => setShowVacanteModal(true)}
          >
            📋 Nueva Vacante
          </button>
          <button 
            className="refresh-btn"
            onClick={() => setShowModal(true)}
          >
            👤 Nuevo Candidato
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="stats-grid mb-6">
        <div className="stat-card">
          <div className="stat-header">
            <h3>Total CVs</h3>
            <div className="stat-icon">📄</div>
          </div>
          <div className="stat-value text-blue-600">{stats.total}</div>
          <div className="stat-subtitle">Candidatos registrados</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>En Proceso</h3>
            <div className="stat-icon">⏳</div>
          </div>
          <div className="stat-value text-yellow-600">{stats.entrevistas}</div>
          <div className="stat-subtitle">En entrevistas</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Nuevos</h3>
            <div className="stat-icon">🆕</div>
          </div>
          <div className="stat-value text-green-600">{stats.postulantes}</div>
          <div className="stat-subtitle">Postulaciones nuevas</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Contratados</h3>
            <div className="stat-icon">🎉</div>
          </div>
          <div className="stat-value text-purple-600">{stats.contratados}</div>
          <div className="stat-subtitle">Proceso exitoso</div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '1.5rem',
        padding: '1rem',
        background: '#f8f9fa',
        borderRadius: '8px'
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Estado:
          </label>
          <select 
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="form-control"
            style={{ width: '150px' }}
          >
            <option value="todos">Todos</option>
            <option value="postulante">Postulante</option>
            <option value="entrevista">En Entrevista</option>
            <option value="seleccionado">Seleccionado</option>
            <option value="contratado">Contratado</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Vacante:
          </label>
          <select 
            value={filtroVacante}
            onChange={(e) => setFiltroVacante(e.target.value)}
            className="form-control"
            style={{ width: '200px' }}
          >
            <option value="todas">Todas las vacantes</option>
            {vacantes.map(v => (
              <option key={v.id} value={v.id}>{v.titulo}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla de candidatos */}
      <div className="table-container">
        <div className="table-header">
          <h2>Lista de Candidatos ({filtrarCandidatos().length})</h2>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Candidato</th>
                <th>Vacante</th>
                <th>Teléfono</th>
                <th>Experiencia</th>
                <th>Puntuación CV</th>
                <th>Estado</th>
                <th>Fecha Postulación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrarCandidatos().map((candidato) => (
                <tr key={candidato.id}>
                  <td>
                    <div>
                      <div className="font-medium">{candidato.nombres} {candidato.apellidos}</div>
                      <div className="text-sm text-gray-500">{candidato.email}</div>
                    </div>
                  </td>
                  <td>
                    {vacantes.find(v => v.id === candidato.vacante_id)?.titulo || 'N/A'}
                  </td>
                  <td>{candidato.telefono}</td>
                  <td>{candidato.experiencia_anos || 0} años</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ 
                        width: '50px', 
                        height: '8px', 
                        background: '#e5e7eb', 
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <div style={{ 
                          width: `${(candidato.puntuacion_cv || 0)}%`, 
                          height: '100%', 
                          background: candidato.puntuacion_cv >= 80 ? '#10b981' : 
                                     candidato.puntuacion_cv >= 60 ? '#f59e0b' : '#ef4444' 
                        }}></div>
                      </div>
                      <span className="text-sm">{candidato.puntuacion_cv || 0}%</span>
                    </div>
                  </td>
                  <td>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getEstadoColor(candidato.estado)}`}>
                      {candidato.estado?.toUpperCase() || 'POSTULANTE'}
                    </span>
                  </td>
                  <td>{new Date(candidato.fecha_postulacion).toLocaleDateString('es-PE')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => {
                          setCandidatoEdit(candidato);
                          setShowModal(true);
                        }}
                        className="action-btn bg-blue-500 hover:bg-blue-600 text-white"
                        title="Ver CV"
                      >
                        👁️
                      </button>
                      <button
                        onClick={() => {
                          setCandidatoEdit(candidato);
                          setShowModal(true);
                        }}
                        className="action-btn bg-green-500 hover:bg-green-600 text-white"
                        title="Editar"
                      >
                        ✏️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtrarCandidatos().length === 0 && (
            <div style={{ 
              textAlign: 'center', 
              padding: '2rem',
              color: '#6b7280'
            }}>
              No hay candidatos que coincidan con los filtros seleccionados.
            </div>
          )}
        </div>
      </div>

      {/* Modal de candidato - Simple y elegante */}
      {showModal && (
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
          onClick={() => {
            setShowModal(false);
            setCandidatoEdit(null);
          }}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '600px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ 
              padding: '2rem 2rem 1rem 2rem',
              borderBottom: '2px solid #e5e7eb',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              borderRadius: '12px 12px 0 0'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', margin: 0 }}>
                    👤 {candidatoEdit?.id ? 'Editar Candidato' : 'Nuevo Candidato'}
                  </h2>
                  <p style={{ fontSize: '0.875rem', opacity: 0.9, margin: '0.5rem 0 0 0' }}>
                    {candidatoEdit?.id ? 'Actualizar información del postulante' : 'Registrar nueva postulación de CV'}
                  </p>
                </div>
                
                <button
                  onClick={() => {
                    setShowModal(false);
                    setCandidatoEdit(null);
                  }}
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1.25rem'
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            <CandidatoFormulario 
              candidato={candidatoEdit}
              vacantes={vacantes}
              onSuccess={() => {
                setShowModal(false);
                setCandidatoEdit(null);
                loadData();
              }}
              onCancel={() => {
                setShowModal(false);
                setCandidatoEdit(null);
              }}
            />
          </div>
        </div>
      )}

      <VacanteModal 
        isOpen={showVacanteModal}
        onClose={() => setShowVacanteModal(false)}
        onSuccess={loadData}
        departamentos={departamentos}
      />
    </div>
  );
};

// Componente de formulario simple dentro del mismo archivo
function CandidatoFormulario({ candidato, vacantes, onSuccess, onCancel }: any) {
  const { toast } = useToast();
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

  useEffect(() => {
    if (candidato) {
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
  }, [candidato]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nombres.trim() || !formData.apellidos.trim() || !formData.email.trim() || !formData.id_vacante) {
      toast({
        title: "Error",
        description: "Complete todos los campos obligatorios",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    try {
      // Calcular puntuación automática del CV
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidatoData),
      });

      if (response.ok) {
        toast({
          title: "Éxito",
          description: `Candidato ${candidato?.id ? 'actualizado' : 'registrado'} exitosamente`,
        });
        onSuccess();
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      console.error('❌ Error:', error);
      toast({
        title: "Error",
        description: "Error al guardar el candidato",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const vacanteSeleccionada = vacantes.find((v: any) => v.id === formData.id_vacante);

  return (
    <form onSubmit={handleSubmit} style={{ padding: '2rem' }}>
      {/* Info de vacante seleccionada */}
      {vacanteSeleccionada && (
        <div style={{ 
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: '#dbeafe',
          borderRadius: '8px',
          border: '1px solid #3b82f6'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#1e40af', fontWeight: '600' }}>
            📋 <strong>Postula para:</strong> {vacanteSeleccionada.titulo} • <strong>Depto:</strong> {vacanteSeleccionada.departamento}
          </div>
        </div>
      )}

      {/* Información Básica */}
      <div style={{ 
        marginBottom: '1.5rem',
        padding: '1.5rem',
        backgroundColor: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #e2e8f0'
      }}>
        <h3 style={{ 
          fontSize: '1.125rem', 
          fontWeight: '600', 
          color: '#1e293b', 
          margin: '0 0 1rem 0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          👤 Información Personal
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Nombres *
            </label>
            <input
              type="text"
              value={formData.nombres}
              onChange={(e) => setFormData({...formData, nombres: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                outline: 'none'
              }}
              placeholder="Juan Carlos"
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Apellidos *
            </label>
            <input
              type="text"
              value={formData.apellidos}
              onChange={(e) => setFormData({...formData, apellidos: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                outline: 'none'
              }}
              placeholder="Pérez García"
              required
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              📧 Email *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                outline: 'none'
              }}
              placeholder="juan.perez@gmail.com"
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              📱 Teléfono
            </label>
            <input
              type="tel"
              value={formData.telefono}
              onChange={(e) => setFormData({...formData, telefono: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                outline: 'none'
              }}
              placeholder="+51 999 888 777"
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
            🏢 Vacante que Postula *
          </label>
          <select
            value={formData.id_vacante}
            onChange={(e) => setFormData({...formData, id_vacante: e.target.value})}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              outline: 'none',
              backgroundColor: 'white'
            }}
            required
          >
            <option value="">Seleccionar vacante...</option>
            {vacantes.map((vacante: any) => (
              <option key={vacante.id} value={vacante.id}>
                {vacante.titulo} - {vacante.departamento}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Información Profesional */}
      <div style={{ 
        marginBottom: '1.5rem',
        padding: '1.5rem',
        backgroundColor: '#f0fdf4',
        borderRadius: '8px',
        border: '1px solid #bbf7d0'
      }}>
        <h3 style={{ 
          fontSize: '1.125rem', 
          fontWeight: '600', 
          color: '#14532d', 
          margin: '0 0 1rem 0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          💼 Información Profesional
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Experiencia (años)
            </label>
            <input
              type="number"
              value={formData.experiencia_anos}
              onChange={(e) => setFormData({...formData, experiencia_anos: parseInt(e.target.value) || 0})}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                outline: 'none'
              }}
              min="0"
              max="50"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              💰 Pretensión Salarial (S/)
            </label>
            <input
              type="number"
              value={formData.pretension_salarial}
              onChange={(e) => setFormData({...formData, pretension_salarial: parseInt(e.target.value) || 0})}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                outline: 'none'
              }}
              min="0"
              step="100"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Estado del Proceso
            </label>
            <select
              value={formData.estado}
              onChange={(e) => setFormData({...formData, estado: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
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
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              📄 URL del CV
            </label>
            <input
              type="url"
              value={formData.cv_url}
              onChange={(e) => setFormData({...formData, cv_url: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                outline: 'none'
              }}
              placeholder="https://drive.google.com/file/..."
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              🔗 LinkedIn
            </label>
            <input
              type="url"
              value={formData.linkedin_url}
              onChange={(e) => setFormData({...formData, linkedin_url: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                outline: 'none'
              }}
              placeholder="https://linkedin.com/in/..."
            />
          </div>
        </div>
      </div>

      {/* Observaciones */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
          📝 Observaciones
        </label>
        <textarea
          value={formData.observaciones}
          onChange={(e) => setFormData({...formData, observaciones: e.target.value})}
          rows={3}
          style={{
            width: '100%',
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            outline: 'none',
            resize: 'vertical'
          }}
          placeholder="Notas sobre entrevistas, fortalezas detectadas, etc..."
        />
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
          onClick={onCancel}
          style={{
            padding: '0.75rem 1.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            backgroundColor: 'white',
            color: '#374151',
            cursor: 'pointer',
            fontWeight: '500'
          }}
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
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          {loading ? (
            <>⏳ Guardando...</>
          ) : (
            <>{candidato?.id ? '✏️ Actualizar' : '➕ Registrar'} Candidato</>
          )}
        </button>
      </div>
    </form>
  );
}

export default CandidatosPage; 
