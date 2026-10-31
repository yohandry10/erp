"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useApi } from "@/hooks/use-api";
import { Campo, control } from "./ContractForm";
import { cantidad, Contrato, dinero, fecha } from "./types";

type Metodo = "MORA_OSCE" | "PORCENTAJE_DIARIO" | "IMPORTE_DIARIO" | "IMPORTE_UNICO";
type Regla = {
  id: string;
  grupo_id: string;
  version: number;
  estado: "VIGENTE" | "REEMPLAZADA" | "ANULADA";
  nombre: string;
  metodo: Metodo;
  base_calculo: "VALOR_ENTREGA" | "VALOR_NO_ACEPTADO";
  tasa: number | null;
  importe: number | null;
  factor_f: number | null;
  plazo_modo: "FIJO" | "OC_A_ENTREGA" | null;
  plazo_dias: number | null;
  tolerancia_dias: number;
  calendario: "CALENDARIO" | "HABILES";
  tope_porcentaje: number | null;
  tope_base: "CONTRATO" | "ENTREGA" | null;
  motivo: string;
  created_at: string;
};
type Excepcion = {
  id: string;
  entrega_id: string;
  grupo_id: string | null;
  dias_excluidos: number;
  motivo: string;
  referencia: string | null;
};
type Revision = {
  id: string;
  accion: string;
  estado_nuevo: string;
  monto_aprobado: number | null;
  comentario: string;
  actor_nombre: string | null;
  created_at: string;
};
type Calculo = {
  id: string;
  regla_id: string;
  entrega_id: string;
  fecha_corte: string;
  moneda: string;
  dias_atraso: number;
  monto_calculado: number;
  monto_tope: number | null;
  monto_estimado: number;
  monto_aprobado: number | null;
  explicacion: string;
  estado: "ESTIMADO" | "EN_REVISION" | "APROBADO" | "OBSERVADO" | "EN_CONTROVERSIA" | "DESCARTADO";
  version: number;
  created_by: string;
  created_at: string;
  regla_nombre: string;
  regla_version: number;
  fecha_programada: string;
  actor_nombre: string | null;
  revisiones: Revision[];
};
type Penalidades = {
  reglas: Regla[];
  excepciones: Excepcion[];
  calculos: Calculo[];
  resumen: Array<{ moneda: string; estimado: number | null; aprobado: number | null }>;
};
type Props = {
  contrato: Contrato;
  busy: boolean;
  manage: boolean;
  approve: boolean;
  onSubmit: (path: string, payload: object) => void;
};

const estados: Record<Calculo["estado"], string> = {
  ESTIMADO: "Estimado",
  EN_REVISION: "En revisión",
  APROBADO: "Aprobado",
  OBSERVADO: "Observado",
  EN_CONTROVERSIA: "En controversia",
  DESCARTADO: "Descartado",
};
const revisiones: Record<string, string> = {
  REVISAR: "Pasar a revisión",
  APROBAR: "Aprobar monto",
  OBSERVAR: "Observar",
  CONTROVERSIA: "Registrar controversia",
  DESCARTAR: "Descartar",
};
const hoyLocal = () => new Date().toLocaleDateString("en-CA");

function describir(r: Regla, moneda: string) {
  const dias = r.calendario === "HABILES" ? "hábiles" : "calendario";
  const base = r.base_calculo === "VALOR_ENTREGA" ? "valor de la entrega" : "valor no aceptado al límite";
  const metodo =
    r.metodo === "MORA_OSCE"
      ? `Mora 0.10 × base / (F ${r.factor_f} × ${r.plazo_modo === "FIJO" ? `${r.plazo_dias} días` : "días de la OC a la entrega"})`
      : r.metodo === "PORCENTAJE_DIARIO"
        ? `${r.tasa}% diario`
        : r.metodo === "IMPORTE_DIARIO"
          ? `${dinero(r.importe ?? 0, moneda)} por día`
          : `${dinero(r.importe ?? 0, moneda)} una vez si hay atraso`;
  const tope = r.tope_porcentaje
    ? ` · tope ${r.tope_porcentaje}% del ${r.tope_base === "CONTRATO" ? "contrato" : "valor de la entrega"}`
    : "";
  return `${metodo} sobre ${base} · tolerancia ${r.tolerancia_dias} días ${dias}${tope}`;
}

