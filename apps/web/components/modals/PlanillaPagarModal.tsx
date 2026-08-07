"use client";

import { useState, useCallback, useEffect } from "react";
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
  empleado_id: string;
  empleado_nombre: string;
  empleado_documento: string;
  dias_trabajados: number;
  total_ingresos: number;
  total_descuentos: number;
  neto_pagar: number;
  estado_pago: string;
  fecha_pago?: string;
  metodo_pago?: string;
  numero_operacion?: string;
}

interface HistorialPago {
  id: string;
  fecha: string;
  metodo: string;
  monto: number;
  empleados_count: number;
  numero_operacion?: string;
  observaciones?: string;
}

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
  const [empleados, setEmpleados] = useState<EmpleadoPago[]>([]);
  const [historialPagos, setHistorialPagos] = useState<HistorialPago[]>([]);
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "transferencia">(
    "transferencia",
  );
  const [numeroOperacion, setNumeroOperacion] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [empleadosSeleccionados, setEmpleadosSeleccionados] = useState<
    string[]
  >([]);
  const [pagando, setPagando] = useState(false);

  const loadDetallePlanilla = useCallback(async () => {
    if (!planilla?.id) return;

    try {
      setLoading(true);
      const response = await get(`/api/rrhh/planillas/${planilla.id}/detalle`);

      if (response && Array.isArray(response)) {
        const empleadosConEstado = response.map((emp: any) => ({
          id: emp.id,
          empleado_id: emp.empleado_id,
          empleado_nombre: `${emp.empleados?.nombres} ${emp.empleados?.apellidos}`,
          empleado_documento: emp.empleados?.numero_documento,
          dias_trabajados: emp.dias_trabajados,
          total_ingresos: parseFloat(emp.total_ingresos) || 0,
          total_descuentos: parseFloat(emp.total_descuentos) || 0,
          neto_pagar: parseFloat(emp.neto_pagar) || 0,
          estado_pago: emp.estado_pago || "pendiente",
          fecha_pago: emp.fecha_pago,
          metodo_pago: emp.metodo_pago,
          numero_operacion: emp.numero_operacion,
        }));

        setEmpleados(empleadosConEstado);

        // Seleccionar empleados pendientes por defecto
        const pendientes = empleadosConEstado
          .filter((emp) => emp.estado_pago === "pendiente")
          .map((emp) => emp.id);
        setEmpleadosSeleccionados(pendientes);
      }
    } catch (error) {
      console.error("Error cargando detalle planilla:", error);
    } finally {
      setLoading(false);
    }
  }, [get, planilla]);

  const loadHistorialPagos = useCallback(async () => {
    if (!planilla?.id) return;

    try {
      const response = await get(
        `/api/rrhh/planillas/${planilla.id}/historial-pagos`,
      );
      if (response?.success && response.data) {
        setHistorialPagos(response.data);
      }
    } catch (error) {
      console.error("Error cargando historial:", error);
    }
  }, [get, planilla]);

  useEffect(() => {
    if (isOpen && planilla) {
      loadDetallePlanilla();
      loadHistorialPagos();
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen, loadDetallePlanilla, loadHistorialPagos, planilla]);

  const toggleEmpleado = (empleadoId: string) => {
    setEmpleadosSeleccionados((prev) => {
      if (prev.includes(empleadoId)) {
        return prev.filter((id) => id !== empleadoId);
      } else {
        return [...prev, empleadoId];
      }
    });
  };

  const seleccionarTodos = () => {
    // Seleccionar TODOS los empleados (no solo pendientes)
    const todosLosEmpleados = empleados.map((emp) => emp.id);
    setEmpleadosSeleccionados(todosLosEmpleados);
  };

  const deseleccionarTodos = () => {
    setEmpleadosSeleccionados([]);
  };

  const procesarPago = async () => {
    if (empleadosSeleccionados.length === 0) {
      alert("Debe seleccionar al menos un empleado para pagar");
      return;
    }

    if (metodoPago === "transferencia" && !numeroOperacion.trim()) {
      alert("Debe ingresar el número de operación para transferencias");
      return;
    }

    try {
      setPagando(true);

      const datosPago = {
        empleados_ids: empleadosSeleccionados,
        metodo_pago: metodoPago,
        numero_operacion: numeroOperacion.trim() || null,
        observaciones: observaciones.trim() || null,
      };

      const response = await post(
        `/api/rrhh/planillas/${planilla.id}/pagar-empleados`,
        datosPago,
      );

      if (response?.success) {
        alert(
          `✅ Pago procesado correctamente para ${empleadosSeleccionados.length} empleados`,
        );
        await loadDetallePlanilla();
        await loadHistorialPagos();
        setEmpleadosSeleccionados([]);
        setNumeroOperacion("");
        setObservaciones("");
        onSuccess();
      } else {
        throw new Error(response?.message || "Error procesando pago");
      }
    } catch (error: any) {
      console.error("Error procesando pago:", error);
      alert("Error procesando pago: " + (error?.message || String(error)));
    } finally {
      setPagando(false);
    }
  };

  const generarComprobantePago = async () => {
    if (empleadosSeleccionados.length === 0) {
      alert("Debe seleccionar empleados para generar comprobante");
      return;
    }

    try {
      const empleadosParaComprobante = empleados.filter((emp) =>
        empleadosSeleccionados.includes(emp.id),
      );

      const html = generarComprobanteHTML(empleadosParaComprobante);

      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `comprobante_pago_${planilla.periodo}_${new Date().toISOString().split("T")[0]}.html`,
      );
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error: any) {
      console.error("Error generando comprobante:", error);
      alert(
        "Error generando comprobante: " + (error?.message || String(error)),
      );
    }
  };

  const generarComprobanteHTML = (empleadosPago: EmpleadoPago[]) => {
    const totalPago = empleadosPago.reduce(
      (sum, emp) => sum + emp.neto_pagar,
      0,
    );

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Comprobante de Pago - Planilla ${planilla.periodo}</title>
    </head>
    <body>
        <div class="header">
            <div class="company">NEON SYSTEM</div>
            <div class="title">Comprobante de Pago de Planilla</div>
            <div>Período: ${planilla.periodo}</div>
            <div>Generado: ${new Date().toLocaleDateString(locale)} ${new Date().toLocaleTimeString(locale)}</div>
        </div>

        <div class="info-grid">
            <div class="info-box">
                <h3>Información del Pago</h3>
                <p><strong>Método:</strong> ${metodoPago === "efectivo" ? "Efectivo" : "Transferencia Bancaria"}</p>
                <p><strong>Fecha:</strong> ${new Date().toLocaleDateString(locale)}</p>
                ${numeroOperacion ? `<p><strong>N° Operación:</strong> ${numeroOperacion}</p>` : ""}
                ${observaciones ? `<p><strong>Observaciones:</strong> ${observaciones}</p>` : ""}
            </div>
            <div class="info-box">
                <h3>Resumen</h3>
                <p><strong>Total Empleados:</strong> ${empleadosPago.length}</p>
                <p><strong>Monto Total:</strong> ${currencySymbol} ${totalPago.toFixed(2)}</p>
                <p><strong>Estado:</strong> Pagado</p>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Empleado</th>
                    <th>Documento</th>
                    <th class="number">Días</th>
                    <th class="number">Total Ingresos</th>
                    <th class="number">Descuentos</th>
                    <th class="number">Neto Pagado</th>
                </tr>
            </thead>
            <tbody>
                ${empleadosPago
                  .map(
                    (emp) => `
                    <tr>
                        <td>${emp.empleado_nombre}</td>
                        <td>${emp.empleado_documento}</td>
                        <td class="number">${emp.dias_trabajados}</td>
                        <td class="number">${currencySymbol} ${emp.total_ingresos.toFixed(2)}</td>
                        <td class="number">${currencySymbol} ${emp.total_descuentos.toFixed(2)}</td>
                        <td class="number">${currencySymbol} ${emp.neto_pagar.toFixed(2)}</td>
                    </tr>
                `,
                  )
                  .join("")}
                <tr class="total-row">
                    <td colspan="5">TOTAL PAGADO</td>
                    <td class="number">${currencySymbol} ${totalPago.toFixed(2)}</td>
                </tr>
            </tbody>
        </table>

        <div class="footer">
            <p>Este comprobante certifica el pago de la planilla correspondiente al período ${planilla.periodo}</p>
            <p>Sistema ERP - Generado automáticamente</p>
        </div>
    </body>
    </html>`;
  };

  // Cálculos
  const empleadosPendientes = empleados.filter(
    (emp) => emp.estado_pago === "pendiente",
  );
  const empleadosPagados = empleados.filter(
    (emp) => emp.estado_pago === "pagado",
  );
  const empleadosASerarPagados = empleados.filter((emp) =>
    empleadosSeleccionados.includes(emp.id),
  );
  const totalASerPagado = empleadosASerarPagados.reduce(
    (sum, emp) => sum + emp.neto_pagar,
    0,
  );
  const totalYaPagado = empleadosPagados.reduce(
    (sum, emp) => sum + emp.neto_pagar,
    0,
  );

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !pagando && onClose()}
    >
      <DialogContent className="flex h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden border-border bg-card p-0 text-card-foreground xl:max-w-[1400px]">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
          <DialogTitle>💰 Pagar Planilla {planilla?.periodo}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col overflow-hidden px-6">
          {/* Resumen superior */}
          <div className="grid grid-cols-[repeat(4,_1fr)] gap-4 mb-4 shrink-0">
            <div className="bg-[var(--blue-50)] p-4 text-center border">
              <div className="text-2xl font-bold text-[var(--blue-600)]">
                {empleados.length}
              </div>
              <div className="text-[0.875rem] text-[var(--blue-700)]">
                Total Empleados
              </div>
            </div>
            <div className="bg-[var(--emerald-50)] p-4 text-center border">
              <div className="text-2xl font-bold text-[var(--emerald-600)]">
                {empleadosSeleccionados.length}
              </div>
              <div className="text-[0.875rem] text-[var(--emerald-700)]">
                Seleccionados
              </div>
            </div>
            <div className="bg-[var(--blue-50)] p-4 text-center border">
              <div className="text-2xl font-bold text-[var(--blue-600)]">
                {currencySymbol} {totalASerPagado.toFixed(2)}
              </div>
              <div className="text-[0.875rem] text-[var(--blue-700)]">
                A Pagar Ahora
              </div>
            </div>
            <div className="bg-[#f0f9ff] p-4 text-center border">
              <div className="text-2xl font-bold text-[#0ea5e9]">
                {currencySymbol} {totalYaPagado.toFixed(2)}
              </div>
              <div className="text-[0.875rem] text-[#0c4a6e]">Ya Pagado</div>
            </div>
          </div>

          {/* Configuración de pago */}
          <div className="bg-[var(--primary-50)] p-4 mb-4 shrink-0">
            <h3 className="mt-0 mr-0 mb-4 ml-0 text-[var(--primary-700)]">
              💳 Configuración del Pago
            </h3>
            <div className="grid grid-cols-[auto_auto_1fr_auto_auto] gap-4 items-center">
              <div>
                <label className="text-[0.875rem] font-semibold text-[var(--primary-700)]">
                  Método:
                </label>
                <select
                  value={metodoPago}
                  onChange={(e) =>
                    setMetodoPago(
                      e.target.value as "efectivo" | "transferencia",
                    )
                  }
                  className="p-2 border rounded-[4px] ml-2"
                >
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                </select>
              </div>

              {metodoPago === "transferencia" && (
                <div>
                  <label className="text-[0.875rem] font-semibold text-[var(--primary-700)]">
                    N° Operación:
                  </label>
                  <input
                    type="text"
                    value={numeroOperacion}
                    onChange={(e) => setNumeroOperacion(e.target.value)}
                    placeholder="Ej: 123456789"
                    className="p-2 border rounded-[4px] ml-2 w-[150px]"
                  />
                </div>
              )}

              <div>
                <input
                  type="text"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Observaciones adicionales..."
                  className="p-2 border rounded-[4px] w-[100%]"
                />
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={seleccionarTodos}
              >
                ✅ Seleccionar Todos
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={deseleccionarTodos}
              >
                ❌ Deseleccionar
              </Button>
            </div>
          </div>

          {/* Lista de empleados */}
          <div className="flex-[1] overflow-auto border">
            <table className="w-[100%] text-[0.875rem] bg-card">
              <thead className="sticky top-0 bg-[var(--primary-100)] z-[10]">
                <tr>
                  <th className="p-3 border w-[50px]">✓</th>
                  <th className="p-3 border min-w-[200px]">👤 EMPLEADO</th>
                  <th className="p-3 border min-w-[100px]">📄 DOCUMENTO</th>
                  <th className="p-3 border min-w-[80px]">📅 DÍAS</th>
                  <th className="p-3 border min-w-[120px]">💰 INGRESOS</th>
                  <th className="p-3 border min-w-[120px]">💸 DESCUENTOS</th>
                  <th className="p-3 border min-w-[120px]">💵 NETO A PAGAR</th>
                  <th className="p-3 border min-w-[120px]">📊 ESTADO</th>
                  <th className="p-3 border min-w-[100px]">📅 FECHA PAGO</th>
                </tr>
              </thead>
              <tbody>
                {empleados.map((empleado, index) => (
                  <tr key={empleado.id}>
                    <td className="p-3 border text-center">
                      {/* SIEMPRE mostrar checkbox - se puede pagar múltiples veces */}
                      <input
                        type="checkbox"
                        checked={empleadosSeleccionados.includes(empleado.id)}
                        onChange={() => toggleEmpleado(empleado.id)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="p-3 border font-semibold">
                      {empleado.empleado_nombre}
                    </td>
                    <td className="p-3 border text-[var(--primary-600)]">
                      {empleado.empleado_documento}
                    </td>
                    <td className="p-3 border text-center">
                      {empleado.dias_trabajados}
                    </td>
                    <td className="p-3 border text-right text-[var(--emerald-600)] font-semibold">
                      {currencySymbol} {empleado.total_ingresos.toFixed(2)}
                    </td>
                    <td className="p-3 border text-right text-[var(--red-600)] font-semibold">
                      {currencySymbol} {empleado.total_descuentos.toFixed(2)}
                    </td>
                    <td className="p-3 border text-right text-[var(--blue-700)] font-bold text-base">
                      {currencySymbol} {empleado.neto_pagar.toFixed(2)}
                    </td>
                    <td className="p-3 border text-center">
                      <span
                        className={
                          empleado.estado_pago === "pagado"
                            ? "inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400 dark:text-emerald-300"
                            : "inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-400 dark:text-amber-300"
                        }
                      >
                        {empleado.estado_pago === "pagado"
                          ? "✅ Pagado"
                          : "⏳ Pendiente"}
                      </span>
                    </td>
                    <td className="p-3 border text-center text-[0.8rem] text-[var(--primary-600)]">
                      {empleado.fecha_pago
                        ? new Date(empleado.fecha_pago).toLocaleDateString(
                            locale,
                          )
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Historial de pagos */}
          {historialPagos.length > 0 && (
            <div className="mt-4 shrink-0">
              <h3 className="mt-0 mr-0 mb-2 ml-0 text-[var(--primary-700)]">
                📊 Historial de Pagos de esta Planilla
              </h3>
              <div className="max-h-[150px] overflow-auto border bg-card">
                <table className="w-[100%] text-[0.8rem]">
                  <thead className="bg-[var(--primary-50)]">
                    <tr>
                      <th className="p-2 border">Fecha</th>
                      <th className="p-2 border">Método</th>
                      <th className="p-2 border">Empleados</th>
                      <th className="p-2 border">Monto</th>
                      <th className="p-2 border">N° Operación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historialPagos.map((pago, index) => (
                      <tr key={pago.id}>
                        <td className="p-2 border">
                          {new Date(pago.fecha).toLocaleDateString(locale)}
                        </td>
                        <td className="p-2 border">
                          {pago.metodo === "efectivo"
                            ? "💵 Efectivo"
                            : "🏦 Transferencia"}
                        </td>
                        <td className="p-2 border text-center">
                          {pago.empleados_count}
                        </td>
                        <td className="p-2 border text-right font-semibold">
                          {currencySymbol} {pago.monto.toFixed(2)}
                        </td>
                        <td className="p-2 border">
                          {pago.numero_operacion || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border p-6">
          <Button
            variant="warning"
            onClick={generarComprobantePago}
            disabled={empleadosSeleccionados.length === 0}
          >
            📄 Generar Comprobante
          </Button>

          {/* BOTÓN DE PAGO - SIEMPRE DISPONIBLE para múltiples pagos */}
          <Button
            variant="success"
            onClick={procesarPago}
            disabled={empleadosSeleccionados.length === 0 || pagando}
          >
            {pagando
              ? "⏳ Procesando..."
              : `💰 Pagar ${empleadosSeleccionados.length} Empleados`}
          </Button>

          <Button variant="outline" onClick={onClose} disabled={pagando}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
