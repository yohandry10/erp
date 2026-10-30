"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useApi } from "@/hooks/use-api";
import { toast } from "@/components/ui/use-toast";
import { useCountryContext } from "@/hooks/use-country-context";
import { EpsCoberturaForm, emptyEpsCobertura, epsCoberturaPayload } from "@/components/rrhh/EpsCoberturaForm";
import { BasesGratificacionForm, BasesGratificacionValue, basesGratificacionPayload } from "@/components/rrhh/BasesGratificacionForm";
import { useTenant } from "@/contexts/TenantContext";
import { usePermission } from "@/hooks/use-permission";
import { usePayrollCreationOperation } from '@/hooks/use-payroll-creation-operation';
import { readPayrollCalculationSources } from "@/lib/rrhh/payroll-calculation-source";

interface PlanillaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Empleado {
  id: string;
  nombres: string;
  apellidos: string;
  numero_documento: string;
  puesto: string;
  estado: string;
  contratos?: any[];
}

interface EmpleadoPlanilla extends Empleado {
  incluir: boolean;
  dias_trabajados: number;
  horas_extras_25: number;
  horas_extras_35: number;
  tardanzas_minutos: number;
  faltas: number;
  sueldo_base: number;
  bonos_adicionales: number;
  // Calculados en tiempo real
  sueldo_diario: number;
  descuento_tardanzas: number;
  descuento_faltas: number;
  pago_horas_extras: number;
  sueldo_bruto_total: number;
}

const DIAS_LABORABLES_MES = 30;
const HORAS_DIA = 8;
const VALOR_HORA_NORMAL = (sueldo: number) =>
  sueldo / DIAS_LABORABLES_MES / HORAS_DIA;

