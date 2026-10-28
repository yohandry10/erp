"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";
import { usePermission } from "@/hooks/use-permission";
import { fetchApi } from "@/lib/api-fetch";
import { Campo, control } from "../ventas/contratos/ContractForm";

type Archivo = "contratos" | "oc" | "cronograma" | "stock";
const ARCHIVOS: Array<{ clave: Archivo; titulo: string; runType: string; ruta: string }> = [
  { clave: "contratos", titulo: "Contratos y líneas", runType: "contratos_suministro", ruta: "contratos-suministro" },
  { clave: "oc", titulo: "OC del cliente", runType: "oc_suministro", ruta: "oc-suministro" },
  { clave: "cronograma", titulo: "Cronograma de entregas", runType: "cronograma_suministro", ruta: "cronograma-suministro" },
  { clave: "stock", titulo: "Stock inicial con lotes", runType: "stock_inicial", ruta: "stock-inicial" },
];
type Conciliacion = {
  cuadra: boolean;
  entidades: Array<{ entidad: string; origen: Record<string, number>; erp: Record<string, number>; diferencias: Record<string, number>; cuadra: boolean }>;
};
type Ensayo = {
  errores: number;
  registros: Array<{ entidad: string; id_origen: string; fila: number | null; ok: boolean; error?: string }>;
  conciliacion: Conciliacion | null;
  errores_archivo: Array<{ archivo: string; rowIndex: number; field?: string; message: string }>;
};
type Importacion = {
  runId: string | null;
  status: string;
  result: { totalRows: number; okRows: number; errorRows: number; skippedRows: number; created: number; errors: Array<{ rowIndex: number; externalId?: string; message: string }> };
};

const leerBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
    r.readAsDataURL(file);
  });
const leerControl = async (file: File) => {
  try {
    return JSON.parse(await file.text()) as Record<string, unknown>;
  } catch {
    throw new Error("control.json no es un JSON válido.");
  }
};

export default function MigracionFoxPage() {
  const importar = usePermission("migration", "import", "suministro");
  const validar = usePermission("migration", "read", "validar");
  const { post } = useApi({ throwOnError: true, showErrorToast: false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const correr = async (tarea: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await tarea();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la operación.");
    } finally {
      setBusy(false);
    }
  };

  if (importar.loading)
    return (
      <p role="status" className="p-6">
        Comprobando acceso a la migración…
      </p>
    );
  if (!importar.hasPermission)
    return (
      <p role="alert" className="p-6">
        No tiene permiso para migrar contratos desde FOX.
      </p>
    );

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Migración desde FOX</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Sustitución con fecha de corte: se migran saldos abiertos (lo no ejecutado de cada contrato, lo pendiente de cada OC y
          las entregas pendientes) y el stock con lotes y vencimientos. La historia queda en FOX y no genera pedidos, despachos,
          comprobantes ni asientos. Orden: clientes y productos, contratos, OC, cronograma y stock.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Plantillas />
      <EnsayoCompleto busy={busy} correr={correr} post={post} />
      <ImportarArchivo busy={busy} correr={correr} post={post} />
      {validar.hasPermission && <ConciliarMigracion busy={busy} correr={correr} post={post} />}
    </div>
  );
}

type Acciones = {
  busy: boolean;
  correr: (tarea: () => Promise<void>) => Promise<void>;
  post: ReturnType<typeof useApi>["post"];
};

