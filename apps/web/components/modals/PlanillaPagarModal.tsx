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

interface PlanillaPagarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  planilla: any;
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
}: PlanillaPagarModalProps) {
  const { get, post } = useApi();
  const country = useCountryContext();
  const currencySymbol = country.simboloMoneda || "S/";
  const locale = country.locale || "es-PE";
  const [loading, setLoading] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [empleados, setEmpleados] = useState<EmpleadoPago[]>([]);
  const [error, setError] = useState("");
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancariaPago[]>([]);
  const [sesionesCaja, setSesionesCaja] = useState<SesionCajaPago[]>([]);
  const [cuentaBancariaId, setCuentaBancariaId] = useState("");
  const [sesionCajaId, setSesionCajaId] = useState("");
  const [referencia, setReferencia] = useState("");
  const paymentKeyRef = useRef("");
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "transferencia">(
    "transferencia",
  );

  const loadDetallePlanilla = useCallback(async () => {
    if (!isOpen || !planilla?.id) return;
    try {
      setLoading(true);
      setError("");
      const response = await get(`/api/rrhh/planillas/${planilla.id}/detalle`);
      const detalles = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];
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
    } catch (loadError: any) {
      console.error("Error cargando el detalle de planilla:", loadError);
      setError(loadError?.message || "No se pudo cargar el detalle de la planilla");
      setEmpleados([]);
    } finally {
      setLoading(false);
    }
  }, [get, isOpen, planilla?.id]);

  useEffect(() => {
    void loadDetallePlanilla();
  }, [loadDetallePlanilla]);

  const loadDestinosTesoreria = useCallback(async () => {
    if (!isOpen) return;
    try {
      const response = await get("/api/rrhh/planillas/tesoreria/destinos");
      const payload = response?.data ?? response ?? {};
      const cuentas = Array.isArray(payload?.cuentas_bancarias)
        ? payload.cuentas_bancarias
        : [];
      const sesiones = Array.isArray(payload?.sesiones_caja)
        ? payload.sesiones_caja
        : [];
      setCuentasBancarias(cuentas);
      setSesionesCaja(sesiones);
      setCuentaBancariaId((current) => current || String(cuentas[0]?.id || ""));
      setSesionCajaId((current) => current || String(sesiones[0]?.id || ""));
    } catch (loadError: any) {
      setCuentasBancarias([]);
      setSesionesCaja([]);
      setError(loadError?.message || "No se pudieron cargar los destinos de tesorería");
    }
  }, [get, isOpen]);

  useEffect(() => {
    if (isOpen && !paymentKeyRef.current) paymentKeyRef.current = crypto.randomUUID();
    void loadDestinosTesoreria();
  }, [isOpen, loadDestinosTesoreria]);

  const totalNeto = useMemo(
    () => empleados.reduce((sum, empleado) => sum + empleado.neto_pagar, 0),
    [empleados],
  );
  const planillaAprobada = String(planilla?.estado || "").toLowerCase() === "aprobada";
  const cerrarModal = () => {
    paymentKeyRef.current = "";
    setReferencia("");
    setError("");
    onClose();
  };

  const procesarPago = async () => {
    if (!planillaAprobada) {
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

    try {
      setPagando(true);
      setError("");
      const response = await post(`/api/rrhh/planillas/${planilla.id}/pagar`, {
        metodo_pago: metodoPago,
        idempotency_key: paymentKeyRef.current,
        cuenta_bancaria_id: metodoPago === "transferencia" ? cuentaBancariaId : undefined,
        sesion_caja_id: metodoPago === "efectivo" ? sesionCajaId : undefined,
        referencia: metodoPago === "transferencia" ? referencia.trim() : undefined,
      });
      if (!response?.success) {
        throw new Error(response?.message || "La transacción de pago no fue confirmada");
      }

      const empleadosPagados = response?.data?.empleadosPagados ?? empleados.length;
      const totalPagado = toAmount(response?.data?.totalPagado ?? totalNeto);
      alert(
        `✅ Planilla pagada en una sola operación\n\n${empleadosPagados} empleados · ${currencySymbol} ${totalPagado.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      );
      onSuccess();
      paymentKeyRef.current = "";
      onClose();
    } catch (paymentError: any) {
      console.error("Error pagando la planilla:", paymentError);
      setError(paymentError?.message || "No se pudo pagar la planilla");
    } finally {
      setPagando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !pagando && cerrarModal()}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden border-border bg-card p-0 text-card-foreground xl:max-w-5xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
          <DialogTitle>💰 Pagar planilla {planilla?.periodo}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-hidden px-6 py-5">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
            <div className="font-semibold">Pago total y atómico</div>
            <p className="mt-1 text-muted-foreground">
              Se pagarán todos los empleados de la planilla. Cabecera, detalle,
              comprobantes internos y evento contable se confirmarán juntos; si
              una parte falla, no se registrará ningún pago parcial.
            </p>
          </div>

          {!planillaAprobada && (
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
              value={metodoPago}
              onChange={(event) => setMetodoPago(event.target.value as "efectivo" | "transferencia")}
              disabled={pagando}
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
                  value={cuentaBancariaId}
                  onChange={(event) => setCuentaBancariaId(event.target.value)}
                  disabled={pagando}
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
                  disabled={pagando}
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
                value={sesionCajaId}
                onChange={(event) => setSesionCajaId(event.target.value)}
                disabled={pagando}
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
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border p-6">
          <Button variant="outline" onClick={cerrarModal} disabled={pagando}>Cancelar</Button>
          <Button
            variant="success"
            onClick={procesarPago}
            disabled={loading || pagando || !planillaAprobada || empleados.length === 0}
          >
            {pagando ? "Procesando…" : `Pagar planilla completa · ${currencySymbol} ${totalNeto.toFixed(2)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
