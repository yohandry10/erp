"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";
import { Campo, control } from "./ContractForm";
import { cantidad, Contrato, dinero, fecha } from "./types";

type LineaCuenta = {
  contrato_linea_id: string;
  codigo_producto: string;
  descripcion: string;
  unidad_medida: string;
  contratado: number;
  en_oc: number;
  programado: number;
  despachado: number;
  aceptado: number;
  facturado: number;
  facturado_valor: number;
  por_facturar: number;
  por_facturar_valor: number;
};
type Documento = {
  cxc_id: string;
  pedido_numero: string;
  documento: string;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  moneda: string;
  total: number;
  notas_credito: number;
  cobrado: number;
  saldo: number;
  cuadra: boolean;
};
type Total = { moneda: string; facturado: number; notas_credito: number; neto: number; cobrado: number; saldo: number };
type EstadoCuenta = {
  moneda: string;
  base_facturacion: "DESPACHO" | "CONFORMIDAD";
  lineas: LineaCuenta[];
  ordenes: Array<{ orden_cliente_id: string; numero: string; estado: string; valor: number; facturado_valor: number; por_facturar_valor: number }>;
  documentos: Documento[];
  totales: Total[];
};
type Props = {
  contrato: Contrato;
  busy: boolean;
  manage: boolean;
  onSubmit: (path: string, payload: object, method?: "POST" | "PUT") => void;
};

