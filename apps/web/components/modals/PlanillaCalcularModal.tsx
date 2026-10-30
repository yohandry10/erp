"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCountryContext } from "@/hooks/use-country-context";
import { EpsCoberturaForm, emptyEpsCobertura, epsCoberturaPayload } from "@/components/rrhh/EpsCoberturaForm";
import { BasesGratificacionForm, BasesGratificacionValue, basesGratificacionPayload } from "@/components/rrhh/BasesGratificacionForm";
import { useTenant } from "@/contexts/TenantContext";
import { usePermission } from "@/hooks/use-permission";
import { readPayrollCalculationSources } from "@/lib/rrhh/payroll-calculation-source";
import { payrollCalculationRequest } from "@/lib/rrhh/payroll-calculation-operation";
import type { PayrollCalculationOperation } from "@/hooks/use-payroll-calculation-operation";

interface PlanillaCalcularModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  planilla: any;
  operation: PayrollCalculationOperation;
}

interface EmpleadoPlanilla {
  id: string;
  incluir: boolean;
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
  operation,
}: PlanillaCalcularModalProps) {
  const { get } = useApi({ throwOnError: true, requireLive: true });
  const country = useCountryContext();
  const {tenant,user}=useTenant();
  const {hasPermission:canCalculate,loading:checkingCalculate}=usePermission('rrhh','calculate','planillas');
  const readScope=`${tenant?.id||''}:${user?.id||''}:${planilla?.id||''}:${planilla?.periodo||''}`;
  const currentScope=useRef(readScope);currentScope.current=readScope;
  const restoredScope=useRef('');
  const [sourceReady,setSourceReady]=useState(false);
  const isArgentina = country.paisCodigo === "AR";
  const isColombia = country.paisCodigo === "CO";
  const currencySymbol = country.simboloMoneda || "S/";
  const [loading, setLoading] = useState(false);
  const [empleados, setEmpleados] = useState<EmpleadoPlanilla[]>([]);
  const [calculando, setCalculando] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  const [epsCobertura, setEpsCobertura] = useState(emptyEpsCobertura);
  const [epsReadReady, setEpsReadReady] = useState(true);
  const [basesGratificacion, setBasesGratificacion] = useState<BasesGratificacionValue>({});
  useEffect(() => { if (isOpen) setBasesGratificacion({}); }, [isOpen, planilla?.id, planilla?.periodo]);
  useEffect(() => { if (isOpen) setEpsCobertura(emptyEpsCobertura()); }, [isOpen, planilla?.id]);

  const loadEmpleados = useCallback(async () => {
    if (operation.pending) {setLoading(false);setSourceReady(false);return;}
    const generation = ++loadGeneration.current;
    const scope=readScope;
    const sameScope=restoredScope.current===scope;
    if(!sameScope)setEmpleados([]);
    setLoadError(null);setSourceReady(false);
    try {
      setLoading(true);
      if(!tenant?.id||!user?.id||planilla?.tenant_id!==tenant.id||planilla?.estado!=='borrador')throw new Error('No se pudo confirmar el ámbito y el borrador de la planilla.');
      const [response,contractsResponse]=await Promise.all([get("/api/rrhh/empleados"),get("/api/rrhh/contratos")]);
      if (generation !== loadGeneration.current||scope!==currentScope.current) return;
      const verified=readPayrollCalculationSources(response,contractsResponse,tenant.id,planilla.periodo);

      {
        const empleadosActivos = verified;

        const empleadosConCalculos = empleadosActivos.map((emp: any) => {
          const sueldoBase = emp.sueldo_base_confirmado;
          return calcularEmpleado({
            id: emp.id,
            incluir: true,
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

        setEmpleados(previous=>empleadosConCalculos.map(next=>{
          const old=sameScope?previous.find(p=>p.id===next.id):undefined;
          if(!old)return next;
          return calcularEmpleado({...next,incluir:old.incluir,dias_trabajados:old.dias_trabajados,horas_extras_25:old.horas_extras_25,horas_extras_35:old.horas_extras_35,horas_recargo_nocturno:old.horas_recargo_nocturno,horas_dominicales_festivas:old.horas_dominicales_festivas,tardanzas_minutos:old.tardanzas_minutos,faltas:old.faltas,bonos_adicionales:old.bonos_adicionales});
        }));
        restoredScope.current=scope;setSourceReady(true);
      }
    } catch (error) {
      if (generation !== loadGeneration.current||scope!==currentScope.current) return;
      if(!sameScope)setEmpleados([]);
      setLoadError(error instanceof Error ? error.message : 'No se pudieron consultar los empleados.');
    } finally {
      if (generation === loadGeneration.current&&scope===currentScope.current) setLoading(false);
    }
  // calcularEmpleado se ejecuta únicamente al invocar este callback y usa el
  // país vigente del mismo render; se mantiene aquí para evitar recrear toda
  // la carga por cada edición manual de una fila.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get, isArgentina, isColombia,readScope,tenant?.id,user?.id,planilla?.tenant_id,planilla?.estado,planilla?.periodo,operation.pending]);

  useEffect(() => {
    if (isOpen && planilla) {
      loadEmpleados();
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      loadGeneration.current++;
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
    if(!sourceReady||loading||loadError||checkingCalculate||!canCalculate||!operation.ready||operation.pending||operation.recoveryError||restoredScope.current!==readScope||planilla?.tenant_id!==tenant?.id||planilla?.estado!=='borrador')return;
    const seleccionados = empleados.filter(empleado => empleado.incluir);
    if (loading || loadError || !seleccionados.length || (epsCobertura.enabled && !epsReadReady)) return;
    try {
      setCalculando(true);

      // El navegador sólo envía variables operativas. Sueldo, contrato,
      // régimen pensionario, tasas y totales se vuelven a resolver y calcular
      // en el backend tenant-scoped; nunca se confían importes del preview.
      const datosCalculados = {
        ...(country.paisCodigo === 'PE' && epsCobertura.enabled ? { eps_cobertura: epsCoberturaPayload(epsCobertura, planilla.periodo) } : {}),
        empleados: seleccionados.map((emp) => ({
          empleado_id: emp.id,
          ...(country.paisCodigo === 'PE' ? { remuneracion_gratificacion_previa: basesGratificacionPayload(basesGratificacion, planilla.periodo, emp.id) } : {}),
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

      const result = await operation.perform(datosCalculados,planilla,seleccionados);
      if (result === 'CALCULATE') {
        onSuccess();
        onClose();
      }
    } catch (error: any) {
      console.error("Error calculando planilla:", error);
      alert("Error calculando planilla: " + (error?.message || String(error)));
    } finally {
      setCalculando(false);
    }
  };

  // Cálculos totales
  const visibles=restoredScope.current===readScope?empleados:[];
  const seleccionados = visibles.filter(empleado => empleado.incluir);
  const totalIngresos = seleccionados.reduce(
    (sum, emp) => sum + emp.total_ingresos,
    0,
  );
  const totalDescuentos = seleccionados.reduce(
    (sum, emp) => sum + emp.total_descuentos,
    0,
  );
  const totalNeto = seleccionados.reduce((sum, emp) => sum + emp.neto_pagar, 0);

  if (!isOpen || !planilla || planilla.tenant_id!==tenant?.id) return null;

  if (operation.pending && operation.pending.payroll.id === planilla.id) {
    const intent=operation.pending,request=payrollCalculationRequest(intent);
    const resume=async(resolve: boolean)=>{
      const result=await (resolve ? operation.resolve() : operation.perform());
      if (result) {onSuccess();onClose();}
    };
    return <Dialog open={isOpen} onOpenChange={(open)=>{if(!open)onClose();}}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Cálculo pendiente de confirmación · {intent.payroll.period}</DialogTitle></DialogHeader>
        <p className="text-sm">Se conserva la solicitud original de {intent.employees.length} empleados. El reintento utiliza sus mismos datos. La conciliación recupera un cálculo ya confirmado o abandona de forma segura una solicitud que no se confirmó.</p>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Empleado</th><th>Días trabajados</th><th>Horas extras 25%</th><th>Horas extras 35%</th><th>Tardanzas</th><th>Faltas</th><th>Bonos</th></tr></thead><tbody>
          {request.empleados.map((input:any)=>{const employee=intent.employees.find(row=>row.id.toLowerCase()===input.empleado_id.toLowerCase())!;return <tr key={input.empleado_id}><td>{employee.name}<br/>{employee.document}</td><td>{input.dias_trabajados}</td><td>{input.horas_extras_25}</td><td>{input.horas_extras_35}</td><td>{input.tardanzas_minutos}</td><td>{input.faltas}</td><td>{input.bonos_adicionales ?? 0}</td></tr>;})}
        </tbody></table></div>
        {request.eps_cobertura && <p className="text-sm">Cobertura EPS original: {request.eps_cobertura.periodo_cobertura} · {request.eps_cobertura.referencia} · {intent.payroll.currency} {request.eps_cobertura.monto_pagado}</p>}
        {(operation.error || operation.recoveryError) && <div role="alert" className="text-sm text-destructive">{operation.error || operation.recoveryError}</div>}
        <div className="flex flex-wrap gap-2"><Button disabled={operation.busy || !operation.ready || !canCalculate || checkingCalculate || !!operation.recoveryError} onClick={()=>{void resume(false);}}>Reintentar solicitud original</Button>
          <Button variant="outline" disabled={operation.busy || !operation.ready || !canCalculate || checkingCalculate || !!operation.recoveryError} onClick={()=>{void resume(true);}}>Conciliar o abandonar solicitud</Button>
          <Button variant="outline" onClick={onClose}>Cerrar y conservar solicitud</Button></div>
      </DialogContent>
    </Dialog>;
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !calculando && onClose()}
    >
      <DialogContent className="flex h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden border-border bg-card p-0 text-card-foreground xl:max-w-[1600px]">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
          <DialogTitle>🧮 Calcular Planilla {planilla?.periodo}</DialogTitle>
        </DialogHeader>
        {(operation.error || operation.recoveryError) && <div role="alert" className="text-sm text-destructive">{operation.error || operation.recoveryError}</div>}

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
                {seleccionados.length}
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

          <p className="my-2 text-sm text-muted-foreground">Los importes de esta vista son estimados. Al calcular se resolverán la normativa, los contratos, la gratificación y el crédito EPS aplicables; revisa los totales definitivos en la planilla calculada antes de aprobarla.</p>
          {loadError && <div role="alert" className="my-2 text-destructive">{loadError} <Button variant="outline" onClick={loadEmpleados} disabled={loading}>Reintentar lectura</Button></div>}
          {/* Tabla de empleados estilo Excel */}
          <div className="flex-[1] overflow-auto border">
            <table className="w-[100%] text-[0.875rem] bg-card">
              <thead className="sticky top-0 bg-[var(--primary-100)] z-[10]">
                <tr>
                  <th className="p-3 border">Incluir</th>
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
                {visibles.map((empleado, index) => (
                  <tr key={empleado.id}>
                    <td className="p-3 border"><input type="checkbox" aria-label={`Incluir ${empleado.nombres} ${empleado.apellidos}`} checked={empleado.incluir} disabled={calculando} onChange={event => setEmpleados(current => current.map(item => item.id === empleado.id ? {...item,incluir:event.target.checked} : item))}/></td>
                    <td className="p-3 border sticky left-0 font-semibold">
                      <div>
                        {empleado.nombres} {empleado.apellidos}
                      </div>
                      <div className="text-xs text-[var(--primary-500)]">
                        {empleado.puesto} • {empleado.numero_documento}
                      </div>
                    </td>
                    <td className="p-2 border">
                      <input aria-label="Sueldo base"
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
                      <input aria-label="Días trabajados"
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
                      <input aria-label="Horas extra al 25%"
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
                      <input aria-label="Horas extra al 35%"
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
                      <input aria-label="Minutos de tardanza"
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
                      <input aria-label="Faltas"
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
                      <input aria-label="Bonos adicionales"
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
          {country.paisCodigo === 'PE' && <div className="w-full max-h-64 overflow-y-auto space-y-3"><BasesGratificacionForm periodo={planilla.periodo} empleados={seleccionados} value={basesGratificacion} onChange={setBasesGratificacion}/><EpsCoberturaForm periodo={planilla.periodo} value={epsCobertura} onChange={setEpsCobertura} onReadReadyChange={setEpsReadReady}/></div>}
          <Button
            onClick={calcularPlanillaCompleta}
            disabled={loading || calculando || !!loadError || !sourceReady || checkingCalculate || !canCalculate || !operation.ready || !!operation.pending || !!operation.recoveryError || restoredScope.current!==readScope || !seleccionados.length || (epsCobertura.enabled && !epsReadReady)}
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
