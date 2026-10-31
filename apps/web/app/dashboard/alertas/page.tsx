"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { usePermission } from "@/hooks/use-permission";
import { useTenant } from "@/contexts/TenantContext";

type Tipo =
  | "ENTREGA_PROXIMA"
  | "ENTREGA_ATRASADA"
  | "ENTREGA_INCOMPLETA"
  | "LOTE_POR_VENCER"
  | "COBRANZA_POR_VENCER"
  | "COBRANZA_VENCIDA";
type Alerta = {
  id: string;
  tipo: Tipo;
  titulo: string;
  severidad: "AVISO" | "CRITICA";
  estado: "ABIERTA" | "RESUELTA";
  motivo_resolucion: string | null;
  fecha_objetivo: string;
  detalle: Record<string, unknown>;
  contrato_id: string | null;
  created_at: string;
  escalada_at: string | null;
  reconocida_por_mi: boolean;
  soy_destinatario: boolean;
  destinatarios: Array<{ usuario_id: string; nombre: string; nivel: string; reconocido_at: string | null; correo: boolean }>;
};
type Regla = {
  id: string;
  tipo: Tipo;
  activa: boolean;
  dias_anticipacion: number;
  dias_escalamiento: number | null;
  destinatarios: string[];
  escalar_a: string[];
  incluir_responsable: boolean;
  enviar_correo: boolean;
  version: number;
};
type Usuario = { id: string; nombre: string; email: string | null };
type Vista = "mias" | "todas" | "reglas";

