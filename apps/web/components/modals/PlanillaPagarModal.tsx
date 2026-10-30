"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCountryContext } from "@/hooks/use-country-context";
import { customAuth } from "@/lib/auth-service";
import { fetchApi } from "@/lib/api-fetch";
import { isOfflineCachedResponse } from "@/lib/offline-store";
import { readLivePayroll, readPayrollList, readPayrollDetail, readPayrollPaymentDestinations } from "@/lib/rrhh/payroll-read-contract";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/use-permission";
import { payrollPaymentIntentKey, readPayrollPaymentIntent, createPayrollPaymentIntent, confirmPayrollPayment, type PayrollPaymentIntent, type PayrollPaymentPayload } from "@/lib/rrhh/payroll-payment-operation";

interface PlanillaPagarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  planilla: any;
  onPendingChange?: () => void;
}

interface EmpleadoPago {
  id: string;
  empleado_nombre: string;
  empleado_documento: string;
  dias_trabajados: number;
  total_ingresos: number;
  total_descuentos: number;
  neto_pagar: number;
  estado_pago: string;
}

interface CuentaBancariaPago {
  id: string;
  nombre?: string;
  banco?: string;
  numero_cuenta?: string;
  moneda?: string;
  saldo?: number;
  saldo_actual?: number;
}

interface SesionCajaPago {
  id: string;
  nombre?: string;
  moneda?: string;
}

