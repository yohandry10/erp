"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";
import { getApiBaseUrl } from "@/lib/api-url";
import { Campo } from "../ventas/contratos/ContractForm";
import { fecha } from "../ventas/contratos/types";
import { Dataset, TITULOS } from "./types";

type Credencial = {
  id: string;
  nombre: string;
  prefijo: string;
  datasets: Dataset[];
  expira_en: string;
  created_at: string;
  creado_por_nombre: string | null;
  revocado_en: string | null;
  motivo_revocacion: string | null;
  ultimo_uso_en: string | null;
  estado: "ACTIVA" | "VENCIDA" | "REVOCADA";
};
type Acceso = {
  id: number;
  credencial: string;
  dataset: string;
  resultado: string;
  filas: number | null;
  hash: string | null;
  created_at: string;
};
const resultados: Record<string, string> = {
  OK: "Leído",
  CREDENCIAL_INACTIVA: "Credencial vencida o revocada",
  DATASET_NO_PERMITIDO: "Conjunto no autorizado",
  CORTE_NO_ENCONTRADO: "Corte inexistente",
};
const enDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};

/** Credenciales de lectura para Power BI; el token se ve una sola vez. */
export function BiCredenciales({ visibles }: { visibles: Dataset[] }) {
  const { get, post } = useApi({ throwOnError: true, showErrorToast: false });
  const [credenciales, setCredenciales] = useState<Credencial[]>([]);
  const [accesos, setAccesos] = useState<Acceso[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [creando, setCreando] = useState(false);
  const [emitida, setEmitida] = useState<{ nombre: string; token: string; dataset: Dataset } | null>(null);
  const [revocando, setRevocando] = useState<Credencial | null>(null);

  useEffect(() => {
    let valid = true;
    void get("/api/integraciones/bi/credenciales")
      .then((r) => {
        if (!valid) return;
        if (!Array.isArray(r?.data?.credenciales) || !Array.isArray(r?.data?.accesos))
          throw new Error("Las credenciales llegaron incompletas.");
        setCredenciales(r.data.credenciales);
        setAccesos(r.data.accesos);
      })
      .catch((e: Error) => valid && setError(e.message));
    return () => {
      valid = false;
    };
  }, [get, reload]);

  const operar = async (path: string, body: object, onOk: (data: any) => void) => {
    setBusy(true);
    setError("");
    try {
      const r = await post(path, body, { headers: { "Idempotency-Key": `bi:${crypto.randomUUID()}` } });
      if (!r?.data?.id) throw new Error("No se pudo confirmar la operación. Reintente.");
      onOk(r.data);
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la operación.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 border-t border-border pt-6" aria-label="Power BI">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Power BI</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Power BI lee los cortes registrados con una credencial de solo lectura de esta empresa, no con la sesión de un
            usuario. Cada lectura queda registrada con el corte y su hash, de modo que los informes concilian con este tablero
            al mismo corte.
          </p>
        </div>
        {!creando && (
          <Button variant="outline" disabled={busy || !visibles.length} onClick={() => setCreando(true)}>
            Crear credencial
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {creando && (
        <CredencialForm
          visibles={visibles}
          busy={busy}
          onCancel={() => setCreando(false)}
          onSubmit={(body) =>
            operar("/api/integraciones/bi/credenciales", body, (data) => {
              setCreando(false);
              setEmitida(data.token ? { nombre: data.nombre, token: data.token, dataset: body.datasets[0] } : null);
              if (!data.token) setError("La credencial ya estaba creada y su token no puede mostrarse otra vez. Revóquela y cree otra.");
            })
          }
        />
      )}
      {emitida && <TokenEmitido {...emitida} onClose={() => setEmitida(null)} />}
      {revocando && (
        <RevocarForm
          credencial={revocando}
          busy={busy}
          onCancel={() => setRevocando(null)}
          onSubmit={(motivo) =>
            operar(`/api/integraciones/bi/credenciales/${revocando.id}/revocar`, { motivo }, () => setRevocando(null))
          }
        />
      )}

      {!credenciales.length ? (
        <p className="text-sm text-muted-foreground">Aún no hay credenciales de lectura.</p>
      ) : (
        <ul className="space-y-2">
          {credenciales.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3 text-sm">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">
                  {c.nombre} <span className="font-mono text-xs font-normal text-muted-foreground">erpbi_{c.prefijo}_…</span>
                </p>
                <p>{c.datasets.map((d) => TITULOS[d] ?? d).join(", ")}</p>
                <p className="text-xs text-muted-foreground">
                  {c.estado === "ACTIVA" ? `Vence ${fecha(c.expira_en)}` : c.estado === "VENCIDA" ? `Venció ${fecha(c.expira_en)}` : `Revocada: ${c.motivo_revocacion}`}
                  {" · "}
                  {c.ultimo_uso_en ? `Último uso ${new Date(c.ultimo_uso_en).toLocaleString("es-PE")}` : "Sin uso"}
                  {c.creado_por_nombre ? ` · creada por ${c.creado_por_nombre}` : ""}
                </p>
              </div>
              {c.estado !== "REVOCADA" && !revocando && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRevocando(c)}>
                  Revocar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {accesos.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Últimas lecturas ({accesos.length})
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Lecturas de Power BI</caption>
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="p-2">Fecha</th>
                  <th scope="col" className="p-2">Credencial</th>
                  <th scope="col" className="p-2">Conjunto</th>
                  <th scope="col" className="p-2">Resultado</th>
                  <th scope="col" className="p-2 text-right">Filas</th>
                  <th scope="col" className="p-2">Corte</th>
                </tr>
              </thead>
              <tbody>
                {accesos.map((a) => (
                  <tr key={a.id} className="border-b border-border">
                    <td className="whitespace-nowrap p-2">{new Date(a.created_at).toLocaleString("es-PE")}</td>
                    <td className="p-2">{a.credencial}</td>
                    <td className="p-2">{TITULOS[a.dataset as Dataset] ?? a.dataset}</td>
                    <td className="p-2">{resultados[a.resultado] ?? a.resultado}</td>
                    <td className="p-2 text-right tabular-nums">{a.filas ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">{a.hash ? `${a.hash.slice(0, 12)}…` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function CredencialForm({
  visibles,
  busy,
  onCancel,
  onSubmit,
}: {
  visibles: Dataset[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (body: { nombre: string; datasets: Dataset[]; expira_en: string }) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [datasets, setDatasets] = useState<Dataset[]>(visibles);
  const [expira, setExpira] = useState(enDias(90));
  const completo = nombre.trim().length >= 3 && datasets.length > 0 && expira > enDias(0) && expira <= enDias(366);
  return (
    <form
      className="space-y-3 rounded-md border border-border p-4"
      aria-label="Nueva credencial de Power BI"
      onSubmit={(e) => {
        e.preventDefault();
        if (completo) onSubmit({ nombre: nombre.trim(), datasets, expira_en: expira });
      }}
    >
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <Campo label="Nombre (para quién o qué informe)">
          {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
          <Input value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} />
        </Campo>
        <Campo label="Vence">
          <Input type="date" min={enDias(1)} max={enDias(366)} value={expira} onChange={(e) => setExpira(e.target.value)} />
        </Campo>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">Conjuntos que podrá leer</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {visibles.map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={datasets.includes(d)}
                  onChange={(e) => setDatasets(e.target.checked ? [...datasets, d] : datasets.filter((x) => x !== d))}
                />
                {TITULOS[d]}
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>
      <p className="text-xs text-muted-foreground">Sólo aparecen los conjuntos que usted puede consultar. Vence como máximo en un año.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !completo}>
          Crear credencial
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function TokenEmitido({ nombre, token, dataset, onClose }: { nombre: string; token: string; dataset: Dataset; onClose: () => void }) {
  const [copiado, setCopiado] = useState("");
  const url = `${getApiBaseUrl()}/api/bi/v1/suministro/${dataset}/?corte=ultimo`;
  const consulta = [
    "let",
    `    Fuente = Json.Document(Web.Contents("${url}", [Headers = [Authorization = "Bearer ${token}"]])),`,
    "    Filas = Table.FromRecords(Fuente[filas])",
    "in",
    "    Filas",
  ].join("\n");
  const copiar = (texto: string, que: string) =>
    void navigator.clipboard?.writeText(texto).then(() => setCopiado(que), () => setCopiado(""));
  return (
    <div role="region" aria-label="Token emitido" className="space-y-3 rounded-md border border-primary bg-primary/5 p-4 text-sm">
      <p className="font-medium">Token de «{nombre}»: cópielo ahora, no se mostrará otra vez.</p>
      <code className="block break-all rounded bg-background p-2 font-mono text-xs">{token}</code>
      <p className="text-muted-foreground">
        En Power BI Desktop: Obtener datos → Consulta en blanco → Editor avanzado, pegue la consulta y use acceso anónimo. Cambie{" "}
        <span className="font-mono">{dataset}</span> por otro conjunto autorizado o <span className="font-mono">corte=ultimo</span> por el
        identificador de un corte.
      </p>
      <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-xs">{consulta}</pre>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => copiar(token, "token")}>
          {copiado === "token" ? "Token copiado" : "Copiar token"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => copiar(consulta, "consulta")}>
          {copiado === "consulta" ? "Consulta copiada" : "Copiar consulta"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Ya lo guardé
        </Button>
      </div>
    </div>
  );
}

function RevocarForm({
  credencial,
  busy,
  onCancel,
  onSubmit,
}: {
  credencial: Credencial;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <form
      className="space-y-3 rounded-md border border-border p-4"
      aria-label={`Revocar ${credencial.nombre}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (motivo.trim().length >= 5) onSubmit(motivo.trim());
      }}
    >
      <p className="text-sm font-medium">Revocar «{credencial.nombre}»</p>
      <Campo label="Motivo">
        {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
        <Input value={motivo} maxLength={1000} disabled={busy} onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
      <p className="text-xs text-muted-foreground">Power BI dejará de leer con este token de inmediato; las lecturas registradas se conservan.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" disabled={busy || motivo.trim().length < 5}>
          Revocar credencial
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
