"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";
import { usePermission } from "@/hooks/use-permission";
import { fetchApi } from "@/lib/api-fetch";
import { Campo, control } from "../ventas/contratos/ContractForm";

type Archivo =
  | "clientes" | "proveedores" | "almacenes" | "plan_cuentas" | "productos" | "cuentas_bancarias" | "listas_precios"
  | "cxc" | "cxp" | "balance" | "contratos" | "oc" | "cronograma" | "oc_compra" | "pedidos_venta" | "stock";
type DefArchivo = { clave: Archivo; titulo: string; runType: string; ruta: string; corte?: boolean };
// En el orden en que se importan: cada etapa depende de las anteriores.
const ETAPAS: Array<{ titulo: string; archivos: DefArchivo[] }> = [
  { titulo: "Terceros", archivos: [
    { clave: "clientes", titulo: "Clientes", runType: "clientes", ruta: "clientes" },
    { clave: "proveedores", titulo: "Proveedores", runType: "proveedores", ruta: "proveedores" },
  ] },
  { titulo: "Maestros", archivos: [
    { clave: "almacenes", titulo: "Almacenes", runType: "almacenes", ruta: "fox/almacenes" },
    { clave: "plan_cuentas", titulo: "Plan de cuentas", runType: "plan_cuentas", ruta: "fox/plan_cuentas" },
    { clave: "productos", titulo: "Productos", runType: "productos", ruta: "fox/productos" },
    { clave: "cuentas_bancarias", titulo: "Cuentas bancarias", runType: "cuentas_bancarias", ruta: "fox/cuentas_bancarias" },
    { clave: "listas_precios", titulo: "Listas de precios", runType: "listas_precios", ruta: "fox/listas_precios" },
  ] },
  { titulo: "Saldos y apertura", archivos: [
    { clave: "cxc", titulo: "Cuentas por cobrar abiertas", runType: "cxc_abiertas", ruta: "cxc", corte: true },
    { clave: "cxp", titulo: "Cuentas por pagar abiertas", runType: "cxp_abiertas", ruta: "cxp", corte: true },
    { clave: "balance", titulo: "Balance de apertura", runType: "balance_apertura", ruta: "balance-apertura", corte: true },
  ] },
  { titulo: "Suministro", archivos: [
    { clave: "contratos", titulo: "Contratos y líneas", runType: "contratos_suministro", ruta: "contratos-suministro" },
    { clave: "oc", titulo: "OC del cliente", runType: "oc_suministro", ruta: "oc-suministro" },
    { clave: "cronograma", titulo: "Cronograma de entregas", runType: "cronograma_suministro", ruta: "cronograma-suministro" },
  ] },
  { titulo: "Operación abierta", archivos: [
    { clave: "oc_compra", titulo: "OC de compra abiertas", runType: "oc_compra", ruta: "fox/oc_compra" },
    { clave: "pedidos_venta", titulo: "Pedidos de venta abiertos", runType: "pedidos_venta", ruta: "fox/pedidos_venta" },
    { clave: "stock", titulo: "Stock inicial con lotes", runType: "stock_inicial", ruta: "stock-inicial", corte: true },
  ] },
];
const ARCHIVOS = ETAPAS.flatMap((e) => e.archivos);
const conCorte = (claves: string[]) => ARCHIVOS.some((a) => a.corte && claves.includes(a.clave));

