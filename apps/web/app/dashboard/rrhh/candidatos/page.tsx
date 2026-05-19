'use client'

import React, { useState, useCallback, useEffect } from 'react';
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
  const [candidatoEdit, setCandidatoEdit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { get, post } = useApi();
  const { toast } = useToast();
  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED === 'true';

  const loadData = useCallback(async () => {
    if (!rrhhEnabled) {
      setCandidatos([]);
      setVacantes([]);
      setDepartamentos([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      
      // Cargar candidatos
      const candidatosData = await get('/api/rrhh/candidatos');
      if (candidatosData && Array.isArray(candidatosData)) {
        setCandidatos(candidatosData);
      }

      // Cargar vacantes
      const vacantesData = await get('/api/rrhh/vacantes');
      if (vacantesData && Array.isArray(vacantesData)) {
        setVacantes(vacantesData);
      }

      // Cargar departamentos
      const departamentosData = await get('/api/rrhh/departamentos');
      if (departamentosData && Array.isArray(departamentosData)) {
        setDepartamentos(departamentosData);
      }
    } catch (error) {
      console.error('Error cargando candidatos:', error);
    } finally {
      setLoading(false);
    }
  }, [get, rrhhEnabled]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      await post('/api/rrhh/vacantes', {
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
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">Candidatos</h1>
            <p className="dashboard-subtitle">Cargando postulantes, vacantes activas y departamentos disponibles.</p>
          </div>
        </div>
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
        <div className="flex gap-4">
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
      <div className="flex gap-4 mb-6 p-4 bg-[#f8f9fa] rounded-2">
        <div>
          <label className="block mb-2 font-medium">
            Estado:
          </label>
          <select 
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="form-control w-[150px]"
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
          <label className="block mb-2 font-medium">
            Vacante:
          </label>
          <select 
            value={filtroVacante}
            onChange={(e) => setFiltroVacante(e.target.value)}
            className="form-control w-[200px]"
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
                    <div className="flex items-center gap-2">
                      <div className="w-[50px] h-2 bg-[#e5e7eb] rounded-[4px] overflow-hidden">
                        <div className="h-[100%]"></div>
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
                    <div className="flex gap-2">
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
            <div className="text-center p-8 text-gray-500">
              No hay candidatos que coincidan con los filtros seleccionados.
            </div>
          )}
        </div>
      </div>

      {/* Modal de candidato - Simple y elegante */}
      {showModal && (
        <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.75)] flex items-center justify-center z-[99999] p-4"
          onClick={() => {
            setShowModal(false);
            setCandidatoEdit(null);
          }}
        >
          <div className="bg-white rounded-3 w-[100%] max-w-[600px] overflow-y-auto shadow"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="pt-8 pr-8 pb-4 pl-8 text-white">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-7 font-bold m-0">
                    👤 {candidatoEdit?.id ? 'Editar Candidato' : 'Nuevo Candidato'}
                  </h2>
                  <p className="text-[0.875rem] opacity-[0.9] mt-2 mr-0 mb-0 ml-0">
                    {candidatoEdit?.id ? 'Actualizar información del postulante' : 'Registrar nueva postulación de CV'}
                  </p>
                </div>
                
                <button
                  onClick={() => {
                    setShowModal(false);
                    setCandidatoEdit(null);
                  }} className="w-10 h-10 rounded-full bg-[rgba(255,_255,_255,_0.2)] text-white border-0 cursor-pointer text-5"
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
    <form onSubmit={handleSubmit} className="p-8">
      {/* Info de vacante seleccionada */}
      {vacanteSeleccionada && (
        <div className="mb-6 p-4 bg-[#dbeafe] rounded-2 border">
          <div className="text-[0.875rem] text-[#1e40af] font-semibold">
            📋 <strong>Postula para:</strong> {vacanteSeleccionada.titulo} • <strong>Depto:</strong> {vacanteSeleccionada.departamento}
          </div>
        </div>
      )}

      {/* Información Básica */}
      <div className="mb-6 p-6 bg-slate-50 rounded-2 border">
        <h3 className="text-[1.125rem] font-semibold text-slate-800 mt-0 mr-0 mb-4 ml-0 flex items-center gap-2">
          👤 Información Personal
        </h3>
        
        <div className="grid grid-cols-[1fr_1fr] gap-4 mb-4">
          <div>
            <label className="block text-[0.875rem] font-semibold mb-2">
              Nombres *
            </label>
            <input
              type="text"
              value={formData.nombres}
              onChange={(e) => setFormData({...formData, nombres: e.target.value})} className="w-[100%] p-3 border rounded-[6px]"
              placeholder="Juan Carlos"
              required
            />
          </div>

          <div>
            <label className="block text-[0.875rem] font-semibold mb-2">
              Apellidos *
            </label>
            <input
              type="text"
              value={formData.apellidos}
              onChange={(e) => setFormData({...formData, apellidos: e.target.value})} className="w-[100%] p-3 border rounded-[6px]"
              placeholder="Pérez García"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_1fr] gap-4 mb-4">
          <div>
            <label className="block text-[0.875rem] font-semibold mb-2">
              📧 Email *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-[100%] p-3 border rounded-[6px]"
              placeholder="juan.perez@gmail.com"
              required
            />
          </div>

          <div>
            <label className="block text-[0.875rem] font-semibold mb-2">
              📱 Teléfono
            </label>
            <input
              type="tel"
              value={formData.telefono}
              onChange={(e) => setFormData({...formData, telefono: e.target.value})} className="w-[100%] p-3 border rounded-[6px]"
              placeholder="+51 999 888 777"
            />
          </div>
        </div>

        <div>
          <label className="block text-[0.875rem] font-semibold mb-2">
            🏢 Vacante que Postula *
          </label>
          <select
            value={formData.id_vacante}
            onChange={(e) => setFormData({...formData, id_vacante: e.target.value})} className="w-[100%] p-3 border rounded-[6px] bg-white"
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
      <div className="mb-6 p-6 bg-[#f0fdf4] rounded-2 border">
        <h3 className="text-[1.125rem] font-semibold text-[#14532d] mt-0 mr-0 mb-4 ml-0 flex items-center gap-2">
          💼 Información Profesional
        </h3>
        
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 mb-4">
          <div>
            <label className="block text-[0.875rem] font-semibold mb-2">
              Experiencia (años)
            </label>
            <input
              type="number"
              value={formData.experiencia_anos}
              onChange={(e) => setFormData({...formData, experiencia_anos: parseInt(e.target.value) || 0})} className="w-[100%] p-3 border rounded-[6px]"
              min="0"
              max="50"
            />
          </div>

          <div>
            <label className="block text-[0.875rem] font-semibold mb-2">
              💰 Pretensión Salarial (S/)
            </label>
            <input
              type="number"
              value={formData.pretension_salarial}
              onChange={(e) => setFormData({...formData, pretension_salarial: parseInt(e.target.value) || 0})} className="w-[100%] p-3 border rounded-[6px]"
              min="0"
              step="100"
            />
          </div>

          <div>
            <label className="block text-[0.875rem] font-semibold mb-2">
              Estado del Proceso
            </label>
            <select
              value={formData.estado}
              onChange={(e) => setFormData({...formData, estado: e.target.value})} className="w-[100%] p-3 border rounded-[6px] bg-white"
            >
              <option value="postulante">📝 Postulante</option>
              <option value="entrevista">🤝 En Entrevista</option>
              <option value="seleccionado">✅ Seleccionado</option>
              <option value="contratado">🎉 Contratado</option>
              <option value="rechazado">❌ Rechazado</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_1fr] gap-4">
          <div>
            <label className="block text-[0.875rem] font-semibold mb-2">
              📄 URL del CV
            </label>
            <input
              type="url"
              value={formData.cv_url}
              onChange={(e) => setFormData({...formData, cv_url: e.target.value})} className="w-[100%] p-3 border rounded-[6px]"
              placeholder="https://drive.google.com/file/..."
            />
          </div>

          <div>
            <label className="block text-[0.875rem] font-semibold mb-2">
              🔗 LinkedIn
            </label>
            <input
              type="url"
              value={formData.linkedin_url}
              onChange={(e) => setFormData({...formData, linkedin_url: e.target.value})} className="w-[100%] p-3 border rounded-[6px]"
              placeholder="https://linkedin.com/in/..."
            />
          </div>
        </div>
      </div>

      {/* Observaciones */}
      <div className="mb-6">
        <label className="block text-[0.875rem] font-semibold mb-2">
          📝 Observaciones
        </label>
        <textarea
          value={formData.observaciones}
          onChange={(e) => setFormData({...formData, observaciones: e.target.value})}
          rows={3} className="w-[100%] p-3 border rounded-[6px]"
          placeholder="Notas sobre entrevistas, fortalezas detectadas, etc..."
        />
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-4 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel} className="py-3 px-6 border rounded-[6px] bg-white text-gray-700 cursor-pointer font-medium"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading} className="py-3 px-6 border-0 rounded-[6px] text-white font-medium flex items-center gap-2"
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