export function ContractStatement({ contrato, busy, manage, onSubmit }: Props) {
  const { get } = useApi({ throwOnError: true, showErrorToast: false });
  const [data, setData] = useState<EstadoCuenta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [editando, setEditando] = useState(false);
  const base = `/api/ventas/contratos/${contrato.id}`;
  useEffect(() => {
    let valid = true;
    setLoading(true);
    setError("");
    void get(`${base}/estado-cuenta`)
      .then((r) => {
        if (!valid) return;
        const d = r?.data ?? {};
        if (![d.lineas, d.documentos, d.totales, d.ordenes].every(Array.isArray))
          throw new Error("El estado de cuenta llegó incompleto.");
        setData(d);
        setEditando(false);
      })
      .catch((e: Error) => valid && setError(e.message))
      .finally(() => valid && setLoading(false));
    return () => {
      valid = false;
    };
    // El expediente se vuelve a consultar después de cada operación.
  }, [get, base, contrato, reload]);
  const moneda = data?.moneda ?? contrato.moneda;

  return (
    <section className="space-y-5 border-t border-border pt-5" aria-label="Estado de cuenta del contrato">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Estado de cuenta</h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Cantidades y valores a precio de OC sin impuestos; documentos con impuestos en {moneda}. Cada pedido vinculado
            se factura una sola vez con su comprobante, su cuenta por cobrar y sus cobros.
          </p>
        </div>
        <Button variant="outline" disabled={busy || loading} onClick={() => setReload((n) => n + 1)}>
          Actualizar
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error} Pulse Actualizar para volver a consultar.
        </p>
      )}
      {loading && !data && (
        <p role="status" className="text-sm">
          Cargando estado de cuenta…
        </p>
      )}
      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p>
              Facturación{" "}
              <span className="font-medium">
                {data.base_facturacion === "CONFORMIDAD"
                  ? "contra conformidad del cliente: un pedido se factura con todo lo despachado aceptado"
                  : "por despacho: un pedido se factura al completar su despacho"}
              </span>
            </p>
            {manage && contrato.estado !== "ANULADO" && !editando && (
              <Button variant="outline" disabled={busy} onClick={() => setEditando(true)}>
                Cambiar base de facturación
              </Button>
            )}
          </div>
          {editando && (
            <BaseForm
              actual={data.base_facturacion}
              busy={busy}
              onCancel={() => setEditando(false)}
              onSubmit={(base_facturacion, motivo) =>
                onSubmit(`${base}/facturacion`, { base_facturacion, version: contrato.version, motivo }, "PUT")
              }
            />
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm tabular-nums">
              <caption className="sr-only">Saldos por línea contractual</caption>
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="p-2">Línea</th>
                  <th scope="col" className="whitespace-nowrap p-2 text-right">Contratado</th>
                  <th scope="col" className="whitespace-nowrap p-2 text-right">Despachado</th>
                  <th scope="col" className="whitespace-nowrap p-2 text-right">Aceptado</th>
                  <th scope="col" className="whitespace-nowrap p-2 text-right">Facturado</th>
                  <th scope="col" className="whitespace-nowrap p-2 text-right">Por facturar</th>
                </tr>
              </thead>
              <tbody>
                {data.lineas.map((l) => (
                  <tr key={l.contrato_linea_id} className="border-b border-border align-top">
                    <td className="p-2">
                      <span className="font-medium">{l.codigo_producto}</span>
                      <span className="block">{l.descripcion}</span>
                      <span className="block text-xs text-muted-foreground">
                        En OC {cantidad(l.en_oc)} · programado {cantidad(l.programado)} {l.unidad_medida}
                      </span>
                    </td>
                    <td className="whitespace-nowrap p-2 text-right">{cantidad(l.contratado)}</td>
                    <td className="whitespace-nowrap p-2 text-right">{cantidad(l.despachado)}</td>
                    <td className="whitespace-nowrap p-2 text-right">{cantidad(l.aceptado)}</td>
                    <td className="whitespace-nowrap p-2 text-right">
                      {cantidad(l.facturado)}
                      <span className="block text-xs text-muted-foreground">{dinero(l.facturado_valor, moneda)}</span>
                    </td>
                    <td className="whitespace-nowrap p-2 text-right font-medium">
                      {cantidad(l.por_facturar)}
                      <span className="block text-xs font-normal text-muted-foreground">{dinero(l.por_facturar_valor, moneda)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.ordenes.length > 0 && (
            <ul className="space-y-1 text-sm tabular-nums">
              {data.ordenes.map((o) => (
                <li key={o.orden_cliente_id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    OC {o.numero}
                    {o.estado === "ANULADA" ? " · anulada" : ""}
                  </span>
                  <span>
                    Valor {dinero(o.valor, moneda)} · facturado {dinero(o.facturado_valor, moneda)} · por facturar{" "}
                    {dinero(o.por_facturar_valor, moneda)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Comprobantes y cobranza</h4>
            {!data.documentos.length ? (
              <p className="text-sm text-muted-foreground">Aún no hay comprobantes de pedidos vinculados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm tabular-nums">
                  <caption className="sr-only">Comprobantes, notas, cobros y saldo</caption>
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="p-2">Comprobante</th>
                      <th scope="col" className="whitespace-nowrap p-2 text-right">Total</th>
                      <th scope="col" className="whitespace-nowrap p-2 text-right">Notas de crédito</th>
                      <th scope="col" className="whitespace-nowrap p-2 text-right">Cobrado</th>
                      <th scope="col" className="whitespace-nowrap p-2 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.documentos.map((d) => (
                      <tr key={d.cxc_id} className="border-b border-border align-top">
                        <td className="p-2">
                          <span className="font-medium">{d.documento}</span>
                          <span className="block text-xs text-muted-foreground">
                            Pedido {d.pedido_numero} · emitido {fecha(d.fecha_emision ?? "")}
                            {d.fecha_vencimiento ? ` · vence ${fecha(d.fecha_vencimiento)}` : ""}
                          </span>
                        </td>
                        <td className="whitespace-nowrap p-2 text-right">{dinero(d.total, d.moneda)}</td>
                        <td className="whitespace-nowrap p-2 text-right">{dinero(d.notas_credito, d.moneda)}</td>
                        <td className="whitespace-nowrap p-2 text-right">{dinero(d.cobrado, d.moneda)}</td>
                        <td className="whitespace-nowrap p-2 text-right font-medium">
                          {dinero(d.saldo, d.moneda)}
                          {!d.cuadra && (
                            <span className="block text-xs font-normal text-destructive">
                              No cuadra con total, notas y cobros
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {data.totales.map((t) => (
                      <tr key={t.moneda} className="font-medium">
                        <th scope="row" className="p-2 text-left">
                          Total {t.moneda}
                        </th>
                        <td className="whitespace-nowrap p-2 text-right">{dinero(t.facturado, t.moneda)}</td>
                        <td className="whitespace-nowrap p-2 text-right">{dinero(t.notas_credito, t.moneda)}</td>
                        <td className="whitespace-nowrap p-2 text-right">{dinero(t.cobrado, t.moneda)}</td>
                        <td className="whitespace-nowrap p-2 text-right">{dinero(t.saldo, t.moneda)}</td>
                      </tr>
                    ))}
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function BaseForm({
  actual,
  busy,
  onCancel,
  onSubmit,
}: {
  actual: "DESPACHO" | "CONFORMIDAD";
  busy: boolean;
  onCancel: () => void;
  onSubmit: (base: "DESPACHO" | "CONFORMIDAD", motivo: string) => void;
}) {
  const [baseFacturacion, setBase] = useState(actual);
  const [motivo, setMotivo] = useState("");
  return (
    <form
      className="space-y-3 rounded-md border border-border p-4"
      aria-label="Base de facturación"
      onSubmit={(e) => {
        e.preventDefault();
        if (motivo.trim().length >= 5 && baseFacturacion !== actual) onSubmit(baseFacturacion, motivo.trim());
      }}
    >
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <Campo label="Facturar">
          {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
          <select className={control} value={baseFacturacion} onChange={(e) => setBase(e.target.value as typeof actual)}>
            <option value="DESPACHO">Por despacho completo del pedido</option>
            <option value="CONFORMIDAD">Contra conformidad total del cliente</option>
          </select>
        </Campo>
        <Campo label="Motivo del cambio">
          <Input value={motivo} maxLength={1000} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
      </fieldset>
      <p className="text-xs text-muted-foreground">Aplica a las facturas futuras; las ya emitidas no cambian.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || motivo.trim().length < 5 || baseFacturacion === actual}>
          Guardar base de facturación
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
