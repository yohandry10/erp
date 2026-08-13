"use client";

import React, { useState, useCallback, useEffect } from "react";
import { parseDateLocal } from "@/lib/date-utils";
import PlanillaModal from "@/components/modals/PlanillaModal";
import PlanillaCalcularModal from "@/components/modals/PlanillaCalcularModal";
import PlanillaPagarModal from "@/components/modals/PlanillaPagarModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useApi } from "@/hooks/use-api";
import { usePermission } from "@/hooks/use-permission";
import { apiSucceeded, unwrapApiArray } from "@/lib/api-contract";
import { fetchApi } from "@/lib/api-fetch";
import {
  BadgeCheck,
  Banknote,
  Calculator,
  BarChart3,
  CheckCircle,
  HelpCircle,
  Eye,
  FileDown,
  FileEdit,
  Hourglass,
  Rocket,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useCountryContext } from "@/hooks/use-country-context";

const PlanillasPage = () => {
  const country = useCountryContext();
  const isArgentina = country.paisCodigo === "AR";
  const isColombia = country.paisCodigo === "CO";
  const currencySymbol = country.simboloMoneda || "S/";
  const locale = country.locale || "es-PE";
  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED !== "false";
  const { get } = useApi();
  const { hasPermission: canCreatePayroll } = usePermission(
    "rrhh",
    "create",
    "planillas",
  );
  const { hasPermission: canCalculatePayroll } = usePermission(
    "rrhh",
    "calculate",
    "planillas",
  );
  const { hasPermission: canApprovePayroll } = usePermission(
    "rrhh",
    "approve",
    "planillas",
  );
  const { hasPermission: canPayPayroll } = usePermission(
    "rrhh",
    "pay",
    "planillas",
  );
  const [planillas, setPlanillas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detallePlanilla, setDetallePlanilla] = useState<any[]>([]);
  const [showDetalle, setShowDetalle] = useState(false);
  const [showPlanillaModal, setShowPlanillaModal] = useState(false);
  const [showCalcularModal, setShowCalcularModal] = useState(false);
  const [showPagarModal, setShowPagarModal] = useState(false);
  const [planillaSeleccionada, setPlanillaSeleccionada] = useState<any>(null);

  // Estado para diálogo de confirmación
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    variant?: "default" | "danger" | "warning";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    variant: "default",
  });

  const loadPlanillas = useCallback(async () => {
    if (!rrhhEnabled) {
      setPlanillas([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await get("/api/rrhh/planillas");
      if (apiSucceeded(response)) {
        setPlanillas(unwrapApiArray(response));
      } else {
        setPlanillas([]);
      }
    } catch {
      setPlanillas([]);
    } finally {
      setLoading(false);
    }
  }, [get, rrhhEnabled]);

  useEffect(() => {
    loadPlanillas();
  }, [loadPlanillas]);

  const abrirModalPlanilla = () => {
    setShowPlanillaModal(true);
  };

  const editarPlanilla = (planilla: any) => {
    // TODO: Implementar modal de edición de planilla
    alert(
      `🚧 Función en desarrollo\n\nPronto podrás editar la planilla ${planilla?.periodo}\n\nPor ahora puedes:\n• Ver el detalle\n• Generar reportes\n• Aprobar si está calculada`,
    );
  };

  const abrirCalcularPlanilla = (planilla: any) => {
    setPlanillaSeleccionada(planilla);
    setShowCalcularModal(true);
  };

  const abrirPagarPlanilla = (planilla: any) => {
    setPlanillaSeleccionada(planilla);
    setShowPagarModal(true);
  };

  const handleCalcularSuccess = () => {
    setShowCalcularModal(false);
    setPlanillaSeleccionada(null);
    loadPlanillas();
  };

  const handlePagarSuccess = () => {
    setShowPagarModal(false);
    setPlanillaSeleccionada(null);
    loadPlanillas();
  };

  const handlePlanillaSuccess = () => {
    setShowPlanillaModal(false);
    loadPlanillas();
  };

  const verDetallePlanilla = async (planillaId: string) => {
    try {
      setLoading(true);
      const response = await fetchApi(
        `/api/rrhh/planillas/${planillaId}/detalle`,
      );

      if (response.ok) {
        const data = await response.json();
        setDetallePlanilla(Array.isArray(data) ? data : []);
        setShowDetalle(true);
      } else {
        alert("Error cargando detalle de planilla");
      }
    } catch (error: any) {
      alert("Error cargando detalle: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const generarReporteProfesional = async (
    planillaId: string,
    periodo: string,
  ) => {
    try {
      const response = await fetchApi(
        `/api/rrhh/planillas/${planillaId}/detalle`,
      );

      if (response.ok) {
        const data = await response.json();

        if (!data || !Array.isArray(data) || data.length === 0) {
          alert(
            "⚠️ Esta planilla no tiene empleados calculados. Primero calcule la planilla.",
          );
          return;
        }

        // Generar reporte HTML profesional
        const html = generarReporteHTML(data, periodo);

        // Crear y descargar
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `reporte_planilla_${periodo}.html`);
        link.className = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error: any) {
      alert("Error generando reporte: " + error.message);
    }
  };

  const generarReporteHTML = (empleados: any[], periodo: string) => {
    if (!Array.isArray(empleados)) {
      empleados = [];
    }

    const totalIngresos = empleados.reduce(
      (sum, emp) => sum + (parseFloat(emp?.total_ingresos) || 0),
      0,
    );
    const totalDescuentos = empleados.reduce(
      (sum, emp) => sum + (parseFloat(emp?.total_descuentos) || 0),
      0,
    );
    const totalNeto = empleados.reduce(
      (sum, emp) => sum + (parseFloat(emp?.neto_pagar) || 0),
      0,
    );

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Reporte de Planilla ${periodo}</title>
    </head>
    <body>
        <div class="header">
            <div class="company">NEON SYSTEM</div>
            <div class="title">Reporte de Planilla - Período ${periodo}</div>
            <div>Generado el: ${new Date().toLocaleDateString(locale)}</div>
        </div>

        <div class="summary">
            <h3>Resumen Ejecutivo</h3>
            <p><strong>Total Empleados:</strong> ${empleados.length}</p>
            <p><strong>Total Ingresos:</strong> ${currencySymbol} ${totalIngresos.toFixed(2)}</p>
            <p><strong>Total Descuentos:</strong> ${currencySymbol} ${totalDescuentos.toFixed(2)}</p>
            <p><strong>Total Neto a Pagar:</strong> ${currencySymbol} ${totalNeto.toFixed(2)}</p>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Empleado</th>
                    <th>Documento</th>
                    <th class="number">Días</th>
                    <th class="number">Ingresos</th>
                    <th class="number">Descuentos</th>
                    <th class="number">Neto</th>
                </tr>
            </thead>
            <tbody>
                ${empleados
                  .map(
                    (emp) => `
                    <tr>
                        <td>${emp?.empleados?.nombres || "N/A"} ${emp?.empleados?.apellidos || ""}</td>
                        <td>${emp?.empleados?.numero_documento || "N/A"}</td>
                        <td class="number">${emp?.dias_trabajados || 0}</td>
                        <td class="number">${currencySymbol} ${(parseFloat(emp?.total_ingresos) || 0).toFixed(2)}</td>
                        <td class="number">${currencySymbol} ${(parseFloat(emp?.total_descuentos) || 0).toFixed(2)}</td>
                        <td class="number">${currencySymbol} ${(parseFloat(emp?.neto_pagar) || 0).toFixed(2)}</td>
                    </tr>
                `,
                  )
                  .join("")}
                <tr class="total-row">
                    <td colspan="3">TOTALES</td>
                    <td class="number">${currencySymbol} ${totalIngresos.toFixed(2)}</td>
                    <td class="number">${currencySymbol} ${totalDescuentos.toFixed(2)}</td>
                    <td class="number">${currencySymbol} ${totalNeto.toFixed(2)}</td>
                </tr>
            </tbody>
        </table>
    </body>
    </html>`;
  };

  const aprobarPlanilla = async (planillaId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Aprobar Planilla",
      message:
        "¿Está seguro de aprobar esta planilla?\n\nUna vez aprobada no se podrá modificar.",
      variant: "warning",
      onConfirm: async () => {
        try {
          const response = await fetchApi(
            `/api/rrhh/planillas/${planillaId}/aprobar`,
            {
              method: "POST",
            },
          );

          if (response.ok) {
            alert("✅ Planilla aprobada exitosamente");
            loadPlanillas();
          }
        } catch {}
      },
    });
  };

  const descargarBoleta = async (empleadoPlanillaId: string) => {
    try {
      const response = await fetchApi(`/api/rrhh/boleta/${empleadoPlanillaId}`);

      if (response.ok) {
        const data = await response.json();

        // Generar boleta HTML
        const html = generarBoletaHTML(data);

        // Crear y descargar
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute(
          "download",
          `${isColombia ? "desprendible_nomina" : isArgentina ? "recibo_sueldo" : "boleta"}_${data?.empleados?.nombres}_${data?.empleados?.apellidos}.html`,
        );
        link.className = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error: any) {
      alert("Error descargando boleta: " + error.message);
    }
  };

  const generarBoletaHTML = (data: any) => {
    if (!data) {
      data = {};
    }

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>${isColombia ? "Desprendible de nómina" : isArgentina ? "Recibo de sueldo" : "Boleta de pago"}</title>
    </head>
    <body>
        <div class="boleta">
            <div class="header">
                <div class="company">NEON SYSTEM</div>
                <div class="title">${isColombia ? "Desprendible de nómina" : isArgentina ? "Recibo de sueldo" : "Boleta de pago"}</div>
                <div>Período: ${data?.planillas?.periodo || "N/A"}</div>
            </div>

            <div class="empleado">
                <strong>Empleado:</strong> ${data?.empleados?.nombres || "N/A"} ${data?.empleados?.apellidos || ""}<br>
                <strong>Documento:</strong> ${data?.empleados?.numero_documento || "N/A"}<br>
                <strong>Puesto:</strong> ${data?.empleados?.puesto || "N/A"}<br>
                <strong>Fecha de Pago:</strong> ${data?.planillas?.fecha_pago ? parseDateLocal(data.planillas.fecha_pago).toLocaleDateString(locale) : "N/A"}
            </div>

            <div class="section">
                <div class="section-title">💰 INGRESOS</div>
                <div class="item">
                    <span>Sueldo Base</span>
                    <span class="amount positive">${currencySymbol} ${(parseFloat(data?.sueldo_base) || 0).toFixed(2)}</span>
                </div>
                <div class="item">
                    <span>Horas Extras ${isArgentina ? "50" : "25"}%</span>
                    <span class="amount positive">${currencySymbol} ${(parseFloat(data?.horas_extras_25) || 0).toFixed(2)}</span>
                </div>
                <div class="item">
                    <span>Horas Extras ${isArgentina ? "100" : isColombia ? "75" : "35"}%</span>
                    <span class="amount positive">${currencySymbol} ${(parseFloat(data?.horas_extras_35) || 0).toFixed(2)}</span>
                </div>
                <div class="item">
                    <span>${isColombia ? "Otros devengados" : isArgentina ? "Adicionales" : "Bonos adicionales"}</span>
                    <span class="amount positive">${currencySymbol} ${(parseFloat(data?.bonos_adicionales) || 0).toFixed(2)}</span>
                </div>
                <div class="item total">
                    <span>TOTAL INGRESOS</span>
                    <span class="amount positive">${currencySymbol} ${(parseFloat(data?.total_ingresos) || 0).toFixed(2)}</span>
                </div>
            </div>

            <div class="section">
                <div class="section-title">📉 DESCUENTOS</div>
                <div class="item">
                    <span>${isArgentina ? "SIPA / INSSJP / obra social" : isColombia ? "Salud / pensión" : "AFP/ONP"}</span>
                    <span class="amount negative">${currencySymbol} ${(parseFloat(data?.descuento_afp) || 0).toFixed(2)}</span>
                </div>
                <div class="item">
                    <span>${isArgentina ? "Ganancias / sindicato" : isColombia ? "FSP / retención" : "ESSALUD (9%)"}</span>
                    <span class="amount negative">${currencySymbol} ${(parseFloat(data?.descuento_essalud) || 0).toFixed(2)}</span>
                </div>
                <div class="item">
                    <span>Tardanzas</span>
                    <span class="amount negative">${currencySymbol} ${(parseFloat(data?.descuento_tardanzas) || 0).toFixed(2)}</span>
                </div>
                <div class="item">
                    <span>Faltas</span>
                    <span class="amount negative">${currencySymbol} ${(parseFloat(data?.descuento_faltas) || 0).toFixed(2)}</span>
                </div>
                <div class="item total">
                    <span>TOTAL DESCUENTOS</span>
                    <span class="amount negative">${currencySymbol} ${(parseFloat(data?.total_descuentos) || 0).toFixed(2)}</span>
                </div>
            </div>

            <div class="item total">
                <span>NETO A PAGAR</span>
                <span class="amount">${currencySymbol} ${(parseFloat(data?.neto_pagar) || 0).toFixed(2)}</span>
            </div>

            <div>
                <p>Este documento es generado automáticamente por NEON SYSTEM</p>
                <p>Fecha de generación: ${new Date().toLocaleDateString(locale)} ${new Date().toLocaleTimeString(locale)}</p>
            </div>
        </div>
    </body>
    </html>`;
  };

  const formatCurrency = (amount: number) => {
    if (isNaN(amount)) amount = 0;
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: country.moneda || "PEN",
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    try {
      const partes = String(dateString).slice(0, 10).split("-").map(Number);
      if (partes.length === 3 && partes.every((n) => !Number.isNaN(n))) {
        return new Date(partes[0], partes[1] - 1, partes[2]).toLocaleDateString(
          locale,
        );
      }
      return new Date(dateString).toLocaleDateString(locale);
    } catch (error: any) {
      return "N/A";
    }
  };

  if (!rrhhEnabled) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="alert alert-warning">
          <h1 className="text-xl font-semibold">RRHH deshabilitado</h1>
          <p className="text-sm text-foreground/80">
            {/* // HARDENING: bloquear planillas cuando RRHH no está habilitado. */}
            Las funciones de planilla estarán disponibles cuando el módulo de
            RRHH se active en este entorno.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
          <div>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">
              Planillas
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Cargando nómina, periodos, cálculos y estado de pagos de RRHH.
            </p>
          </div>
        </div>
        <div className="flex min-h-48 items-center justify-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p>Cargando planillas...</p>
        </div>
      </div>
    );
  }

  if (!rrhhEnabled) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="flex min-h-48 items-center justify-center">
          <p>El módulo de RRHH está deshabilitado en este entorno.</p>
        </div>
      </div>
    );
  }

  // Variables calculadas con protecciones
  const planillasArray = Array.isArray(planillas) ? planillas : [];
  const planillasCalculadas = planillasArray.filter(
    (p: any) => p?.estado === "calculada" || p?.estado === "aprobada",
  );
  const totalNomina = planillasCalculadas.reduce(
    (sum: number, p: any) => sum + (parseFloat(p?.total_neto) || 0),
    0,
  );
  const planillasEnProceso = planillasArray.filter(
    (p: any) => p?.estado === "borrador",
  ).length;

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 flex items-center gap-3 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">
            <WalletCards className="h-8 w-8 text-primary" aria-hidden="true" />
            Planillas
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Gestión de nómina
          </p>
        </div>
        {canCreatePayroll && (
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            onClick={abrirModalPlanilla}
          >
            <Rocket className="h-4 w-4" aria-hidden="true" />
            Crear Nueva Planilla
          </button>
        )}
      </div>

      {/* Estadísticas */}
      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5">
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Total Planillas</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-primary">
            {planillasArray.length}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">
            Períodos registrados
          </div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Planillas Listas</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CheckCircle className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-emerald-400">
            {planillasCalculadas.length}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">
            Calculadas y aprobadas
          </div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>En Proceso</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Hourglass className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-amber-400">
            {planillasEnProceso}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">
            Pendientes de cálculo
          </div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Total Nómina</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Banknote className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-violet-400">
            {formatCurrency(totalNomina)}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">
            Monto total calculado
          </div>
        </div>
      </div>

      {/* Lista de Planillas */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="m-0 text-lg font-bold text-foreground">
            Períodos de Planilla
          </h2>
          <div className="text-[0.8125rem] text-muted-foreground">
            <span>
              Total: {planillasArray.length} planillas |{" "}
              {planillasCalculadas.length} procesadas
            </span>
          </div>
        </div>

        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
          {planillasArray.length === 0 ? (
            <div className="px-4 py-10 text-center text-muted-foreground">
              <Rocket
                className="mx-auto mb-4 h-14 w-14 text-primary/70"
                aria-hidden="true"
              />
              <h3>¡Comienza con tu Primera Planilla!</h3>
              <p>
                Usa el botón &quot;Crear Nueva Planilla&quot; para configurar y
                generar tu primera planilla
              </p>
              {canCreatePayroll && (
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                  onClick={abrirModalPlanilla}
                >
                  <Rocket className="h-4 w-4" aria-hidden="true" />
                  Crear primera planilla
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Estado</th>
                    <th>Empleados</th>
                    <th>Total Ingresos</th>
                    <th>Total Descuentos</th>
                    <th>Neto a Pagar</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {planillasArray.map((planilla: any) => (
                    <tr key={planilla?.id || "unknown"}>
                      <td>
                        <div>
                          <strong>{planilla?.periodo || "N/A"}</strong>
                          <div className="text-xs text-[var(--primary-500)]">
                            {/* La tabla planillas no tiene fecha_inicio ni fecha_fin: se
                                leian campos inexistentes y la fila mostraba "N/A - N/A". */}
                            {planilla?.fecha_pago
                              ? `Pago: ${formatDate(planilla.fecha_pago)}`
                              : "Pago sin programar"}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={
                            planilla?.estado === "borrador"
                              ? "inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-400 dark:text-amber-300"
                              : planilla?.estado === "calculada"
                                ? "inline-flex items-center rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-bold text-primary dark:text-blue-300"
                                : planilla?.estado === "aprobada" ||
                                    planilla?.estado === "pagada"
                                  ? "inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400 dark:text-emerald-300"
                                  : "inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-bold text-destructive"
                          }
                        >
                          {planilla?.estado === "borrador" && (
                            <>
                              <FileEdit
                                className="mr-1 h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              Borrador
                            </>
                          )}
                          {planilla?.estado === "calculada" && (
                            <>
                              <Calculator
                                className="mr-1 h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              Calculada
                            </>
                          )}
                          {planilla?.estado === "aprobada" && (
                            <>
                              <CheckCircle
                                className="mr-1 h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              Aprobada
                            </>
                          )}
                          {planilla?.estado === "pagada" && (
                            <>
                              <Banknote
                                className="mr-1 h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              Pagada
                            </>
                          )}
                          {!planilla?.estado && (
                            <>
                              <HelpCircle
                                className="mr-1 h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              Sin estado
                            </>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className="bg-[var(--blue-100)] text-[var(--blue-800)] py-1 px-2 rounded-xl text-xs font-bold">
                          <Users
                            className="mr-1 inline h-3.5 w-3.5"
                            aria-hidden="true"
                          />{" "}
                          Ver detalle
                        </span>
                      </td>
                      <td className="text-emerald-400">
                        <strong>
                          {formatCurrency(
                            parseFloat(planilla?.total_ingresos) || 0,
                          )}
                        </strong>
                      </td>
                      <td className="text-destructive">
                        <strong>
                          {formatCurrency(
                            parseFloat(planilla?.total_descuentos) || 0,
                          )}
                        </strong>
                      </td>
                      <td className="text-primary">
                        <strong>
                          {formatCurrency(
                            parseFloat(planilla?.total_neto) || 0,
                          )}
                        </strong>
                      </td>
                      <td>
                        <div className="flex gap-2 items-center flex-wrap">
                          {/* Botón Calcular - Solo para borradores */}
                          {canCalculatePayroll &&
                            planilla?.estado === "borrador" && (
                              <button
                                className="py-[4px] px-2 text-[0.7rem] font-semibold bg-blue-500 text-white border-0 rounded-[6px] cursor-pointer flex items-center gap-[4px] transition hover:bg-blue-600"
                                onClick={() => abrirCalcularPlanilla(planilla)}
                                title="Calcular planilla detallada"
                              >
                                <Calculator
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />{" "}
                                Calcular
                              </button>
                            )}

                          {/* El pago sólo existe después de aprobar y devengar. */}
                          {canPayPayroll && planilla?.estado === "aprobada" && (
                            <button
                              className="py-[4px] px-2 text-[0.7rem] font-semibold bg-emerald-600 text-white border-0 rounded-[6px] cursor-pointer flex items-center gap-[4px] transition hover:bg-emerald-700"
                              onClick={() => abrirPagarPlanilla(planilla)}
                              title="Pagar planilla"
                            >
                              <Banknote
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />{" "}
                              Pagar
                            </button>
                          )}

                          {/* Botón Ver Detalle */}
                          <button
                            className="py-[4px] px-2 text-[0.7rem] font-semibold bg-gray-500 text-white border-0 rounded-[6px] cursor-pointer flex items-center gap-[4px] transition hover:bg-gray-600"
                            onClick={() => verDetallePlanilla(planilla?.id)}
                            title="Ver detalle completo"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                            Ver
                          </button>

                          {/* Botón Reporte */}
                          <button
                            className="py-[4px] px-2 text-[0.7rem] font-semibold bg-blue-700 text-white border-0 rounded-[6px] cursor-pointer flex items-center gap-[4px] transition hover:bg-blue-800"
                            onClick={() =>
                              generarReporteProfesional(
                                planilla?.id,
                                planilla?.periodo,
                              )
                            }
                            title="Generar reporte profesional"
                          >
                            <BarChart3
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />{" "}
                            Reporte
                          </button>

                          {/* Botón Aprobar - Solo para calculadas */}
                          {canApprovePayroll &&
                            planilla?.estado === "calculada" && (
                              <button
                                className="py-[4px] px-2 text-[0.7rem] font-semibold bg-emerald-600 text-white border-0 rounded-[6px] cursor-pointer flex items-center gap-[4px] transition hover:bg-emerald-700"
                                onClick={() => aprobarPlanilla(planilla?.id)}
                                title="Aprobar planilla"
                              >
                                <CheckCircle
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />{" "}
                                Aprobar
                              </button>
                            )}

                          {/* Estado Aprobada - Informativo */}
                          {planilla?.estado === "aprobada" && (
                            <span className="bg-[var(--green-100)] text-[var(--green-800)] py-[4px] px-2 rounded-[6px] text-[0.7rem] font-semibold">
                              <BadgeCheck
                                className="mr-1 inline h-3.5 w-3.5"
                                aria-hidden="true"
                              />{" "}
                              Oficial
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal para ver detalle de planilla */}
      {showDetalle && Array.isArray(detallePlanilla) && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-[95%] max-w-[1200px] overflow-auto rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl md:p-10">
            <div className="flex justify-between items-center mb-8">
              <h2 className="m-0 flex items-center gap-2 text-[1.75rem] font-extrabold text-foreground">
                <Eye className="h-6 w-6 text-primary" aria-hidden="true" />
                Detalle de planilla
              </h2>
              <button
                onClick={() => setShowDetalle(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="Cerrar detalle de planilla"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {detallePlanilla.length === 0 ? (
              <div className="text-center p-8">
                <FileEdit
                  className="mx-auto mb-4 h-12 w-12 text-muted-foreground"
                  aria-hidden="true"
                />
                <h3>Planilla sin calcular</h3>
                <p>
                  Esta planilla aún no tiene empleados calculados. Use el
                  proceso automático para calcularla.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-[100%] mb-8">
                  <thead>
                    <tr>
                      <th className="text-left p-3">Empleado</th>
                      <th className="text-left p-3">Documento</th>
                      <th className="text-right p-3">Días</th>
                      <th className="text-right p-3">Ingresos</th>
                      <th className="text-right p-3">Descuentos</th>
                      <th className="text-right p-3">Neto</th>
                      <th className="text-center p-3">
                        {isColombia
                          ? "Desprendible"
                          : isArgentina
                            ? "Recibo"
                            : "Boleta"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detallePlanilla.map((empleado: any) => (
                      <tr key={empleado?.id || "unknown"}>
                        <td className="p-3 border-b">
                          <strong>
                            {empleado?.empleados?.nombres || "N/A"}{" "}
                            {empleado?.empleados?.apellidos || ""}
                          </strong>
                        </td>
                        <td className="p-3 border-b">
                          {empleado?.empleados?.numero_documento || "N/A"}
                        </td>
                        <td className="p-3 border-b text-right">
                          {empleado?.dias_trabajados || 0}
                        </td>
                        <td className="p-3 border-b text-right text-[var(--green-600)]">
                          <strong>
                            {formatCurrency(
                              parseFloat(empleado?.total_ingresos) || 0,
                            )}
                          </strong>
                        </td>
                        <td className="p-3 border-b text-right text-[var(--red-600)]">
                          <strong>
                            {formatCurrency(
                              parseFloat(empleado?.total_descuentos) || 0,
                            )}
                          </strong>
                        </td>
                        <td className="p-3 border-b text-right text-[var(--blue-600)]">
                          <strong>
                            {formatCurrency(
                              parseFloat(empleado?.neto_pagar) || 0,
                            )}
                          </strong>
                        </td>
                        <td className="p-3 border-b text-center">
                          <button
                            className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-accent"
                            onClick={() => descargarBoleta(empleado?.id)}
                            title={
                              isColombia
                                ? "Descargar desprendible de nómina"
                                : isArgentina
                                  ? "Descargar recibo de sueldo"
                                  : "Descargar boleta profesional"
                            }
                          >
                            <FileDown className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowDetalle(false)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold leading-5 text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Planilla */}
      {canCreatePayroll && (
        <PlanillaModal
          isOpen={showPlanillaModal}
          onClose={() => {
            setShowPlanillaModal(false);
          }}
          onSuccess={handlePlanillaSuccess}
        />
      )}

      {/* Modal de Calcular Planilla */}
      {canCalculatePayroll && (
        <PlanillaCalcularModal
          isOpen={showCalcularModal}
          onClose={() => {
            setShowCalcularModal(false);
            setPlanillaSeleccionada(null);
          }}
          onSuccess={handleCalcularSuccess}
          planilla={planillaSeleccionada}
        />
      )}

      {/* Modal de Pagar Planilla */}
      {canPayPayroll && (
        <PlanillaPagarModal
          isOpen={showPagarModal}
          onClose={() => {
            setShowPagarModal(false);
            setPlanillaSeleccionada(null);
          }}
          onSuccess={handlePagarSuccess}
          planilla={planillaSeleccionada}
        />
      )}

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

export default PlanillasPage;
