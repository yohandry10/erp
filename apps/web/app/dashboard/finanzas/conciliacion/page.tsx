"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/use-api";
import { formatDate as formatDateOnly } from "@/lib/format-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocalizedMoney } from "@/hooks/use-localized-money";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  RefreshCw,
  FileCheck,
  Clock,
  CheckCircle,
  AlertCircle,
  Eye,
  XCircle,
} from "lucide-react";

interface Conciliacion {
  id: string;
  periodo: string;
  estado: "ABIERTA" | "EN_PROCESO" | "CERRADA";
  fecha_desde: string;
  fecha_hasta: string;
  saldo_libro: number;
  saldo_banco: number;
  diferencia: number;
  items_conciliados: number;
  items_pendientes: number;
  created_at: string;
  updated_at: string;
  cuentas_bancarias?: {
    id: string;
    nombre: string;
    banco: string;
    numero_cuenta: string;
    moneda: string;
  };
}

type EstadoConciliacion = "ABIERTA" | "EN_PROCESO" | "CERRADA";

const ESTADOS_CONFIG: Record<
  EstadoConciliacion,
  {
    label: string;
    color: string;
    icon: any;
  }
> = {
  ABIERTA: {
    label: "Abierta",
    color: "#3b82f6",
    icon: Clock,
  },
  EN_PROCESO: {
    label: "En Proceso",
    color: "#f59e0b",
    icon: AlertCircle,
  },
  CERRADA: {
    label: "Cerrada",
    color: "#10b981",
    icon: CheckCircle,
  },
};