function Plantillas() {
  const [error, setError] = useState("");
  const descargar = async (runType: string) => {
    setError("");
    const res = await fetchApi(`/api/migration/templates/${runType}`);
    if (!res.ok) return setError("No se pudo descargar la plantilla.");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `plantilla_migracion_${runType}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <section aria-label="Plantillas" className="space-y-3">
      <h2 className="text-lg font-semibold">1. Plantillas</h2>
      <p className="text-sm text-muted-foreground">
        CSV UTF-8 con punto decimal y fechas AAAA-MM-DD. El transformador <span className="font-mono">scripts/fox</span> las genera desde
        el extracto FOX junto con <span className="font-mono">control.json</span>.
      </p>
      <div className="flex flex-wrap gap-2">
        {ARCHIVOS.map((a) => (
          <Button key={a.clave} variant="outline" size="sm" onClick={() => void descargar(a.runType)}>
            <Download className="mr-2 h-4 w-4" aria-hidden />
            {a.titulo}
          </Button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

function EnsayoCompleto({ busy, correr, post }: Acciones) {
  const [archivos, setArchivos] = useState<Partial<Record<Archivo, File>>>({});
  const [controlFile, setControlFile] = useState<File | null>(null);
  const [fechaCorte, setFechaCorte] = useState("");
  const [resultado, setResultado] = useState<Ensayo | null>(null);
  const listo = Object.keys(archivos).length > 0 && (!archivos.stock || fechaCorte);
  return (
    <section aria-label="Ensayo completo" className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 className="text-lg font-semibold">2. Ensayo completo (no escribe)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Valida todo en la base en el orden real y revierte al final: errores por registro y conciliación contra los totales de
          control. Se puede repetir las veces necesarias.
        </p>
      </div>
      <form
        aria-label="Archivos del ensayo"
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!listo) return;
          void correr(async () => {
            const body: Record<string, unknown> = {};
            for (const [clave, file] of Object.entries(archivos)) if (file) body[clave] = await leerBase64(file);
            if (archivos.stock) body.fechaCorte = fechaCorte;
            if (controlFile) body.control = await leerControl(controlFile);
            const r = await post("/api/migration/fox/ensayo", body);
            if (!Array.isArray(r?.data?.registros)) throw new Error("El ensayo no devolvió resultados.");
            setResultado(r.data);
          });
        }}
      >
        {ARCHIVOS.map((a) => (
          <Campo key={a.clave} label={a.titulo}>
            <input
              type="file"
              accept=".csv,text/csv"
              className={control}
              onChange={(e) => setArchivos({ ...archivos, [a.clave]: e.target.files?.[0] })}
            />
          </Campo>
        ))}
        <Campo label="Fecha de corte del stock">
          <Input type="date" value={fechaCorte} onChange={(e) => setFechaCorte(e.target.value)} />
        </Campo>
        <Campo label="Totales de control (control.json)">
          <input type="file" accept=".json,application/json" className={control} onChange={(e) => setControlFile(e.target.files?.[0] ?? null)} />
        </Campo>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy || !listo}>
            {busy ? "Ensayando…" : "Ensayar migración"}
          </Button>
        </div>
      </form>
      {resultado && (
        <div className="space-y-4" aria-live="polite">
          <p className="text-sm font-medium" role="status">
            {resultado.errores === 0 && !resultado.errores_archivo.length
              ? `Ensayo sin errores: ${resultado.registros.length} registros.`
              : `${resultado.errores + resultado.errores_archivo.length} errores en ${resultado.registros.length + resultado.errores_archivo.length} registros.`}
          </p>
          {resultado.conciliacion && <TablaConciliacion data={resultado.conciliacion} />}
          <Errores
            filas={[
              ...resultado.errores_archivo.map((e) => ({ origen: e.archivo, id: e.field ?? "", fila: e.rowIndex, mensaje: e.message })),
              ...resultado.registros.filter((r) => !r.ok).map((r) => ({ origen: r.entidad, id: r.id_origen, fila: r.fila, mensaje: r.error ?? "" })),
            ]}
          />
        </div>
      )}
    </section>
  );
}

function ImportarArchivo({ busy, correr, post }: Acciones) {
  const [tipo, setTipo] = useState<Archivo>("contratos");
  const [file, setFile] = useState<File | null>(null);
  const [fechaCorte, setFechaCorte] = useState("");
  const [resultado, setResultado] = useState<(Importacion & { ensayo: boolean }) | null>(null);
  const def = ARCHIVOS.find((a) => a.clave === tipo)!;
  const listo = Boolean(file) && (tipo !== "stock" || fechaCorte);
  const enviar = (dryRun: boolean) =>
    correr(async () => {
      const r = await post(`/api/migration/${def.ruta}/import`, {
        fileBase64: await leerBase64(file!),
        filename: file!.name,
        dryRun,
        ...(tipo === "stock" ? { fechaCorte } : {}),
      });
      if (!r?.result) throw new Error("La importación no devolvió resultados.");
      setResultado({ ...r, ensayo: dryRun });
    });
  return (
    <section aria-label="Importar" className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 className="text-lg font-semibold">3. Importar</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada archivo se importa por separado y en orden. Repetir el mismo archivo no duplica: lo ya migrado se informa como
          omitido, y un dato cambiado en FOX se rechaza.
        </p>
      </div>
      <form className="grid gap-3 sm:grid-cols-3" aria-label="Archivo a importar" onSubmit={(e) => e.preventDefault()}>
        <Campo label="Tipo">
          <select className={control} value={tipo} onChange={(e) => setTipo(e.target.value as Archivo)}>
            {ARCHIVOS.map((a) => (
              <option key={a.clave} value={a.clave}>
                {a.titulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Archivo CSV">
          <input type="file" accept=".csv,text/csv" className={control} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Campo>
        {tipo === "stock" && (
          <Campo label="Fecha de corte">
            <Input type="date" value={fechaCorte} onChange={(e) => setFechaCorte(e.target.value)} />
          </Campo>
        )}
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <Button type="button" variant="outline" disabled={busy || !listo} onClick={() => void enviar(true)}>
            Ensayar este archivo
          </Button>
          <Button type="button" disabled={busy || !listo} onClick={() => void enviar(false)}>
            Importar
          </Button>
        </div>
      </form>
      {resultado && (
        <div className="space-y-3" aria-live="polite">
          <p role="status" className="text-sm font-medium">
            {resultado.ensayo ? "Ensayo" : `Importación ${resultado.status === "completed" ? "completa" : resultado.status === "partial" ? "parcial" : "fallida"}`}
            : {resultado.result.okRows} filas correctas, {resultado.result.skippedRows} ya migradas, {resultado.result.errorRows} con
            error de {resultado.result.totalRows}.
            {resultado.runId ? ` Lote ${resultado.runId.slice(0, 8)}.` : ""}
          </p>
          <Errores filas={resultado.result.errors.map((e) => ({ origen: def.titulo, id: e.externalId ?? "", fila: e.rowIndex, mensaje: e.message }))} />
        </div>
      )}
    </section>
  );
}

function ConciliarMigracion({ busy, correr, post }: Acciones) {
  const [controlFile, setControlFile] = useState<File | null>(null);
  const [resultado, setResultado] = useState<Conciliacion | null>(null);
  return (
    <section aria-label="Conciliación" className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 className="text-lg font-semibold">4. Conciliación</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Compara lo migrado en el ERP con los totales de control del extracto: registros, líneas, cantidades y valores.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        aria-label="Conciliar migración"
        onSubmit={(e) => {
          e.preventDefault();
          if (!controlFile) return;
          void correr(async () => {
            const r = await post("/api/migration/fox/conciliacion", { control: await leerControl(controlFile) });
            if (!Array.isArray(r?.data?.entidades)) throw new Error("La conciliación no devolvió resultados.");
            setResultado(r.data);
          });
        }}
      >
        <div className="min-w-[260px] flex-1">
          <Campo label="Totales de control (control.json)">
            <input type="file" accept=".json,application/json" className={control} onChange={(e) => setControlFile(e.target.files?.[0] ?? null)} />
          </Campo>
        </div>
        <Button type="submit" disabled={busy || !controlFile}>
          Conciliar
        </Button>
      </form>
      {resultado && <TablaConciliacion data={resultado} />}
    </section>
  );
}

function TablaConciliacion({ data }: { data: Conciliacion }) {
  const filas = data.entidades.flatMap((e) =>
    Object.keys(e.origen).map((campo) => ({ entidad: e.entidad, campo, origen: e.origen[campo], erp: e.erp?.[campo], dif: e.diferencias[campo] })),
  );
  return (
    <div className="space-y-2">
      <p role="status" className="text-sm font-medium">
        {data.cuadra ? "Conciliación: cuadra con el extracto." : "Conciliación: hay diferencias con el extracto."}
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[520px] text-sm tabular-nums">
          <caption className="sr-only">Conciliación FOX frente al ERP</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="p-2">Entidad</th>
              <th scope="col" className="p-2">Medida</th>
              <th scope="col" className="p-2 text-right">FOX</th>
              <th scope="col" className="p-2 text-right">ERP</th>
              <th scope="col" className="p-2 text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={`${f.entidad}:${f.campo}`} className="border-b border-border last:border-0">
                <td className="p-2">{f.entidad}</td>
                <td className="p-2">{f.campo}</td>
                <td className="p-2 text-right">{f.origen}</td>
                <td className="p-2 text-right">{f.erp ?? "—"}</td>
                <td className={`p-2 text-right ${f.dif ? "font-semibold text-destructive" : ""}`}>{f.dif ? f.dif : "Cuadra"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Errores({ filas }: { filas: Array<{ origen: string; id: string; fila: number | null; mensaje: string }> }) {
  if (!filas.length) return null;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[560px] text-sm">
        <caption className="sr-only">Errores por registro</caption>
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="p-2">Archivo o entidad</th>
            <th scope="col" className="p-2">Registro</th>
            <th scope="col" className="p-2 text-right">Fila</th>
            <th scope="col" className="p-2">Error</th>
          </tr>
        </thead>
        <tbody>
          {filas.slice(0, 500).map((f, i) => (
            <tr key={`${f.origen}:${f.id}:${f.fila}:${i}`} className="border-b border-border align-top last:border-0">
              <td className="p-2">{f.origen}</td>
              <td className="p-2">{f.id}</td>
              <td className="p-2 text-right tabular-nums">{f.fila ?? "—"}</td>
              <td className="p-2">{f.mensaje}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