const TIPOS: Array<{ tipo: Tipo; nombre: string; anticipacion: string | null; contrato: boolean }> = [
  { tipo: "ENTREGA_PROXIMA", nombre: "Entrega próxima sin despachar", anticipacion: "Días antes de la entrega", contrato: true },
  { tipo: "ENTREGA_ATRASADA", nombre: "Entrega atrasada sin aceptación completa", anticipacion: null, contrato: true },
  { tipo: "ENTREGA_INCOMPLETA", nombre: "Entrega con rechazo o aceptación incompleta", anticipacion: null, contrato: true },
  { tipo: "LOTE_POR_VENCER", nombre: "Lote con stock por vencer o vencido", anticipacion: "Días antes del vencimiento", contrato: false },
  { tipo: "COBRANZA_POR_VENCER", nombre: "Cobranza contractual por vencer", anticipacion: "Días antes del vencimiento", contrato: true },
  { tipo: "COBRANZA_VENCIDA", nombre: "Cobranza contractual vencida", anticipacion: null, contrato: true },
];
const nombreTipo = (t: Tipo) => TIPOS.find((x) => x.tipo === t)?.nombre ?? t;
const motivos: Record<string, string> = {
  CONDICION_SUPERADA: "Condición superada",
  REPROGRAMADA: "Entrega reprogramada",
  REGLA_DESACTIVADA: "Regla desactivada",
};
const fecha = (v: string) => v.slice(0, 10).split("-").reverse().join("/");
const control =
  "min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export default function AlertasPage() {
  const { get, post, put } = useApi({ throwOnError: true, showErrorToast: false });
  const { tenant } = useTenant();
  const ver = usePermission("alertas", "ver", "suministro");
  const gestionar = usePermission("alertas", "gestionar", "suministro");
  const [vista, setVista] = useState<Vista>("mias");
  const [estado, setEstado] = useState<"ABIERTA" | "RESUELTA" | "TODAS">("ABIERTA");
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [editando, setEditando] = useState<Tipo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{ tipo: Tipo; body: object; key: string } | null>(null);
  const seq = useRef(0);

  const cargar = useCallback(async () => {
    const actual = ++seq.current;
    setLoading(true);
    setError("");
    try {
      if (vista === "reglas") {
        const r = await get("/api/alertas/reglas");
        if (actual !== seq.current) return;
        setReglas(r.data.items);
        setUsuarios(r.data.usuarios);
      } else {
        const r = await get(vista === "mias" ? "/api/alertas/mias" : "/api/alertas", { params: { estado, limite: 100 } });
        if (actual !== seq.current) return;
        setAlertas(r.data.items);
      }
    } catch (err: unknown) {
      if (actual === seq.current) setError(err instanceof Error ? err.message : "No se pudo cargar las alertas.");
    } finally {
      if (actual === seq.current) setLoading(false);
    }
  }, [get, vista, estado]);

  useEffect(() => {
    setVista("mias");
    setEditando(null);
    setPending(null);
  }, [tenant?.id]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const reconocer = async (a: Alerta) => {
    setSaving(true);
    setError("");
    try {
      await post(`/api/alertas/${a.id}/reconocer`, {});
      setAviso("Alerta reconocida");
      await cargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo reconocer la alerta.");
    } finally {
      setSaving(false);
    }
  };
  const guardar = async (op: { tipo: Tipo; body: object; key: string }) => {
    setSaving(true);
    setError("");
    setAviso("");
    try {
      await put(`/api/alertas/reglas/${op.tipo}`, op.body, { headers: { "Idempotency-Key": op.key } });
      setPending(null);
      setEditando(null);
      setAviso(`Regla «${nombreTipo(op.tipo)}» guardada`);
      await cargar();
    } catch (err: unknown) {
      const f = err as { message?: string; status?: number; data?: { statusCode?: number } };
      const status = Number(f.status || f.data?.statusCode);
      setPending(status >= 400 && status < 500 ? null : op);
      setError(f.message || "No se pudo guardar la regla.");
    } finally {
      setSaving(false);
    }
  };
  const evaluar = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await post("/api/alertas/evaluar", {});
      setAviso(`Evaluación completa: ${r.data.creadas} nuevas, ${r.data.resueltas} resueltas, ${r.data.escaladas} escaladas.`);
      await cargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo evaluar las alertas.");
    } finally {
      setSaving(false);
    }
  };

  const vistas: Array<[Vista, string]> = [
    ["mias", "Mis alertas"],
    ...(ver.hasPermission ? ([["todas", "Todas"], ["reglas", "Reglas"]] as Array<[Vista, string]>) : []),
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Alertas de suministro</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Entregas próximas o atrasadas, lotes por vencer y cobranza de contratos. Cada destinatario reconoce sus avisos;
            una reprogramación resuelve la alerta anterior y conserva el historial.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div role="tablist" aria-label="Vista" className="inline-flex rounded-md border border-border p-0.5">
            {vistas.map(([valor, label]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={vista === valor}
                className={`min-h-9 rounded px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${vista === valor ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => {
                  setVista(valor);
                  setEditando(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <Button variant="outline" disabled={loading || saving} onClick={() => void cargar()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
          {gestionar.hasPermission && (
            <Button disabled={saving} onClick={() => void evaluar()}>
              Evaluar ahora
            </Button>
          )}
        </div>
      </header>
      {aviso && (
        <p role="status" className="rounded-md border border-border bg-muted p-3 text-sm">
          {aviso}
        </p>
      )}
      {error && (
        <div role="alert" className="space-y-2 rounded-md border border-destructive p-3 text-sm text-destructive">
          <p>{error}</p>
          {pending && (
            <Button variant="outline" disabled={saving} onClick={() => void guardar(pending)}>
              Reintentar guardado
            </Button>
          )}
        </div>
      )}

      {vista !== "reglas" ? (
        <section className="space-y-4" aria-label={vista === "mias" ? "Mis alertas" : "Alertas de la empresa"}>
          <label className="flex w-56 flex-col gap-1.5 text-sm font-medium">
            Estado
            <select className={control} value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
              <option value="ABIERTA">Abiertas</option>
              <option value="RESUELTA">Resueltas</option>
              <option value="TODAS">Todas</option>
            </select>
          </label>
          {loading ? (
            <p role="status" className="text-sm text-muted-foreground">
              Cargando alertas…
            </p>
          ) : !alertas.length ? (
            <div className="py-8">
              <h2 className="font-medium">Sin alertas {estado === "ABIERTA" ? "abiertas" : ""}</h2>
              <p className="mt-2 text-sm text-muted-foreground">Las alertas aparecen al evaluar las reglas activas.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {alertas.map((a) => (
                <li key={a.id} className="space-y-2 py-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-xs font-medium ${a.severidad === "CRITICA" ? "text-destructive" : "text-amber-400 group-data-[erp-theme=light]/dashboard:text-amber-700"}`}>
                        {a.severidad === "CRITICA" ? "Crítica" : "Aviso"} · {nombreTipo(a.tipo)}
                        {a.escalada_at ? " · escalada" : ""}
                      </p>
                      <p className="mt-1 font-medium">{a.titulo}</p>
                      <p className="text-muted-foreground">
                        {String(a.detalle.producto ?? a.detalle.documento ?? "")}
                        {a.detalle.pendiente !== undefined ? ` · pendiente ${a.detalle.pendiente}` : ""}
                        {a.detalle.saldo !== undefined ? ` · saldo ${a.detalle.moneda ?? ""} ${a.detalle.saldo}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.estado === "RESUELTA" ? `Resuelta: ${motivos[a.motivo_resolucion ?? ""] ?? ""}` : `Objetivo ${fecha(a.fecha_objetivo)}`}
                        {" · "}
                        {a.destinatarios
                          .map((d) => `${d.nombre}${d.nivel === "ESCALAMIENTO" ? " (escalamiento)" : ""}: ${d.reconocido_at ? "reconocida" : "pendiente"}`)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {a.contrato_id && (
                        <a className="inline-flex min-h-10 items-center rounded-md border border-input px-3 hover:bg-muted" href={`/dashboard/ventas/contratos?contrato=${a.contrato_id}`}>
                          Ver contrato
                        </a>
                      )}
                      {a.soy_destinatario && !a.reconocida_por_mi && a.estado === "ABIERTA" && (
                        <Button disabled={saving} onClick={() => void reconocer(a)}>
                          Reconocer
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="space-y-4" aria-label="Reglas de alerta">
          {loading ? (
            <p role="status" className="text-sm text-muted-foreground">
              Cargando reglas…
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {TIPOS.map((t) => {
                const regla = reglas.find((r) => r.tipo === t.tipo);
                return (
                  <li key={t.tipo} className="space-y-3 py-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{t.nombre}</p>
                        <p className="text-muted-foreground">
                          {!regla
                            ? "Sin configurar"
                            : [
                                regla.activa ? "Activa" : "Inactiva",
                                t.anticipacion ? `${regla.dias_anticipacion} días de anticipación` : null,
                                `${regla.destinatarios.length} destinatarios${regla.incluir_responsable && t.contrato ? " + responsable del contrato" : ""}`,
                                regla.dias_escalamiento ? `escala a los ${regla.dias_escalamiento} días` : "sin escalamiento",
                                regla.enviar_correo ? "con correo" : "sin correo",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                      </div>
                      {gestionar.hasPermission && editando !== t.tipo && (
                        <Button variant="outline" disabled={saving || Boolean(pending)} onClick={() => setEditando(t.tipo)}>
                          {regla ? "Editar" : "Configurar"}
                        </Button>
                      )}
                    </div>
                    {editando === t.tipo && (
                      <ReglaForm
                        tipo={t}
                        regla={regla}
                        usuarios={usuarios}
                        busy={saving}
                        onCancel={() => setEditando(null)}
                        onSubmit={(body) => void guardar({ tipo: t.tipo, body, key: `alerta:${crypto.randomUUID()}` })}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Usuarios({
  label,
  usuarios,
  value,
  onChange,
}: {
  label: string;
  usuarios: Usuario[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
        {usuarios.map((u) => (
          <label key={u.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              checked={value.includes(u.id)}
              onChange={(e) => onChange(e.target.checked ? [...value, u.id] : value.filter((x) => x !== u.id))}
            />
            <span className="truncate">{u.nombre || u.email}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ReglaForm({
  tipo,
  regla,
  usuarios,
  busy,
  onCancel,
  onSubmit,
}: {
  tipo: (typeof TIPOS)[number];
  regla?: Regla;
  usuarios: Usuario[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (body: object) => void;
}) {
  const [activa, setActiva] = useState(regla?.activa ?? true);
  const [dias, setDias] = useState(String(regla?.dias_anticipacion ?? 7));
  const [destinatarios, setDestinatarios] = useState<string[]>(regla?.destinatarios ?? []);
  const [responsable, setResponsable] = useState(regla?.incluir_responsable ?? tipo.contrato);
  const [escalar, setEscalar] = useState<string[]>(regla?.escalar_a ?? []);
  const [diasEsc, setDiasEsc] = useState(regla?.dias_escalamiento ? String(regla.dias_escalamiento) : "");
  const [correo, setCorreo] = useState(regla?.enviar_correo ?? false);
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (tipo.anticipacion && (!/^\d{1,3}$/.test(dias) || Number(dias) > 365)) {
      setError("La anticipación debe ser de 0 a 365 días.");
      return;
    }
    if ((diasEsc.trim() === "") !== (escalar.length === 0)) {
      setError("Para escalar indique los días y a quién escalar; sin escalamiento deje ambos vacíos.");
      return;
    }
    if (diasEsc && (!/^\d{1,2}$/.test(diasEsc) || Number(diasEsc) < 1 || Number(diasEsc) > 90)) {
      setError("El escalamiento debe ser de 1 a 90 días.");
      return;
    }
    if (activa && !destinatarios.length && !(responsable && tipo.contrato)) {
      setError("Elija destinatarios o incluya al responsable del contrato.");
      return;
    }
    setError("");
    onSubmit({
      activa,
      dias_anticipacion: tipo.anticipacion ? Number(dias) : 0,
      dias_escalamiento: diasEsc ? Number(diasEsc) : null,
      destinatarios,
      escalar_a: escalar,
      incluir_responsable: tipo.contrato ? responsable : false,
      enviar_correo: correo,
      version: regla?.version ?? 0,
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-md border border-border p-4" aria-label={`Regla ${tipo.nombre}`}>
      <fieldset disabled={busy} className="space-y-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
            Regla activa
          </label>
          {tipo.contrato && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={responsable} onChange={(e) => setResponsable(e.target.checked)} />
              Avisar al responsable del contrato
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={correo} onChange={(e) => setCorreo(e.target.checked)} />
            Enviar también por correo
          </label>
        </div>
        {tipo.anticipacion && (
          <label className="flex w-56 flex-col gap-1.5 text-sm font-medium">
            {tipo.anticipacion}
            <input className={control} inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value.replace(/\D/g, "").slice(0, 3))} />
          </label>
        )}
        <Usuarios label="Destinatarios" usuarios={usuarios} value={destinatarios} onChange={setDestinatarios} />
        <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Escalar si nadie la reconoce en (días)
            <input className={control} inputMode="numeric" value={diasEsc} onChange={(e) => setDiasEsc(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </label>
          <Usuarios label="Escalar a" usuarios={usuarios} value={escalar} onChange={setEscalar} />
        </div>
      </fieldset>
      {correo && (
        <p className="text-xs text-muted-foreground">El correo se encola para los destinatarios con email; requiere el servicio de correo configurado.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          Guardar regla
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
