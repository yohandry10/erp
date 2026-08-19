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

interface PlanillaCalcularModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  planilla: any;
}

interface EmpleadoPlanilla {
  id: string;
  nombres: string;
  apellidos: string;
  numero_documento: string;
  puesto: string;
  sueldo_base: number;
  dias_trabajados: number;
  horas_extras_25: number;
  horas_extras_35: number;
  horas_recargo_nocturno: number;
  horas_dominicales_festivas: number;
  tardanzas_minutos: number;
  faltas: number;
  bonos_adicionales: number;
  // Calculados
  sueldo_diario: number;
  descuento_tardanzas: number;
  descuento_faltas: number;
  pago_horas_extras: number;
  total_ingresos: number;
  afp_onp: number;
  essalud: number;
  impuesto_renta: number;
  total_descuentos: number;
  neto_pagar: number;
}

export default function PlanillaCalcularModal({
  isOpen,
  onClose,
  onSuccess,
  planilla,
}: PlanillaCalcularModalProps) {
  const { get, post } = useApi();
  const country = useCountryContext();
  const isArgentina = country.paisCodigo === "AR";
  const isColombia = country.paisCodigo === "CO";
  const currencySymbol = country.simboloMoneda || "S/";
  const [loading, setLoading] = useState(false);
  const [empleados, setEmpleados] = useState<EmpleadoPlanilla[]>([]);
  const [calculando, setCalculando] = useState(false);

  const loadEmpleados = useCallback(async () => {
    try {
      setLoading(true);
      const response = await get("/api/rrhh/empleados");

      if (response?.success && response.data) {
        const empleadosActivos = response.data.filter(
          (emp: any) => String(emp.estado || "").toLowerCase() === "activo",
        );

        const empleadosConCalculos = empleadosActivos.map((emp: any) => {
          const sueldoBase = emp.contratos?.[0]?.sueldo_bruto || 0;
          return calcularEmpleado({
            id: emp.id,
            nombres: emp.nombres,
            apellidos: emp.apellidos,
            numero_documento: emp.numero_documento,
            puesto: emp.puesto,
            sueldo_base: sueldoBase,
            dias_trabajados: 30,
            horas_extras_25: 0,
            horas_extras_35: 0,
            horas_recargo_nocturno: 0,
            horas_dominicales_festivas: 0,
            tardanzas_minutos: 0,
            faltas: 0,
            bonos_adicionales: 0,
            sueldo_diario: 0,
            descuento_tardanzas: 0,
            descuento_faltas: 0,
            pago_horas_extras: 0,
            total_ingresos: 0,
            afp_onp: 0,
            essalud: 0,
            impuesto_renta: 0,
            total_descuentos: 0,
            neto_pagar: 0,
          });
        });

        setEmpleados(empleadosConCalculos);
      }
    } catch (error) {
      console.error("Error cargando empleados:", error);
    } finally {
      setLoading(false);
    }
  // calcularEmpleado se ejecuta únicamente al invocar este callback y usa el
  // país vigente del mismo render; se mantiene aquí para evitar recrear toda
  // la carga por cada edición manual de una fila.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get, isArgentina, isColombia]);

  useEffect(() => {
    if (isOpen && planilla) {
      loadEmpleados();
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen, loadEmpleados, planilla]);

  const calcularEmpleado = (empleado: EmpleadoPlanilla): EmpleadoPlanilla => {
    const sueldoDiario = empleado.sueldo_base / 30;
    const valorHora = isArgentina
      ? empleado.sueldo_base / 200
      : isColombia
        ? empleado.sueldo_base / 210
        : empleado.sueldo_base / 30 / 8;

    // Descuentos
    const descuentoTardanzas = (empleado.tardanzas_minutos * valorHora) / 60;
    const descuentoFaltas = empleado.faltas * sueldoDiario;

    // Horas extras
    const pagoHorasExtras25 =
      empleado.horas_extras_25 * valorHora * (isArgentina ? 1.5 : 1.25);
    const pagoHorasExtras35 =
      empleado.horas_extras_35 * valorHora * (isArgentina ? 2 : isColombia ? 1.75 : 1.35);
    const pagoRecargoNocturno = isColombia ? empleado.horas_recargo_nocturno * valorHora * 0.35 : 0;
    const pagoDominicalFestivo = isColombia ? empleado.horas_dominicales_festivas * valorHora * 0.9 : 0;
    const pagoHorasExtras = pagoHorasExtras25 + pagoHorasExtras35 + pagoRecargoNocturno + pagoDominicalFestivo;

    // Total ingresos
    const totalIngresos =
      empleado.sueldo_base +
      empleado.bonos_adicionales +
      pagoHorasExtras -
      descuentoTardanzas -
      descuentoFaltas;

    // Descuentos legales
    const afpOnp = totalIngresos * (isArgentina ? 0.17 : isColombia ? 0.08 : 0.1);
    const essalud = totalIngresos * (isArgentina ? 0.18 : isColombia ? 0.30022 : 0.09);
    // Ganancias Argentina se toma de SiRADIG/backend; no se inventa una
    // retención en la vista previa.
    const impuestoRenta = isArgentina || isColombia
      ? 0
      : totalIngresos > 2300
        ? (totalIngresos - 2300) * 0.08
        : 0;

    const totalDescuentos = afpOnp + impuestoRenta;
    const netoPagar = totalIngresos - totalDescuentos;

    return {
      ...empleado,
      sueldo_diario: sueldoDiario,
      descuento_tardanzas: descuentoTardanzas,
      descuento_faltas: descuentoFaltas,
      pago_horas_extras: pagoHorasExtras,
      total_ingresos: totalIngresos,
      afp_onp: afpOnp,
      essalud: essalud,
      impuesto_renta: impuestoRenta,
      total_descuentos: totalDescuentos,
      neto_pagar: netoPagar,
    };
  };

  const actualizarEmpleado = (
    empleadoId: string,
    campo: keyof EmpleadoPlanilla,
    valor: any,
  ) => {
    setEmpleados((prevEmpleados) =>
      prevEmpleados.map((emp) => {
        if (emp.id === empleadoId) {
          const empleadoActualizado = { ...emp, [campo]: valor };
          return calcularEmpleado(empleadoActualizado);
        }
        return emp;
      }),
    );
  };

  const calcularPlanillaCompleta = async () => {
    try {
      setCalculando(true);

      // El navegador sólo envía variables operativas. Sueldo, contrato,
      // régimen pensionario, tasas y totales se vuelven a resolver y calcular
      // en el backend tenant-scoped; nunca se confían importes del preview.
      const datosCalculados = {
        empleados: empleados.map((emp) => ({
          empleado_id: emp.id,
          dias_trabajados: emp.dias_trabajados,
          horas_extras_25: emp.horas_extras_25,
          horas_extras_35: emp.horas_extras_35,
          tardanzas_minutos: emp.tardanzas_minutos,
          faltas: emp.faltas,
          bonos_adicionales: emp.bonos_adicionales,
          // El recargo nocturno y el dominical/festivo se capturaban en esta misma
          // pantalla y se sumaban al neto que se mostraba, pero no viajaban: el
          // backend los liquidaba en cero y el trabajador cobraba de menos un
          // recargo que sí había trabajado. Sólo aplican al régimen colombiano.
          ...(isColombia
            ? {
                horas_recargo_nocturno: emp.horas_recargo_nocturno,
                horas_dominicales_festivas: emp.horas_dominicales_festivas,
              }
            : {}),
        })),
      };

      const response = await post(
        `/api/rrhh/planillas/${planilla.id}/calcular-personalizada`,
        datosCalculados,
      );

      if (response?.success) {
        onSuccess();
        onClose();
      } else {
        throw new Error("Error calculando planilla");
      }
    } catch (error: any) {
      console.error("Error calculando planilla:", error);
      alert("Error calculando planilla: " + (error?.message || String(error)));
    } finally {
      setCalculando(false);
    }
  };

  // Cálculos totales
  const totalIngresos = empleados.reduce(
    (sum, emp) => sum + emp.total_ingresos,
    0,
  );
  const totalDescuentos = empleados.reduce(
    (sum, emp) => sum + emp.total_descuentos,
    0,
  );
  const totalNeto = empleados.reduce((sum, emp) => sum + emp.neto_pagar, 0);

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !calculando && onClose()}
    >
      <DialogContent className="flex h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden border-border bg-card p-0 text-card-foreground xl:max-w-[1600px]">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
          <DialogTitle>🧮 Calcular Planilla {planilla?.periodo}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col overflow-hidden px-6">
          {/* Información de la planilla */}
          <div className="mb-4 shrink-0 rounded-lg border border-border bg-muted/40">
            <div className="grid grid-cols-[repeat(4,_1fr)] gap-4 bg-[var(--blue-50)] p-4 border">
              <div>
                <strong>Período:</strong> {planilla?.periodo}
              </div>
              <div>
                <strong>Fecha Inicio:</strong> {planilla?.fecha_inicio}
              </div>
              <div>
                <strong>Fecha Fin:</strong> {planilla?.fecha_fin}
              </div>
              <div>
                <strong>Estado:</strong>
                <span
                  className={
                    planilla?.estado === "borrador"
                      ? "inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-400 dark:text-amber-300"
                      : planilla?.estado === "calculada"
                        ? "inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400 dark:text-emerald-300"
                        : "inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-bold text-destructive"
                  }
                >
                  {planilla?.estado}
                </span>
              </div>
            </div>
          </div>

          {/* Totales */}
          <div className="grid grid-cols-[repeat(4,_1fr)] gap-4 mb-4 shrink-0">
            <div className="bg-[var(--emerald-50)] p-4 text-center border">
              <div className="text-2xl font-bold text-[var(--emerald-600)]">
                {empleados.length}
              </div>
              <div className="text-[0.875rem] text-[var(--emerald-700)]">
                Empleados
              </div>
            </div>
            <div className="bg-[var(--blue-50)] p-4 text-center border">
              <div className="text-2xl font-bold text-[var(--blue-600)]">
                {currencySymbol} {totalIngresos.toFixed(2)}
              </div>
              <div className="text-[0.875rem] text-[var(--blue-700)]">
                Total Ingresos
              </div>
            </div>
            <div className="bg-[var(--red-50)] p-4 text-center border">
              <div className="text-2xl font-bold text-[var(--red-600)]">
                {currencySymbol} {totalDescuentos.toFixed(2)}
              </div>
              <div className="text-[0.875rem] text-[var(--red-700)]">
                Total Descuentos
              </div>
            </div>
            <div className="bg-[#f0f9ff] p-4 text-center border">
              <div className="text-2xl font-bold text-[#0ea5e9]">
                {currencySymbol} {totalNeto.toFixed(2)}
              </div>
              <div className="text-[0.875rem] text-[#0c4a6e]">Total Neto</div>
            </div>
          </div>

          {/* Tabla de empleados estilo Excel */}
          <div className="flex-[1] overflow-auto border">
            <table className="w-[100%] text-[0.875rem] bg-card">
              <thead className="sticky top-0 bg-[var(--primary-100)] z-[10]">
                <tr>
                  <th className="p-3 border min-w-[200px]">👤 EMPLEADO</th>
                  <th className="p-3 border min-w-[120px]">💰 SUELDO BASE</th>
                  <th className="p-3 border min-w-[80px]">📅 DÍAS</th>
                  <th className="p-3 border min-w-[80px]">⏰ HE {isArgentina ? '50' : '25'}%</th>
                  <th className="p-3 border min-w-[80px]">⏰ HE {isArgentina ? '100' : isColombia ? '75' : '35'}%</th>
                  {isColombia && <th className="p-3 border min-w-[95px]">🌙 NOCT. 35%</th>}
                  {isColombia && <th className="p-3 border min-w-[95px]">📅 DOM/FEST 90%</th>}
                  <th className="p-3 border min-w-[80px]">⏱️ TARDANZAS</th>
                  <th className="p-3 border min-w-[80px]">❌ FALTAS</th>
                  <th className="p-3 border min-w-[100px]">💵 {isArgentina ? 'ADICIONALES' : isColombia ? 'OTROS DEVENGADOS' : 'BONOS'}</th>
                  <th className="p-3 border min-w-[120px]">
                    📈 TOTAL INGRESOS
                  </th>
                  <th className="p-3 border min-w-[100px]">🏦 {isArgentina ? 'SIPA/OS' : isColombia ? 'SALUD/PENSIÓN' : 'AFP/ONP'}</th>
                  <th className="p-3 border min-w-[100px]">💊 {isArgentina ? 'CONTR. PATR.' : isColombia ? 'PILA/PARAF.' : 'ESSALUD'}</th>
                  <th className="p-3 border min-w-[100px]">📋 {isArgentina ? 'GANANCIAS' : isColombia ? 'RET. FUENTE' : 'IMP. RENTA'}</th>
                  <th className="p-3 border min-w-[120px]">💸 NETO A PAGAR</th>
                </tr>
              </thead>
              <tbody>
                {empleados.map((empleado, index) => (
                  <tr key={empleado.id}>
                    <td className="p-3 border sticky left-0 font-semibold">
                      <div>
                        {empleado.nombres} {empleado.apellidos}
                      </div>
                      <div className="text-xs text-[var(--primary-500)]">
                        {empleado.puesto} • {empleado.numero_documento}
                      </div>
                    </td>
                    <td className="p-2 border">
                      <input
                        type="number"
                        value={empleado.sueldo_base}
                        onChange={(e) =>
                          actualizarEmpleado(
                            empleado.id,
                            "sueldo_base",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-[100%] p-1 border rounded-[4px] text-center"
                      />
                    </td>
                    <td className="p-2 border">
                      <input
                        type="number"
                        value={empleado.dias_trabajados}
                        onChange={(e) =>
                          actualizarEmpleado(
                            empleado.id,
                            "dias_trabajados",
                            parseInt(e.target.value) || 0,
                          )
                        }
                        className="w-[100%] p-1 border rounded-[4px] text-center"
                        max="31"
                        min="0"
                      />
                    </td>
                    <td className="p-2 border">
                      <input
                        type="number"
                        value={empleado.horas_extras_25}
                        onChange={(e) =>
                          actualizarEmpleado(
                            empleado.id,
                            "horas_extras_25",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-[100%] p-1 border rounded-[4px] text-center"
                        step="0.5"
                        min="0"
                      />
                    </td>
                    <td className="p-2 border">
                      <input
                        type="number"
                        value={empleado.horas_extras_35}
                        onChange={(e) =>
                          actualizarEmpleado(
                            empleado.id,
                            "horas_extras_35",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-[100%] p-1 border rounded-[4px] text-center"
                        step="0.5"
                        min="0"
                      />
                    </td>
                    {isColombia && (
                      <td className="p-2 border">
                        <input
                          aria-label={`Horas nocturnas ordinarias de ${empleado.nombres} ${empleado.apellidos}`}
                          type="number"
                          value={empleado.horas_recargo_nocturno}
                          onChange={(e) => actualizarEmpleado(empleado.id, "horas_recargo_nocturno", parseFloat(e.target.value) || 0)}
                          className="w-[100%] p-1 border rounded-[4px] text-center"
                          step="0.5"
                          min="0"
                        />
                      </td>
                    )}
                    {isColombia && (
                      <td className="p-2 border">
                        <input
                          aria-label={`Horas dominicales o festivas de ${empleado.nombres} ${empleado.apellidos}`}
                          type="number"
                          value={empleado.horas_dominicales_festivas}
                          onChange={(e) => actualizarEmpleado(empleado.id, "horas_dominicales_festivas", parseFloat(e.target.value) || 0)}
                          className="w-[100%] p-1 border rounded-[4px] text-center"
                          step="0.5"
                          min="0"
                        />
                      </td>
                    )}
                    <td className="p-2 border">
                      <input
                        type="number"
                        value={empleado.tardanzas_minutos}
                        onChange={(e) =>
                          actualizarEmpleado(
                            empleado.id,
                            "tardanzas_minutos",
                            parseInt(e.target.value) || 0,
                          )
                        }
                        className="w-[100%] p-1 border rounded-[4px] text-center"
                        min="0"
                      />
                    </td>
                    <td className="p-2 border">
                      <input
                        type="number"
                        value={empleado.faltas}
                        onChange={(e) =>
                          actualizarEmpleado(
                            empleado.id,
                            "faltas",
                            parseInt(e.target.value) || 0,
                          )
                        }
                        className="w-[100%] p-1 border rounded-[4px] text-center"
                        min="0"
                      />
                    </td>
                    <td className="p-2 border">
                      <input
                        type="number"
                        value={empleado.bonos_adicionales}
                        onChange={(e) =>
                          actualizarEmpleado(
                            empleado.id,
                            "bonos_adicionales",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-[100%] p-1 border rounded-[4px] text-center"
                        step="0.01"
                        min="0"
                      />
                    </td>
                    <td className="p-3 border text-center font-semibold text-[var(--emerald-600)]">
                      {currencySymbol} {empleado.total_ingresos.toFixed(2)}
                    </td>
                    <td className="p-3 border text-center text-[var(--amber-600)]">
                      {currencySymbol} {empleado.afp_onp.toFixed(2)}
                    </td>
                    <td className="p-3 border text-center text-[var(--blue-600)]">
                      {currencySymbol} {empleado.essalud.toFixed(2)}
                    </td>
                    <td className="p-3 border text-center text-[var(--red-600)]">
                      {currencySymbol} {empleado.impuesto_renta.toFixed(2)}
                    </td>
                    <td className="p-3 border text-center font-bold text-[var(--blue-700)] text-base">
                      {currencySymbol} {empleado.neto_pagar.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border p-6">
          <Button
            onClick={calcularPlanillaCompleta}
            disabled={loading || calculando}
          >
            {calculando ? "⏳ Calculando..." : "🧮 Calcular Planilla"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={calculando}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
