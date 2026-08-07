'use client'

import React, { useState, useCallback, useEffect } from 'react';
import { parseDateLocal } from '@/lib/date-utils'
import { useApi } from '@/hooks/use-api';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import PromptDialog from '@/components/ui/PromptDialog';
import { fetchApi } from '@/lib/api-fetch';
import { AlertTriangle, CheckCircle2, DollarSign, Download, FilePlus2, FileText, MessageSquare, RefreshCw, User, XCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContractFormDialog } from './ContractFormDialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCountryContext } from '@/hooks/use-country-context';

const ContratosPage = () => {
  const country = useCountryContext();
  const isArgentina = country.paisCodigo === 'AR';
  const isColombia = country.paisCodigo === 'CO';
  const currencySymbol = country.simboloMoneda || 'S/';
  const locale = country.locale || 'es-PE';
  const contractTypes = isArgentina
    ? ['indefinido', 'plazo_fijo', 'temporada', 'eventual']
    : isColombia
      ? ['indefinido', 'fijo', 'obra_labor', 'prestacion_servicios']
      : ['indefinido', 'temporal', 'practicas', 'locacion_servicios'];
  const isActiveContract = (contrato: any) =>
    ['activo', 'vigente'].includes(String(contrato?.estado || '').toLowerCase());
  const [contratos, setContratos] = useState<any[]>([]);
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [contratoDetail, setContratoDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { get, post, put } = useApi();
  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED !== 'false';

  // Estado para diálogo de confirmación
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void | Promise<void>
    variant?: 'default' | 'danger' | 'warning'
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'default'
  });

  // Estado para diálogo de prompt
  const [promptDialog, setPromptDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    placeholder?: string
    onConfirm: (value: string) => void | Promise<void>
    variant?: 'default' | 'danger' | 'warning'
    multiline?: boolean
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'default'
  });

  const loadData = useCallback(async () => {
    if (!rrhhEnabled) {
      setContratos([]);
      setEmpleados([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);

      // Cargar contratos
      const contratosData = await get('/rrhh/contratos');
      setContratos(
        contratosData?.success && Array.isArray(contratosData.data)
          ? contratosData.data
          : Array.isArray(contratosData)
            ? contratosData
            : [],
      );

      // Cargar empleados
      const empleadosData = await get('/rrhh/empleados');
      setEmpleados(
        empleadosData?.success && Array.isArray(empleadosData.data)
          ? empleadosData.data
          : Array.isArray(empleadosData)
            ? empleadosData
            : [],
      );
    } catch (error) {
      console.error('Error cargando contratos:', error);
    } finally {
      setLoading(false);
    }
  }, [get, rrhhEnabled]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const renovarContrato = async (contratoId: string) => {
    setPromptDialog({
      isOpen: true,
      title: 'Renovar Contrato',
      message: '¿Por cuántos meses desea renovar el contrato?',
      placeholder: '12',
      variant: 'default',
      onConfirm: async (meses: string) => {
        if (!isNaN(Number(meses))) {
          try {
            await post(`/api/rrhh/contratos/${contratoId}/renovar`, {
              meses: parseInt(meses)
            });
            loadData();
          } catch (error) {
            console.error('Error renovando contrato:', error);
          }
        }
      }
    });
  };

  const finalizarContrato = async (contratoId: string) => {
    setPromptDialog({
      isOpen: true,
      title: 'Finalizar Contrato',
      message: 'Ingrese el motivo de finalización del contrato:',
      placeholder: 'Ej: Renuncia voluntaria, término de proyecto, etc.',
      variant: 'warning',
      multiline: true,
      onConfirm: async (motivo: string) => {
        try {
          await put(`/api/rrhh/contratos/${contratoId}/finalizar`, {
            motivo_finalizacion: motivo,
            fecha_finalizacion: new Date().toISOString().split('T')[0]
          });
          loadData();
        } catch (error) {
          console.error('Error finalizando contrato:', error);
        }
      }
    });
  };

  const generarContrato = async (contratoId: string) => {
    try {
      const response = await fetchApi(`/api/rrhh/contratos/${contratoId}/generar`);

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contrato-${contratoId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error generando contrato:', error);
    }
  };

  const filtrarContratos = () => {
    let filtrados = contratos;

    if (filtroEstado !== 'todos') {
      filtrados = filtrados.filter(c =>
        filtroEstado === 'activo' ? isActiveContract(c) : c.estado === filtroEstado,
      );
    }

    if (filtroTipo !== 'todos') {
      filtrados = filtrados.filter(c => c.tipo_contrato === filtroTipo);
    }

    return filtrados;
  };

  const getEstadoColor = (estado: string) => {
    const colores: Record<string, string> = {
      'activo': 'bg-emerald-500/10 text-emerald-400',
      'vencido': 'bg-destructive/10 text-destructive',
      'renovado': 'bg-primary/10 text-primary',
      'finalizado': 'bg-muted text-foreground',
      'en_periodo_prueba': 'bg-amber-500/10 text-amber-400'
    };
    return colores[estado] || 'bg-muted text-foreground';
  };

  const getTipoColor = (tipo: string) => {
    const colores: Record<string, string> = {
      'indefinido': 'bg-primary/10 text-primary',
      'temporal': 'bg-amber-500/10 text-amber-400',
      'fijo': 'bg-amber-500/10 text-amber-400',
      'obra_labor': 'bg-violet-500/10 text-violet-400',
      'prestacion_servicios': 'bg-violet-500/10 text-violet-400',
      'practicas': 'bg-violet-500/10 text-violet-400',
      'locacion_servicios': 'bg-violet-500/10 text-violet-400'
    };
    return colores[tipo] || 'bg-muted text-foreground';
  };

  const calcularEstadisticas = () => {
    const total = contratos.length;
    const activos = contratos.filter(isActiveContract).length;
    const vencidos = contratos.filter(c => c.estado === 'vencido').length;
    const porVencer = contratos.filter(c => {
      if (!c.fecha_fin) return false;
      const fechaFin = new Date(c.fecha_fin);
      const hoy = new Date();
      const diasParaVencer = Math.ceil((fechaFin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      return diasParaVencer <= 30 && diasParaVencer > 0;
    }).length;

    return { total, activos, vencidos, porVencer };
  };

  const getEmpleadoNombre = (empleadoId: string) => {
    const empleado = empleados.find(e => e.id === empleadoId);
    return empleado ? `${empleado.nombres} ${empleado.apellidos}` : 'N/A';
  };

  const calcularDiasRestantes = (fechaFin: string) => {
    if (!fechaFin) return null;
    const fin = new Date(fechaFin);
    const hoy = new Date();
    const dias = Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
    return dias;
  };

  if (!rrhhEnabled) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="alert alert-warning">
          <h1 className="text-xl font-semibold">RRHH deshabilitado</h1>
          <p className="text-sm text-foreground/80">
            {/* // HARDENING: contratos bloqueados hasta finalizar validaciones legales. */}
            La gestión de contratos estará disponible cuando el módulo de RRHH se habilite en este entorno.
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
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Gestión de Contratos</h1>
            <p className="mt-2 text-base text-muted-foreground">Cargando contratos laborales, empleados vinculados y estados de renovación.</p>
          </div>
        </div>
        <div className="flex min-h-48 items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card/70 text-muted-foreground shadow-sm">
          <div className="inline-block size-7 animate-spin rounded-full border-[3px] border-muted border-t-primary" aria-hidden="true"></div>
          <p className="text-sm font-medium">Cargando contratos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Gestión de Contratos</h1>
          <p className="mt-2 text-base text-muted-foreground">Control de contratos laborales y renovaciones</p>
        </div>
        <div className="flex gap-4">
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => setShowModal(true)}
          >
            <FilePlus2 className="size-4" aria-hidden="true" /> Nuevo Contrato
          </button>
          <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50" onClick={loadData}>
            <RefreshCw className="size-4" aria-hidden="true" /> Actualizar
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5 mb-6">
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Total Contratos</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="size-5" aria-hidden="true" /></div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-primary">{stats.total}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Contratos registrados</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Activos</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><CheckCircle2 className="size-5" aria-hidden="true" /></div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-emerald-400">{stats.activos}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Contratos vigentes</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Por Vencer</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><AlertTriangle className="size-5" aria-hidden="true" /></div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-amber-400">{stats.porVencer}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Próximos 30 días</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Vencidos</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><XCircle className="size-5" aria-hidden="true" /></div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-destructive">{stats.vencidos}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Requieren renovación</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-6 grid gap-4 rounded-2xl border border-border bg-card/80 p-4 sm:grid-cols-2">
        <div className="min-w-0">
          <Label htmlFor="filtro-estado-contratos" className="mb-2">Estado</Label>
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger id="filtro-estado-contratos" aria-label="Filtrar contratos por estado"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="activo">Activo</SelectItem>
              <SelectItem value="vencido">Vencido</SelectItem>
              <SelectItem value="renovado">Renovado</SelectItem>
              <SelectItem value="finalizado">Finalizado</SelectItem>
              <SelectItem value="en_periodo_prueba">En Período Prueba</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0">
          <Label htmlFor="filtro-tipo-contratos" className="mb-2">Tipo</Label>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger id="filtro-tipo-contratos" aria-label="Filtrar contratos por tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {contractTypes.map((tipo) => (
                <SelectItem key={tipo} value={tipo}>{tipo.replace(/_/g, ' ').toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabla de contratos */}
      <div className="table-container">
        <div className="table-header">
          <h2>Lista de Contratos ({filtrarContratos().length})</h2>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Tipo Contrato</th>
                <th>Salario</th>
                <th>Fecha Inicio</th>
                <th>Fecha Fin</th>
                <th>Días Restantes</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrarContratos().map((contrato) => {
                const diasRestantes = calcularDiasRestantes(contrato.fecha_fin);
                let alertaVencimiento = '';
                if (diasRestantes !== null) {
                  if (diasRestantes < 0) alertaVencimiento = 'text-destructive font-bold';
                  else if (diasRestantes <= 30) alertaVencimiento = 'text-amber-400 font-bold';
                }

                return (
                  <tr key={contrato.id}>
                    <td>
                      <div>
                        <div className="font-medium">{getEmpleadoNombre(contrato.empleado_id)}</div>
                        <div className="text-sm text-muted-foreground">ID: {contrato.id.substring(0, 8)}...</div>
                      </div>
                    </td>
                    <td>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getTipoColor(contrato.tipo_contrato)}`}>
                        {contrato.tipo_contrato?.replace('_', ' ').toUpperCase() || 'N/A'}
                      </span>
                    </td>
                    <td className="text-right font-medium">{currencySymbol} {(contrato.salario || 0).toLocaleString(locale)}</td>
                    <td>{parseDateLocal(contrato.fecha_inicio).toLocaleDateString(locale)}</td>
                    <td>{contrato.fecha_fin ? parseDateLocal(contrato.fecha_fin).toLocaleDateString(locale) : 'Indefinido'}</td>
                    <td className={alertaVencimiento}>
                      {diasRestantes !== null ? (
                        diasRestantes < 0 ?
                          `Vencido hace ${Math.abs(diasRestantes)} días` :
                          `${diasRestantes} días`
                      ) : 'Indefinido'}
                    </td>
                    <td>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getEstadoColor(contrato.estado)}`}>
                        {contrato.estado?.replace('_', ' ').toUpperCase() || 'ACTIVO'}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => generarContrato(contrato.id)}
                          className="action-btn bg-blue-500 hover:bg-blue-600 text-white"
                          title="Generar PDF"
                        >
                          📄
                        </button>

                        {isActiveContract(contrato) && (
                          <>
                            <button
                              onClick={() => renovarContrato(contrato.id)}
                              className="action-btn bg-green-500 hover:bg-green-600 text-white"
                              title="Renovar"
                            >
                              🔄
                            </button>
                            <button
                              onClick={() => finalizarContrato(contrato.id)}
                              className="action-btn bg-red-500 hover:bg-red-600 text-white"
                              title="Finalizar"
                            >
                              ❌
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => {
                            setContratoDetail(contrato);
                            setShowDetailModal(true);
                          }}
                          className="action-btn bg-gray-500 hover:bg-gray-600 text-white"
                          title="Ver Detalles"
                        >
                          👁️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtrarContratos().length === 0 && (
            <div className="text-center p-8 text-muted-foreground">
              No hay contratos que coincidan con los filtros seleccionados.
            </div>
          )}
        </div>
      </div>

      {/* Alertas de vencimiento */}
      {stats.porVencer > 0 && (
        <div className="mt-8 p-4 bg-[#fef3c7] border rounded-lg">
          <h3 className="text-[#92400e] mt-0 mr-0 mb-2 ml-0">
            ⚠️ Contratos por Vencer
          </h3>
          <p className="text-[#92400e] m-0">
            Hay {stats.porVencer} contrato(s) que vencen en los próximos 30 días.
            Revisar la tabla para tomar las acciones necesarias.
          </p>
        </div>
      )}

      {/* Resumen por tipo */}
      <div className="table-container mt-6">
        <div className="table-header">
          <h2>Resumen por Tipo de Contrato</h2>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tipo de Contrato</th>
                <th>Total</th>
                <th>Activos</th>
                <th>Vencidos</th>
                <th>Salario Promedio</th>
              </tr>
            </thead>
            <tbody>
              {contractTypes.map(tipo => {
                const contratosTipo = contratos.filter(c => c.tipo_contrato === tipo);
                const activos = contratosTipo.filter(isActiveContract).length;
                const vencidos = contratosTipo.filter(c => c.estado === 'vencido').length;
                const salarioPromedio = contratosTipo.length > 0
                  ? contratosTipo.reduce((sum, c) => sum + (c.salario || 0), 0) / contratosTipo.length
                  : 0;

                return (
                  <tr key={tipo}>
                    <td>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getTipoColor(tipo)}`}>
                        {tipo.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="text-center">{contratosTipo.length}</td>
                    <td className="text-center text-emerald-400">{activos}</td>
                    <td className="text-center text-destructive">{vencidos}</td>
                    <td className="text-right">{currencySymbol} {salarioPromedio.toLocaleString(locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalle del Contrato */}
      <Dialog
        open={showDetailModal && Boolean(contratoDetail)}
        onOpenChange={(open) => {
          setShowDetailModal(open);
          if (!open) {
            setShowDetailModal(false);
            setContratoDetail(null);
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-3xl gap-0 overflow-y-auto p-0 sm:max-h-[calc(100dvh-2rem)]">
          <DialogHeader className="sticky top-0 z-10 border-b border-border bg-background px-5 py-5 pr-12 sm:px-6">
            <DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl"><FileText className="size-5 text-primary" aria-hidden="true" /> Detalle del contrato</DialogTitle>
            <DialogDescription>Información completa del contrato laboral.</DialogDescription>
          </DialogHeader>

            {/* Contenido */}
            {contratoDetail && <div className="p-4 sm:p-6">
              {/* Información del Empleado */}
              <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4 sm:p-6">
                <h3 className="text-[1.125rem] font-semibold text-foreground mt-0 mr-0 mb-4 ml-0 flex items-center gap-2">
                  <User className="size-5 text-primary" aria-hidden="true" /> Información del Empleado
                </h3>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      EMPLEADO
                    </label>
                    <div className="text-base font-semibold text-foreground/85">
                      {getEmpleadoNombre(contratoDetail?.empleado_id || '')}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      ID CONTRATO
                    </label>
                    <div className="text-[0.875rem] text-muted-foreground">
                      {contratoDetail?.id}
                    </div>
                  </div>
                </div>
              </div>

              {/* Detalles del Contrato */}
              <div className="mb-6 rounded-lg border border-border bg-accent/35 p-4 sm:p-6">
                <h3 className="m-0 mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <FileText className="size-5 text-primary" aria-hidden="true" /> Detalles del Contrato
                </h3>

                <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      TIPO DE CONTRATO
                    </label>
                    <span className="inline-block py-2 px-4 rounded-[6px] text-[0.875rem] font-semibold">
                      {contratoDetail.tipo_contrato?.replace('_', ' ').toUpperCase() || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      ESTADO
                    </label>
                    <span className="inline-block py-2 px-4 rounded-[6px] text-[0.875rem] font-semibold">
                      {contratoDetail.estado?.replace('_', ' ').toUpperCase() || 'ACTIVO'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      FECHA INICIO
                    </label>
                    <div className="text-[0.875rem] font-medium text-foreground/85">
                      {parseDateLocal(contratoDetail.fecha_inicio).toLocaleDateString('es-PE', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      FECHA FIN
                    </label>
                    <div className="text-[0.875rem] font-medium text-foreground/85">
                      {contratoDetail.fecha_fin ?
                        parseDateLocal(contratoDetail.fecha_fin).toLocaleDateString('es-PE', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        }) :
                        'Indefinido'
                      }
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      DÍAS RESTANTES
                    </label>
                    <div className="text-[0.875rem] font-semibold">
                      {(() => {
                        const dias = calcularDiasRestantes(contratoDetail.fecha_fin);
                        if (dias === null) return 'Indefinido';
                        if (dias < 0) return `Vencido hace ${Math.abs(dias)} días`;
                        return `${dias} días`;
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Información Económica */}
              <div className="mb-6 rounded-lg border border-amber-500/25 bg-amber-500/10 p-4 sm:p-6">
                <h3 className="m-0 mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <DollarSign className="size-5 text-amber-400 dark:text-amber-400" aria-hidden="true" /> Información Económica
                </h3>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      SALARIO MENSUAL
                    </label>
                    <div className="text-2xl font-bold text-emerald-400 dark:text-emerald-400">
                      {currencySymbol} {(contratoDetail.salario || 0).toLocaleString(locale)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      BENEFICIOS
                    </label>
                    <div className="text-[0.875rem] font-medium text-foreground/85">
                      {contratoDetail.beneficios || 'Beneficios estándar según ley'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Observaciones */}
              {contratoDetail.observaciones && (
                <div className="mb-6 p-6 bg-muted rounded-lg border">
                  <h3 className="m-0 mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                    <MessageSquare className="size-5 text-primary" aria-hidden="true" /> Observaciones
                  </h3>
                  <div className="text-[0.875rem] text-foreground/80 leading-6">
                    {contratoDetail.observaciones}
                  </div>
                </div>
              )}

              {/* Botones de Acción */}
              <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <button
                  onClick={() => generarContrato(contratoDetail.id)} className="py-3 px-6 border-0 rounded-[6px] bg-blue-500 text-white cursor-pointer font-medium flex items-center gap-2"
                >
                  <Download className="size-4" aria-hidden="true" /> Descargar PDF
                </button>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setContratoDetail(null);
                  }} className="py-3 px-6 border rounded-[6px] bg-card text-foreground/85 cursor-pointer font-medium"
                >
                  Cerrar
                </button>
              </div>
            </div>}
        </DialogContent>
      </Dialog>

      <ContractFormDialog
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={loadData}
        empleados={empleados}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
      />

      <PromptDialog
        isOpen={promptDialog.isOpen}
        onClose={() => setPromptDialog({ ...promptDialog, isOpen: false })}
        onConfirm={promptDialog.onConfirm}
        title={promptDialog.title}
        message={promptDialog.message}
        placeholder={promptDialog.placeholder}
        variant={promptDialog.variant}
        multiline={promptDialog.multiline}
      />
    </div>
  );
};

export default ContratosPage;
