"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { parseDateLocal } from "@/lib/date-utils";
import { escapeHtml, generarBoletaPlanillaHtml } from "@/lib/rrhh/boleta-planilla";
import PlanillaModal from "@/components/modals/PlanillaModal";
import PlanillaCalcularModal from "@/components/modals/PlanillaCalcularModal";
import PlanillaEditarModal from "@/components/modals/PlanillaEditarModal";
import PlanillaPagarModal from "@/components/modals/PlanillaPagarModal";
import PlanillaAprobarModal from "@/components/modals/PlanillaAprobarModal";
import { usePermission } from "@/hooks/use-permission";
import { fetchApi } from "@/lib/api-fetch";
import { useAuth } from "@/contexts/AuthContext";
import { payrollPaymentIntentKey, readPayrollPaymentIntent, type PayrollPaymentIntent } from "@/lib/rrhh/payroll-payment-operation";
import { usePayrollCalculationOperation } from "@/hooks/use-payroll-calculation-operation";
import { readLivePayroll, readPayrollList, readPayrollDetail, readPayrollBoleta } from "@/lib/rrhh/payroll-read-contract";
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
  const { session } = useAuth();
  const tenantId = session?.user?.tenant_id || '', actorId = session?.user?.id || '';
  const paymentScope = `${tenantId}:${actorId}`;
  const [pendingPayment, setPendingPayment] = useState<PayrollPaymentIntent | null>(null);
  const [paymentRecoveryError, setPaymentRecoveryError] = useState('');
  const [paymentRecoveryScope, setPaymentRecoveryScope] = useState('');
  const { hasPermission: canCreatePayroll } = usePermission(
    "rrhh",
    "create",
    "planillas",
  );
  const { hasPermission: canCalculatePayroll, loading: checkingCalculatePayroll } = usePermission(
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
  const calculationOperation=usePayrollCalculationOperation({tenantId,actorId},canCalculatePayroll,!!tenantId && !!actorId && !checkingCalculatePayroll);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const retryAction = useRef<(() => void) | null>(null);
  const listGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const actionGeneration = useRef(0);
  const [detallePlanilla, setDetallePlanilla] = useState<any[]>([]);
  const [showDetalle, setShowDetalle] = useState(false);
  const [showPlanillaModal, setShowPlanillaModal] = useState(false);
  const [showCalcularModal, setShowCalcularModal] = useState(false);
  const [showPagarModal, setShowPagarModal] = useState(false);
  const [showEditarModal, setShowEditarModal] = useState(false);
  const [planillaSeleccionada, setPlanillaSeleccionada] = useState<any>(null);
  const visiblePendingPayment = canPayPayroll && pendingPayment?.tenantId === tenantId && pendingPayment.actorId === actorId ? pendingPayment : null;
  const refreshPendingPayment = useCallback(() => {
    setPendingPayment(null); setPaymentRecoveryError(''); setPaymentRecoveryScope('');
    if (!tenantId || !actorId || !canPayPayroll) return;
    try { setPendingPayment(readPayrollPaymentIntent(localStorage.getItem(payrollPaymentIntentKey({ tenantId, actorId })), { tenantId, actorId })); }
    catch (error: any) { setPaymentRecoveryError(error?.message || 'No se pudo recuperar el pago pendiente. Sus datos se conservan.'); }
    setPaymentRecoveryScope(paymentScope);
  }, [tenantId, actorId, canPayPayroll, paymentScope]);
  useEffect(() => {
    refreshPendingPayment();
    window.addEventListener('storage', refreshPendingPayment); window.addEventListener('focus', refreshPendingPayment);
    return () => { window.removeEventListener('storage', refreshPendingPayment); window.removeEventListener('focus', refreshPendingPayment); };
  }, [refreshPendingPayment]);

  const [approvalRequest, setApprovalRequest] = useState<any>(null);

  const loadPlanillas = useCallback(async () => {
    const current = ++listGeneration.current;
    if (!rrhhEnabled) {
      setPlanillas([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setReadError(null);
      setPlanillas([]);
      const data = await readLivePayroll("/api/rrhh/planillas", readPayrollList);
      if (current === listGeneration.current) setPlanillas(data);
    } catch {
      if (current === listGeneration.current) setReadError("No se pudo consultar la lista completa de planillas. Reintente para recuperar los datos actuales.");
    } finally {
      if (current === listGeneration.current) setLoading(false);
    }
  }, [rrhhEnabled]);

  useEffect(() => {
    loadPlanillas();
    return () => { listGeneration.current++; detailGeneration.current++; actionGeneration.current++; };
  }, [loadPlanillas]);

  const abrirModalPlanilla = () => {
    setShowPlanillaModal(true);
  };

  const editarPlanilla = (planilla: any) => {
    setPlanillaSeleccionada(planilla);
    setShowEditarModal(true);
  };

  const handleEditarSuccess = () => {
    setShowEditarModal(false);
    setPlanillaSeleccionada(null);
    loadPlanillas();
  };

  const abrirCalcularPlanilla = (planilla: any) => {
    if (!calculationOperation.ready || calculationOperation.recoveryError || calculationOperation.busy
      || calculationOperation.pending && calculationOperation.pending.payroll.id !== planilla.id) return;
    setPlanillaSeleccionada(planilla);
    setShowCalcularModal(true);
  };

  const abrirPagarPlanilla = (planilla: any) => {
    if (!canPayPayroll || paymentRecoveryScope !== paymentScope || paymentRecoveryError || (visiblePendingPayment && visiblePendingPayment.payroll.id !== planilla.id)) return;
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
    const current = ++detailGeneration.current;
    actionGeneration.current++;
    setActionError(null); setActionLoading(false);
    setDetailId(planillaId); setDetallePlanilla([]); setDetailError(null); setDetailLoading(true); setShowDetalle(true);
    try {
      const planilla = planillas.find(row => row.id === planillaId);
      const data = await readLivePayroll(`/api/rrhh/planillas/${planillaId}/detalle`, value => readPayrollDetail(value, planilla));
      if (current === detailGeneration.current) setDetallePlanilla(data);
    } catch {
      if (current === detailGeneration.current) setDetailError("No se pudo consultar el detalle completo de la planilla. Reintente.");
    } finally {
      if (current === detailGeneration.current) setDetailLoading(false);
    }
  };

  const cerrarDetalle = () => {
    detailGeneration.current++; actionGeneration.current++;
    setShowDetalle(false); setActionError(null); setActionLoading(false);
  };

  const generarReporteProfesional = async (
    planillaId: string,
    periodo: string,
  ) => {
    const current = ++actionGeneration.current;
    setActionError(null); setActionLoading(true);
    retryAction.current = () => { void generarReporteProfesional(planillaId, periodo); };
    try {
        const planilla = planillas.find(row => row.id === planillaId);
        const data = await readLivePayroll(`/api/rrhh/planillas/${planillaId}/detalle`, value => readPayrollDetail(value, planilla));

        if (!data || !Array.isArray(data) || data.length === 0) {
          throw new Error("Esta planilla aún no tiene empleados calculados. Calcule la planilla para emitir el reporte.");
        }

        // Generar reporte HTML profesional
        const boleta = await readLivePayroll(`/api/rrhh/boleta/${data[0].id}`, value => readPayrollBoleta(value, data[0], planilla));
        if (current !== actionGeneration.current) return;
        const empresa = boleta.empresa;
        const html = generarReporteHTML(data, periodo, empresa);

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
        URL.revokeObjectURL(url);
    } catch (error: any) {
      if (current === actionGeneration.current) setActionError("No se pudo generar el reporte completo. " + error.message);
    } finally {
      if (current === actionGeneration.current) setActionLoading(false);
    }
  };

  const generarReporteHTML = (empleados: any[], periodo: string, empresa: any) => {
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
        <title>Reporte de Planilla ${escapeHtml(periodo)}</title>
        <style>
          @page{size:A4 landscape;margin:12mm}
          body{font:12px Arial,sans-serif;color:#172033;margin:0;line-height:1.45}
          .header{margin-bottom:18px}.company{font-size:16px;font-weight:700}
          .title{font-size:20px;font-weight:700;margin:8px 0}
          .summary{padding:12px 16px;background:#f1f5f9;margin-bottom:20px;break-inside:avoid}
          .summary h3{margin:0 0 8px}.summary p{margin:4px 0}
          table{width:100%;border-collapse:collapse}thead{display:table-header-group}
          th,td{padding:8px 10px;border-bottom:1px solid #cbd5e1;text-align:left}
          th{background:#e2e8f0}.number{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
          tr{break-inside:avoid}.total-row{font-weight:700;background:#f1f5f9}
        </style>
    </head>
    <body>
        <div class="header">
            <div class="company">${escapeHtml(empresa?.razon_social)}</div>
            <div>${isArgentina ? 'CUIT' : isColombia ? 'NIT' : 'RUC'}: ${escapeHtml(empresa?.ruc)}</div>
            <div class="title">Reporte de Planilla - Período ${escapeHtml(periodo)}</div>
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
                        <td>${escapeHtml(emp?.empleados?.nombres || "N/A")} ${escapeHtml(emp?.empleados?.apellidos || "")}</td>
                        <td>${escapeHtml(emp?.empleados?.numero_documento || "N/A")}</td>
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

  const aprobarPlanilla = (planillaId: string) => {
    if (!canApprovePayroll) return;
    const current = planillas.find(row => row.id === planillaId && row.tenant_id === tenantId);
    if (current) setApprovalRequest(current);
  };

  const descargarBoleta = async (empleadoPlanillaId: string) => {
    const current = ++actionGeneration.current;
    setActionError(null); setActionLoading(true);
    retryAction.current = () => { void descargarBoleta(empleadoPlanillaId); };
    try {
        const detail = detallePlanilla.find(row => row.id === empleadoPlanillaId);
        const planilla = planillas.find(row => row.id === detailId);
        const data = await readLivePayroll(`/api/rrhh/boleta/${empleadoPlanillaId}`, value => readPayrollBoleta(value, detail, planilla));
        if (current !== actionGeneration.current) return;

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
        URL.revokeObjectURL(url);
    } catch (error: any) {
      if (current === actionGeneration.current) setActionError("No se pudo descargar la boleta completa. " + error.message);
    } finally {
      if (current === actionGeneration.current) setActionLoading(false);
    }
  };

  const generarBoletaHTML = (data: any) => generarBoletaPlanillaHtml(data, {
    currencySymbol, locale, countryCode: country.paisCodigo || 'PE',
  });

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
      return parseDateLocal(dateString).toLocaleDateString(locale);
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

  if (readError) return <div className="p-6"><h1 className="text-2xl font-bold">Planillas</h1><div role="alert" className="my-4 rounded-xl border border-destructive p-4">{readError}</div><button onClick={() => void loadPlanillas()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">Reintentar</button></div>;

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
      {actionError && !showDetalle && <div role="alert" className="mb-4 rounded-xl border border-destructive p-4">{actionError}<button disabled={actionLoading} onClick={() => retryAction.current?.()} className="ml-4 rounded-lg bg-primary px-4 py-2 text-primary-foreground">Reintentar descarga</button></div>}
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
      <PlanillaAprobarModal request={approvalRequest} planillas={planillas} listLoading={loading} listError={readError} onClose={() => setApprovalRequest(null)} onSuccess={() => { void loadPlanillas(); }} />

      {canCalculatePayroll && calculationOperation.recoveryError && <div role="alert" className="mb-4 rounded-xl border border-destructive/40 p-4 text-sm">
        <p>{calculationOperation.recoveryError}</p><button type="button" onClick={calculationOperation.recover} className="mt-2 rounded-md border px-3 py-2">Reintentar recuperación del cálculo</button>
      </div>}
      {canCalculatePayroll && calculationOperation.pending && <div role="status" className="mb-4 rounded-xl border border-amber-500/40 p-4 text-sm">
        <p className="font-semibold">Cálculo pendiente de confirmación · {calculationOperation.pending.payroll.period}</p>
        <p>{calculationOperation.pending.employees.length} empleados · Se conserva la solicitud original para un reintento o conciliación manual.</p>
        <button type="button" disabled={calculationOperation.busy} className="mt-2 rounded-md border px-3 py-2" onClick={() => {
          const intent=calculationOperation.pending!;
          setPlanillaSeleccionada(planillas.find(row => row.id === intent.payroll.id && row.tenant_id === tenantId)
            || {id:intent.payroll.id,tenant_id:intent.tenantId,periodo:intent.payroll.period,moneda:intent.payroll.currency});setShowCalcularModal(true);
        }}>Retomar cálculo pendiente</button>
      </div>}

      {canPayPayroll && paymentRecoveryScope === paymentScope && paymentRecoveryError && <div role="alert" className="mb-4 rounded-xl border border-destructive/40 p-4 text-sm">
        <p>{paymentRecoveryError}</p><button type="button" onClick={refreshPendingPayment} className="mt-2 rounded-md border px-3 py-2">Reintentar recuperación del pago</button>
      </div>}
      {visiblePendingPayment && <div role="status" className="mb-4 rounded-xl border border-amber-500/40 p-4 text-sm">
        <p className="font-semibold">Pago pendiente de confirmación · {visiblePendingPayment.payroll.period}</p>
        <p>{visiblePendingPayment.payroll.currency} {visiblePendingPayment.payroll.total.toFixed(2)} · {visiblePendingPayment.payroll.employees.length} empleados · {visiblePendingPayment.payload.metodo_pago}</p>
        {visiblePendingPayment.payload.referencia && <p>Referencia: {visiblePendingPayment.payload.referencia}</p>}
        <p>La operación se conserva y requiere un reintento manual.</p>
        <button type="button" className="mt-2 rounded-md border px-3 py-2" disabled={loading || !!readError || !planillas.some(row => row.id === visiblePendingPayment.payroll.id && row.tenant_id === tenantId)} onClick={() => {
          const row = planillas.find(item => item.id === visiblePendingPayment.payroll.id && item.tenant_id === tenantId);
          if (row) abrirPagarPlanilla(row);
        }}>Retomar pago pendiente</button>
      </div>}
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

                          {/* Editar - sólo período y observaciones, sólo en borrador */}
                          {canCreatePayroll &&
                            planilla?.estado === "borrador" && (
                              <button
                                className="py-[4px] px-2 text-[0.7rem] font-semibold bg-muted text-foreground border border-border rounded-[6px] cursor-pointer flex items-center gap-[4px] transition hover:bg-accent"
                                onClick={() => editarPlanilla(planilla)}
                                title="Editar período y observaciones"
                              >
                                <FileEdit
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />{" "}
                                Editar
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
                onClick={cerrarDetalle}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="Cerrar detalle de planilla"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {actionError && <div role="alert" className="mb-4 rounded-xl border border-destructive p-4">{actionError}<button disabled={actionLoading} onClick={() => retryAction.current?.()} className="ml-4 rounded-lg bg-primary px-4 py-2 text-primary-foreground">Reintentar descarga</button></div>}
            {detailLoading ? <p>Cargando detalle de planilla...</p> : detailError ? <div role="alert">{detailError}<button onClick={() => detailId && void verDetallePlanilla(detailId)} className="ml-4 rounded-lg bg-primary px-4 py-2 text-primary-foreground">Reintentar detalle</button></div> : detallePlanilla.length === 0 ? (
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
                            disabled={actionLoading}
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
                onClick={cerrarDetalle}
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
            calculationOperation.invalidate();
            setShowCalcularModal(false);
            setPlanillaSeleccionada(null);
          }}
          onSuccess={handleCalcularSuccess}
          planilla={planillaSeleccionada}
          operation={calculationOperation}
        />
      )}

      {/* Modal de Editar Planilla */}
      {canCreatePayroll && (
        <PlanillaEditarModal
          isOpen={showEditarModal}
          onClose={() => {
            setShowEditarModal(false);
            setPlanillaSeleccionada(null);
          }}
          onSuccess={handleEditarSuccess}
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
          onPendingChange={refreshPendingPayment}
        />
      )}


    </div>
  );
};

export default PlanillasPage;