type Cruce = { bancos: number; apertura: number; cuadra: boolean; cuentas: Array<{ cuenta_contable: string | null; cuentas_bancarias: number; bancos: number; apertura: number; cuadra: boolean }> };
type Conciliacion = {
  cuadra: boolean;
  entidades: Array<{ entidad: string; origen: Record<string, number>; erp: Record<string, number>; diferencias: Record<string, number>; cuadra: boolean }>;
  cruces?: { bancos_vs_apertura?: Cruce };
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
  result: { totalRows: number; okRows: number; errorRows: number; skippedRows: number; created: number; updated?: number; errors: Array<{ rowIndex: number; externalId?: string; message: string }> };
};
type Lote = { id: string; descripcion: string; fecha_corte: string | null; estado: "CARGANDO" | "COMPLETO" | "DESCARTADO"; tablas: Record<string, number>; cerrado_en: string | null; motivo_descarte: string | null };
type ConsultaArchivo = {
  lotes: Lote[]; lote_id: string | null; tablas: Array<{ tabla: string; filas: number }>; total: number; pagina: number; limite: number;
  filas: Array<{ id: number; tabla: string; clave: string; fila: Record<string, unknown> }>;
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
  const importar = usePermission("migration", "import", "fox");
  const validar = usePermission("migration", "read", "validar");
  const leerArchivo = usePermission("migration", "read", "archivo");
  // Importar miles de filas o ensayar el extracto completo tarda minutos: el límite de 12 s por defecto lo abortaría.
  const { post, get } = useApi({ throwOnError: true, showErrorToast: false, timeoutMs: 15 * 60 * 1000 });
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

  if (importar.loading || leerArchivo.loading)
    return (
      <p role="status" className="p-6">
        Comprobando acceso a la migración…
      </p>
    );
  if (!importar.hasPermission && !leerArchivo.hasPermission)
    return (
      <p role="alert" className="p-6">
        No tiene permiso para migrar ni consultar el archivo de FOX.
      </p>
    );

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Migración desde FOX</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Dos capas con fecha de corte. El archivo íntegro guarda cada tabla del extracto tal cual, consultable y sin efectos. La
          migración operativa carga terceros, maestros y saldos abiertos por los mismos procesos del ERP: lo pendiente de cada
          documento, nunca la historia, que queda en el archivo.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {importar.hasPermission && (
        <>
          <Plantillas />
          <EnsayoCompleto busy={busy} correr={correr} post={post} />
          <ImportarArchivo busy={busy} correr={correr} post={post} />
          {validar.hasPermission && <ConciliarMigracion busy={busy} correr={correr} post={post} />}
        </>
      )}
      {leerArchivo.hasPermission && <ArchivoIntegro get={get} />}
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {ETAPAS.map((etapa) => (
          <div key={etapa.titulo} className="space-y-2">
            <h3 className="text-sm font-medium">{etapa.titulo}</h3>
            <div className="flex flex-col items-start gap-1.5">
              {etapa.archivos.map((a) => (
                <Button key={a.clave} variant="ghost" size="sm" className="h-auto justify-start px-2 py-1 text-left" onClick={() => void descargar(a.runType)}>
                  <Download className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                  {a.titulo}
                </Button>
              ))}
            </div>
          </div>
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
  const elegidos = Object.keys(archivos).filter((k) => archivos[k as Archivo]);
  const exigeCorte = conCorte(elegidos);
  const listo = elegidos.length > 0 && (!exigeCorte || fechaCorte);
  return (
    <section aria-label="Ensayo completo" className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 className="text-lg font-semibold">2. Ensayo integral (no escribe)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Valida todo junto en la base en el orden real y revierte al final: errores por registro, conciliación contra los totales
          de control y cruce de bancos con el asiento de apertura. Se puede repetir las veces necesarias.
        </p>
      </div>
      <form
        aria-label="Archivos del ensayo"
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!listo) return;
          void correr(async () => {
            const body: Record<string, unknown> = {};
            for (const [clave, file] of Object.entries(archivos)) if (file) body[clave] = await leerBase64(file);
            if (fechaCorte) body.fechaCorte = fechaCorte;
            if (controlFile) body.control = await leerControl(controlFile);
            const r = await post("/api/migration/fox/ensayo", body);
            if (!Array.isArray(r?.data?.registros)) throw new Error("El ensayo no devolvió resultados.");
            setResultado(r.data);
          });
        }}
      >
        {ETAPAS.map((etapa) => (
          <fieldset key={etapa.titulo} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="mb-2 text-sm font-medium">{etapa.titulo}</legend>
            {etapa.archivos.map((a) => (
              <Campo key={a.clave} label={a.titulo}>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className={control}
                  onChange={(e) => setArchivos({ ...archivos, [a.clave]: e.target.files?.[0] })}
                />
              </Campo>
            ))}
          </fieldset>
        ))}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Fecha de corte">
            <Input type="date" value={fechaCorte} onChange={(e) => setFechaCorte(e.target.value)} aria-describedby="corte-ayuda" />
          </Campo>
          <Campo label="Totales de control (control.json)">
            <input type="file" accept=".json,application/json" className={control} onChange={(e) => setControlFile(e.target.files?.[0] ?? null)} />
          </Campo>
        </div>
        <p id="corte-ayuda" className="text-xs text-muted-foreground">
          Obligatoria con saldos por cobrar o pagar, balance o stock.
        </p>
        <Button type="submit" disabled={busy || !listo}>
          {busy ? "Ensayando…" : "Ensayar migración"}
        </Button>
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
  const [tipo, setTipo] = useState<Archivo>("clientes");
  const [file, setFile] = useState<File | null>(null);
  const [fechaCorte, setFechaCorte] = useState("");
  const [resultado, setResultado] = useState<(Importacion & { ensayo: boolean; titulo: string }) | null>(null);
  const def = ARCHIVOS.find((a) => a.clave === tipo)!;
  const listo = Boolean(file) && (!def.corte || fechaCorte);
  const enviar = (dryRun: boolean) =>
    correr(async () => {
      const r = await post(`/api/migration/${def.ruta}/import`, {
        fileBase64: await leerBase64(file!),
        filename: file!.name,
        dryRun,
        ...(def.corte ? { fechaCorte } : {}),
      });
      if (!r?.result) throw new Error("La importación no devolvió resultados.");
      setResultado({ ...r, ensayo: dryRun, titulo: def.titulo });
    });
  return (
    <section aria-label="Importar" className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 className="text-lg font-semibold">3. Importar</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Un archivo a la vez, en el orden de la lista. Repetir el mismo archivo no duplica: lo ya migrado se informa como omitido,
          lo que ya existía en el ERP se enlaza, y un dato cambiado en FOX se rechaza.
        </p>
      </div>
      <form className="grid gap-3 sm:grid-cols-3" aria-label="Archivo a importar" onSubmit={(e) => e.preventDefault()}>
        <Campo label="Tipo">
          <select
            className={control}
            value={tipo}
            onChange={(e) => {
              // Otro tipo exige otro archivo: no se reutiliza el elegido antes.
              setTipo(e.target.value as Archivo);
              setFile(null);
              setResultado(null);
            }}
          >
            {ETAPAS.map((etapa) => (
              <optgroup key={etapa.titulo} label={etapa.titulo}>
                {etapa.archivos.map((a) => (
                  <option key={a.clave} value={a.clave}>
                    {a.titulo}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Campo>
        <Campo label="Archivo CSV">
          <input key={tipo} type="file" accept=".csv,text/csv" className={control} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Campo>
        {def.corte && (
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
            {resultado.result.updated ? ` ${resultado.result.updated} enlazadas a registros existentes.` : ""}
            {resultado.runId ? ` Lote ${resultado.runId.slice(0, 8)}.` : ""}
          </p>
          <Errores filas={resultado.result.errors.map((e) => ({ origen: resultado.titulo, id: e.externalId ?? "", fila: e.rowIndex, mensaje: e.message }))} />
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
          Compara lo migrado en el ERP con los totales de control del extracto: registros, líneas, cantidades, saldos y valores.
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
  const cruce = data.cruces?.bancos_vs_apertura;
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
      {cruce && cruce.cuentas.length > 0 && (
        <div className="space-y-2 pt-2">
          <p role="status" className="text-sm font-medium">
            {cruce.cuadra
              ? "Bancos y asiento de apertura: cuadran en moneda local."
              : "Bancos y asiento de apertura: no cuadran; revise el saldo o el tipo de cambio de cada cuenta."}
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[480px] text-sm tabular-nums">
              <caption className="sr-only">Saldos bancarios frente al asiento de apertura</caption>
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="p-2">Cuenta contable</th>
                  <th scope="col" className="p-2 text-right">Cuentas bancarias</th>
                  <th scope="col" className="p-2 text-right">Bancos</th>
                  <th scope="col" className="p-2 text-right">Apertura</th>
                </tr>
              </thead>
              <tbody>
                {cruce.cuentas.map((c) => (
                  <tr key={c.cuenta_contable ?? "sin-cuenta"} className="border-b border-border last:border-0">
                    <td className="p-2">{c.cuenta_contable ?? "Sin cuenta contable"}</td>
                    <td className="p-2 text-right">{c.cuentas_bancarias}</td>
                    <td className="p-2 text-right">{c.bancos}</td>
                    <td className={`p-2 text-right ${c.cuadra ? "" : "font-semibold text-destructive"}`}>{c.apertura}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const ESTADO_LOTE: Record<Lote["estado"], string> = { CARGANDO: "Cargando", COMPLETO: "Completo", DESCARTADO: "Descartado" };

function ArchivoIntegro({ get }: { get: ReturnType<typeof useApi>["get"] }) {
  const [filtros, setFiltros] = useState({ loteId: "", tabla: "", texto: "", pagina: 1 });
  const [texto, setTexto] = useState("");
  const [datos, setDatos] = useState<ConsultaArchivo | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const LIMITE = 25;

  const consultar = useCallback(async (f: typeof filtros) => {
    setCargando(true);
    setError("");
    try {
      const q = new URLSearchParams({ limite: String(LIMITE), pagina: String(f.pagina) });
      if (f.loteId) q.set("loteId", f.loteId);
      if (f.tabla) q.set("tabla", f.tabla);
      if (f.texto) q.set("texto", f.texto);
      const r = await get(`/api/migration/fox/archivo?${q.toString()}`);
      if (!Array.isArray(r?.data?.filas)) throw new Error("La consulta del archivo no devolvió resultados.");
      setDatos(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar el archivo.");
    } finally {
      setCargando(false);
    }
  }, [get]);

  useEffect(() => {
    void consultar(filtros);
  }, [consultar, filtros]);

  const lote = datos?.lotes.find((l) => l.id === datos.lote_id) ?? null;
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.limite)) : 1;
  return (
    <section aria-label="Archivo íntegro" className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 className="text-lg font-semibold">Archivo íntegro de FOX</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Cada tabla del extracto tal cual, incluidas las filas borradas en FOX, para consultar la historia que no se migra. Las
          credenciales se redactan al cargar. Se carga con <span className="font-mono">scripts/fox/archivar-fox.mjs</span> y es de
          sólo lectura.
        </p>
      </div>
      {datos && datos.lotes.length === 0 ? (
        <p className="text-sm" role="status">Aún no hay un extracto archivado.</p>
      ) : (
        <form
          aria-label="Buscar en el archivo"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFiltros({ ...filtros, texto: texto.trim(), pagina: 1 });
          }}
        >
          <Campo label="Extracto">
            <select className={control} value={filtros.loteId || datos?.lote_id || ""}
              onChange={(e) => setFiltros({ loteId: e.target.value, tabla: "", texto: filtros.texto, pagina: 1 })}>
              {(datos?.lotes ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.descripcion} · {ESTADO_LOTE[l.estado]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Tabla">
            <select className={control} value={filtros.tabla} onChange={(e) => setFiltros({ ...filtros, tabla: e.target.value, pagina: 1 })}>
              <option value="">Todas</option>
              {(datos?.tablas ?? []).map((t) => (
                <option key={t.tabla} value={t.tabla}>
                  {t.tabla} ({t.filas.toLocaleString("es-PE")})
                </option>
              ))}
            </select>
          </Campo>
          <div className="sm:col-span-2">
            <Campo label="Buscar texto">
              <div className="flex gap-2">
                <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder='p. ej. "orden 457" -anulada' maxLength={200} />
                <Button type="submit" disabled={cargando}>Buscar</Button>
              </div>
            </Campo>
          </div>
        </form>
      )}
      {lote && lote.estado !== "COMPLETO" && (
        <p className="text-sm text-muted-foreground" role="note">
          {lote.estado === "DESCARTADO" ? `Extracto descartado: ${lote.motivo_descarte}.` : "Extracto en carga: sus conteos aún no están cerrados."}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {datos && datos.lotes.length > 0 && (
        <div className="space-y-3" aria-live="polite" aria-busy={cargando}>
          <p role="status" className="text-sm font-medium tabular-nums">
            {datos.total === 0
              ? "Sin filas para esa búsqueda."
              : `${datos.total.toLocaleString("es-PE")} filas · página ${datos.pagina} de ${paginas}`}
          </p>
          <ul className="divide-y divide-border rounded-md border border-border" aria-label="Filas del archivo">
            {datos.filas.map((f) => (
              <FilaArchivo key={f.id} fila={f} />
            ))}
          </ul>
          {paginas > 1 && (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={cargando || datos.pagina <= 1}
                onClick={() => setFiltros({ ...filtros, pagina: datos.pagina - 1 })}>
                Anterior
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={cargando || datos.pagina >= paginas}
                onClick={() => setFiltros({ ...filtros, pagina: datos.pagina + 1 })}>
                Siguiente
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FilaArchivo({ fila }: { fila: ConsultaArchivo["filas"][number] }) {
  const campos = Object.entries(fila.fila).filter(([k]) => k !== "_borrado");
  const borrada = fila.fila._borrado === true;
  return (
    <li className="p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-xs font-medium">{fila.tabla}</span>
        <span className="font-mono text-xs text-muted-foreground">registro {fila.clave}</span>
        {borrada && <span className="text-xs font-medium text-destructive">Borrado en FOX</span>}
      </div>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {campos.slice(0, 9).map(([k, v]) => (
          <div key={k} className="flex min-w-0 gap-2">
            <dt className="shrink-0 font-mono text-xs text-muted-foreground">{k}</dt>
            <dd className="min-w-0 truncate" title={String(v ?? "")}>{v === null || v === "" ? "—" : String(v)}</dd>
          </div>
        ))}
      </dl>
      {campos.length > 9 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">Ver los {campos.length} campos</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(Object.fromEntries(campos), null, 2)}</pre>
        </details>
      )}
    </li>
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