const toAmount = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function PlanillaPagarModal({
  isOpen,
  onClose,
  onSuccess,
  planilla,
  onPendingChange,
}: PlanillaPagarModalProps) {
  // El pago se rechaza con motivos que el usuario debe leer (por ejemplo, la
  // segregación aprobador/pagador); sin throwOnError llegaba null y un texto genérico.
  const { post } = useApi({ requireLive: true, retries: 0, throwOnError: true, showErrorToast: false });
  const { session } = useAuth();
  const { hasPermission: canPay, loading: permissionsLoading } = usePermission('rrhh', 'pay', 'planillas');
  const tenantId = session?.user?.tenant_id || '', actorId = session?.user?.id || '';
  const scope = `${tenantId}:${actorId}`;
  const activeScope = useRef(scope); activeScope.current = scope;
  const activePermission = useRef(false); activePermission.current = canPay && !permissionsLoading;
  const operationEpoch = useRef(0), writing = useRef(false);
  const pendingBytes = useRef<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<PayrollPaymentIntent | null>(null);
  const [storageError, setStorageError] = useState('');
  const [intentReady, setIntentReady] = useState('');
  const [livePayroll, setLivePayroll] = useState<any>(null);
  const [liveDetails, setLiveDetails] = useState<any[]>([]);
  const visibleIntent = pendingIntent?.tenantId === tenantId && pendingIntent.actorId === actorId ? pendingIntent : null;
  const country = useCountryContext();
  const currencySymbol = country.simboloMoneda || "S/";
  const locale = country.locale || "es-PE";
  const [loading, setLoading] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [empleados, setEmpleados] = useState<EmpleadoPago[]>([]);
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [readReady, setReadReady] = useState(false);
  const readGeneration = useRef(0);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancariaPago[]>([]);
  const [sesionesCaja, setSesionesCaja] = useState<SesionCajaPago[]>([]);
  const [cuentaBancariaId, setCuentaBancariaId] = useState("");
  const [sesionCajaId, setSesionCajaId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "transferencia">(
    "transferencia",
  );

  const loadPaymentData = useCallback(async () => {
    if (!isOpen || !planilla?.id || !tenantId || !actorId || !activePermission.current) return;
    const generation = ++readGeneration.current;
    setLoading(true); setReadReady(false); setReadError("");
    setEmpleados([]); setCuentasBancarias([]); setSesionesCaja([]); setLivePayroll(null); setLiveDetails([]);
    let recovered = false;
    try {
      const actor = (await customAuth.getRequestSession()).session?.user;
      if (!actor || `${actor.tenant_id}:${actor.id}` !== scope) throw new Error('La sesión cambió. Consulte nuevamente el pago.');
      setStorageError(''); setIntentReady('');
      const serialized = localStorage.getItem(payrollPaymentIntentKey({ tenantId, actorId }));
      const pending = readPayrollPaymentIntent(serialized, { tenantId, actorId });
      pendingBytes.current = serialized;
      recovered = true;
      setPendingIntent(pending); setIntentReady(scope);
      if (pending && pending.payroll.id !== planilla.id) throw new Error('Existe un pago pendiente de otra planilla. Retómelo desde el listado.');
      if (pending) {
        setMetodoPago(pending.payload.metodo_pago); setCuentaBancariaId(pending.payload.cuenta_bancaria_id || ''); setSesionCajaId(pending.payload.sesion_caja_id || ''); setReferencia(pending.payload.referencia || '');
      }
      const [headers, detalles, response] = await Promise.all([
        readLivePayroll('/api/rrhh/planillas', readPayrollList),
        readLivePayroll(`/api/rrhh/planillas/${planilla.id}/detalle`, data => readPayrollDetail(data, planilla)),
        fetchApi('/api/rrhh/planillas/tesoreria/destinos'),
      ]);
      if (!response.ok || isOfflineCachedResponse(response) || response.headers.get('x-erp-offline-queued') === 'true') throw new Error('No se pudieron consultar los destinos actuales del pago.');
      const destinos = readPayrollPaymentDestinations(await response.json());
      const current = (await customAuth.getRequestSession()).session?.user;
      if (!actor || current?.id !== actor.id || current.tenant_id !== actor.tenant_id) throw new Error('La sesión cambió durante la consulta del pago. Reintente.');
      if (generation !== readGeneration.current || activeScope.current !== scope || !activePermission.current) return;
      const header = headers.find(row => row.id === planilla.id && row.tenant_id === tenantId);
      if (!header) throw new Error('No se pudo recuperar la planilla actual de esta empresa.');
      setLivePayroll(header); setLiveDetails(detalles);
      setEmpleados(
        detalles.map((detalle: any) => ({
          id: String(detalle.id),
          empleado_nombre:
            `${detalle.empleados?.nombres || ""} ${detalle.empleados?.apellidos || ""}`.trim()
            || "Empleado sin nombre",
          empleado_documento: detalle.empleados?.numero_documento || "-",
          dias_trabajados: Number(detalle.dias_trabajados || 0),
          total_ingresos: toAmount(detalle.total_ingresos),
          total_descuentos: toAmount(detalle.total_descuentos),
          neto_pagar: toAmount(detalle.neto_pagar),
          estado_pago: String(detalle.estado_pago || "pendiente").toLowerCase(),
        })),
      );
      setCuentasBancarias(destinos.cuentas_bancarias); setSesionesCaja(destinos.sesiones_caja);
      if (!pending) {
        setCuentaBancariaId(currentId => destinos.cuentas_bancarias.some((row: any) => row.id === currentId) ? currentId : String(destinos.cuentas_bancarias[0]?.id || ''));
        setSesionCajaId(currentId => destinos.sesiones_caja.some((row: any) => row.id === currentId) ? currentId : String(destinos.sesiones_caja[0]?.id || ''));
      }
      setReadReady(true);
    } catch (loadError: any) {
      if (generation !== readGeneration.current || activeScope.current !== scope) return;
      setIntentReady(scope);
      if (!recovered) setStorageError(loadError?.message || 'No se pudo recuperar el pago pendiente.');
      setReadError(loadError?.message || "No se pudo consultar la información completa del pago.");
    } finally {
      if (generation === readGeneration.current) setLoading(false);
    }
  }, [isOpen, planilla, tenantId, actorId, scope, canPay, permissionsLoading]);

  useEffect(() => {
    void loadPaymentData();
    return () => { readGeneration.current++; operationEpoch.current++; };
  }, [isOpen, loadPaymentData]);

  useEffect(() => {
    setPendingIntent(null); setStorageError(''); setIntentReady(''); setReadReady(false); setError(''); setPagando(false); setReferencia(''); setCuentaBancariaId(''); setSesionCajaId(''); writing.current = false;
    pendingBytes.current = null;
    return () => { operationEpoch.current++; readGeneration.current++; };
  }, [scope]);

  const totalNeto = useMemo(
    () => empleados.reduce((sum, empleado) => sum + empleado.neto_pagar, 0),
    [empleados],
  );
  const planillaAprobada = String(livePayroll?.estado || "").toLowerCase() === "aprobada";
  const cerrarModal = () => {
    setReferencia("");
    setError("");
    onClose();
  };

  const procesarPago = async () => {
    if (!readReady || loading || readError || storageError || intentReady !== scope || !activePermission.current || writing.current || pagando) return;
    if (!planillaAprobada && !(visibleIntent && livePayroll?.estado === 'pagada')) {
      setError("La planilla debe estar aprobada antes de pagarla.");
      return;
    }
    if (empleados.length === 0) {
      setError("La planilla no contiene empleados calculados.");
      return;
    }
    if (metodoPago === "transferencia" && (!cuentaBancariaId || !referencia.trim())) {
      setError("Seleccione una cuenta bancaria e ingrese la referencia de la transferencia.");
      return;
    }
    if (metodoPago === "efectivo" && !sesionCajaId) {
      setError("El pago en efectivo requiere una sesión de caja abierta a nombre del pagador.");
      return;
    }

    const submittedScope = scope, epoch = operationEpoch.current;
    const currentOperation = () => submittedScope === activeScope.current && epoch === operationEpoch.current && activePermission.current;
    try {
      writing.current = true;
      setPagando(true);
      setError("");
      const actor = (await customAuth.getRequestSession()).session?.user;
      if (!actor || `${actor.tenant_id}:${actor.id}` !== submittedScope || !currentOperation()) throw new Error('La sesión cambió. El pago pendiente se conserva.');
      const ownScope = { tenantId, actorId }, storageKey = payrollPaymentIntentKey(ownScope);
      const original = localStorage.getItem(storageKey);
      if (original !== pendingBytes.current) throw new Error('El pago pendiente cambió en otra ventana. Consulte nuevamente sus datos antes de reintentar.');
      const stored = readPayrollPaymentIntent(original, ownScope);
      const payload: PayrollPaymentPayload = {
        metodo_pago: metodoPago,
        idempotency_key: stored?.payload.idempotency_key || crypto.randomUUID(),
        ...(metodoPago === 'transferencia' ? { cuenta_bancaria_id: cuentaBancariaId, referencia: referencia.trim() } : { sesion_caja_id: sesionCajaId }),
      };
      const candidate = stored || createPayrollPaymentIntent(ownScope, livePayroll, liveDetails, payload, country.paisCodigo);
      if (candidate.payroll.id !== planilla.id) throw new Error('Retome el pago pendiente de su planilla original.');
      if (!stored && metodoPago === 'transferencia' && cuentasBancarias.find(row => row.id === cuentaBancariaId)?.moneda !== candidate.payroll.currency) throw new Error('La moneda de la cuenta bancaria no coincide con la planilla.');
      const serialized = original ?? JSON.stringify(candidate);
      if (localStorage.getItem(storageKey) !== original) throw new Error('El pago pendiente cambió en otra ventana. Sus datos se conservan.');
      if (original === null) localStorage.setItem(storageKey, serialized);
      if (localStorage.getItem(storageKey) !== serialized) throw new Error('No se pudo conservar el pago antes de enviarlo.');
      pendingBytes.current = serialized;
      setPendingIntent(candidate); onPendingChange?.();
      const response = await post(`/api/rrhh/planillas/${candidate.payroll.id}/pagar`, candidate.payload);
      const currentActor = (await customAuth.getRequestSession()).session?.user;
      if (!currentOperation() || !currentActor || `${currentActor.tenant_id}:${currentActor.id}` !== submittedScope) return;
      const confirmed = confirmPayrollPayment(response, candidate, ownScope, country.paisCodigo);
      if (localStorage.getItem(storageKey) !== serialized) throw new Error('El pago pendiente cambió. No se retira la operación de otra ventana.');
      localStorage.removeItem(storageKey);
      if (localStorage.getItem(storageKey) !== null) throw new Error('No se pudo retirar el pago confirmado. Reintente la misma operación.');
      pendingBytes.current = null;
      setPendingIntent(null); onPendingChange?.();
      const empleadosPagados = confirmed.empleadosPagados;
      const totalPagado = confirmed.totalPagado;
      alert(
        `✅ Planilla pagada en una sola operación\n\n${empleadosPagados} empleados · ${currencySymbol} ${totalPagado.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      );
      onSuccess();
      onClose();
    } catch (paymentError: any) {
      if (currentOperation()) setError(paymentError?.message || "No se pudo pagar la planilla");
    } finally {
      if (currentOperation()) { setPagando(false); writing.current = false; }
    }
  };

  if (!isOpen || !canPay || permissionsLoading || !tenantId || !actorId || planilla?.tenant_id !== tenantId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !pagando && cerrarModal()}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden border-border bg-card p-0 text-card-foreground xl:max-w-5xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
          <DialogTitle>💰 Pagar planilla {planilla?.periodo}</DialogTitle>
        </DialogHeader>

        {visibleIntent && <div className="mx-6 mt-4 rounded-xl border border-amber-500/40 p-4 text-sm" role="status">
          <p className="font-semibold">Pago pendiente de confirmación · {visibleIntent.payroll.period}</p>
          <p>{visibleIntent.payroll.currency} {visibleIntent.payroll.total.toFixed(2)} · {visibleIntent.payroll.employees.length} empleados · {visibleIntent.payload.metodo_pago}</p>
          {visibleIntent.payload.referencia && <p>Referencia: {visibleIntent.payload.referencia}</p>}
          <p>Los importes y el destino se conservan. Reintente este mismo pago con conexión.</p>
        </div>}

        {!readReady || intentReady !== scope ? <div className="px-6 py-5" role={readError ? 'alert' : 'status'}>
          {readError ? <><p>{readError}</p><Button variant="outline" disabled={loading} onClick={() => void loadPaymentData()}>Reintentar consulta de pago</Button></> : <p>Cargando información actual del pago…</p>}
        </div> : <div className="flex flex-1 flex-col gap-4 overflow-hidden px-6 py-5">
          <Button variant="outline" disabled={pagando} onClick={() => void loadPaymentData()}>Actualizar consulta de pago</Button>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
            <div className="font-semibold">Pago total y atómico</div>
            <p className="mt-1 text-muted-foreground">
              Se pagarán todos los empleados de la planilla. Cabecera, detalle,
              comprobantes internos y evento contable se confirmarán juntos; si
              una parte falla, no se registrará ningún pago parcial.
            </p>
          </div>

          {!planillaAprobada && !(visibleIntent && livePayroll?.estado === 'pagada') && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
              Esta planilla no está aprobada. Vuelva al listado y complete la aprobación.
            </div>
          )}
          {error && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Empleados</div>
              <div className="mt-1 text-2xl font-bold">{empleados.length}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-4 sm:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total neto</div>
              <div className="mt-1 text-2xl font-bold text-emerald-400">
                {currencySymbol} {totalNeto.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <label className="flex flex-col gap-2 text-sm font-semibold sm:max-w-xs">
            Método de pago
            <select
              aria-label="Método de pago"
              value={metodoPago}
              onChange={(event) => setMetodoPago(event.target.value as "efectivo" | "transferencia")}
              disabled={pagando || !!visibleIntent}
              className="rounded-md border border-input bg-background px-3 py-2 font-normal"
            >
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
            </select>
          </label>

          {metodoPago === "transferencia" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-semibold">
                Cuenta bancaria
                <select
                  aria-label="Cuenta bancaria"
                  value={cuentaBancariaId}
                  onChange={(event) => setCuentaBancariaId(event.target.value)}
                  disabled={pagando || !!visibleIntent}
                  className="rounded-md border border-input bg-background px-3 py-2 font-normal"
                >
                  <option value="">Seleccione una cuenta</option>
                  {cuentasBancarias.map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.id}>
                      {cuenta.banco || cuenta.nombre || "Banco"} · {cuenta.numero_cuenta || cuenta.id.slice(0, 8)} · {cuenta.moneda || "PEN"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold">
                Referencia / operación
                <input
                  value={referencia}
                  onChange={(event) => setReferencia(event.target.value)}
                  disabled={pagando || !!visibleIntent}
                  maxLength={180}
                  placeholder="Ej. OP-2026-000123"
                  className="rounded-md border border-input bg-background px-3 py-2 font-normal"
                />
              </label>
            </div>
          ) : (
            <label className="flex flex-col gap-2 text-sm font-semibold sm:max-w-md">
              Sesión de caja del pagador
              <select
                aria-label="Sesión de caja del pagador"
                value={sesionCajaId}
                onChange={(event) => setSesionCajaId(event.target.value)}
                disabled={pagando || !!visibleIntent}
                className="rounded-md border border-input bg-background px-3 py-2 font-normal"
              >
                <option value="">Seleccione una sesión abierta</option>
                {sesionesCaja.map((sesion) => (
                  <option key={sesion.id} value={sesion.id}>
                    {sesion.nombre || `Sesión ${sesion.id.slice(0, 8)}`} · {sesion.moneda || "PEN"}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="p-3 text-left">Empleado</th>
                  <th className="p-3 text-left">Documento</th>
                  <th className="p-3 text-right">Días</th>
                  <th className="p-3 text-right">Ingresos</th>
                  <th className="p-3 text-right">Descuentos</th>
                  <th className="p-3 text-right">Neto</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Cargando detalle…</td></tr>
                ) : empleados.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Sin empleados calculados</td></tr>
                ) : empleados.map((empleado) => (
                  <tr key={empleado.id} className="border-t border-border">
                    <td className="p-3 font-medium">{empleado.empleado_nombre}</td>
                    <td className="p-3 text-muted-foreground">{empleado.empleado_documento}</td>
                    <td className="p-3 text-right">{empleado.dias_trabajados}</td>
                    <td className="p-3 text-right">{currencySymbol} {empleado.total_ingresos.toFixed(2)}</td>
                    <td className="p-3 text-right text-destructive">{currencySymbol} {empleado.total_descuentos.toFixed(2)}</td>
                    <td className="p-3 text-right font-semibold text-emerald-400">{currencySymbol} {empleado.neto_pagar.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>}

        <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border p-6">
          <Button variant="outline" onClick={cerrarModal} disabled={pagando}>Cancelar</Button>
          {readReady && <Button
            variant="success"
            onClick={procesarPago}
            disabled={loading || pagando || writing.current || !readReady || !!storageError || intentReady !== scope || (!planillaAprobada && !(visibleIntent && livePayroll?.estado === 'pagada')) || empleados.length === 0}
          >
            {pagando ? "Procesando…" : visibleIntent ? 'Reintentar pago pendiente' : `Pagar planilla completa · ${currencySymbol} ${totalNeto.toFixed(2)}`}
          </Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
