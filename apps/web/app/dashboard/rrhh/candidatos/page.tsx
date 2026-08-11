'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { parseDateLocal } from '@/lib/date-utils'
import { useApi } from '@/hooks/use-api';
import { fetchApi } from '@/lib/api-fetch';

import VacanteModal from '@/components/modals/VacanteModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Briefcase,
  CheckCircle2,
  Clock3,
  Edit2,
  Eye,
  FileText,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCountryContext } from '@/hooks/use-country-context';

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
  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED !== 'false';

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
      // El API responde { success, data: [...] }; hay que desempaquetar `.data`.
      // Antes se hacía Array.isArray(respuestaCruda) → siempre false → nunca cargaba.
      const asList = (r: any) => Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : []);
      setCandidatos(asList(candidatosData));

      // Cargar vacantes
      const vacantesData = await get('/api/rrhh/vacantes');
      setVacantes(asList(vacantesData));

      // Cargar departamentos
      const departamentosData = await get('/api/rrhh/departamentos');
      setDepartamentos(asList(departamentosData));
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
      'postulante': 'bg-primary/10 text-primary',
      'entrevista': 'bg-amber-500/10 text-amber-400',
      'seleccionado': 'bg-emerald-500/10 text-emerald-400',
      'rechazado': 'bg-destructive/10 text-destructive',
      'contratado': 'bg-violet-500/10 text-violet-400'
    };
    return colores[estado] || 'bg-muted text-foreground';
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
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="alert alert-warning">
          <h1 className="text-xl font-semibold">RRHH deshabilitado</h1>
          <p className="text-sm text-foreground/80">
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
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
          <div>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Candidatos</h1>
            <p className="mt-2 text-base text-muted-foreground">Cargando postulantes, vacantes activas y departamentos disponibles.</p>
          </div>
        </div>
        <div className="flex min-h-48 items-center justify-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p>Cargando candidatos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">CVs & Candidatos</h1>
          <p className="mt-2 text-base text-muted-foreground">Gestión de reclutamiento y selección</p>
        </div>
        <div className="flex gap-4">
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => setShowVacanteModal(true)}
          >
            <Briefcase className="size-4" aria-hidden="true" />
            Nueva Vacante
          </button>
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => setShowModal(true)}
          >
            <UserPlus className="size-4" aria-hidden="true" />
            Nuevo Candidato
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5 mb-6">
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Total CVs</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="size-5" aria-hidden="true" /></div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-primary">{stats.total}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Candidatos registrados</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>En Proceso</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Clock3 className="size-5" aria-hidden="true" /></div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-amber-400">{stats.entrevistas}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">En entrevistas</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Nuevos</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="size-5" aria-hidden="true" /></div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-emerald-400">{stats.postulantes}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Postulaciones nuevas</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Contratados</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><CheckCircle2 className="size-5" aria-hidden="true" /></div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-violet-400">{stats.contratados}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Proceso exitoso</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-6 grid gap-4 rounded-2xl border border-border bg-card/80 p-4 sm:grid-cols-2">
        <div className="min-w-0">
          <Label htmlFor="filtro-estado-candidatos" className="mb-2">Estado</Label>
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger id="filtro-estado-candidatos" aria-label="Filtrar candidatos por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="postulante">Postulante</SelectItem>
              <SelectItem value="entrevista">En Entrevista</SelectItem>
              <SelectItem value="seleccionado">Seleccionado</SelectItem>
              <SelectItem value="contratado">Contratado</SelectItem>
              <SelectItem value="rechazado">Rechazado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0">
          <Label htmlFor="filtro-vacante-candidatos" className="mb-2">Vacante</Label>
          <Select value={filtroVacante} onValueChange={setFiltroVacante}>
            <SelectTrigger id="filtro-vacante-candidatos" aria-label="Filtrar candidatos por vacante">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las vacantes</SelectItem>
              {vacantes.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.titulo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                      <div className="text-sm text-muted-foreground">{candidato.email}</div>
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
                  <td>{parseDateLocal(candidato.fecha_postulacion).toLocaleDateString('es-PE')}</td>
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
                        <Eye className="size-4" aria-hidden="true" />
                        <span className="sr-only">Ver CV</span>
                      </button>
                      <button
                        onClick={() => {
                          setCandidatoEdit(candidato);
                          setShowModal(true);
                        }}
                        className="action-btn bg-green-500 hover:bg-green-600 text-white"
                        title="Editar"
                      >
                        <Edit2 className="size-4" aria-hidden="true" />
                        <span className="sr-only">Editar candidato</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtrarCandidatos().length === 0 && (
            <div className="text-center p-8 text-muted-foreground">
              No hay candidatos que coincidan con los filtros seleccionados.
            </div>
          )}
        </div>
      </div>

      {/* Modal de candidato - Simple y elegante */}
      <Dialog
        open={showModal}
        onOpenChange={(open) => {
          setShowModal(open);
          if (!open) {
            setShowModal(false);
            setCandidatoEdit(null);
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-2xl gap-0 overflow-y-auto p-0 sm:max-h-[calc(100dvh-2rem)]">
          <DialogHeader className="sticky top-0 z-10 border-b border-border bg-background px-5 py-5 pr-12 sm:px-6">
            <DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl">
              <UserPlus className="size-5 text-primary" aria-hidden="true" />
              {candidatoEdit?.id ? 'Editar Candidato' : 'Nuevo Candidato'}
            </DialogTitle>
            <DialogDescription>
              {candidatoEdit?.id ? 'Actualizar información del postulante' : 'Registrar nueva postulación de CV'}
            </DialogDescription>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>

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
  const country = useCountryContext();
  const isArgentina = country.paisCodigo === 'AR';
  const isColombia = country.paisCodigo === 'CO';
  const [formData, setFormData] = useState({
    id_vacante: '',
    nombres: '',
    apellidos: '',
    email: '',
    telefono: '',
    numero_documento: '',
    tipo_documento: isArgentina ? 'CUIL' : isColombia ? 'CC' : 'DNI',
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
  const mutationIntent = useRef('');

  useEffect(() => {
    mutationIntent.current = `rrhh-candidate-${candidato?.id ? 'update' : 'create'}:${crypto.randomUUID()}`;
    if (candidato) {
      setFormData({
        id_vacante: candidato.id_vacante || '',
        nombres: candidato.nombres || '',
        apellidos: candidato.apellidos || '',
        email: candidato.email || '',
        telefono: candidato.telefono || '',
        numero_documento: candidato.numero_documento || '',
        tipo_documento: candidato.tipo_documento || (isArgentina ? 'CUIL' : isColombia ? 'CC' : 'DNI'),
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
    } else {
      setFormData((current) => ({
        ...current,
        tipo_documento: isArgentina ? 'CUIL' : isColombia ? 'CC' : 'DNI',
      }));
    }
  }, [candidato, isArgentina, isColombia]);

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

      const response = await fetchApi(candidato?.id ? `/api/rrhh/candidatos/${candidato.id}` : '/api/rrhh/candidatos', {
        method: candidato?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': mutationIntent.current,
        },
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
    <form onSubmit={handleSubmit} className="p-4 sm:p-6">
      {/* Info de vacante seleccionada */}
      {vacanteSeleccionada && (
        <div className="mb-6 rounded-lg border border-primary/20 bg-primary/10 p-4">
          <div className="flex items-start gap-2 text-sm font-semibold text-foreground">
            <Briefcase className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span><strong>Postula para:</strong> {vacanteSeleccionada.titulo} • <strong>Depto:</strong> {vacanteSeleccionada.departamento}</span>
          </div>
        </div>
      )}

      {/* Información Básica */}
      <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4 sm:p-6">
        <h3 className="text-[1.125rem] font-semibold text-foreground mt-0 mr-0 mb-4 ml-0 flex items-center gap-2">
          <Users className="size-5 text-primary" aria-hidden="true" /> Información Personal
        </h3>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="candidatos-nombres" className="block text-[0.875rem] font-semibold mb-2">
              Nombres *
            </label>
            <input id="candidatos-nombres"
              type="text"
              value={formData.nombres}
              onChange={(e) => setFormData({...formData, nombres: e.target.value})} className="w-[100%] p-3 border rounded-[6px]"
              placeholder="Juan Carlos"
              required
            />
          </div>

          <div>
            <label htmlFor="candidatos-apellidos" className="block text-[0.875rem] font-semibold mb-2">
              Apellidos *
            </label>
            <input id="candidatos-apellidos"
              type="text"
              value={formData.apellidos}
              onChange={(e) => setFormData({...formData, apellidos: e.target.value})} className="w-[100%] p-3 border rounded-[6px]"
              placeholder="Pérez García"
              required
            />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="candidatos-email" className="block text-[0.875rem] font-semibold mb-2">
              Email *
            </label>
            <input id="candidatos-email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-[100%] p-3 border rounded-[6px]"
              placeholder="juan.perez@gmail.com"
              required
            />
          </div>

          <div>
            <label htmlFor="candidatos-telefono" className="block text-[0.875rem] font-semibold mb-2">
              Teléfono
            </label>
            <input id="candidatos-telefono"
              type="tel"
              value={formData.telefono}
              onChange={(e) => setFormData({...formData, telefono: e.target.value})} className="w-[100%] p-3 border rounded-[6px]"
              placeholder="+51 999 888 777"
            />
          </div>
        </div>

        <div>
          <label htmlFor="candidatos-id-vacante" className="block text-[0.875rem] font-semibold mb-2">
            Vacante que Postula *
          </label>
          <select id="candidatos-id-vacante"
            value={formData.id_vacante}
            onChange={(e) => setFormData({...formData, id_vacante: e.target.value})} className="w-[100%] p-3 border rounded-[6px] bg-card"
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
      <div className="mb-6 rounded-lg border border-border bg-accent/35 p-4 sm:p-6">
        <h3 className="m-0 mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Briefcase className="size-5 text-primary" aria-hidden="true" /> Información Profesional
        </h3>

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="candidatos-experiencia-anos" className="block text-[0.875rem] font-semibold mb-2">
              Experiencia (años)
            </label>
            <input id="candidatos-experiencia-anos"
              type="number"
              value={formData.experiencia_anos}
              onChange={(e) => setFormData({...formData, experiencia_anos: parseInt(e.target.value) || 0})} className="w-[100%] p-3 border rounded-[6px]"
              min="0"
              max="50"
            />
          </div>

          <div>
            <label htmlFor="candidatos-pretension-salarial" className="block text-[0.875rem] font-semibold mb-2">
              Pretensión Salarial ({country.simboloMoneda || 'S/'})
            </label>
            <input id="candidatos-pretension-salarial"
              type="number"
              value={formData.pretension_salarial}
              onChange={(e) => setFormData({...formData, pretension_salarial: parseInt(e.target.value) || 0})} className="w-[100%] p-3 border rounded-[6px]"
              min="0"
              step="100"
            />
          </div>

          <div>
            <label htmlFor="candidatos-estado" className="block text-[0.875rem] font-semibold mb-2">
              Estado del Proceso
            </label>
            <select id="candidatos-estado"
              value={formData.estado}
              onChange={(e) => setFormData({...formData, estado: e.target.value})} className="w-[100%] p-3 border rounded-[6px] bg-card"
            >
              <option value="postulante">Postulante</option>
              <option value="entrevista">En Entrevista</option>
              <option value="seleccionado">Seleccionado</option>
              <option value="contratado">Contratado</option>
              <option value="rechazado">Rechazado</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="candidatos-cv-url" className="block text-[0.875rem] font-semibold mb-2">
              URL del CV
            </label>
            <input id="candidatos-cv-url"
              type="url"
              value={formData.cv_url}
              onChange={(e) => setFormData({...formData, cv_url: e.target.value})} className="w-[100%] p-3 border rounded-[6px]"
              placeholder="https://drive.google.com/file/..."
            />
          </div>

          <div>
            <label htmlFor="candidatos-linkedin-url" className="block text-[0.875rem] font-semibold mb-2">
              LinkedIn
            </label>
            <input id="candidatos-linkedin-url"
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
        <label htmlFor="candidatos-observaciones" className="block text-[0.875rem] font-semibold mb-2">
          Observaciones
        </label>
        <textarea id="candidatos-observaciones"
          value={formData.observaciones}
          onChange={(e) => setFormData({...formData, observaciones: e.target.value})}
          rows={3} className="w-[100%] p-3 border rounded-[6px]"
          placeholder="Notas sobre entrevistas, fortalezas detectadas, etc..."
        />
      </div>

      {/* Botones */}
      <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-3 border-t border-border bg-background px-4 pb-1 pt-4 sm:static sm:mx-0 sm:flex-row sm:justify-end sm:px-0">
        <button
          type="button"
          onClick={onCancel} className="rounded-md border border-border bg-background px-6 py-3 font-medium text-foreground hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? (
            <><Clock3 className="size-4 animate-pulse" aria-hidden="true" /> Guardando...</>
          ) : (
            <>{candidato?.id ? <Edit2 className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}{candidato?.id ? 'Actualizar' : 'Registrar'} Candidato</>
          )}
        </button>
      </div>
    </form>
  );
}

export default CandidatosPage;
