"use client";

import { useMemo, useRef, useState } from "react";
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
import { useCountryContext } from "@/hooks/use-country-context";
import { useToast } from "@/components/ui/use-toast";

const asList = (response: any): any[] => {
  if (Array.isArray(response)) return response;
  return Array.isArray(response?.data) ? response.data : [];
};

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
  const { get, post } = useApi({ throwOnError: true });
  const queryClient = useQueryClient();
  const country = useCountryContext();
  const { toast } = useToast();
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
  const liquidationPaymentIntentRef = useRef<{
    fingerprint: string;
    key: string;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["rrhh-liquidaciones-operativas", country.paisCodigo],
    enabled: !country.loading,
    queryFn: async () => {
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
          : Promise.resolve([]),
        get("/finanzas/bancos/cuentas").catch(() => []),
      ]);
      return {
        employees: asList(employeesResponse),
        liquidations: asList(liquidationsResponse),
        cts: asList(ctsResponse),
        banks: asList(banksResponse),
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

  const calculateLiquidation = () =>
    run(
      () =>
        post(`/rrhh/empleados/${employeeId}/liquidacion`, {
          motivo_terminacion: terminationReason,
          fecha_terminacion: terminationDate,
        }),
      "La liquidación quedó calculada. El empleado continúa activo hasta confirmar.",
    );

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

  const calculateCts = () =>
    run(
      () => post("/rrhh/cts/depositos", { periodo: ctsPeriod }),
      "CTS calculada para los trabajadores elegibles.",
    );

  const depositCts = (id: string) =>
    run(
      () =>
        post(`/rrhh/cts/depositos/${id}/depositar`, {
          cuenta_bancaria_id: bankAccountId,
          referencia: ctsReference,
        }),
      "CTS depositada con movimiento de tesorería y asiento contable.",
    );

  return (
    <PageShell
      title="Liquidaciones y CTS"
      description="Calcula sin cesar, confirma con trazabilidad y ejecuta pagos o depósitos desde una frontera atómica."
      actions={
        <Button
          variant="outline"
          onClick={refresh}
          disabled={isLoading || busy}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      }
    >
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
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
        </Card>

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
                      {status === "calculada" && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => confirmLiquidation(liquidation.id)}
                        >
                          Confirmar
                        </Button>
                      )}
                      {["aprobada", "pagada"].includes(status) && (
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

      {selectedLiquidation && (
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
                  <Label>Medio</Label>
                  <Input value="Transferencia bancaria" disabled />
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
                    <SelectTrigger>
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
              <div>
                <Label htmlFor="cts-period">Período de depósito</Label>
                <Input
                  id="cts-period"
                  value={ctsPeriod}
                  onChange={(event) => setCtsPeriod(event.target.value)}
                  placeholder="2026-05 o 2026-11"
                />
              </div>
              <div>
                <Label>Cuenta bancaria de origen</Label>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger>
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
                <Label htmlFor="cts-reference">Referencia de depósito</Label>
                <Input
                  id="cts-reference"
                  value={ctsReference}
                  onChange={(event) => setCtsReference(event.target.value)}
                />
              </div>
              <Button
                className="self-end"
                variant="outline"
                disabled={busy || !/^\d{4}-(05|11)$/.test(ctsPeriod)}
                onClick={calculateCts}
              >
                Calcular período
              </Button>
            </div>
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
                        {new Intl.NumberFormat("es-PE", {
                          style: "currency",
                          currency: "PEN",
                        }).format(Number(deposit.monto || 0))}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">{deposit.estado}</Badge>
                      </td>
                      <td className="p-3 text-right">
                        {normalizedStatus(deposit.estado) === "calculado" && (
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
