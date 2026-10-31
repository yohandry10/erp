"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { cantidad, dinero, fecha } from "../ventas/contratos/types";
import { Dataset, etiquetas, Fila, porcentaje, Tablero, TITULOS } from "./types";

/** Conjunto abierto y, si viene de una ficha, el estado que la explica. */
export type Foco = { dataset: Dataset; estado?: string };

const LIMITE = 200;
const expediente = (f: Fila) => `/dashboard/ventas/contratos/?contrato=${f.contrato_id}`;
const lotes = (f: Fila) => `/dashboard/inventario/lotes/?producto=${f.producto_id}`;
const d = (v?: string | null) => (v ? fecha(v) : "—");

type Columna = { titulo: string; celda: (f: Fila) => ReactNode; numero?: boolean };
const COLUMNAS: Record<Dataset, { columnas: Columna[]; enlace: (f: Fila) => { href: string; texto: string } }> = {
  contratos: {
    columnas: [
      { titulo: "Contrato y OC", celda: (f) => <Doble a={`${f.contrato_numero} · OC ${f.oc_numero}`} b={`${f.cliente ?? ""} · ${d(f.oc_fecha)}`} /> },
      { titulo: "En OC", numero: true, celda: (f) => cantidad(f.cantidad_oc) },
      { titulo: "Despachado", numero: true, celda: (f) => cantidad(f.despachado) },
      { titulo: "Aceptado", numero: true, celda: (f) => cantidad(f.aceptado) },
      { titulo: "Cumplimiento", numero: true, celda: (f) => porcentaje(f.cantidad_oc > 0 ? (f.aceptado * 100) / f.cantidad_oc : null) },
      { titulo: "Por facturar", numero: true, celda: (f) => dinero(f.por_facturar_valor, f.moneda) },
    ],
    enlace: (f) => ({ href: expediente(f), texto: "Abrir expediente" }),
  },
  entregas: {
    columnas: [
      { titulo: "Contrato y producto", celda: (f) => <Doble a={`${f.contrato_numero} · OC ${f.oc_numero}`} b={`${f.codigo_producto} ${f.descripcion}`} /> },
      { titulo: "Programada", celda: (f) => <Doble a={d(f.fecha_programada)} b={f.fecha_original !== f.fecha_programada ? `Original ${d(f.fecha_original)}` : f.destino} /> },
      { titulo: "Cantidad", numero: true, celda: (f) => cantidad(f.cantidad) },
      { titulo: "Aceptado", numero: true, celda: (f) => <Doble a={cantidad(f.aceptado)} b={f.rechazado > 0 ? `Rechazado ${cantidad(f.rechazado)}` : ""} /> },
      { titulo: "Cumplimiento", celda: (f) => <Doble a={etiquetas[f.cumplimiento] ?? f.cumplimiento} b={f.fecha_cumplimiento ? `Aceptada ${d(f.fecha_cumplimiento)}` : ""} /> },
      { titulo: "Atraso", numero: true, celda: (f) => (f.dias_atraso > 0 ? `${f.dias_atraso} días` : "—") },
      { titulo: "Documentos", celda: (f) => <Doble a={f.pedidos ? `Pedidos ${f.pedidos}` : "Sin pedido"} b={f.recepciones ? `Recepciones ${f.recepciones}` : ""} /> },
    ],
    enlace: (f) => ({ href: expediente(f), texto: "Abrir expediente" }),
  },
  stock: {
    columnas: [
      { titulo: "Producto", celda: (f) => <Doble a={f.codigo_producto} b={f.descripcion} /> },
      { titulo: "Utilizable", numero: true, celda: (f) => cantidad(f.stock_utilizable) },
      { titulo: "Vencido", numero: true, celda: (f) => cantidad(f.stock_vencido) },
      { titulo: "Pendiente 30 días", numero: true, celda: (f) => cantidad(f.pendiente_30_dias) },
      { titulo: "Cobertura", numero: true, celda: (f) => porcentaje(f.cobertura_pct) },
      { titulo: "Estado", celda: (f) => etiquetas[f.estado] ?? f.estado },
    ],
    enlace: (f) => ({ href: lotes(f), texto: "Ver lotes" }),
  },
  vencimientos: {
    columnas: [
      { titulo: "Producto y lote", celda: (f) => <Doble a={`${f.codigo_producto} · lote ${f.lote}`} b={f.descripcion} /> },
      { titulo: "Vence", celda: (f) => <Doble a={d(f.fecha_vencimiento)} b={f.dias_para_vencer < 0 ? `Hace ${-f.dias_para_vencer} días` : `En ${f.dias_para_vencer} días`} /> },
      { titulo: "Stock", numero: true, celda: (f) => cantidad(f.stock) },
      { titulo: "Reservado", numero: true, celda: (f) => cantidad(f.stock_reservado) },
      { titulo: "Estado", celda: (f) => etiquetas[f.estado] ?? f.estado },
    ],
    enlace: (f) => ({ href: lotes(f), texto: "Ver lotes" }),
  },
  cobranza: {
    columnas: [
      { titulo: "Comprobante", celda: (f) => <Doble a={f.documento} b={`Pedido ${f.pedido_numero} · ${f.contrato_numero}`} /> },
      { titulo: "Vence", celda: (f) => <Doble a={d(f.fecha_vencimiento)} b={f.dias_vencido > 0 ? `${f.dias_vencido} días vencido` : ""} /> },
      { titulo: "Total", numero: true, celda: (f) => dinero(f.total, f.moneda) },
      { titulo: "Cobrado", numero: true, celda: (f) => dinero(f.cobrado, f.moneda) },
      { titulo: "Saldo", numero: true, celda: (f) => <Doble a={dinero(f.saldo, f.moneda)} b={f.cuadra === false ? "No cuadra" : ""} /> },
      { titulo: "Situación", celda: (f) => etiquetas[f.situacion] ?? f.situacion },
    ],
    enlace: (f) => ({ href: expediente(f), texto: "Ver estado de cuenta" }),
  },
  penalidades: {
    columnas: [
      { titulo: "Contrato y regla", celda: (f) => <Doble a={f.contrato_numero} b={`${f.regla} · versión ${f.regla_version}`} /> },
      { titulo: "Entrega", celda: (f) => <Doble a={d(f.fecha_programada)} b={`Corte ${d(f.fecha_corte_calculo)}`} /> },
      { titulo: "Atraso", numero: true, celda: (f) => `${f.dias_atraso} días` },
      { titulo: "Estimado", numero: true, celda: (f) => dinero(f.monto_estimado, f.moneda) },
      { titulo: "Estado", celda: (f) => <Doble a={etiquetas[f.estado] ?? f.estado} b={f.monto_aprobado !== null ? dinero(f.monto_aprobado, f.moneda) : ""} /> },
    ],
    enlace: (f) => ({ href: expediente(f), texto: "Ver penalidad" }),
  },
};