export function ContractPenalties({ contrato, busy, manage, approve, onSubmit }: Props) {
  const { get } = useApi({ throwOnError: true, showErrorToast: false });
  const { user } = useAuth();
  const [data, setData] = useState<Penalidades | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState<{ tipo: "regla"; previa?: Regla } | { tipo: "anular"; regla: Regla } | { tipo: "excepcion" } | null>(
    null,
  );
  const [corte, setCorte] = useState(hoyLocal);
  const [abierto, setAbierto] = useState<string | null>(null);
  const base = `/api/ventas/contratos/${contrato.id}/penalidades`;
  useEffect(() => {
    let valid = true;
    setLoading(true);
    setError("");
    void get(base)
      .then((r) => {
        if (!valid) return;
        const d = r?.data ?? {};
        if (![d.reglas, d.excepciones, d.calculos, d.resumen].every(Array.isArray))
          throw new Error("Las penalidades llegaron incompletas.");
        setData(d);
        setEditor(null);
      })
      .catch((e: Error) => valid && setError(e.message))
      .finally(() => valid && setLoading(false));
    return () => {
      valid = false;
    };
    // El expediente se vuelve a consultar después de cada operación.
  }, [get, base, contrato, reload]);

  const entregas = useMemo(() => new Map(contrato.entregas.map((e) => [e.id, e])), [contrato.entregas]);
  const vigentes = data?.reglas.filter((r) => r.estado === "VIGENTE") ?? [];
  const anuladas = data?.reglas.filter((r) => r.estado === "ANULADA") ?? [];
  const nombreGrupo = (grupo: string | null) =>
    grupo ? (data?.reglas.find((r) => r.grupo_id === grupo)?.nombre ?? "Regla") : "Todas las reglas";
  // Un corte posterior de la misma regla y entrega deja el anterior como historia.
  const reemplazados = useMemo(() => {
    const ultimo = new Map<string, string>();
    for (const c of data?.calculos ?? []) {
      if (c.estado === "DESCARTADO") continue;
      const k = `${c.regla_id}:${c.entrega_id}`;
      if ((ultimo.get(k) ?? "") < c.fecha_corte) ultimo.set(k, c.fecha_corte);
    }
    return new Set(
      (data?.calculos ?? []).filter((c) => (ultimo.get(`${c.regla_id}:${c.entrega_id}`) ?? "") > c.fecha_corte).map((c) => c.id),
    );
  }, [data]);
  const activo = contrato.estado === "ACTIVO";

  return (
    <section className="space-y-5 border-t border-border pt-5" aria-label="Penalidades del contrato">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Penalidades</h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Estimación por entrega tardía. No genera asientos, notas de crédito ni descuentos en la cobranza. Cada cálculo
            guarda la versión de la regla y las fechas usadas; una regla nueva o una excepción sólo cambia los cálculos
            siguientes.
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
          Cargando penalidades…
        </p>
      )}
      {data && (
        <>
          {data.resumen.length > 0 && (
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm tabular-nums">
              {data.resumen.map((s) => (
                <Fragment key={s.moneda}>
                  <div>
                    <dt className="text-muted-foreground">Pendiente de decisión ({s.moneda})</dt>
                    <dd className="text-base font-semibold">{dinero(s.estimado ?? 0, s.moneda)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Aprobado ({s.moneda})</dt>
                    <dd className="text-base font-semibold">{dinero(s.aprobado ?? 0, s.moneda)}</dd>
                  </div>
                </Fragment>
              ))}
            </dl>
          )}

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Reglas</h4>
              {manage && activo && !editor && (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setEditor({ tipo: "regla" })}>
                  Agregar regla
                </Button>
              )}
            </div>
            {editor?.tipo === "regla" && (
              <ReglaForm
                previa={editor.previa}
                moneda={contrato.moneda}
                busy={busy}
                onCancel={() => setEditor(null)}
                onSubmit={(payload) => onSubmit(`${base}/reglas`, payload)}
              />
            )}
            {editor?.tipo === "anular" && (
              <MotivoForm
                titulo={`Anular «${editor.regla.nombre}»`}
                ayuda="Los cálculos ya registrados con esta regla se conservan."
                accion="Anular regla"
                busy={busy}
                onCancel={() => setEditor(null)}
                onSubmit={(motivo) =>
                  onSubmit(`${base}/reglas/${editor.regla.grupo_id}/anular`, { version: editor.regla.version, motivo })
                }
              />
            )}
            {!vigentes.length && !anuladas.length ? (
              <p className="text-sm text-muted-foreground">El contrato aún no tiene reglas de penalidad.</p>
            ) : (
              <ul className="space-y-3">
                {[...vigentes, ...anuladas].map((r) => {
                  const previas = data.reglas.filter((x) => x.grupo_id === r.grupo_id && x.id !== r.id);
                  return (
                    <li key={r.id} className="space-y-1 rounded-md border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className={r.estado === "ANULADA" ? "text-muted-foreground" : "font-medium"}>
                          {r.nombre} <span className="font-normal text-muted-foreground">· versión {r.version}</span>
                          {r.estado === "ANULADA" && " · anulada"}
                        </p>
                        {manage && activo && r.estado === "VIGENTE" && !editor && (
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" disabled={busy} onClick={() => setEditor({ tipo: "regla", previa: r })}>
                              Nueva versión
                            </Button>
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditor({ tipo: "anular", regla: r })}>
                              Anular
                            </Button>
                          </div>
                        )}
                      </div>
                      <p>{describir(r, contrato.moneda)}</p>
                      <p className="text-xs text-muted-foreground">{r.motivo}</p>
                      {previas.length > 0 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground">Versiones anteriores ({previas.length})</summary>
                          <ul className="mt-2 space-y-1">
                            {previas.map((p) => (
                              <li key={p.id}>
                                Versión {p.version}: {describir(p, contrato.moneda)} — {p.motivo}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Días excluidos por entrega</h4>
              {manage && activo && vigentes.length > 0 && !editor && (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setEditor({ tipo: "excepcion" })}>
                  Excluir días
                </Button>
              )}
            </div>
            {editor?.tipo === "excepcion" && (
              <ExcepcionForm
                contrato={contrato}
                reglas={vigentes}
                busy={busy}
                onCancel={() => setEditor(null)}
                onSubmit={(payload) => onSubmit(`${base}/excepciones`, payload)}
              />
            )}
            {!data.excepciones.length ? (
              <p className="text-sm text-muted-foreground">Sin ampliaciones ni días excluidos.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.excepciones.map((x) => {
                  const e = entregas.get(x.entrega_id);
                  return (
                    <li key={x.id}>
                      <span className="font-medium">{x.dias_excluidos} días</span> en la entrega del{" "}
                      {e ? fecha(e.fecha_programada) : "cronograma"} · {nombreGrupo(x.grupo_id)} · {x.motivo}
                      {x.referencia ? ` (${x.referencia})` : ""}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Cálculos</h4>
            {manage && vigentes.length > 0 && (
              <form
                className="flex flex-wrap items-end gap-3"
                aria-label="Calcular penalidades"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (corte && corte <= hoyLocal()) onSubmit(`${base}/calcular`, { fecha_corte: corte });
                }}
              >
                <div className="w-44">
                  <Campo label="Fecha de corte">
                    {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
                    <Input type="date" required max={hoyLocal()} value={corte} disabled={busy} onChange={(e) => setCorte(e.target.value)} />
                  </Campo>
                </div>
                <Button type="submit" disabled={busy || !corte}>
                  Calcular al corte
                </Button>
                <p className="basis-full text-xs text-muted-foreground">
                  Sólo se registran entregas con atraso. Repetir un corte ya calculado no duplica ni cambia lo registrado.
                </p>
              </form>
            )}
            {!data.calculos.length ? (
              <p className="text-sm text-muted-foreground">Aún no hay cálculos registrados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm tabular-nums">
                  <caption className="sr-only">Cálculos de penalidad por entrega y corte</caption>
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="p-2">Entrega y regla</th>
                      <th scope="col" className="whitespace-nowrap p-2">Corte</th>
                      <th scope="col" className="whitespace-nowrap p-2 text-right">Atraso</th>
                      <th scope="col" className="whitespace-nowrap p-2 text-right">Estimado</th>
                      <th scope="col" className="p-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.calculos.map((c) => {
                      const viejo = reemplazados.has(c.id);
                      const expandido = abierto === c.id;
                      return (
                        <Fragment key={c.id}>
                          <tr className={`border-b border-border align-top ${viejo ? "text-muted-foreground" : ""}`}>
                            <td className="p-2">
                              <span className="font-medium">Entrega del {fecha(c.fecha_programada)}</span>
                              <span className="block text-xs text-muted-foreground">
                                {c.regla_nombre} · versión {c.regla_version}
                              </span>
                              <button
                                type="button"
                                className="mt-1 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-expanded={expandido}
                                onClick={() => setAbierto(expandido ? null : c.id)}
                              >
                                {expandido ? "Ocultar detalle" : "Ver cálculo y revisiones"}
                              </button>
                            </td>
                            <td className="whitespace-nowrap p-2">
                              {fecha(c.fecha_corte)}
                              {viejo && <span className="block text-xs">Corte anterior</span>}
                            </td>
                            <td className="whitespace-nowrap p-2 text-right">{cantidad(c.dias_atraso)} días</td>
                            <td className="whitespace-nowrap p-2 text-right font-medium">
                              {dinero(c.monto_estimado, c.moneda)}
                              {c.monto_tope !== null && c.monto_estimado < c.monto_calculado && (
                                <span className="block text-xs font-normal text-muted-foreground">
                                  Limitado por tope (calculado {dinero(c.monto_calculado, c.moneda)})
                                </span>
                              )}
                            </td>
                            <td className="p-2">
                              {estados[c.estado]}
                              {c.monto_aprobado !== null && (
                                <span className="block text-xs text-muted-foreground">{dinero(c.monto_aprobado, c.moneda)}</span>
                              )}
                            </td>
                          </tr>
                          {expandido && (
                            <tr className="border-b border-border">
                              <td colSpan={5} className="space-y-3 bg-muted/30 p-3">
                                <p className="max-w-4xl text-sm">{c.explicacion}</p>
                                <p className="text-xs text-muted-foreground">
                                  Registrado por {c.actor_nombre || "usuario"} el {new Date(c.created_at).toLocaleString("es-PE")}
                                </p>
                                {c.revisiones.length > 0 && (
                                  <ol className="space-y-1 text-sm">
                                    {c.revisiones.map((v) => (
                                      <li key={v.id}>
                                        <span className="font-medium">{estados[v.estado_nuevo as Calculo["estado"]] ?? v.estado_nuevo}</span>
                                        {v.monto_aprobado !== null ? ` por ${dinero(v.monto_aprobado, c.moneda)}` : ""} ·{" "}
                                        {v.actor_nombre || "usuario"} · {new Date(v.created_at).toLocaleString("es-PE")} — {v.comentario}
                                      </li>
                                    ))}
                                  </ol>
                                )}
                                {approve && !["APROBADO", "DESCARTADO"].includes(c.estado) && (
                                  <RevisionForm
                                    calculo={c}
                                    propio={c.created_by === user?.id}
                                    busy={busy}
                                    onSubmit={(payload) => onSubmit(`${base}/calculos/${c.id}/revisar`, payload)}
                                  />
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function ReglaForm({
  previa,
  moneda,
  busy,
  onCancel,
  onSubmit,
}: {
  previa?: Regla;
  moneda: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: object) => void;
}) {
  const [f, setF] = useState({
    nombre: previa?.nombre ?? "",
    metodo: previa?.metodo ?? ("MORA_OSCE" as Metodo),
    base_calculo: previa?.base_calculo ?? "VALOR_ENTREGA",
    factor_f: String(previa?.factor_f ?? "0.40"),
    plazo_modo: previa?.plazo_modo ?? "OC_A_ENTREGA",
    plazo_dias: String(previa?.plazo_dias ?? ""),
    tasa: String(previa?.tasa ?? ""),
    importe: String(previa?.importe ?? ""),
    tolerancia_dias: String(previa?.tolerancia_dias ?? 0),
    calendario: previa?.calendario ?? "CALENDARIO",
    con_tope: previa ? previa.tope_porcentaje !== null : true,
    tope_porcentaje: String(previa?.tope_porcentaje ?? 10),
    tope_base: previa?.tope_base ?? "CONTRATO",
    motivo: "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const payload = {
    ...(previa ? { grupo_id: previa.grupo_id, version: previa.version } : {}),
    nombre: f.nombre.trim(),
    metodo: f.metodo,
    base_calculo: f.base_calculo,
    ...(f.metodo === "MORA_OSCE"
      ? { factor_f: num(f.factor_f), plazo_modo: f.plazo_modo, ...(f.plazo_modo === "FIJO" ? { plazo_dias: num(f.plazo_dias) } : {}) }
      : {}),
    ...(f.metodo === "PORCENTAJE_DIARIO" ? { tasa: num(f.tasa) } : {}),
    ...(f.metodo === "IMPORTE_DIARIO" || f.metodo === "IMPORTE_UNICO" ? { importe: num(f.importe) } : {}),
    tolerancia_dias: num(f.tolerancia_dias) ?? 0,
    calendario: f.calendario,
    ...(f.con_tope ? { tope_porcentaje: num(f.tope_porcentaje), tope_base: f.tope_base } : {}),
    motivo: f.motivo.trim(),
  };
  const completo =
    payload.nombre.length >= 3 &&
    payload.motivo.length >= 5 &&
    (f.metodo !== "MORA_OSCE" || (Number(f.factor_f) > 0 && (f.plazo_modo !== "FIJO" || Number(f.plazo_dias) > 0))) &&
    (f.metodo !== "PORCENTAJE_DIARIO" || Number(f.tasa) > 0) &&
    (!f.metodo.startsWith("IMPORTE") || Number(f.importe) > 0) &&
    (!f.con_tope || Number(f.tope_porcentaje) > 0);
  return (
    <form
      className="space-y-3 rounded-md border border-border p-4"
      aria-label={previa ? `Nueva versión de ${previa.nombre}` : "Nueva regla de penalidad"}
      onSubmit={(e) => {
        e.preventDefault();
        if (completo) onSubmit(payload);
      }}
    >
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo label="Nombre">
          {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
          <Input value={f.nombre} maxLength={160} onChange={set("nombre")} />
        </Campo>
        <Campo label="Método">
          <select className={control} value={f.metodo} onChange={set("metodo")}>
            <option value="MORA_OSCE">Mora: 0.10 × base / (F × plazo)</option>
            <option value="PORCENTAJE_DIARIO">Porcentaje diario</option>
            <option value="IMPORTE_DIARIO">Importe por día</option>
            <option value="IMPORTE_UNICO">Importe único</option>
          </select>
        </Campo>
        <Campo label="Base">
          {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
          <select className={control} value={f.base_calculo} onChange={set("base_calculo")}>
            <option value="VALOR_ENTREGA">Valor de la entrega</option>
            <option value="VALOR_NO_ACEPTADO">Valor no aceptado al límite</option>
          </select>
        </Campo>
        {f.metodo === "MORA_OSCE" && (
          <>
            <Campo label="Factor F">
              <Input type="number" inputMode="decimal" min="0.0001" max="9" step="0.0001" value={f.factor_f} onChange={set("factor_f")} />
            </Campo>
            <Campo label="Plazo">
              {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
              <select className={control} value={f.plazo_modo} onChange={set("plazo_modo")}>
                <option value="OC_A_ENTREGA">Días desde la OC hasta la entrega</option>
                <option value="FIJO">Días fijos</option>
              </select>
            </Campo>
            {f.plazo_modo === "FIJO" && (
              <Campo label="Días de plazo">
                <Input type="number" min="1" max="3650" step="1" value={f.plazo_dias} onChange={set("plazo_dias")} />
              </Campo>
            )}
          </>
        )}
        {f.metodo === "PORCENTAJE_DIARIO" && (
          <Campo label="Porcentaje diario (%)">
            {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
            <Input type="number" inputMode="decimal" min="0.000001" max="100" step="0.000001" value={f.tasa} onChange={set("tasa")} />
          </Campo>
        )}
        {f.metodo.startsWith("IMPORTE") && (
          <Campo label={`Importe (${moneda})`}>
            <Input type="number" inputMode="decimal" min="0.01" step="0.01" value={f.importe} onChange={set("importe")} />
          </Campo>
        )}
        <Campo label="Días de tolerancia">
          <Input type="number" min="0" max="365" step="1" value={f.tolerancia_dias} onChange={set("tolerancia_dias")} />
        </Campo>
        <Campo label="Días">
          {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
          <select className={control} value={f.calendario} onChange={set("calendario")}>
            <option value="CALENDARIO">Calendario</option>
            <option value="HABILES">Hábiles (lunes a viernes)</option>
          </select>
        </Campo>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
          <input type="checkbox" checked={f.con_tope} onChange={(e) => setF({ ...f, con_tope: e.target.checked })} />
          Con tope
        </label>
        {f.con_tope && (
          <>
            <Campo label="Tope (%)">
              {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
              <Input type="number" inputMode="decimal" min="0.0001" max="100" step="0.0001" value={f.tope_porcentaje} onChange={set("tope_porcentaje")} />
            </Campo>
            <Campo label="Tope sobre">
              <select className={control} value={f.tope_base} onChange={set("tope_base")}>
                <option value="CONTRATO">Monto vigente del contrato</option>
                <option value="ENTREGA">Valor de cada entrega</option>
              </select>
            </Campo>
          </>
        )}
        <div className="sm:col-span-2 lg:col-span-3">
          <Campo label={previa ? "Motivo de la nueva versión (adenda, cláusula)" : "Sustento (cláusula del contrato)"}>
            {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
            <Input value={f.motivo} maxLength={1000} onChange={set("motivo")} />
          </Campo>
        </div>
      </fieldset>
      {previa && (
        <p className="text-xs text-muted-foreground">
          La versión {previa.version} queda reemplazada; sus cálculos registrados no cambian.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !completo}>
          {previa ? `Guardar versión ${previa.version + 1}` : "Guardar regla"}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function ExcepcionForm({
  contrato,
  reglas,
  busy,
  onCancel,
  onSubmit,
}: {
  contrato: Contrato;
  reglas: Regla[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: object) => void;
}) {
  const programadas = contrato.entregas.filter((e) => e.estado === "PROGRAMADA");
  const [f, setF] = useState({ entrega_id: programadas[0]?.id ?? "", grupo_id: "", dias: "", motivo: "", referencia: "" });
  const dias = Number(f.dias);
  const completo = Boolean(f.entrega_id) && Number.isInteger(dias) && dias >= 1 && dias <= 3650 && f.motivo.trim().length >= 5;
  return (
    <form
      className="space-y-3 rounded-md border border-border p-4"
      aria-label="Excluir días de una entrega"
      onSubmit={(e) => {
        e.preventDefault();
        if (!completo) return;
        onSubmit({
          entrega_id: f.entrega_id,
          ...(f.grupo_id ? { grupo_id: f.grupo_id } : {}),
          dias_excluidos: dias,
          motivo: f.motivo.trim(),
          ...(f.referencia.trim() ? { referencia: f.referencia.trim() } : {}),
        });
      }}
    >
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo label="Entrega">
          {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
          <select className={control} value={f.entrega_id} onChange={(e) => setF({ ...f, entrega_id: e.target.value })}>
            {programadas.map((e) => (
              <option key={e.id} value={e.id}>
                {fecha(e.fecha_programada)} · {cantidad(e.cantidad)} · {e.destino}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Aplica a">
          <select className={control} value={f.grupo_id} onChange={(e) => setF({ ...f, grupo_id: e.target.value })}>
            <option value="">Todas las reglas</option>
            {reglas.map((r) => (
              <option key={r.grupo_id} value={r.grupo_id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Días excluidos">
          {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
          <Input type="number" min="1" max="3650" step="1" value={f.dias} onChange={(e) => setF({ ...f, dias: e.target.value })} />
        </Campo>
        <div className="sm:col-span-2">
          <Campo label="Motivo">
            <Input value={f.motivo} maxLength={1000} onChange={(e) => setF({ ...f, motivo: e.target.value })} />
          </Campo>
        </div>
        <Campo label="Documento de sustento (opcional)">
          <Input value={f.referencia} maxLength={80} onChange={(e) => setF({ ...f, referencia: e.target.value })} />
        </Campo>
      </fieldset>
      <p className="text-xs text-muted-foreground">Se descuentan del atraso en los cálculos siguientes; los registrados no cambian.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !completo}>
          Registrar días excluidos
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function RevisionForm({
  calculo,
  propio,
  busy,
  onSubmit,
}: {
  calculo: Calculo;
  propio: boolean;
  busy: boolean;
  onSubmit: (payload: object) => void;
}) {
  const [accion, setAccion] = useState(calculo.estado === "ESTIMADO" ? "REVISAR" : "OBSERVAR");
  const [monto, setMonto] = useState(String(calculo.monto_estimado));
  const [comentario, setComentario] = useState("");
  const valor = Number(monto);
  const montoValido = accion !== "APROBAR" || (monto.trim() !== "" && valor >= 0 && valor <= Number(calculo.monto_estimado));
  const completo = comentario.trim().length >= 5 && montoValido && !(accion === "APROBAR" && propio);
  return (
    <form
      className="space-y-3 rounded-md border border-border bg-background p-3"
      aria-label="Revisar cálculo"
      onSubmit={(e) => {
        e.preventDefault();
        if (!completo) return;
        onSubmit({
          version: calculo.version,
          accion,
          ...(accion === "APROBAR" ? { monto_aprobado: valor } : {}),
          comentario: comentario.trim(),
        });
      }}
    >
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-3">
        <Campo label="Decisión">
          {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
          <select className={control} value={accion} onChange={(e) => setAccion(e.target.value)}>
            {Object.entries(revisiones)
              .filter(([k]) => !(k === "REVISAR" && calculo.estado === "EN_REVISION"))
              .map(([k, label]) => (
                <option key={k} value={k} disabled={k === "APROBAR" && propio}>
                  {label}
                </option>
              ))}
          </select>
        </Campo>
        {accion === "APROBAR" && (
          <Campo label={`Monto aprobado (máx. ${dinero(calculo.monto_estimado, calculo.moneda)})`}>
            {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              max={String(calculo.monto_estimado)}
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </Campo>
        )}
        <div className={accion === "APROBAR" ? "" : "sm:col-span-2"}>
          <Campo label="Comentario">
            <Input value={comentario} maxLength={2000} onChange={(e) => setComentario(e.target.value)} />
          </Campo>
        </div>
      </fieldset>
      {propio && <p className="text-xs text-muted-foreground">Usted registró este cálculo: otra persona debe aprobarlo.</p>}
      {!montoValido && (
        <p role="alert" className="text-xs text-destructive">
          El monto aprobado va de 0 al estimado.
        </p>
      )}
      <Button type="submit" disabled={busy || !completo}>
        Registrar decisión
      </Button>
    </form>
  );
}

function MotivoForm({
  titulo,
  ayuda,
  accion,
  busy,
  onCancel,
  onSubmit,
}: {
  titulo: string;
  ayuda: string;
  accion: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <form
      className="space-y-3 rounded-md border border-border p-4"
      aria-label={titulo}
      onSubmit={(e) => {
        e.preventDefault();
        if (motivo.trim().length >= 5) onSubmit(motivo.trim());
      }}
    >
      <p className="text-sm font-medium">{titulo}</p>
      <Campo label="Motivo">
        {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
        <Input value={motivo} maxLength={1000} disabled={busy} onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
      <p className="text-xs text-muted-foreground">{ayuda}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" disabled={busy || motivo.trim().length < 5}>
          {accion}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
