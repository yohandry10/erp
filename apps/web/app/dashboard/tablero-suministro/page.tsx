"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";
import { usePermission } from "@/hooks/use-permission";
import { useTenant } from "@/contexts/TenantContext";
import { fetchApi } from "@/lib/api-fetch";
import { Campo, control } from "../ventas/contratos/ContractForm";
import { cantidad, dinero, fecha } from "../ventas/contratos/types";
import { BiCredenciales } from "./BiCredenciales";
import { DetalleTablero, Foco } from "./DetalleTablero";
import { Dataset, etiquetas, Filtros, porcentaje, query, Tablero, TITULOS } from "./types";

type Ficha = { titulo: string; valor: string; detalle: string; foco: Foco };

export default function TableroSuministroPage() {
  const lectura = usePermission("reports", "read", "suministro");
  const exportacion = usePermission("reports", "export", "suministro");
  const bi = usePermission("integraciones", "gestionar", "bi");
  const { tenant } = useTenant();
  const { get, post } = useApi({ throwOnError: true, showErrorToast: false });
  const [corteId, setCorteId] = useState("");
  const [filtros, setFiltros] = useState<Filtros>({});
  const [data, setData] = useState<Tablero | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [reload, setReload] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [foco, setFoco] = useState<Foco>({ dataset: "entregas" });
  const [opciones, setOpciones] = useState<{ contratos: Map<string, string>; clientes: Map<string, string> }>({
    contratos: new Map(),
    clientes: new Map(),
  });

  useEffect(() => {
    if (lectura.loading || !lectura.hasPermission || !tenant?.id) return;
    let valid = true;
    setLoading(true);
    setError("");
    void get(`/api/reportes/suministro${query({ ...filtros, corte_id: corteId || undefined })}`)
      .then((r) => {
        if (!valid) return;
        const d = r?.data as Tablero | undefined;
        if (!d?.corte?.hash || !d.datasets || !d.resumen || !Array.isArray(d.cortes))
          throw new Error("El tablero llegó incompleto.");
        setData(d);
        // Las opciones de filtro se acumulan: filtrar no debe borrar las demás.
        setOpciones((prev) => {
          const contratos = new Map(prev.contratos);
          const clientes = new Map(prev.clientes);
          for (const filas of Object.values(d.datasets))
            for (const f of filas ?? []) {
              if (f.contrato_id && f.contrato_numero) contratos.set(f.contrato_id, f.contrato_numero);
              if (f.cliente_id && f.cliente) clientes.set(f.cliente_id, f.cliente);
            }
          return { contratos, clientes };
        });
      })
      .catch((e: Error) => valid && setError(e.message))
      .finally(() => valid && setLoading(false));
    return () => {
      valid = false;
    };
  }, [get, lectura.loading, lectura.hasPermission, tenant?.id, corteId, filtros, reload]);

  const visibles = useMemo(
    () => (data ? (Object.keys(data.datasets) as Dataset[]) : []),
    [data],
  );
  useEffect(() => {
    if (visibles.length && !visibles.includes(foco.dataset)) setFoco({ dataset: visibles[0] });
  }, [visibles, foco.dataset]);

  const fichas = useMemo(() => (data ? construirFichas(data) : []), [data]);

  const exportar = async () => {
    setExportando(true);
    setError("");
    setAviso("");
    try {
      let id = corteId;
      if (!id) {
        // El Excel siempre sale de un corte registrado, el mismo que luego se consulta aquí.
        const r = await post("/api/reportes/suministro/cortes", {}, {
          headers: { "Idempotency-Key": `tablero:${crypto.randomUUID()}` },
        });
        id = r?.data?.id;
        if (!id) throw new Error("No se pudo confirmar el corte. Reintente.");
        setCorteId(id);
      }
      const res = await fetchApi(`/api/reportes/suministro/cortes/${id}/excel${query(filtros)}`);
      if (!res.ok) throw new Error("No se pudo generar el Excel del corte. Reintente.");
      const nombre = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "tablero_suministro.xlsx";
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = nombre;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setAviso(`Excel descargado del corte con hash ${(res.headers.get("x-corte-hash") ?? "").slice(0, 12)}…`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      setExportando(false);
    }
  };

  if (lectura.loading)
    return (
      <p role="status" className="p-6">
        Comprobando acceso al tablero…
      </p>
    );
  if (!lectura.hasPermission)
    return (
      <p role="alert" className="p-6">
        No tiene permiso para consultar el tablero de suministro.
      </p>
    );

  const corte = data?.corte;
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tablero de suministro</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Cumplimiento, entregas, stock, vencimientos, facturación, cobranza y penalidades de los contratos activos. Cada
            indicador abre su detalle y cada fila lleva a su documento.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={loading} onClick={() => setReload((n) => n + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            Actualizar
          </Button>
          {exportacion.hasPermission && (
            <Button disabled={exportando || loading || !data} onClick={() => void exportar()}>
              <Download className="mr-2 h-4 w-4" aria-hidden />
              {exportando ? "Exportando…" : corteId ? "Exportar este corte" : "Registrar corte y exportar"}
            </Button>
          )}
        </div>
      </header>

      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]"
        aria-label="Corte y filtros"
        onSubmit={(e) => e.preventDefault()}
      >
        <Campo label="Corte">
          {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
          <select className={control} value={corteId} onChange={(e) => setCorteId(e.target.value)}>
            <option value="">En vivo (hoy)</option>
            {(data?.cortes ?? []).map((c) => (
              <option key={c.id} value={c.id ?? ""}>
                {fecha(c.fecha_corte)} · {etiquetas[c.origen]} · {new Date(c.generado_en).toLocaleTimeString("es-PE", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Contrato">
          {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
          <select
            className={control}
            value={filtros.contrato_id ?? ""}
            onChange={(e) => setFiltros({ ...filtros, contrato_id: e.target.value || undefined })}
          >
            <option value="">Todos</option>
            {[...opciones.contratos].sort((a, b) => a[1].localeCompare(b[1])).map(([id, numero]) => (
              <option key={id} value={id}>
                {numero}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Cliente">
          {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
          <select
            className={control}
            value={filtros.cliente_id ?? ""}
            onChange={(e) => setFiltros({ ...filtros, cliente_id: e.target.value || undefined })}
          >
            <option value="">Todos</option>
            {[...opciones.clientes].sort((a, b) => a[1].localeCompare(b[1])).map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Desde">
          {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
          <Input type="date" value={filtros.desde ?? ""} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value || undefined })} />
        </Campo>
        <Campo label="Hasta">
          <Input type="date" value={filtros.hasta ?? ""} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value || undefined })} />
        </Campo>
      </form>

      {corte && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {corte.origen === "EN_VIVO"
            ? `En vivo al ${new Date(corte.generado_en).toLocaleString("es-PE")}`
            : `Corte del ${fecha(corte.fecha_corte)} · ${etiquetas[corte.origen]}${corte.generado_por_nombre ? ` por ${corte.generado_por_nombre}` : ""} · ${new Date(corte.generado_en).toLocaleString("es-PE")}`}
          {" · "}SHA-256 <span className="font-mono">{corte.hash.slice(0, 12)}…</span>
          {" · "}las fechas filtran la fecha programada, de OC o de emisión; stock y vencimientos son del corte completo.
        </p>
      )}
      {data && data.ocultos.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Sin permiso para ver: {data.ocultos.map((d) => TITULOS[d]).join(", ")}.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          {aviso}
        </p>
      )}
      {loading && !data && (
        <p role="status" className="text-sm">
          Calculando indicadores…
        </p>
      )}

      {data && (
        <>
          <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {fichas.map((f) => {
              const activa = foco.dataset === f.foco.dataset && foco.estado === f.foco.estado;
              return (
                <button
                  key={f.titulo}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => setFoco(f.foco)}
                  className={`rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    activa ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <span className="block text-sm text-muted-foreground">{f.titulo}</span>
                  <span className="mt-1 block text-2xl font-semibold tabular-nums">{f.valor}</span>
                  <span className="mt-1 block text-xs text-muted-foreground tabular-nums">{f.detalle}</span>
                </button>
              );
            })}
          </section>
          <DetalleTablero data={data} foco={foco} onFoco={setFoco} />
        </>
      )}

      {bi.hasPermission && <BiCredenciales visibles={visibles} />}
    </div>
  );
}

/** Fichas de indicadores; cada una abre el detalle que la explica. */
function construirFichas({ resumen: r }: Tablero): Ficha[] {
  const fichas: Ficha[] = [];
  const montos = <T extends { moneda: string }>(items: T[] | undefined, campo: keyof T) =>
    (items ?? []).length ? (items ?? []).map((m) => dinero(Number(m[campo]), m.moneda)).join(" · ") : dinero(0, "PEN");
  if (r.cumplimiento)
    fichas.push({
      titulo: "Cumplimiento de OC",
      valor: porcentaje(r.cumplimiento.porcentaje),
      detalle: `${cantidad(r.cumplimiento.aceptado)} aceptado de ${cantidad(r.cumplimiento.cantidad_oc)} en ${r.cumplimiento.ordenes} OC`,
      foco: { dataset: "contratos" },
    });
  if (r.entregas) {
    fichas.push({
      titulo: "Entregas a tiempo y completas",
      valor: porcentaje(r.entregas.porcentaje),
      detalle: `${r.entregas.a_tiempo_completas} de ${r.entregas.exigibles} exigibles · ${r.entregas.en_plazo} en plazo`,
      foco: { dataset: "entregas", estado: "EXIGIBLE" },
    });
    fichas.push({
      titulo: "Entregas atrasadas",
      valor: String(r.entregas.atrasadas),
      detalle:
        r.entregas.dias_atraso_promedio !== undefined
          ? `${r.entregas.dias_atraso_promedio} días de atraso promedio (incluye completas tarde)`
          : "Sin atrasos",
      foco: { dataset: "entregas", estado: "ATRASADA" },
    });
  }
  if (r.stock)
    fichas.push({
      titulo: "Productos sin cobertura",
      valor: `${r.stock.sin_cobertura} de ${r.stock.productos}`,
      detalle: "Stock utilizable frente a lo pendiente de despachar en 30 días",
      foco: { dataset: "stock", estado: "SIN_COBERTURA" },
    });
  if (r.vencimientos)
    fichas.push({
      titulo: "Lotes vencidos",
      valor: String(r.vencimientos.vencidos),
      detalle: `${r.vencimientos.por_vencer} por vencer en 90 días · ${cantidad(r.vencimientos.stock_vencido)} unidades vencidas`,
      foco: { dataset: "vencimientos" },
    });
  if (r.facturacion)
    fichas.push({
      titulo: "Por facturar",
      valor: montos(r.facturacion, "por_facturar"),
      detalle: `Sin impuestos · facturado ${montos(r.facturacion, "facturado")}`,
      foco: { dataset: "contratos" },
    });
  if (r.cobranza)
    fichas.push({
      titulo: "Saldo por cobrar",
      valor: montos(r.cobranza, "saldo"),
      detalle: `Vencido ${montos(r.cobranza, "vencido")}`,
      foco: { dataset: "cobranza" },
    });
  if (r.penalidades)
    fichas.push({
      titulo: "Penalidades pendientes",
      valor: montos(r.penalidades, "pendiente"),
      detalle: `Aprobadas ${montos(r.penalidades, "aprobado")} · sin efecto contable`,
      foco: { dataset: "penalidades" },
    });
  return fichas;
}