// Filtro de cada ficha sobre su conjunto.
const ESTADOS: Record<string, { texto: string; aplica: (f: Fila) => boolean }> = {
  EXIGIBLE: { texto: "Exigibles", aplica: (f) => f.cumplimiento !== "EN_PLAZO" },
  ATRASADA: { texto: "Atrasadas", aplica: (f) => f.cumplimiento === "ATRASADA" },
  SIN_COBERTURA: { texto: "Sin cobertura", aplica: (f) => f.estado === "SIN_COBERTURA" },
};

export function DetalleTablero({ data, foco, onFoco }: { data: Tablero; foco: Foco; onFoco: (f: Foco) => void }) {
  const visibles = Object.keys(data.datasets) as Dataset[];
  const todas = data.datasets[foco.dataset] ?? [];
  const filtro = foco.estado ? ESTADOS[foco.estado] : undefined;
  const filas = filtro ? todas.filter(filtro.aplica) : todas;
  const def = COLUMNAS[foco.dataset];
  return (
    <section aria-label="Detalle del indicador" className="space-y-3">
      <div role="tablist" aria-label="Conjuntos" className="flex flex-wrap gap-2">
        {visibles.map((nombre) => (
          <button
            key={nombre}
            type="button"
            role="tab"
            aria-selected={foco.dataset === nombre}
            onClick={() => onFoco({ dataset: nombre })}
            className={`rounded-md border px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              foco.dataset === nombre ? "border-primary bg-primary/5 font-medium" : "border-border hover:bg-muted/40"
            }`}
          >
            {TITULOS[nombre]} <span className="tabular-nums text-muted-foreground">{(data.datasets[nombre] ?? []).length}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={TITULOS[foco.dataset]} className="space-y-2">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {filas.length} de {todas.length} filas
          {filtro && (
            <button
              type="button"
              className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onFoco({ dataset: foco.dataset })}
            >
              {filtro.texto} · quitar filtro
            </button>
          )}
          {filas.length > LIMITE && <span>Se muestran {LIMITE}; el Excel del corte trae todas.</span>}
        </p>
        {!filas.length ? (
          <p className="text-sm text-muted-foreground">Sin filas para este corte y filtros.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">{TITULOS[foco.dataset]} del corte</caption>
              <thead>
                <tr className="border-b border-border text-left">
                  {def.columnas.map((c) => (
                    <th key={c.titulo} scope="col" className={`whitespace-nowrap p-2 ${c.numero ? "text-right" : ""}`}>
                      {c.titulo}
                    </th>
                  ))}
                  <th scope="col" className="p-2">
                    <span className="sr-only">Documento origen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, LIMITE).map((f, i) => {
                  const enlace = def.enlace(f);
                  return (
                    <tr key={`${f.entrega_id ?? f.calculo_id ?? f.cxc_id ?? f.lote_id ?? f.orden_cliente_id ?? f.producto_id}:${i}`} className="border-b border-border align-top last:border-0">
                      {def.columnas.map((c) => (
                        <td key={c.titulo} className={`p-2 ${c.numero ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                          {c.celda(f)}
                        </td>
                      ))}
                      <td className="whitespace-nowrap p-2 text-right">
                        <Link className="text-sm font-medium text-primary underline-offset-2 hover:underline" href={enlace.href}>
                          {enlace.texto}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Doble({ a, b }: { a: ReactNode; b?: ReactNode }) {
  return (
    <>
      <span className="block">{a}</span>
      {b ? <span className="block text-xs text-muted-foreground">{b}</span> : null}
    </>
  );
}