export default function ConciliacionPage() {
  const router = useRouter();
  const { get } = useApi();
  const { currency, formatCurrency: formatLocalizedCurrency } = useLocalizedMoney();

  const [conciliaciones, setConciliaciones] = useState<Conciliacion[]>([]);
  const [cuentasBancarias, setCuentasBancarias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [estadoFilter, setEstadoFilter] = useState<string>("");
  const [cuentaFilter, setCuentaFilter] = useState<string>("");
  const [showNewModal, setShowNewModal] = useState(false);

  const loadConciliaciones = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (estadoFilter) params.append("estado", estadoFilter);
      if (cuentaFilter) params.append("cuenta_bancaria_id", cuentaFilter);

      const response = await get(
        `/api/finanzas/conciliacion?${params.toString()}`,
      );

      if (response?.success) {
        const data = response.data || [];
        setConciliaciones(data);
      }
    } catch (error) {
      console.error("Error loading conciliaciones:", error);
      alert("Error: No se pudieron cargar las conciliaciones");
    } finally {
      setLoading(false);
    }
  }, [estadoFilter, cuentaFilter, get]);

  const loadCuentasBancarias = useCallback(async () => {
    try {
      const response = await get("/api/finanzas/bancos/cuentas?activa=true");
      if (response?.success) {
        setCuentasBancarias(response.data || []);
      }
    } catch (error) {
      console.error("Error loading cuentas bancarias:", error);
    }
  }, [get]);

  useEffect(() => {
    loadCuentasBancarias();
  }, [loadCuentasBancarias]);

  useEffect(() => {
    loadConciliaciones();
  }, [loadConciliaciones]);

  const handleClearFilters = () => {
    setEstadoFilter("");
    setCuentaFilter("");
  };

  const formatCurrency = (amount: number, moneda: string = currency) => {
    if (amount === undefined || amount === null) return "-";
    return formatLocalizedCurrency(amount, moneda);
  };

  const isFilterActive = estadoFilter || cuentaFilter;

  const getEstadoBadge = (estado: string) => {
    const config = ESTADOS_CONFIG[estado as EstadoConciliacion];
    if (!config) return null;

    const Icon = config.icon;

    return (
      <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full text-xs font-medium text-white">
        <Icon size={14} />
        {config.label}
      </span>
    );
  };

  const totalConciliaciones = conciliaciones.length;
  const abiertas = conciliaciones.filter((c) => c.estado === "ABIERTA").length;
  const enProceso = conciliaciones.filter(
    (c) => c.estado === "EN_PROCESO",
  ).length;
  const cerradas = conciliaciones.filter((c) => c.estado === "CERRADA").length;

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Conciliación Bancaria</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Concilia los movimientos bancarios con el sistema
          </p>
        </div>
        <div className="flex gap-4 items-center">
          <button onClick={loadConciliaciones} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50">
            <RefreshCw size={16} />
            Actualizar
          </button>
          <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50" onClick={() => setShowNewModal(true)}>
            <Plus size={20} />
            Nueva Conciliación
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5">
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>TOTAL</h3>
            <FileCheck className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-blue-500" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{totalConciliaciones}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Conciliaciones</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>ABIERTAS</h3>
            <Clock className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-blue-500" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{abiertas}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Por procesar</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>EN PROCESO</h3>
            <AlertCircle className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-amber-500" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{enProceso}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">En revisión</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>CERRADAS</h3>
            <CheckCircle className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-[#10b981]" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{cerradas}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Completadas</div>
        </div>
      </div>

      {/* Filters */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl mb-8">
        <div className="flex gap-4 flex-wrap items-end">
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="conciliacion-estado">Estado</Label>
            <Select value={estadoFilter || "TODOS"} onValueChange={(value) => setEstadoFilter(value === "TODOS" ? "" : value)}>
              <SelectTrigger id="conciliacion-estado" aria-label="Filtrar por estado" className="h-11 rounded-xl bg-background">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los estados</SelectItem>
                <SelectItem value="ABIERTA">Abierta</SelectItem>
                <SelectItem value="EN_PROCESO">En proceso</SelectItem>
                <SelectItem value="CERRADA">Cerrada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[200px] flex-1">
            <Label htmlFor="conciliacion-cuenta">Cuenta bancaria</Label>
            <Select value={cuentaFilter || "TODAS"} onValueChange={(value) => setCuentaFilter(value === "TODAS" ? "" : value)}>
              <SelectTrigger id="conciliacion-cuenta" aria-label="Filtrar por cuenta bancaria" className="h-11 rounded-xl bg-background">
                <SelectValue placeholder="Todas las cuentas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas las cuentas</SelectItem>
              {cuentasBancarias.map((cuenta) => (
                <SelectItem key={cuenta.id} value={cuenta.id}>
                  {cuenta.banco} - {cuenta.numero_cuenta}
                </SelectItem>
              ))}
              </SelectContent>
            </Select>
          </div>

          {isFilterActive && (
            <button
              onClick={handleClearFilters}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold leading-5 text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 text-red-500"
            >
              <XCircle size={16} />
              Limpiar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Content - List */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        {loading ? (
          <div className="flex min-h-48 items-center justify-center">
            <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
            <p>Cargando conciliaciones...</p>
          </div>
        ) : (
          <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
            {conciliaciones.length === 0 ? (
              <div className="text-center p-12 text-muted-foreground">
                <FileCheck size={48} className="text-muted-foreground" />
                <h3 className="text-[1.125rem] font-semibold mb-2">
                  No hay conciliaciones bancarias
                </h3>
                <p className="mb-6">
                  {isFilterActive
                    ? "No se encontraron conciliaciones con los filtros aplicados"
                    : "Crea una nueva conciliación para comenzar"}
                </p>
                {!isFilterActive && (
                  <button
                    onClick={() => setShowNewModal(true)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Plus size={16} />
                    Nueva Conciliación
                  </button>
                )}
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Cuenta Bancaria</th>
                    <th>Fechas</th>
                    <th className="text-right">Saldo Libro</th>
                    <th className="text-right">Saldo Banco</th>
                    <th className="text-right">Diferencia</th>
                    <th className="text-center">Progreso</th>
                    <th className="text-center">Estado</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {conciliaciones.map((conciliacion) => {
                    const totalItems =
                      (conciliacion.items_conciliados || 0) +
                      (conciliacion.items_pendientes || 0);
                    const progreso =
                      totalItems > 0
                        ? Math.round(
                            ((conciliacion.items_conciliados || 0) /
                              totalItems) *
                              100,
                          )
                        : 0;
                    const moneda =
                      conciliacion.cuentas_bancarias?.moneda || "PEN";

                    return (
                      <tr key={conciliacion.id}>
                        <td>
                          <div className="text-[0.875rem] font-semibold">
                            {conciliacion.periodo}
                          </div>
                        </td>
                        <td>
                          <div className="text-[0.875rem] font-medium">
                            {conciliacion.cuentas_bancarias?.banco || "N/A"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {conciliacion.cuentas_bancarias?.numero_cuenta ||
                              "N/A"}
                          </div>
                        </td>
                        <td>
                          <div className="text-[0.875rem]">
                            {formatDateOnly(conciliacion.fecha_desde)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            al {formatDateOnly(conciliacion.fecha_hasta)}
                          </div>
                        </td>
                        <td className="text-right text-[0.875rem] font-semibold">
                          {formatCurrency(conciliacion.saldo_libro, moneda)}
                        </td>
                        <td className="text-right text-[0.875rem] font-semibold">
                          {formatCurrency(conciliacion.saldo_banco, moneda)}
                        </td>
                        <td className="text-right">
                          <div className="text-[0.875rem] font-bold">
                            {formatCurrency(conciliacion.diferencia, moneda)}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-[100%] h-[6px] bg-[#e5e7eb] rounded-[3px] overflow-hidden">
                              <div className="h-[100%] transition" />
                            </div>
                            <div className="text-xs text-muted-foreground font-medium">
                              {conciliacion.items_conciliados || 0}/{totalItems}
                            </div>
                          </div>
                        </td>
                        <td className="text-center">
                          {getEstadoBadge(conciliacion.estado)}
                        </td>
                        <td className="text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() =>
                                router.push(
                                  `/dashboard/finanzas/conciliacion/${conciliacion.id}`,
                                )
                              }
                              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 text-xs py-2 px-4"
                            >
                              <Eye size={14} />
                              {conciliacion.estado === "CERRADA"
                                ? "Ver"
                                : "Procesar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <Dialog open={showNewModal} onOpenChange={setShowNewModal}>
        <DialogContent className="border-border bg-card text-card-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" aria-hidden="true" />
              Nueva conciliación bancaria
            </DialogTitle>
          </DialogHeader>
          <NewConciliacionForm
            cuentasBancarias={cuentasBancarias}
            onSuccess={() => {
              setShowNewModal(false);
              loadConciliaciones();
            }}
            onCancel={() => setShowNewModal(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// New Conciliacion Form Component
function NewConciliacionForm({
  cuentasBancarias,
  onSuccess,
  onCancel,
}: {
  cuentasBancarias: any[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  // Sin throwOnError el hook devuelve null en caso de error y el motivo real
  // del backend -por ejemplo el formato del periodo- nunca llega al usuario.
  const { post } = useApi({ throwOnError: true, showErrorToast: false });
  const [formData, setFormData] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const lastDay = String(
      new Date(year, now.getMonth() + 1, 0).getDate(),
    ).padStart(2, "0");

    return {
      // El valor visible y el enviado deben nacer sincronizados. Radix puede
      // resaltar la primera opción al abrir la lista aunque el estado sea vacío.
      cuenta_bancaria_id: cuentasBancarias[0]?.id || "",
      periodo: `${year}-${month}`,
      fecha_desde: `${year}-${month}-01`,
      fecha_hasta: `${year}-${month}-${lastDay}`,
    };
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(
    () => `recon-create:${crypto.randomUUID()}`,
  );

  useEffect(() => {
    if (!formData.cuenta_bancaria_id && cuentasBancarias[0]?.id) {
      setFormData((current) => ({
        ...current,
        cuenta_bancaria_id: cuentasBancarias[0].id,
      }));
    }
  }, [cuentasBancarias, formData.cuenta_bancaria_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.cuenta_bancaria_id ||
      !formData.periodo ||
      !formData.fecha_desde ||
      !formData.fecha_hasta
    ) {
      setErrorMessage(
        "Completa la cuenta bancaria, el período y el rango de fechas.",
      );
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");
      const response = await post("/api/finanzas/conciliacion", {
        ...formData,
        idempotency_key: idempotencyKey,
      });

      if (response?.success) {
        alert("✅ Conciliación creada exitosamente");
        onSuccess();
      } else {
        setErrorMessage(
          response?.message || "No se pudo crear la conciliación.",
        );
      }
    } catch (error) {
      console.error("Error creating conciliacion:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo crear la conciliación.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="nueva-conciliacion-cuenta">Cuenta bancaria *</Label>
          <Select
            value={formData.cuenta_bancaria_id}
            onValueChange={(value) => {
              setFormData({ ...formData, cuenta_bancaria_id: value });
              setIdempotencyKey(`recon-create:${crypto.randomUUID()}`);
            }}
          >
            <SelectTrigger id="nueva-conciliacion-cuenta" aria-label="Cuenta bancaria" className="h-11 rounded-xl bg-background">
              <SelectValue placeholder="Selecciona una cuenta" />
            </SelectTrigger>
            <SelectContent>
            {cuentasBancarias.map((cuenta) => (
              <SelectItem key={cuenta.id} value={cuenta.id}>
                {cuenta.banco} - {cuenta.numero_cuenta} ({cuenta.moneda})
              </SelectItem>
            ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="nueva-conciliacion-periodo">Período *</Label>
          <Input
            id="nueva-conciliacion-periodo"
            type="month"
            value={formData.periodo}
            onChange={(e) => {
              setFormData({ ...formData, periodo: e.target.value });
              setIdempotencyKey(`recon-create:${crypto.randomUUID()}`);
            }}
            placeholder="AAAA-MM"
            required
          />
        </div>

        <div>
          <Label htmlFor="nueva-conciliacion-desde">Fecha desde *</Label>
          <Input
            id="nueva-conciliacion-desde"
            type="date"
            value={formData.fecha_desde}
            onChange={(e) => {
              setFormData({ ...formData, fecha_desde: e.target.value });
              setIdempotencyKey(`recon-create:${crypto.randomUUID()}`);
            }}
            required
          />
        </div>

        <div>
          <Label htmlFor="nueva-conciliacion-hasta">Fecha hasta *</Label>
          <Input
            id="nueva-conciliacion-hasta"
            type="date"
            value={formData.fecha_hasta}
            onChange={(e) => {
              setFormData({ ...formData, fecha_hasta: e.target.value });
              setIdempotencyKey(`recon-create:${crypto.randomUUID()}`);
            }}
            required
          />
        </div>

        <div className="flex flex-wrap justify-end gap-3 pt-2">
          {errorMessage ? (
            <p
              role="alert"
              className="w-full rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errorMessage}
            </p>
          ) : null}
          <Button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            variant="outline"
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creando..." : "Crear Conciliación"}
          </Button>
        </div>
      </div>
    </form>
  );
}
