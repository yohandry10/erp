"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/use-permission";
import { readMonitorSnapshot } from "@/lib/contabilidad/monitor-read-contract";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EventStats {
  pending: number;
  processed: number;
  processed_today: number;
  failed: number;
  dead_letter: number;
  avg_processing_time_ms: number | null;
}

interface EventoFallido {
  id: string;
  event_id: string;
  event_type: string;
  error_message: string | null;
  retry_count: number;
  status: string;
  created_at: string;
}

interface AsientoPorTipo {
  tipo: string;
  cantidad: number;
}

const metricCards: Array<{
  key: keyof EventStats;
  label: string;
  helper?: string;
  icon: typeof Activity;
}> = [
  {
    key: "pending",
    label: "Eventos pendientes",
    helper: "En cola contable",
    icon: Clock,
  },
  {
    key: "processed_today",
    label: "Procesados hoy",
    helper: "Ciclo actual",
    icon: CheckCircle,
  },
  {
    key: "failed",
    label: "Eventos con error",
    helper: "Requieren revisión",
    icon: AlertTriangle,
  },
  {
    key: "dead_letter",
    label: "Dead letter",
    helper: "Intervención manual",
    icon: XCircle,
  },
  {
    key: "processed",
    label: "Total procesados",
    helper: "Histórico operativo",
    icon: Activity,
  },
  {
    key: "avg_processing_time_ms",
    label: "Tiempo promedio",
    helper: "Latencia de procesamiento",
    icon: Clock,
  },
];

