"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Calculator,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { PageShell } from "@/components/erp/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApi } from "@/hooks/use-api";
import { usePermission } from "@/hooks/use-permission";
import { useCountryContext } from "@/hooks/use-country-context";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { customAuth } from "@/lib/auth-service";
import { readBenefitsRows } from "@/lib/rrhh/benefits-read-contract";
import { GratificacionPreviaForm, emptyGratificacionPrevia, gratificacionPreviaPayload, type GratificacionPreviaFormValue, RemuneracionPreviaForm, emptyRemuneracionPrevia, remuneracionPreviaPayload } from "@/components/rrhh/GratificacionPreviaForm";

const normalizedStatus = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();
const localCalendarDate = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
};

export default function LiquidacionesPage() {
  const { get } = useApi({ throwOnError: true, requireLive: true, showErrorToast: false });
  const { post } = useApi({ throwOnError: true });
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const country = useCountryContext();
  const isPeru = country.paisCodigo === "PE";
  const pageTitle = isPeru ? "Liquidaciones y CTS" : country.paisCodigo === "AR"
    ? "Liquidaciones finales"
    : "Liquidaciones laborales";
  const { toast } = useToast();
  const { hasPermission: canPayLiquidation, loading: loadingPayPermission } = usePermission('rrhh', 'pay', 'liquidaciones');
  const { hasPermission: canDepositCts, loading: loadingCtsPermission } = usePermission('rrhh', 'deposit', 'cts');
  const { hasPermission: canCalculateLiquidation, loading: loadingCalculatePermission } = usePermission('rrhh', 'calculate', 'liquidaciones');
  const { hasPermission: canApproveLiquidation, loading: loadingApprovePermission } = usePermission('rrhh', 'approve', 'liquidaciones');
  const { hasPermission: canReverseLiquidation, loading: loadingReversePermission } = usePermission('rrhh', 'reverse', 'liquidaciones');
  const { hasPermission: canCalculateCts, loading: loadingCalculateCtsPermission } = usePermission('rrhh', 'calculate', 'cts');
  const [busy, setBusy] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [terminationDate, setTerminationDate] = useState(localCalendarDate);
  const [terminationReason, setTerminationReason] = useState("renuncia");
  const [selectedLiquidationId, setSelectedLiquidationId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [reversalReason, setReversalReason] = useState("");
  const [ctsPeriod, setCtsPeriod] = useState(`${new Date().getFullYear()}-11`);
  const [ctsReference, setCtsReference] = useState("");
  const [gratificacionPrevia, setGratificacionPrevia] = useState(emptyGratificacionPrevia);
  const [gratificacionesCts, setGratificacionesCts] = useState<Record<string, GratificacionPreviaFormValue>>({});
  const [remuneracionPrevia, setRemuneracionPrevia] = useState(emptyRemuneracionPrevia);
  const [remuneracionesCts, setRemuneracionesCts] = useState<Record<string, ReturnType<typeof emptyRemuneracionPrevia>>>({});
  useEffect(() => { setGratificacionPrevia(emptyGratificacionPrevia()); setRemuneracionPrevia(emptyRemuneracionPrevia()); }, [employeeId]);
  const terminationParts = /^(\d{4})-(\d{2})-\d{2}$/.exec(terminationDate);
  const priorGratificationPeriod = terminationParts
    ? Number(terminationParts[2]) === 12 ? `${terminationParts[1]}-12`
      : Number(terminationParts[2]) >= 7 ? `${terminationParts[1]}-07` : `${Number(terminationParts[1]) - 1}-12`
    : "";
  const ctsParts = /^(\d{4})-(05|11)$/.exec(ctsPeriod);
  const priorSalaryPeriod = terminationParts
    ? Number(terminationParts[2]) === 1 ? `${Number(terminationParts[1]) - 1}-12`
      : `${terminationParts[1]}-${String(Number(terminationParts[2]) - 1).padStart(2, '0')}`
    : "";
  const ctsGratificationPeriod = ctsParts
    ? ctsParts[2] === "11" ? `${ctsParts[1]}-07` : `${Number(ctsParts[1]) - 1}-12`
    : "";
  const ctsSalaryPeriod = ctsParts ? `${ctsParts[1]}-${ctsParts[2] === '05' ? '04' : '10'}` : '';
  const liquidationPaymentIntentRef = useRef<{
    fingerprint: string;
    key: string;
  } | null>(null);

  const { data, isLoading, isFetching, error: loadError, refetch } = useQuery({
    queryKey: ["rrhh-liquidaciones-operativas", user?.tenant_id, user?.id, country.paisCodigo, canPayLiquidation, canDepositCts],
    enabled: !authLoading && !!user && !country.loading && !loadingPayPermission && !loadingCtsPermission,
    retry: false,
    queryFn: async () => {
      const actor = (await customAuth.getRequestSession()).session?.user;
      if (!actor || actor.id !== user?.id || actor.tenant_id !== user.tenant_id) throw new Error('La sesión cambió. Consulte nuevamente los datos laborales.');
      const [
        employeesResponse,
        liquidationsResponse,
        ctsResponse,
        banksResponse,
      ] = await Promise.all([
        get("/rrhh/empleados"),
        get("/rrhh/liquidaciones"),
        country.paisCodigo === "PE"
          ? get("/rrhh/cts/depositos")
          : Promise.resolve({ success: true, data: [] }),
        canPayLiquidation ? get("/rrhh/liquidaciones/tesoreria/destinos")
          : canDepositCts ? get("/rrhh/cts/tesoreria/destinos") : Promise.resolve({ success: true, data: [] }),
      ]);
      const current = (await customAuth.getRequestSession()).session?.user;
      if (current?.id !== actor.id || current.tenant_id !== actor.tenant_id) throw new Error('La sesión cambió durante la consulta. Consulte nuevamente los datos laborales.');
      return {
        employees: readBenefitsRows(employeesResponse, 'employees', actor.tenant_id),
        liquidations: readBenefitsRows(liquidationsResponse, 'liquidations', actor.tenant_id),
        cts: readBenefitsRows(ctsResponse, 'cts', actor.tenant_id),
        banks: readBenefitsRows(banksResponse, 'banks', actor.tenant_id),
      };
    },
  });

  const employees = data?.employees || [];
  const liquidations = data?.liquidations || [];
  const ctsDeposits = data?.cts || [];
  const banks = (data?.banks || []).filter(
    (bank: any) =>
      bank?.activa !== false &&
      normalizedStatus(bank?.estado || "activo") === "activo",
  );
  const activeEmployees = employees.filter(
    (employee: any) => normalizedStatus(employee?.estado) === "activo",
  );
  const selectedLiquidation = liquidations.find(
    (item: any) => item.id === selectedLiquidationId,
  );
  const readReady = !!data && !isLoading && !isFetching && !loadError && !authLoading && !country.loading && !loadingPayPermission && !loadingCtsPermission && !loadingCalculatePermission && !loadingApprovePermission && !loadingReversePermission && !loadingCalculateCtsPermission;
  useEffect(() => {
    if (!readReady) return;
    if (employeeId && !activeEmployees.some((employee: any) => employee.id === employeeId)) setEmployeeId('');
    if (selectedLiquidationId && !selectedLiquidation) setSelectedLiquidationId('');
    if (bankAccountId && !banks.some((bank: any) => bank.id === bankAccountId)) setBankAccountId('');
  }, [readReady, activeEmployees, employeeId, selectedLiquidationId, selectedLiquidation, bankAccountId, banks]);

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(country.locale || "es-PE", {
        style: "currency",
        currency: selectedLiquidation?.moneda || country.moneda || "PEN",
        minimumFractionDigits: 2,
      }),
    [country.locale, country.moneda, selectedLiquidation?.moneda],
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["rrhh-liquidaciones-operativas"],
    });
  };

  const run = async (operation: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await operation();
      await refresh();
      toast({ title: "Operación completada", description: message });
    } catch {
      // useApi ya presenta el error HTTP; se absorbe para evitar una promesa
      // rechazada sin manejar desde el evento de la interfaz.
    } finally {
      setBusy(false);
    }
  };

  const calculateLiquidation = () => {
    let source, salarySource;
    try {
      source = isPeru ? gratificacionPreviaPayload(gratificacionPrevia, priorGratificationPeriod) : undefined;
      salarySource = isPeru ? remuneracionPreviaPayload(remuneracionPrevia, priorSalaryPeriod) : undefined;
    }
    catch (error) { toast({ title: "Revisa la gratificación anterior", description: (error as Error).message, variant: "destructive" }); return; }
    return run(
      () =>
        post(`/rrhh/empleados/${employeeId}/liquidacion`, {
          motivo_terminacion: terminationReason,
          fecha_terminacion: terminationDate,
          ...(source ? { gratificacion_previa: source } : {}),
          ...(salarySource ? { remuneracion_gratificacion_previa: salarySource } : {}),
        }),
      "La liquidación quedó calculada. El empleado continúa activo hasta confirmar.",
    );
  };

  const confirmLiquidation = (id: string) =>
    run(
      () => post(`/rrhh/liquidaciones/${id}/confirmar`, {}),
      "Liquidación confirmada, cese aplicado y devengo contable encolado.",
    );

  const payLiquidation = () => {
    const payload = {
      metodo_pago: "transferencia" as const,
      cuenta_bancaria_id: bankAccountId,
      referencia: paymentReference,
    };
    const fingerprint = JSON.stringify([selectedLiquidationId, payload]);
    if (liquidationPaymentIntentRef.current?.fingerprint !== fingerprint) {
      liquidationPaymentIntentRef.current = {
        fingerprint,
        key: `rrhh-liquidation-pay:${crypto.randomUUID()}`,
      };
    }
    return run(
      async () => {
        await post(`/rrhh/liquidaciones/${selectedLiquidationId}/pagar`, {
          ...payload,
          idempotency_key: liquidationPaymentIntentRef.current!.key,
        });
        liquidationPaymentIntentRef.current = null;
      },
      "Pago registrado con evidencia, tesorería y asiento contable durable.",
    );
  };

  const reverseLiquidationPayment = () =>
    run(
      () =>
        post(`/rrhh/liquidaciones/${selectedLiquidationId}/pago/revertir`, {
          motivo: reversalReason,
        }),
      "Pago revertido y obligación restaurada sin perder su trazabilidad.",
    );

  const calculateCts = () => {
    let sources;
    let salarySources;
    try {
      sources = Object.entries(gratificacionesCts).flatMap(([empleado_id, value]) => {
        const source = gratificacionPreviaPayload(value, ctsGratificationPeriod);
        return source ? [{ empleado_id, ...source }] : [];
      });
      salarySources = activeEmployees.flatMap((employee: any) => {
        const source = remuneracionPreviaPayload(remuneracionesCts[employee.id] || emptyRemuneracionPrevia(), ctsSalaryPeriod);
        return source ? [{ empleado_id: employee.id, ...source }] : [];
      });
    } catch (error) { toast({ title: "Revisa las fuentes históricas", description: (error as Error).message, variant: "destructive" }); return; }
    return run(
      () => post("/rrhh/cts/depositos", { periodo: ctsPeriod, ...(sources.length ? { gratificaciones_previas: sources } : {}), ...(salarySources.length ? { remuneraciones_previas: salarySources } : {}) }),
      "CTS calculada para los trabajadores elegibles.",
    );
  };

  const depositCts = (id: string) =>
    run(
      () =>
        post(`/rrhh/cts/depositos/${id}/depositar`, {
          cuenta_bancaria_id: bankAccountId,
          referencia: ctsReference,
        }),
      "CTS depositada con movimiento de tesorería y asiento contable.",
    );

  if (!readReady) return (
    <PageShell title={pageTitle} description="Consulta actual de liquidaciones y depósitos laborales.">
      <Card><CardContent className="p-5" role={loadError ? 'alert' : 'status'}>
        {loadError ? <><p>No se pudieron consultar los datos laborales: {loadError instanceof Error ? loadError.message : 'Error de lectura'}</p><Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>Reintentar consulta</Button></> : <p>Cargando datos laborales actuales…</p>}
      </CardContent></Card>
    </PageShell>
  );

  return (
    <PageShell
      title={pageTitle}
      description={isPeru
        ? "Calcula sin cesar, confirma con trazabilidad y ejecuta pagos o depósitos desde una frontera atómica."
        : "Calcula la liquidación de egreso, confirma el cese y registra el pago con trazabilidad contable."}
      actions={
        <Button
          variant="outline"
          onClick={refresh}
          disabled={isFetching || busy}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      }
    >
      <div className="grid gap-5 xl:grid-cols-3">
        {canCalculateLiquidation && <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Nueva liquidación
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label>Empleado activo</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger aria-label="Empleado para liquidar">
                  <SelectValue placeholder="Selecciona un empleado" />
                </SelectTrigger>
                <SelectContent>
                  {activeEmployees.map((employee: any) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.nombres} {employee.apellidos}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="termination-date">Fecha de terminación</Label>
              <Input
                id="termination-date"
                type="date"
                value={terminationDate}
                onChange={(event) => setTerminationDate(event.target.value)}
              />
            </div>
            <div>
              <Label>Motivo</Label>
              <Select
                value={terminationReason}
                onValueChange={setTerminationReason}
              >
                <SelectTrigger aria-label="Motivo de terminación">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="renuncia">Renuncia</SelectItem>
                  <SelectItem value="despido">Despido</SelectItem>
                  <SelectItem value="fin_contrato">Fin de contrato</SelectItem>
                  <SelectItem value="mutuo_acuerdo">Mutuo acuerdo</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isPeru && employeeId && <div className="md:col-span-4"><GratificacionPreviaForm id="liquidation-gratification" periodo={priorGratificationPeriod} value={gratificacionPrevia} onChange={setGratificacionPrevia}/></div>}
            {isPeru && employeeId && <div className="md:col-span-4"><RemuneracionPreviaForm periodo={priorSalaryPeriod} value={remuneracionPrevia} onChange={setRemuneracionPrevia}/></div>}
            <Button
              className="md:col-start-4"
              disabled={!employeeId || !terminationDate || busy}
              onClick={calculateLiquidation}
            >
              Calcular
            </Button>
            <p className="text-sm text-muted-foreground md:col-span-3">
              Calcular sólo prepara importes. El empleado y su contrato
              permanecen activos hasta la confirmación explícita.
            </p>
          </CardContent>
        </Card>}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Control del flujo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Confirmar genera el devengo y aplica el cese en un único commit.
            </p>
            <p>
              Pagar genera evidencia y movimiento bancario cuando corresponde.
            </p>
            <p>
              Revertir restaura saldo, obligación y contra-asiento sin borrar
              historia.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liquidaciones</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3">Empleado</th>
                <th className="p-3">Fecha</th>
                <th className="p-3">País</th>
                <th className="p-3">Total</th>
                <th className="p-3">Estado</th>
                <th className="p-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {liquidations.map((liquidation: any) => {
                const status = normalizedStatus(liquidation.estado);
                const employee = liquidation.empleados;
                return (
                  <tr key={liquidation.id} className="border-b last:border-0">
                    <td className="p-3 font-medium">
                      {employee
                        ? `${employee.nombres} ${employee.apellidos}`
                        : liquidation.id_empleado}
                    </td>
                    <td className="p-3">{liquidation.fecha_terminacion}</td>
                    <td className="p-3">
                      {liquidation.pais_codigo || country.paisCodigo}
                    </td>
                    <td className="p-3">
                      {new Intl.NumberFormat(country.locale || "es-PE", {
                        style: "currency",
                        currency: liquidation.moneda || country.moneda || "PEN",
                      }).format(Number(liquidation.total_liquidacion || 0))}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">{status || "sin estado"}</Badge>
                    </td>
                    <td className="p-3 text-right">
                      {status === "calculada" && canApproveLiquidation && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => confirmLiquidation(liquidation.id)}
                        >
                          Confirmar
                        </Button>
                      )}
                      {((status === "aprobada" && canPayLiquidation) || (status === "pagada" && canReverseLiquidation)) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setSelectedLiquidationId(liquidation.id)
                          }
                        >
                          {status === "pagada"
                            ? "Revisar / revertir"
                            : "Preparar pago"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!isLoading && liquidations.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-muted-foreground"
                  >
                    No hay liquidaciones calculadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {selectedLiquidation && ((normalizedStatus(selectedLiquidation.estado) === 'aprobada' && canPayLiquidation) || (normalizedStatus(selectedLiquidation.estado) === 'pagada' && canReverseLiquidation)) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              {normalizedStatus(selectedLiquidation.estado) === "pagada"
                ? "Revertir pago"
                : "Pagar liquidación"}{" "}
              ·{" "}
              {formatter.format(
                Number(selectedLiquidation.total_liquidacion || 0),
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            {normalizedStatus(selectedLiquidation.estado) === "aprobada" ? (
              <>
                <div>
                  <Label htmlFor="liquidacion-medio-pago">Medio</Label>
                  <Input id="liquidacion-medio-pago" value="Transferencia bancaria" disabled />
                  <p className="mt-1 text-xs text-muted-foreground">
                    El pago en efectivo permanece deshabilitado hasta contar con una sesión de caja y egreso tesorero explícitos.
                  </p>
                </div>
                <div>
                  <Label>Cuenta bancaria</Label>
                  <Select
                    value={bankAccountId}
                    onValueChange={setBankAccountId}
                  >
                    <SelectTrigger aria-label="Cuenta bancaria">
                      <SelectValue placeholder="Selecciona cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      {banks.map((bank: any) => (
                        <SelectItem key={bank.id} value={bank.id}>
                          {bank.banco || bank.nombre} · {bank.moneda}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="payment-reference">Referencia</Label>
                  <Input
                    id="payment-reference"
                    value={paymentReference}
                    onChange={(event) =>
                      setPaymentReference(event.target.value)
                    }
                    placeholder="Operación bancaria"
                  />
                </div>
                <Button
                  className="self-end"
                  disabled={busy || !bankAccountId || !paymentReference.trim()}
                  onClick={payLiquidation}
                >
                  Registrar pago
                </Button>
              </>
            ) : (
              <>
                <div className="md:col-span-3">
                  <Label htmlFor="reversal-reason">Motivo de reversa</Label>
                  <Input
                    id="reversal-reason"
                    value={reversalReason}
                    onChange={(event) => setReversalReason(event.target.value)}
                    placeholder="Ej. transferencia rechazada"
                  />
                </div>
                <Button
                  variant="destructive"
                  className="self-end"
                  disabled={busy || !reversalReason.trim()}
                  onClick={reverseLiquidationPayment}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Revertir pago
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {country.paisCodigo === "PE" && (
        <Card>
          <CardHeader>
            <CardTitle>Depósitos semestrales de CTS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              {canCalculateCts && <div>
                <Label htmlFor="cts-period">Período de depósito</Label>
                <Input
                  id="cts-period"
                  value={ctsPeriod}
                  onChange={(event) => setCtsPeriod(event.target.value)}
                  placeholder="2026-05 o 2026-11"
                />
              </div>}
              {canDepositCts && <div>
                <Label>Cuenta bancaria de origen</Label>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger aria-label="Cuenta bancaria de origen">
                    <SelectValue placeholder="Selecciona cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((bank: any) => (
                      <SelectItem key={bank.id} value={bank.id}>
                        {bank.banco || bank.nombre} · {bank.moneda}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>}
              {canDepositCts && <div>
                <Label htmlFor="cts-reference">Referencia de depósito</Label>
                <Input
                  id="cts-reference"
                  value={ctsReference}
                  onChange={(event) => setCtsReference(event.target.value)}
                />
              </div>}
              {canCalculateCts && <Button
                className="self-end"
                variant="outline"
                disabled={busy || !/^\d{4}-(05|11)$/.test(ctsPeriod)}
                onClick={calculateCts}
              >
                Calcular período
              </Button>}
            </div>
            {canCalculateCts && activeEmployees.length > 0 && <details className="rounded-xl border p-3">
              <summary className="cursor-pointer text-sm font-medium">Remuneración computable de {ctsSalaryPeriod} anterior al ERP</summary>
              <p className="my-2 text-xs text-muted-foreground">Se utiliza el contrato vigente al cierre de abril u octubre. Declara una fuente computable externa si falta historia o hay remuneración variable documentada. Incluye asignación familiar; excluye el sexto de gratificación, que se calcula por separado.</p>
              <div className="space-y-3">{activeEmployees.map((employee: any) => <div key={employee.id}><p className="mb-1 text-sm font-medium">{employee.nombres} {employee.apellidos}</p><RemuneracionPreviaForm id={`cts-remuneracion-${employee.id}`} periodo={ctsSalaryPeriod} value={remuneracionesCts[employee.id] || emptyRemuneracionPrevia()} onChange={value => setRemuneracionesCts(current => ({...current,[employee.id]:value}))}/></div>)}</div>
            </details>}
            {canCalculateCts && activeEmployees.length > 0 && <details className="rounded-xl border p-3">
              <summary className="cursor-pointer text-sm font-medium">Gratificaciones anteriores pagadas fuera del ERP</summary>
              <div className="mt-3 space-y-3">{activeEmployees.map((employee: any) => <div key={employee.id}><p className="mb-1 text-sm font-medium">{employee.nombres} {employee.apellidos}</p><GratificacionPreviaForm id={`cts-gratification-${employee.id}`} periodo={ctsGratificationPeriod} value={gratificacionesCts[employee.id] || emptyGratificacionPrevia()} onChange={value => setGratificacionesCts(current => ({ ...current, [employee.id]: value }))}/></div>)}</div>
            </details>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-3">Empleado</th>
                    <th className="p-3">Período</th>
                    <th className="p-3">Monto</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {ctsDeposits.map((deposit: any) => (
                    <tr key={deposit.id} className="border-b last:border-0">
                      <td className="p-3">
                        {deposit.empleados
                          ? `${deposit.empleados.nombres} ${deposit.empleados.apellidos}`
                          : deposit.empleado_id}
                      </td>
                      <td className="p-3">{deposit.periodo}</td>
                      <td className="p-3">
                        {/* La moneda es la del contribuyente. Estaba fijada en PEN,
                            y una liquidación argentina o colombiana se mostraba en
                            soles. Sin moneda resuelta se imprime el número solo,
                            que es mejor que etiquetarlo con una divisa ajena. */}
                        {new Intl.NumberFormat(country.locale || "es-PE", {
                          style: country.moneda ? "currency" : "decimal",
                          currency: country.moneda || undefined,
                          minimumFractionDigits: 2,
                        }).format(Number(deposit.monto || 0))}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">{deposit.estado}</Badge>
                      </td>
                      <td className="p-3 text-right">
                        {canDepositCts && normalizedStatus(deposit.estado) === "calculado" && (
                          <Button
                            size="sm"
                            disabled={
                              busy || !bankAccountId || !ctsReference.trim()
                            }
                            onClick={() => depositCts(deposit.id)}
                          >
                            Depositar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
