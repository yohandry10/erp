'use client'

import React, { useState, useCallback, useEffect } from 'react';
import { parseDateLocal } from '@/lib/date-utils'
import { useApi } from '@/hooks/use-api';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { fetchApi } from '@/lib/api-fetch';
import { Banknote, CheckCircle2, Clock3, Receipt, RefreshCw } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCountryContext } from '@/hooks/use-country-context';

const PagosPage = () => {
  const country = useCountryContext();
  const isArgentina = country.paisCodigo === 'AR';
  const isColombia = country.paisCodigo === 'CO';
  const currencySymbol = country.simboloMoneda || 'S/';
  const locale = country.locale || 'es-PE';
  const [pagos, setPagos] = useState<any[]>([]);
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [planillas, setPlanillas] = useState<any[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroPeriodo, setFiltroPeriodo] = useState('todos');
  const [loading, setLoading] = useState(true);
  const { get, put } = useApi();

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

  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED === 'true';

  const loadData = useCallback(async () => {
    if (!rrhhEnabled) {
      setPagos([]);
      setEmpleados([]);
      setPlanillas([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);

      // Cargar pagos
      console.log('🔍 [Frontend] Cargando pagos desde /api/rrhh/pagos...');
      const pagosResponse = await get('/api/rrhh/pagos');
      console.log('📦 [Frontend] Respuesta pagos:', pagosResponse);

      // Verificar si la respuesta tiene la estructura correcta
      let pagosData = [];
      if (pagosResponse?.success && Array.isArray(pagosResponse.data)) {
        pagosData = pagosResponse.data;
        console.log(`✅ [Frontend] Estructura correcta - ${pagosData.length} pagos recibidos`);
      } else if (Array.isArray(pagosResponse)) {
        pagosData = pagosResponse;
        console.log(`✅ [Frontend] Array directo - ${pagosData.length} pagos recibidos`);
      } else {
        console.warn('⚠️ [Frontend] Respuesta no es array:', typeof pagosResponse, pagosResponse);
      }

      setPagos(pagosData);
      console.log(`🎯 [Frontend] Estado actualizado con ${pagosData.length} pagos`);

      // Cargar empleados
      const empleadosData = await get('/api/rrhh/empleados');
      if (empleadosData && Array.isArray(empleadosData)) {
        setEmpleados(empleadosData);
      }

      // Cargar planillas
      const planillasData = await get('/api/rrhh/planillas');
      if (planillasData && Array.isArray(planillasData)) {
        setPlanillas(planillasData);
      }
    } catch (error) {
      console.error('Error cargando pagos:', error);
    } finally {
      setLoading(false);
    }
  }, [get, rrhhEnabled]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const procesarPago = async (pagoId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Procesar Pago',
      message: '¿Confirmar el pago?\n\nEsta acción no se puede deshacer.',
      variant: 'warning',
      onConfirm: async () => {
        try {
          await put(`/api/rrhh/pagos/${pagoId}/procesar`);
          loadData();
        } catch (error) {
          console.error('Error procesando pago:', error);
        }
      }
    });
  };

  const generarComprobante = async (pagoId: string) => {
    try {
      const response = await fetchApi(`/api/rrhh/pagos/${pagoId}/comprobante`);

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `comprobante-pago-${pagoId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error generando comprobante:', error);
    }
  };

  const filtrarPagos = () => {
    let filtrados = pagos;

    if (filtroEstado !== 'todos') {
      filtrados = filtrados.filter(p => p.estado === filtroEstado);
    }

    if (filtroPeriodo !== 'todos') {
      filtrados = filtrados.filter(p => p.periodo === filtroPeriodo);
    }

    return filtrados;
  };

  const getEstadoColor = (estado: string) => {
    const colores: Record<string, string> = {
      'pendiente': 'bg-amber-500/10 text-amber-400',
      'procesado': 'bg-emerald-500/10 text-emerald-400',
      'rechazado': 'bg-destructive/10 text-destructive'
    };
    return colores[estado] || 'bg-muted text-foreground';
  };

  const calcularEstadisticas = () => {
    const total = pagos.length;
    const pendientes = pagos.filter(p => p.estado === 'pendiente').length;
    const procesados = pagos.filter(p => p.estado === 'procesado').length;
    const montoTotal = pagos.filter(p => p.estado === 'procesado').reduce((sum, p) => sum + (p.monto_neto || 0), 0);

    return { total, pendientes, procesados, montoTotal };
  };

  const getEmpleadoNombre = (empleadoId: string) => {
    const empleado = empleados.find(e => e.id === empleadoId);
    return empleado ? `${empleado.nombres} ${empleado.apellidos}` : 'N/A';
  };

  const getPeriodosUnicos = () => {
    const periodos = [...new Set(pagos.map(p => p.periodo))];
    return periodos.sort().reverse();
  };

  if (!rrhhEnabled) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="alert alert-warning">
          <h1 className="text-xl font-semibold">RRHH deshabilitado</h1>
          <p className="text-sm text-foreground/80">
            {/* // HARDENING: pagos RRHH bloqueados hasta completar la validación legal. */}
            El seguimiento de pagos de planilla estará disponible cuando el módulo de RRHH se habilite en este entorno.
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
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Pagos & Comprobantes</h1>
            <p className="mt-2 text-base text-muted-foreground">Cargando pagos de empleados, planillas y comprobantes asociados.</p>
          </div>
        </div>
        <div className="flex min-h-48 items-center justify-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p>Cargando pagos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Pagos & Comprobantes</h1>
          <p className="mt-2 text-base text-muted-foreground">Control de pagos mensuales a empleados</p>
        </div>
        <div className="flex gap-4">
          <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50" onClick={loadData}>
            <RefreshCw className="size-4" aria-hidden="true" /> Actualizar
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5 mb-6">
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Total Pagos</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Receipt className="size-5" aria-hidden="true" /></div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-primary">{stats.total}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Registros de pago</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Pendientes</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Clock3 className="size-5" aria-hidden="true" /></div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-amber-400">{stats.pendientes}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Por procesar</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Procesados</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><CheckCircle2 className="size-5" aria-hidden="true" /></div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-emerald-400">{stats.procesados}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Pagos completados</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Monto Total</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Banknote className="size-5" aria-hidden="true" /></div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-violet-400">{currencySymbol} {stats.montoTotal.toLocaleString(locale)}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Pagos procesados</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-6 grid gap-4 rounded-2xl border border-border bg-card/80 p-4 sm:grid-cols-2">
        <div className="min-w-0">
          <Label htmlFor="filtro-estado-pagos" className="mb-2">Estado</Label>
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger id="filtro-estado-pagos" aria-label="Filtrar pagos por estado"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
              <SelectItem value="procesado">Procesado</SelectItem>
              <SelectItem value="rechazado">Rechazado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0">
          <Label htmlFor="filtro-periodo-pagos" className="mb-2">Período</Label>
          <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
            <SelectTrigger id="filtro-periodo-pagos" aria-label="Filtrar pagos por período"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {getPeriodosUnicos().map(periodo => (
                <SelectItem key={periodo} value={periodo}>{periodo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabla de pagos */}
      <div className="table-container">
        <div className="table-header">
          <h2>Control de Pagos ({filtrarPagos().length})</h2>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Período</th>
                <th>Sueldo Bruto</th>
                <th>Descuentos</th>
                <th>Monto Neto</th>
                <th>Fecha Pago</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrarPagos().map((pago) => (
                <tr key={pago.id}>
                  <td>
                    <div>
                      <div className="font-medium">{getEmpleadoNombre(pago.empleado_id)}</div>
                      <div className="text-sm text-muted-foreground">ID: {pago.empleado_id?.substring(0, 8)}...</div>
                    </div>
                  </td>
                  <td>{pago.periodo}</td>
                  <td className="text-right">{currencySymbol} {(pago.monto_bruto || 0).toLocaleString(locale)}</td>
                  <td className="text-right text-destructive">{currencySymbol} {(pago.total_descuentos || 0).toLocaleString(locale)}</td>
                  <td className="text-right font-bold text-emerald-400">{currencySymbol} {(pago.monto_neto || 0).toLocaleString(locale)}</td>
                  <td>{pago.fecha_pago ? parseDateLocal(pago.fecha_pago).toLocaleDateString(locale) : '-'}</td>
                  <td>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getEstadoColor(pago.estado)}`}>
                      {pago.estado?.toUpperCase() || 'PENDIENTE'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      {pago.estado === 'pendiente' && (
                        <button
                          onClick={() => procesarPago(pago.id)}
                          className="action-btn bg-green-500 hover:bg-green-600 text-white"
                          title="Procesar Pago"
                        >
                          💰 Pagar
                        </button>
                      )}
                      {pago.estado === 'procesado' && (
                        <button
                          onClick={() => generarComprobante(pago.id)}
                          className="action-btn bg-blue-500 hover:bg-blue-600 text-white"
                          title="Descargar Comprobante"
                        >
                          📄 Comprobante
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const detalles = `
DETALLE DEL PAGO
Empleado: ${getEmpleadoNombre(pago.empleado_id)}
Período: ${pago.periodo}
Sueldo Bruto: ${currencySymbol} ${(pago.monto_bruto || 0).toLocaleString(locale)}
${isArgentina ? 'SIPA/INSSJP/obra social' : isColombia ? 'Salud/pensión/FSP' : 'AFP/ONP'}: ${currencySymbol} ${(pago.descuento_afp || 0).toLocaleString(locale)}
${isArgentina ? 'Ganancias' : isColombia ? 'Retención en la fuente' : 'Renta 5ta'}: ${currencySymbol} ${(pago.descuento_renta || 0).toLocaleString(locale)}
Otros Desc.: ${currencySymbol} ${((pago.total_descuentos || 0) - (pago.descuento_afp || 0) - (pago.descuento_renta || 0)).toLocaleString(locale)}
Total Descuentos: ${currencySymbol} ${(pago.total_descuentos || 0).toLocaleString(locale)}
MONTO NETO: ${currencySymbol} ${(pago.monto_neto || 0).toLocaleString(locale)}
                          `;
                          alert(detalles);
                        }}
                        className="action-btn bg-gray-500 hover:bg-gray-600 text-white"
                        title="Ver Detalles"
                      >
                        👁️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtrarPagos().length === 0 && (
            <div className="text-center p-8 text-muted-foreground">
              No hay pagos que coincidan con los filtros seleccionados.
            </div>
          )}
        </div>
      </div>

      {/* Resumen por empleado */}
      <div className="table-container mt-6">
        <div className="table-header">
          <h2>Resumen de Pagos por Empleado</h2>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Último Pago</th>
                <th>Estado Último</th>
                <th>Total Pagado (Año)</th>
                <th>Promedio Mensual</th>
              </tr>
            </thead>
            <tbody>
              {empleados.map((empleado) => {
                const pagosEmpleado = pagos.filter(p => p.empleado_id === empleado.id);
                const ultimoPago = pagosEmpleado.sort((a, b) => new Date(b.periodo).getTime() - new Date(a.periodo).getTime())[0];
                const totalPagado = pagosEmpleado.filter(p => p.estado === 'procesado').reduce((sum, p) => sum + (p.monto_neto || 0), 0);
                const promedioMensual = pagosEmpleado.length > 0 ? totalPagado / pagosEmpleado.filter(p => p.estado === 'procesado').length : 0;

                return (
                  <tr key={empleado.id}>
                    <td>
                      <div>
                        <div className="font-medium">{empleado.nombres} {empleado.apellidos}</div>
                        <div className="text-sm text-muted-foreground">{empleado.puesto || 'N/A'}</div>
                      </div>
                    </td>
                    <td>{ultimoPago?.periodo || 'Sin pagos'}</td>
                    <td>
                      {ultimoPago && (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getEstadoColor(ultimoPago.estado)}`}>
                          {ultimoPago.estado?.toUpperCase() || 'N/A'}
                        </span>
                      )}
                    </td>
                    <td className="text-right font-bold">{currencySymbol} {totalPagado.toLocaleString(locale)}</td>
                    <td className="text-right">{currencySymbol} {promedioMensual.toLocaleString(locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
      />
    </div>
  );
};

export default PagosPage;