export default function PlanillaModal({
  isOpen,
  onClose,
  onSuccess,
}: PlanillaModalProps) {
  const { get } = useApi({ throwOnError: true, requireLive: true });
  const {tenant,user}=useTenant();
  const {hasPermission:canCreate,loading:checkingCreate}=usePermission('rrhh','create','planillas');
  const {hasPermission:canCalculate,loading:checkingCalculate}=usePermission('rrhh','calculate','planillas');
  const country = useCountryContext();
  const creation=usePayrollCreationOperation({tenantId:tenant?.id || '',actorId:user?.id || ''},canCreate && canCalculate,isOpen && !checkingCreate && !checkingCalculate && !!tenant?.id && !!user?.id);
  const isArgentina = country.paisCodigo === "AR";
  const isColombia = country.paisCodigo === "CO";
  const currencySymbol = country.simboloMoneda || "S/";
  const [loading, setLoading] = useState(false);
  const [empleados, setEmpleados] = useState<EmpleadoPlanilla[]>([]);
  const [epsCobertura, setEpsCobertura] = useState(emptyEpsCobertura);
  const [epsReadReady, setEpsReadReady] = useState(true);
  useEffect(() => { if (isOpen) setEpsCobertura(emptyEpsCobertura()); }, [isOpen]);

  const [formData, setFormData] = useState({
    periodo: "",
    tipo: "mensual",
    observaciones: "",
    estado: "borrador",
  });
  const [basesGratificacion, setBasesGratificacion] = useState<BasesGratificacionValue>({});
  const readScope=`${tenant?.id || ''}:${user?.id || ''}:${formData.periodo}`;
  const currentScope=useRef(readScope);currentScope.current=readScope;
  const restoredScope=useRef(''),loadGeneration=useRef(0);
  const [sourceReady,setSourceReady]=useState(false),[loadError,setLoadError]=useState<string|null>(null);
  useEffect(() => { if (isOpen) setBasesGratificacion({}); }, [isOpen, formData.periodo]);

  const configurarPeriodoActual = () => {
    const ahora = new Date();
    const periodo = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
    setFormData({
      periodo,
      tipo: "mensual",
      observaciones: `Planilla mensual ${periodo}`,
      estado: "borrador",
    });
  };

  const loadEmpleados = useCallback(async () => {
    const generation=++loadGeneration.current,scope=readScope;
    setSourceReady(false);setLoadError(null);
    if (!isOpen || !creation.ready || creation.pending || creation.recoveryError || !formData.periodo || checkingCreate || checkingCalculate) return;
    const sameScope=restoredScope.current===scope;
    if (restoredScope.current && !restoredScope.current.startsWith(`${tenant?.id || ''}:${user?.id || ''}:`)) setEmpleados([]);
    try {
      setLoading(true);
      if (!tenant?.id || !user?.id || !canCreate || !canCalculate) throw new Error('Se requiere confirmar la empresa, el usuario y los permisos de creación y cálculo.');
      const [empleadosResponse,contratosResponse]=await Promise.all([get("/api/rrhh/empleados"),get("/api/rrhh/contratos")]);
      if (generation!==loadGeneration.current || scope!==currentScope.current) return;
      const empleadosActivos=readPayrollCalculationSources(empleadosResponse,contratosResponse,tenant.id,formData.periodo);
      const empleadosConDatos = empleadosActivos.map((emp: any) => {
          const sueldoBase = emp.sueldo_base_confirmado;
          return {
            ...emp,
            incluir: true,
            dias_trabajados: DIAS_LABORABLES_MES,
            horas_extras_25: 0,
            horas_extras_35: 0,
            tardanzas_minutos: 0,
            faltas: 0,
            sueldo_base: sueldoBase,
            bonos_adicionales: 0,
            // Calculados
            sueldo_diario: sueldoBase / DIAS_LABORABLES_MES,
            descuento_tardanzas: 0,
            descuento_faltas: 0,
            pago_horas_extras: 0,
            sueldo_bruto_total: sueldoBase,
          };
        });

      setEmpleados(previous=>{
        const byId=new Map(previous.map(row=>[row.id,row]));
        return empleadosConDatos.map(next=>{
          const old=sameScope ? byId.get(next.id) : undefined;
          if (!old) return next;
          const updated={...next,incluir:old.incluir,dias_trabajados:old.dias_trabajados,horas_extras_25:old.horas_extras_25,horas_extras_35:old.horas_extras_35,tardanzas_minutos:old.tardanzas_minutos,faltas:old.faltas,bonos_adicionales:old.bonos_adicionales};
          return {...updated,...calcularValoresEmpleado(updated)};
        });
      });
      restoredScope.current=scope;setSourceReady(true);
    } catch (error) {
      if (generation!==loadGeneration.current || scope!==currentScope.current) return;
      setLoadError(error instanceof Error ? error.message : 'No se pudieron confirmar las fuentes completas de la planilla.');
    } finally {
      if (generation===loadGeneration.current && scope===currentScope.current) setLoading(false);
    }
  // Calculations are invoked later in the same render with the confirmed country.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get,isOpen,readScope,tenant?.id,user?.id,formData.periodo,canCreate,canCalculate,checkingCreate,checkingCalculate,isArgentina,isColombia,creation.ready,creation.pending,creation.recoveryError]);

  useEffect(() => {
    if (isOpen) {
      configurarPeriodoActual();
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      loadGeneration.current++;
      document.body.style.overflow = "unset";
    };
  // Reset the period only when opening, allowing explicit period edits and source retries.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  useEffect(()=>{if(isOpen)void loadEmpleados();return()=>{loadGeneration.current++;};},[isOpen,loadEmpleados]);

  const calcularValoresEmpleado = (empleado: EmpleadoPlanilla) => {
    const sueldoDiario = empleado.sueldo_base / DIAS_LABORABLES_MES;
    const valorHoraNormal = isArgentina
      ? empleado.sueldo_base / 200
      : isColombia
        ? empleado.sueldo_base / 210
        : empleado.sueldo_base / DIAS_LABORABLES_MES / HORAS_DIA;

    // Descuentos por tardanzas (proporcional por minuto)
    const descuentoTardanzas =
      (empleado.tardanzas_minutos * valorHoraNormal) / 60;

    // Descuentos por faltas (día completo)
    const descuentoFaltas = empleado.faltas * sueldoDiario;

    // Pago por horas extras
    const pagoHorasExtras25 =
      empleado.horas_extras_25 * valorHoraNormal * (isArgentina ? 1.5 : 1.25);
    const pagoHorasExtras35 =
      empleado.horas_extras_35 *
      valorHoraNormal *
      (isArgentina ? 2 : isColombia ? 1.75 : 1.35);
    const pagoHorasExtras = pagoHorasExtras25 + pagoHorasExtras35;

    // Sueldo bruto total
    const sueldoBrutoTotal =
      empleado.sueldo_base +
      empleado.bonos_adicionales +
      pagoHorasExtras -
      descuentoTardanzas -
      descuentoFaltas;

    return {
      sueldo_diario: sueldoDiario,
      descuento_tardanzas: descuentoTardanzas,
      descuento_faltas: descuentoFaltas,
      pago_horas_extras: pagoHorasExtras,
      sueldo_bruto_total: sueldoBrutoTotal,
    };
  };

  const actualizarEmpleado = (
    empleadoId: string,
    campo: string,
    valor: any,
  ) => {
    setEmpleados((prevEmpleados) =>
      prevEmpleados.map((emp) => {
        if (emp.id === empleadoId) {
          const empleadoActualizado = { ...emp, [campo]: valor };
          const calculados = calcularValoresEmpleado(empleadoActualizado);
          return { ...empleadoActualizado, ...calculados };
        }
        return emp;
      }),
    );
  };

  const empleadosSeleccionados = empleados.filter((emp) => emp.incluir);
  const totalPlanilla = empleadosSeleccionados.reduce(
    (sum, emp) => sum + emp.sueldo_bruto_total,
    0,
  );
  const totalEmpleados = empleadosSeleccionados.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creation.ready || creation.pending || creation.recoveryError || creation.busy || country.loading || !sourceReady || loadError || restoredScope.current!==readScope || checkingCreate || checkingCalculate || !canCreate || !canCalculate) return;
    if (epsCobertura.enabled && !epsReadReady) return;

    try {
      if (empleadosSeleccionados.length === 0) {
        toast({
          title: "Error",
          description: "Debe seleccionar al menos un empleado",
          variant: "destructive",
        });
        return;
      }

      if (!formData.periodo.trim()) {
        toast({
          title: "Error",
          description: "Ingrese el período de la planilla",
          variant: "destructive",
        });
        return;
      }

      // Crear planilla
      const epsSource = country.paisCodigo === 'PE' ? epsCoberturaPayload(epsCobertura, formData.periodo) : undefined;
      const historicSources = country.paisCodigo === 'PE'
        ? new Map(empleadosSeleccionados.map(employee => [employee.id, basesGratificacionPayload(basesGratificacion, formData.periodo, employee.id)]))
        : new Map();
      const calculoOriginal = {
          ...(epsSource ? { eps_cobertura: epsSource } : {}),
          empleados: empleadosSeleccionados.map((empleado) => ({
            empleado_id: empleado.id,
            ...(historicSources.get(empleado.id) ? { remuneracion_gratificacion_previa: historicSources.get(empleado.id) } : {}),
            dias_trabajados: empleado.dias_trabajados,
            horas_extras_25: empleado.horas_extras_25,
            horas_extras_35: empleado.horas_extras_35,
            tardanzas_minutos: empleado.tardanzas_minutos,
            faltas: empleado.faltas,
            bonos_adicionales: empleado.bonos_adicionales,
          })),
        };
      const confirmed = await creation.perform({periodo:formData.periodo,observaciones:formData.observaciones,pais_codigo:country.paisCodigo,moneda:country.moneda,calculo_original:calculoOriginal},empleadosSeleccionados);
      if (confirmed?.action === 'CALCULATE') {
        toast({title:'Planilla confirmada',description:`Planilla ${formData.periodo} creada con ${confirmed.receipt.totalEmpleados} empleados`});
        onSuccess();handleClose();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error procesando planilla",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    loadGeneration.current++;restoredScope.current='';setSourceReady(false);setLoadError(null);
    setFormData({
      periodo: "",
      tipo: "mensual",
      observaciones: "",
      estado: "borrador",
    });
    setEmpleados([]);
    creation.invalidate();
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  if (creation.pending || creation.recoveryError) {
    const original=creation.pending ? JSON.parse(creation.pending.body) : null;
    const continueOriginal=async(resolve:boolean)=>{
      const result=await (resolve ? creation.resolve() : creation.perform());
      if (!result)return;
      if (result.action==='CREATION_CONFIRMED') {
        toast({title:'Alta confirmada',description:'La cabecera está creada. Continúe para confirmar el cálculo original.'});return;
      }
      toast({title:result.action==='CALCULATE'?'Planilla confirmada':'Solicitud conciliada',description:result.action==='ABANDON_CREATION'?'Se abandonó la solicitud; no se creó una planilla.':result.action==='ABANDON_CALCULATION'?'La cabecera está creada y el cálculo original fue abandonado.':'El alta y el cálculo originales quedaron confirmados.'});
      if (result.action!=='ABANDON_CREATION')onSuccess();handleClose();
    };
    return typeof window==='undefined'?null:createPortal(
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4">
        <div role="dialog" aria-modal="true" aria-label="Solicitud original de planilla" className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-lg bg-card p-6 shadow-xl">
          <div className="flex justify-between items-center"><h2 className="text-xl font-semibold">Solicitud original de planilla</h2><button type="button" onClick={handleClose} aria-label="Cerrar solicitud original">✕</button></div>
          <p>{creation.pending?.parentReceipt?'La cabecera está confirmada. Falta confirmar el cálculo original.':'El alta aún no está confirmada. Sus datos se conservan para continuar o conciliar.'}</p>
          {original && <><p>Período: <strong>{original.periodo}</strong> · Moneda: {original.moneda}</p><p>{original.observaciones || 'Sin observaciones'}</p>
            <table className="w-full text-sm"><thead><tr><th className="text-left">Empleado</th><th>Días</th><th>Faltas</th><th>Bonos</th></tr></thead><tbody>{creation.pending!.employees.map(employee=>{const row=original.calculo_original.empleados.find((e:any)=>e.empleado_id===employee.id);return <tr key={employee.id}><td>{employee.name} · {employee.document}</td><td className="text-center">{row.dias_trabajados}</td><td className="text-center">{row.faltas}</td><td className="text-center">{row.bonos_adicionales ?? 0}</td></tr>})}</tbody></table>
          </>}
          {(creation.recoveryError || creation.error) && <p role="alert" className="my-4 text-red-600">{creation.recoveryError || creation.error}</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={handleClose}>Cerrar</button>
            {creation.recoveryError?<button type="button" onClick={creation.recover}>Recuperar solicitud</button>:<>
              <button type="button" disabled={!creation.ready || creation.busy || !canCreate || !canCalculate} onClick={()=>void continueOriginal(true)}>Conciliar solicitud</button>
              <button type="button" disabled={!creation.ready || creation.busy || !canCreate || !canCalculate} onClick={()=>void continueOriginal(false)}>{creation.busy?'Procesando...':'Continuar solicitud original'}</button>
            </>}
          </div>
        </div>
      </div>,document.body);
  }

  const modalContent = (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.5)] flex items-center justify-center p-4 z-[99999]">
      <div className="bg-card rounded-xl shadow w-[100%] max-w-[1280px] max-h-[calc(100vh-2rem)] overflow-hidden z-[100000] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b shrink-0">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2 m-0">
                💰 Nueva Planilla de Sueldos
              </h2>
              <p className="text-sm text-muted-foreground mt-[4px] m-0">
                Configure el período y seleccione empleados para generar la
                planilla
              </p>
            </div>

            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-red-500 text-white border-0 cursor-pointer flex items-center justify-center font-bold text-base"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {creation.error && <p role="alert" className="text-red-600">{creation.error}</p>}
          <form
            id="planilla-form"
            onSubmit={handleSubmit}
            className="flex flex-col gap-6"
          >
            {/* Configuración de Planilla */}
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="text-[18px] font-medium text-foreground mb-4 m-0">
                ⚙️ Configuración
              </h3>
              <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4">
                <div>
                  <label
                    htmlFor="planilla-modal-periodo"
                    className="block text-sm font-medium text-foreground/85 mb-[4px]"
                  >
                    Período
                  </label>
                  <input
                    id="planilla-modal-periodo"
                    type="text"
                    value={formData.periodo}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        periodo: e.target.value,
                      }))
                    }
                    className="w-[100%] p-2 border rounded-[6px] text-sm"
                    placeholder="2025-06"
                    required
                  />
                </div>
                <p className="col-span-full m-0 text-sm text-muted-foreground">
                  El período define el rango de cálculo. La fecha efectiva se
                  registra al pagar, usando el día local de la empresa y la
                  evidencia de banco o caja.
                </p>
              </div>
              <div className="mt-4">
                <label
                  htmlFor="planilla-modal-observaciones"
                  className="block text-sm font-medium text-foreground/85 mb-[4px]"
                >
                  Observaciones
                </label>
                <textarea
                  id="planilla-modal-observaciones"
                  value={formData.observaciones}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      observaciones: e.target.value,
                    }))
                  }
                  className="w-[100%] p-2 border rounded-[6px] text-sm"
                  rows={2}
                />
              </div>
            </div>

            {country.paisCodigo === 'PE' && <EpsCoberturaForm periodo={formData.periodo} value={epsCobertura} onChange={setEpsCobertura} onReadReadyChange={setEpsReadReady}/>}
            {country.paisCodigo === 'PE' && <BasesGratificacionForm periodo={formData.periodo} empleados={empleadosSeleccionados} value={basesGratificacion} onChange={setBasesGratificacion}/>}
            {loadError && <div role="alert" className="rounded-lg border border-destructive p-3 text-sm"><p>{loadError} Se conservan los campos operativos del mismo período.</p><button type="button" disabled={loading} onClick={()=>{void loadEmpleados();}} className="mt-2 rounded border px-3 py-2">Reintentar lectura</button></div>}
            {!sourceReady && !loadError && <p role="status" className="text-sm">Confirmando las fuentes de empleados y contratos del período.</p>}
            {sourceReady && restoredScope.current===readScope && <>
            {/* Gestión de Empleados */}
            <div>
              <h3 className="text-[18px] font-medium text-foreground mb-4 m-0">
                👥 Empleados para Planilla
              </h3>

              <div className="border rounded-lg overflow-hidden">
                {/* Header con explicaciones claras */}
                <div className="bg-muted py-3 px-4 grid grid-cols-[40px_200px_120px_80px_80px_80px_80px_80px_120px] gap-2 text-xs font-semibold text-foreground/85 border-b">
                  <div>✓</div>
                  <div>👤 EMPLEADO</div>
                  <div>
                    💰 SUELDO BASE
                    <br />
                    <span className="text-[0.625rem] text-muted-foreground">
                      Mensual {currencySymbol}
                    </span>
                  </div>
                  <div>
                    📅 DÍAS
                    <br />
                    <span className="text-[0.625rem] text-muted-foreground">
                      Trabajados
                    </span>
                  </div>
                  <div>
                    ⏰ HE {isArgentina ? "50" : "25"}%<br />
                    <span className="text-[0.625rem] text-muted-foreground">
                      {isArgentina
                        ? "Días hábiles"
                        : isColombia
                          ? "Diurnas"
                          : "Primeras 2h"}
                    </span>
                  </div>
                  <div>
                    ⏰ HE {isArgentina ? "100" : isColombia ? "75" : "35"}%
                    <br />
                    <span className="text-[0.625rem] text-muted-foreground">
                      {isArgentina
                        ? "Domingos/feriados"
                        : isColombia
                          ? "Nocturnas"
                          : "Siguientes"}
                    </span>
                  </div>
                  <div>
                    ⏱️ TARDANZAS
                    <br />
                    <span className="text-[0.625rem] text-muted-foreground">
                      Minutos
                    </span>
                  </div>
                  <div>
                    ❌ FALTAS
                    <br />
                    <span className="text-[0.625rem] text-muted-foreground">
                      Días
                    </span>
                  </div>
                  <div>
                    💵 ADICIONALES
                    <br />
                    <span className="text-[0.625rem] text-muted-foreground">
                      {isArgentina
                        ? "Convenio"
                        : isColombia
                          ? "Otros devengados"
                          : "Bonos"}{" "}
                      {currencySymbol}
                    </span>
                  </div>
                </div>

                {/* Filas de empleados con explicaciones */}
                <div className="max-h-[320px] overflow-y-auto">
                  {empleados.map((empleado) => {
                    const valores = calcularValoresEmpleado(empleado);
                    return (
                      <div
                        key={empleado.id}
                        className="py-3 px-4 grid grid-cols-[40px_200px_120px_80px_80px_80px_80px_80px_120px] gap-2 text-[13px] border-b"
                      >
                        {/* Checkbox selección */}
                        <div className="flex items-center justify-center">
                          <input aria-label="Incluir"
                            type="checkbox"
                            checked={empleado.incluir}
                            onChange={(e) =>
                              actualizarEmpleado(
                                empleado.id,
                                "incluir",
                                e.target.checked,
                              )
                            }
                            className="w-4 h-4 cursor-pointer"
                          />
                        </div>

                        {/* Datos del empleado */}
                        <div>
                          <div className="font-semibold text-foreground mb-[2px]">
                            {empleado.nombres} {empleado.apellidos}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {empleado.puesto} •{" "}
                            {isArgentina ? "CUIL" : isColombia ? "CC" : "DNI"}:{" "}
                            {empleado.numero_documento}
                          </div>
                        </div>
                        {/* Sueldo Base */}
                        <div className="text-center">
                          <input aria-label="Sueldo base"
                            type="number"
                            value={empleado.sueldo_base}
                            readOnly
                            onChange={(e) =>
                              actualizarEmpleado(
                                empleado.id,
                                "sueldo_base",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            disabled={!empleado.incluir}
                            className="w-[100%] p-[4px] text-xs border rounded-[4px] text-center"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                          />
                          <div className="text-[0.625rem] text-emerald-400 font-semibold mt-[2px]">
                            {currencySymbol} {empleado.sueldo_base.toFixed(0)}
                          </div>
                        </div>

                        {/* Días Trabajados */}
                        <div className="text-center">
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
                            disabled={!empleado.incluir}
                            className="w-[100%] p-[4px] text-xs border rounded-[4px] text-center"
                            min="0"
                            max="31"
                          />
                          <div className="text-[0.625rem] text-primary font-semibold mt-[2px]">
                            de 30 días
                          </div>
                        </div>

                        {/* Horas Extras 25% */}
                        <div className="text-center">
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
                            disabled={!empleado.incluir}
                            className="w-[100%] p-[4px] text-xs border rounded-[4px] text-center"
                            min="0"
                            step="0.5"
                          />
                          <div className="text-[0.625rem] text-destructive font-semibold mt-[2px]">
                            +{isArgentina ? "50" : "25"}%
                          </div>
                        </div>

                        {/* Horas Extras 35% */}
                        <div className="text-center">
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
                            disabled={!empleado.incluir}
                            className="w-[100%] p-[4px] text-xs border rounded-[4px] text-center"
                            min="0"
                            step="0.5"
                          />
                          <div className="text-[0.625rem] text-destructive font-semibold mt-[2px]">
                            +{isArgentina ? "100" : isColombia ? "75" : "35"}%
                          </div>
                        </div>

                        {/* Tardanzas */}
                        <div className="text-center">
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
                            disabled={!empleado.incluir}
                            className="w-[100%] p-[4px] text-xs border rounded-[4px] text-center"
                            min="0"
                          />
                          <div className="text-[0.625rem] text-amber-500 font-semibold mt-[2px]">
                            -{currencySymbol}{" "}
                            {(
                              (empleado.tardanzas_minutos *
                                (isArgentina
                                  ? empleado.sueldo_base / 200
                                  : isColombia
                                    ? empleado.sueldo_base / 210
                                    : empleado.sueldo_base / 30 / 8)) /
                              60
                            ).toFixed(0)}
                          </div>
                        </div>

                        {/* Faltas */}
                        <div className="text-center">
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
                            disabled={!empleado.incluir}
                            className="w-[100%] p-[4px] text-xs border rounded-[4px] text-center"
                            min="0"
                          />
                          <div className="text-[0.625rem] text-red-500 font-semibold mt-[2px]">
                            -{currencySymbol}{" "}
                            {(
                              empleado.faltas *
                              (empleado.sueldo_base / 30)
                            ).toFixed(0)}
                          </div>
                        </div>

                        {/* Bonos Adicionales */}
                        <div className="text-center">
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
                            disabled={!empleado.incluir}
                            className="w-[100%] p-[4px] text-xs border rounded-[4px] text-center"
                            min="0"
                            step="0.01"
                          />
                          <div className="text-[0.625rem] text-emerald-400 font-semibold mt-[2px]">
                            Total: {currencySymbol}{" "}
                            {valores.sueldo_bruto_total.toFixed(0)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Resumen Empresarial Claro */}
              <div className="mt-4 p-4 bg-muted rounded-lg border">
                <div className="grid grid-cols-[repeat(auto-fit,_minmax(150px,_1fr))] gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-primary">
                      {empleadosSeleccionados.length}
                    </div>
                    <div className="text-xs text-[#1e40af] font-medium">
                      EMPLEADOS INCLUIDOS
                    </div>
                  </div>

                  <div>
                    <div className="text-2xl font-bold text-emerald-400">
                      {currencySymbol} {totalPlanilla.toFixed(0)}
                    </div>
                    <div className="text-xs text-emerald-400 font-medium">
                      TOTAL BRUTO PLANILLA
                    </div>
                  </div>

                  <div>
                    <div className="text-2xl font-bold text-violet-400">
                      {currencySymbol}{" "}
                      {empleadosSeleccionados.length > 0
                        ? (
                            totalPlanilla / empleadosSeleccionados.length
                          ).toFixed(0)
                        : "0"}
                    </div>
                    <div className="text-xs text-violet-400 font-medium">
                      PROMEDIO POR EMPLEADO
                    </div>
                  </div>

                  <div>
                    <div className="text-2xl font-bold text-destructive">
                      {formData.periodo}
                    </div>
                    <div className="text-xs text-destructive font-medium">
                      PERÍODO PLANILLA
                    </div>
                  </div>
                </div>

                {empleadosSeleccionados.length > 0 && (
                  <div className="mt-3 py-2 px-3 bg-[#dcfce7] rounded-[6px] text-[13px] text-[#166534] text-center font-medium">
                    ✅ Planilla lista para procesar con{" "}
                    {empleadosSeleccionados.length} empleados • Se calcularán
                    automáticamente:{" "}
                    {isArgentina
                      ? "SIPA, INSSJP, obra social, SAC, contribuciones y ART"
                      : isColombia
                        ? "salud, pensión, PILA, ARL, parafiscales, prestaciones y auxilio de transporte"
                        : "AFP/ONP, EsSalud, impuesto de quinta categoría"}
                  </div>
                )}
              </div>
            </div>
            </>}
          </form>
        </div>

        {/* Footer */}
        <div className="py-4 px-6 border-t bg-muted flex justify-end items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="py-2 px-6 text-muted-foreground border rounded-lg bg-card text-sm"
          >
            Cancelar
          </button>

          <button
            type="submit"
            form="planilla-form"
            disabled={
              loading || !creation.ready || creation.busy || !!creation.recoveryError || country.loading ||
              !!loadError || !sourceReady || restoredScope.current!==readScope || checkingCreate || checkingCalculate || !canCreate || !canCalculate ||
              empleadosSeleccionados.length === 0 ||
              (epsCobertura.enabled && !epsReadReady) ||
              !formData.periodo
            }
            className="py-2 px-8 text-white rounded-lg border-0 flex items-center gap-2 text-sm font-medium"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded-full"></div>
                Procesando...
              </>
            ) : (
              <>
                ✅ Crear Planilla
                <span className="bg-blue-700 py-[2px] px-2 rounded-[4px] text-xs">
                  {empleadosSeleccionados.length} empleados
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof window !== "undefined") {
    return createPortal(modalContent, document.body);
  } else {
    return null;
  }
}