export default function MonitoreoPage() {
  const {session} = useAuth();
  return <MonitorWorkspace key={`${session?.user?.tenant_id || ''}:${session?.user?.id || ''}`} />;
}
function MonitorWorkspace() {
  const {session} = useAuth();
  const tenantId = session?.user?.tenant_id || '';
  const actorId = session?.user?.id || '';
  const permission = usePermission('contabilidad','reintentar','eventos');
  const canRetry = !permission.loading && permission.hasPermission;
  const latestRead = useRef(0);
  const writing = useRef(false);
  const [readReady,setReadReady] = useState(false);
  const [retrying,setRetrying] = useState(false);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [eventosFallidos, setEventosFallidos] = useState<EventoFallido[]>([]);
  const [asientosPorTipo, setAsientosPorTipo] = useState<AsientoPorTipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { apiCall: apiGet } = useApi<any>({
    requireLive: true,
    throwOnError: true,
    retries: 0,
    timeoutMs: 12000,
    showErrorToast: false,
  });

  const fetchData = useCallback(async () => {
    if (!tenantId || !actorId || writing.current) return;
    const request = ++latestRead.current;
    setRefreshing(true);setReadReady(false);setError(null);setStats(null);setEventosFallidos([]);setAsientosPorTipo([]);
    try {
      const [statsResult,failedResult,deadLetterResult,asientosTipoResult] = await Promise.all([
        apiGet('/contabilidad/eventos/estadisticas'),
        apiGet('/contabilidad/eventos/fallidos?limit=10'),
        apiGet('/contabilidad/eventos/dead-letter?limit=10'),
        apiGet('/contabilidad/asientos/estadisticas/por-tipo'),
      ]);
      const current = readMonitorSnapshot(statsResult,failedResult,deadLetterResult,asientosTipoResult,tenantId);
      if (request !== latestRead.current) return;
      setStats(current.stats);setEventosFallidos(current.events);setAsientosPorTipo(current.journals);setReadReady(true);
    } catch {
      if (request === latestRead.current) {
        setStats(null);setEventosFallidos([]);setAsientosPorTipo([]);setReadReady(false);
        setError('Monitoreo no disponible: no se pudo completar una lectura en vivo confiable. Reintente la consulta.');
      }
    } finally {if (request === latestRead.current) {setLoading(false);setRefreshing(false);}}
  },[apiGet,tenantId,actorId]);

  const handleRefresh = () => {void fetchData();};
  const handleRetry = async (eventId: string) => {
    if (!canRetry || !readReady || refreshing || error || writing.current || !eventosFallidos.some(e=>e.event_id===eventId)) return;
    const request = latestRead.current;
    writing.current=true;setRetrying(true);
    try {
      const response=await apiGet(`/contabilidad/eventos/${eventId}/reintentar`,{method:'POST'});
      if (request !== latestRead.current) return;
      if (response?.success !== true) throw new Error('OUTBOX_RETRY_REJECTED');
      writing.current=false;await fetchData();
    } catch {
      if (request === latestRead.current) setError('No se pudo reintentar el evento; verifique su estado, empresa y permisos');
    } finally {writing.current=false;setRetrying(false);}
  };
  useEffect(() => {
    void fetchData();
    const interval=setInterval(()=>{void fetchData();},30000);
    return ()=>{++latestRead.current;clearInterval(interval);};
  },[fetchData]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("es-PE", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getEventTypeLabel = (eventType: string) => {
    const labels: Record<string, string> = {
      VentaFacturada: "Venta Facturada",
      CobroRegistrado: "Cobro Registrado",
      RecepcionRegistrada: "Recepción Registrada",
      PagoProveedorRegistrado: "Pago Proveedor",
      AjusteInventarioAplicado: "Ajuste Inventario",
      PlanillaLiquidada: "Planilla Liquidada",
      DepreciacionGenerada: "Depreciación",
    };
    return labels[eventType] || eventType;
  };

  const formatProcessingTime = (ms: number | null) => {
    if (ms === null || ms === undefined) return "N/A";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const totalAsientos = asientosPorTipo.reduce(
    (sum, item) => sum + item.cantidad,
    0,
  );

  const metricValue = (key: keyof EventStats) => {
    if (key === "avg_processing_time_ms")
      return stats ? formatProcessingTime(stats.avg_processing_time_ms) : "—";
    return stats?.[key] ?? "—";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
        <Card className="mx-auto max-w-[1500px] border-cyan-400/20 bg-card/70 text-foreground">
          <CardHeader className="border-b border-cyan-400/10">
            <CardTitle>Monitoreo de Eventos Contables</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-[180px] items-center justify-center gap-3 p-6">
            <Activity className="h-7 w-7 animate-spin text-primary" />
            <span className="text-sm font-medium text-muted-foreground">
              Cargando datos de monitoreo...
            </span>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                ERP Event Control
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Monitoreo de Eventos Contables
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Cola, asientos generados, reintentos y eventos que requieren
                intervención contable.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing || retrying}
              className="gap-2 bg-blue-600 text-white shadow-lg shadow-blue-950/30 hover:bg-blue-500"
            >
              <RefreshCw
                className={cn("h-4 w-4", refreshing && "animate-spin")}
              />
              Actualizar
            </Button>
          </div>
        </section>

        {error && (
          <div role="alert" className="rounded-xl border border-blue-300/20 bg-blue-400/10 p-4 text-sm font-medium text-primary dark:text-blue-200">
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {metricCards.map(({ key, label, helper, icon: Icon }) => (
            <Card
              key={key}
              className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-primary/80">
                      {label}
                    </div>
                    <div className="mt-3 text-2xl font-bold text-foreground">
                      {metricValue(key)}
                    </div>
                    {helper && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {helper}
                      </div>
                    )}
                  </div>
                  <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-2 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        {readReady && stats ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
          <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
              <CardTitle className="text-base text-foreground">
                Asientos generados por tipo
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Distribución según el evento operativo que originó contabilidad.
              </p>
            </CardHeader>
            <CardContent className="p-4">
              {asientosPorTipo.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {asientosPorTipo.map((item) => (
                      <div
                        key={item.tipo}
                        className="rounded-xl border border-cyan-400/15 bg-white/[0.03] p-3"
                      >
                        <div className="truncate text-sm font-semibold text-foreground/90">
                          {getEventTypeLabel(item.tipo)}
                        </div>
                        <div className="mt-2 text-2xl font-bold text-primary">
                          {item.cantidad}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          asiento{item.cantidad !== 1 ? "s" : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-cyan-400/15 bg-cyan-400/10 px-4 py-3">
                    <span className="text-sm font-semibold text-primary">
                      Total de asientos generados
                    </span>
                    <span className="text-2xl font-bold text-foreground">
                      {totalAsientos}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-cyan-400/15 bg-white/[0.03] p-8 text-center text-sm text-muted-foreground">
                  No hay asientos clasificados por tipo en el periodo
                  consultado.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
              <CardTitle className="text-base text-foreground">
                Estado de cola
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Señales para detectar fallos de procesamiento sin abrir logs
                técnicos.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {[
                ["Pendientes", stats.pending],
                ["Procesados hoy", stats.processed_today],
                ["Fallidos", stats.failed],
                ["Dead letter", stats.dead_letter],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-xl border border-cyan-400/15 bg-white/[0.03] px-4 py-3"
                >
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-lg font-bold text-foreground">
                    {value}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        ) : <Card><CardContent className="p-6 text-muted-foreground">Monitoreo no disponible. Las métricas y eventos requieren una lectura completa en vivo.</CardContent></Card>}

        {readReady && (eventosFallidos.length > 0 ? (
          <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
              <CardTitle className="text-base text-foreground">
                Eventos fallidos y dead letter
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Últimos 10 eventos contables que requieren atención. Esta ventana no contiene toda la cola histórica.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-primary/80">
                  <tr>
                    <th className="px-5 py-3 text-left font-semibold">
                      Tipo de evento
                    </th>
                    <th className="px-5 py-3 text-left font-semibold">Error</th>
                    <th className="px-5 py-3 text-left font-semibold">
                      Reintentos
                    </th>
                    <th className="px-5 py-3 text-left font-semibold">Fecha</th>
                    <th className="px-5 py-3 text-left font-semibold">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {eventosFallidos.map((evento) => (
                    <tr key={evento.id} className="border-t border-cyan-400/10">
                      <td className="px-5 py-4 font-medium text-foreground">
                        {getEventTypeLabel(evento.event_type)}
                      </td>
                      <td className="max-w-[320px] px-5 py-4 text-muted-foreground">
                        <div className="truncate">
                          {evento.error_message || "Sin mensaje de error"}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-primary">
                          {evento.retry_count}/3
                        </span>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {formatDate(evento.created_at)}
                      </td>
                      <td className="px-5 py-4">
                        {canRetry && ["failed", "dead_letter"].includes(
                          evento.status.toLowerCase(),
                        ) ? (
                          <Button
                            type="button"
                            onClick={() => handleRetry(evento.event_id)}
                            disabled={retrying || refreshing || !readReady || !!error || !canRetry}
                            size="sm"
                            className="gap-2 bg-blue-600 text-white hover:bg-blue-500"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Reintentar
                          </Button>
                        ) : (
                          <span className="text-xs font-semibold text-primary dark:text-blue-200">
                            Requiere intervención manual
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
            <CardContent className="flex items-center justify-center gap-4 p-8 text-center">
              <CheckCircle className="h-10 w-10 text-primary" />
              <div className="text-left">
                <h3 className="text-lg font-semibold text-foreground">
                  Todo en orden
                </h3>
                <p className="text-sm text-muted-foreground">
                  No hay eventos fallidos en este momento.
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
