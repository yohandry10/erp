"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/use-api";
import { parseDateLocal } from "@/lib/date-utils";
import toast from "react-hot-toast";
import {
  Plus,
  RefreshCw,
  Package,
  Clock,
  CheckCircle,
  FileText,
  Eye,
} from "lucide-react";

interface OrdenCompra {
  id: string;
  numero: string;
  proveedor_id: string;
  fecha_orden: string;
  fecha_entrega_esperada?: string;
  estado: string;
  subtotal: number;
  igv: number;
  total: number;
  moneda: string;
  proveedor?: {
    razon_social: string;
    ruc: string;
  };
  items?: Array<{
    producto_id: string;
    cantidad: number;
    cantidad_recibida?: number;
    producto_nombre?: string;
  }>;
  detalles?: Array<{
    id: string;
    producto_id: string;
    cantidad: number;
    cantidad_recibida: number;
    productos?: {
      nombre: string;
      codigo: string;
    };
  }>;
}

export default function RecepcionesPage() {
  const router = useRouter();
  const { get } = useApi();

  const [ordenesPendientes, setOrdenesPendientes] = useState<OrdenCompra[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrdenesPendientes = useCallback(async () => {
    try {
      setLoading(true);
      // Get orders that are APROBADA or PARCIAL (can receive items)
      const response = await get(
        "/api/compras/ordenes?estado=APROBADA,PARCIAL",
      );

      if (response?.success) {
        // El API expone las líneas como `items`; se normalizan al shape `detalles` que usa esta vista.
        const ordenes = (response.data || []).map((orden: OrdenCompra) => ({
          ...orden,
          detalles:
            orden.detalles && orden.detalles.length > 0
              ? orden.detalles
              : (orden.items || []).map((item, idx) => ({
                  id: `${orden.id}-${idx}`,
                  producto_id: item.producto_id,
                  cantidad: item.cantidad,
                  cantidad_recibida: item.cantidad_recibida ?? 0,
                  productos: {
                    nombre: item.producto_nombre || "Producto",
                    codigo: "",
                  },
                })),
        }));
        // Filter orders that have pending items to receive
        const ordenesPendientes = ordenes.filter((orden: OrdenCompra) => {
          if (!orden.detalles || orden.detalles.length === 0) return false;
          // Check if there are items with pending quantity
          return orden.detalles.some(
            (detalle) => (detalle.cantidad_recibida || 0) < detalle.cantidad,
          );
        });
        setOrdenesPendientes(ordenesPendientes);
      }
    } catch (error) {
      console.error("Error loading ordenes pendientes:", error);
      toast.error("Error: No se pudieron cargar las órdenes pendientes");
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    loadOrdenesPendientes();
  }, [loadOrdenesPendientes]);

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return "-";
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return parseDateLocal(dateString).toLocaleDateString("es-PE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const getPendingQuantity = (orden: OrdenCompra) => {
    if (!orden.detalles) return 0;
    return orden.detalles.reduce((total, detalle) => {
      return total + (detalle.cantidad - (detalle.cantidad_recibida || 0));
    }, 0);
  };

  const getReceivedPercentage = (orden: OrdenCompra) => {
    if (!orden.detalles || orden.detalles.length === 0) return 0;
    const totalCantidad = orden.detalles.reduce(
      (sum, d) => sum + d.cantidad,
      0,
    );
    const totalRecibida = orden.detalles.reduce(
      (sum, d) => sum + (d.cantidad_recibida || 0),
      0,
    );
    return totalCantidad > 0
      ? Math.round((totalRecibida / totalCantidad) * 100)
      : 0;
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Recepciones de Mercancía</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Selecciona una orden de compra para recepcionar mercancía
          </p>
        </div>
        <div className="flex gap-4 items-center">
          <button
            onClick={loadOrdenesPendientes}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 py-3 px-6"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5 grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] mb-8">
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>ÓRDENES PENDIENTES</h3>
            <Package className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-blue-500" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{ordenesPendientes.length}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Con items por recibir</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>APROBADAS</h3>
            <CheckCircle className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-[#10b981]" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">
            {ordenesPendientes.filter((o) => o.estado === "APROBADA").length}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Sin recepciones</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>PARCIALES</h3>
            <Clock className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-amber-500" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">
            {ordenesPendientes.filter((o) => o.estado === "PARCIAL").length}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Recepción parcial</div>
        </div>
      </div>

      {/* Content */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        {loading ? (
          <div className="flex min-h-48 items-center justify-center">
            <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
            <p>Cargando órdenes pendientes...</p>
          </div>
        ) : ordenesPendientes.length === 0 ? (
          <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl text-center p-12">
            <Package size={48} className="text-muted-foreground" />
            <h3 className="text-[1.125rem] font-semibold mb-2 text-foreground/85">
              No hay órdenes pendientes de recepción
            </h3>
            <p className="text-muted-foreground mb-6">
              Todas las órdenes aprobadas han sido recepcionadas completamente
            </p>
            <button
              onClick={() => router.push("/dashboard/compras/ordenes")}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              <FileText size={16} />
              Ver Órdenes de Compra
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,_minmax(400px,_1fr))] gap-6">
            {ordenesPendientes.map((orden) => {
              const pendingQty = getPendingQuantity(orden);
              const receivedPct = getReceivedPercentage(orden);

              return (
                <div
                  key={orden.id}
                  className="rounded-xl p-6 shadow border cursor-pointer transition relative overflow-hidden"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-4px)";
                    e.currentTarget.style.boxShadow = "var(--shadow-xl)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "var(--shadow-md)";
                  }}
                  onClick={() =>
                    router.push(
                      `/dashboard/compras/recepciones/nueva?orden_id=${orden.id}`,
                    )
                  }
                >
                  {/* Top Border Indicator */}
                  <div className="absolute top-0 left-0 right-0 h-[4px]" />

                  {/* Estado Badge */}
                  <div className="mb-4">
                    <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full text-xs font-medium text-white">
                      {orden.estado === "APROBADA" ? (
                        <CheckCircle size={14} />
                      ) : (
                        <Clock size={14} />
                      )}
                      {orden.estado === "APROBADA" ? "Aprobada" : "Parcial"}
                    </span>
                  </div>

                  {/* Order Number */}
                  <div className="mb-3">
                    <div className="text-[0.875rem] font-bold text-[var(--primary-800)] mb-1">
                      {orden.numero}
                    </div>
                    <div className="text-xs text-[var(--primary-500)]">
                      {formatDate(orden.fecha_orden)}
                    </div>
                  </div>

                  {/* Provider */}
                  <div className="mb-4">
                    <div className="text-[0.875rem] font-semibold text-[var(--primary-700)] mb-1">
                      {orden.proveedor?.razon_social || "Proveedor N/A"}
                    </div>
                    {orden.proveedor?.ruc && (
                      <div className="text-xs text-[var(--primary-500)]">
                        RUC: {orden.proveedor.ruc}
                      </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-[var(--primary-600)] font-semibold">
                        Progreso de Recepción
                      </span>
                      <span className="text-xs text-[var(--primary-600)] font-bold">
                        {receivedPct}%
                      </span>
                    </div>
                    <div className="w-[100%] h-2 bg-[var(--primary-200)] rounded-full overflow-hidden">
                      <div className="h-[100%] transition" />
                    </div>
                  </div>

                  {/* Pending Items */}
                  <div className="bg-[rgba(59,_130,_246,_0.1)] rounded-lg p-3 mb-4">
                    <div className="text-xs text-[var(--primary-600)] mb-1">
                      Items Pendientes
                    </div>
                    <div className="text-2xl font-bold text-blue-500">
                      {pendingQty}
                    </div>
                  </div>

                  {/* Total */}
                  <div className="bg-[rgba(16,_185,_129,_0.1)] rounded-lg p-3 mb-4">
                    <div className="text-xs text-[var(--primary-600)] mb-1">
                      Total Orden
                    </div>
                    <div className="text-xl font-bold text-[#10b981]">
                      {formatCurrency(orden.total)}
                    </div>
                  </div>

                  {/* Expected Delivery */}
                  {orden.fecha_entrega_esperada && (
                    <div className="flex items-center gap-2 text-xs text-[var(--primary-500)] mb-4">
                      <Clock size={14} />
                      <span>
                        Entrega esperada:{" "}
                        {formatDate(orden.fecha_entrega_esperada)}
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-4 border-t">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(
                          `/dashboard/compras/recepciones/nueva?orden_id=${orden.id}`,
                        );
                      }}
                      className="flex-[1] p-3 rounded-[6px] border-0 bg-blue-500 text-white cursor-pointer text-[0.875rem] font-semibold flex items-center justify-center gap-2 transition"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#2563eb";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#3b82f6";
                      }}
                    >
                      <Plus size={16} />
                      Recepcionar
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/dashboard/compras/ordenes/${orden.id}`);
                      }}
                      className="p-3 rounded-[6px] border bg-card text-[var(--primary-700)] cursor-pointer text-[0.875rem] font-semibold flex items-center justify-center transition"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--primary-50)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "white";
                      }}
                      title="Ver detalle de orden"
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
