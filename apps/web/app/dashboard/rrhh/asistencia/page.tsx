'use client'

import React, { useState, useCallback, useEffect } from 'react';
import { useApi } from '@/hooks/use-api';

const AsistenciaPage = () => {
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [asistencias, setAsistencias] = useState<any[]>([]);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const { get, post } = useApi();
  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED === 'true';

  const normalizeArrayResponse = (response: any) => {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.data)) return response.data;
    return [];
  };

  const formatLocalDate = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('es-PE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const loadData = useCallback(async () => {
    if (!rrhhEnabled) {
      setEmpleados([]);
      setAsistencias([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);

      // Cargar empleados
      const empleadosData = await get('/api/rrhh/empleados');
      setEmpleados(normalizeArrayResponse(empleadosData));

      // Cargar asistencias del día
      const asistenciasData = await get(`/api/rrhh/asistencias?fecha=${fecha}`);
      setAsistencias(normalizeArrayResponse(asistenciasData));
    } catch (error) {
      console.error('Error cargando asistencias:', error);
    } finally {
      setLoading(false);
    }
  }, [fecha, get, rrhhEnabled]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const marcarAsistencia = async (empleadoId: string, tipo: 'entrada' | 'salida') => {
    try {
      await post('/api/rrhh/asistencias/marcar', {
        empleado_id: empleadoId,
        fecha,
        tipo,
        hora: new Date().toTimeString().split(' ')[0]
      });
      loadData();
    } catch (error) {
      console.error('Error marcando asistencia:', error);
    }
  };

  const getAsistenciaEmpleado = (empleadoId: string) => {
    return asistencias.find(a => a.empleado_id === empleadoId || a.id_empleado === empleadoId);
  };

  const calcularEstadisticas = () => {
    const presentes = asistencias.filter(a => a.hora_entrada).length;
    const ausentes = empleados.length - presentes;
    const completaron = asistencias.filter(a => a.hora_entrada && a.hora_salida).length;

    return { presentes, ausentes, completaron };
  };

  if (!rrhhEnabled) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="alert alert-warning">
          <h1 className="text-xl font-semibold">RRHH deshabilitado</h1>
          <p className="text-sm text-foreground/80">
            {/* // HARDENING: RRHH bloqueado hasta validar cálculo legal de planillas. */}
            Las funciones de asistencia estarán disponibles cuando el módulo de RRHH se habilite en este entorno.
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
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Control de Asistencia</h1>
            <p className="mt-2 text-base text-muted-foreground">Cargando asistencias del día, empleados y marcaciones de entrada o salida.</p>
          </div>
        </div>
        <div className="flex min-h-48 items-center justify-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p>Cargando asistencias...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Control de Asistencia</h1>
          <p className="mt-2 text-base text-muted-foreground">Marcado de entrada y salida del personal</p>
        </div>
        <div className="flex gap-4 items-center">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="form-control w-auto"
          />
          <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50" onClick={loadData}>
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* Estadísticas del día */}
      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5 mb-6">
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Presentes</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">✅</div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-emerald-400">{stats.presentes}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Con entrada registrada</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Ausentes</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">❌</div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-destructive">{stats.ausentes}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Sin entrada registrada</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Completaron</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">🎯</div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-primary">{stats.completaron}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Entrada y salida</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Trabajando</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">⏰</div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-amber-400">{stats.presentes - stats.completaron}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Actualmente en oficina</div>
        </div>
      </div>

      {/* Tabla de asistencias */}
      <div className="table-container">
        <div className="table-header">
          <h2>Asistencia del {formatLocalDate(fecha)}</h2>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Departamento</th>
                <th>Hora Entrada</th>
                <th>Hora Salida</th>
                <th>Horas Trabajadas</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empleados.map((empleado) => {
                const asistencia = getAsistenciaEmpleado(empleado.id);
                const horasT = asistencia?.hora_entrada && asistencia?.hora_salida
                  ? calcularHorasTrabajadas(asistencia.hora_entrada, asistencia.hora_salida)
                  : '-';

                let estado = '❌ Ausente';
                let estadoColor = 'text-destructive';

                if (asistencia?.hora_entrada && asistencia?.hora_salida) {
                  estado = '✅ Completo';
                  estadoColor = 'text-emerald-400';
                } else if (asistencia?.hora_entrada) {
                  estado = '⏰ Trabajando';
                  estadoColor = 'text-amber-400';
                }

                return (
                  <tr key={empleado.id}>
                    <td>
                      <div>
                        <div className="font-medium">{empleado.nombres} {empleado.apellidos}</div>
                        <div className="text-sm text-muted-foreground">{empleado.numero_documento || empleado.documento}</div>
                      </div>
                    </td>
                    <td>{empleado.departamento?.nombre || 'N/A'}</td>
                    <td>{asistencia?.hora_entrada || '-'}</td>
                    <td>{asistencia?.hora_salida || '-'}</td>
                    <td>{horasT}</td>
                    <td>
                      <span className={`font-medium ${estadoColor}`}>
                        {estado}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        {!asistencia?.hora_entrada ? (
                          <button
                            onClick={() => marcarAsistencia(empleado.id, 'entrada')}
                            className="action-btn bg-green-500 hover:bg-green-600 text-white"
                            title="Marcar Entrada"
                          >
                            ⏰ Entrada
                          </button>
                        ) : !asistencia?.hora_salida ? (
                          <button
                            onClick={() => marcarAsistencia(empleado.id, 'salida')}
                            className="action-btn bg-red-500 hover:bg-red-600 text-white"
                            title="Marcar Salida"
                          >
                            🚪 Salida
                          </button>
                        ) : (
                          <span className="text-sm text-muted-foreground">Completo</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const calcularHorasTrabajadas = (entrada: string, salida: string) => {
  try {
    const horaEntrada = new Date(`2000-01-01 ${entrada}`);
    const horaSalida = new Date(`2000-01-01 ${salida}`);
    const diffMs = horaSalida.getTime() - horaEntrada.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return `${diffHours.toFixed(1)}h`;
  } catch {
    return '-';
  }
};

export default AsistenciaPage;
