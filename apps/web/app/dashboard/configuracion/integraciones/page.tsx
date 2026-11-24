"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  CalendarClock,
  Check,
  Copy,
  History,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import { ProtectedComponent } from "@/components/auth/ProtectedComponent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";

type Secreto = {
  id: string;
  prefijo: string;
  estado: "VIGENTE" | "EN_GRACIA" | "RETIRADO";
  valido_hasta: string | null;
  created_at: string;
};

type Credencial = {
  id: string;
  nombre: string;
  sistema: string;
  sucursal_id: string;
  sucursal_nombre: string | null;
  estado: "ACTIVA" | "REVOCADA";
  expira_en: string;
  vencida: boolean;
  ultimo_uso_en: string | null;
  revocada_en: string | null;
  motivo_revocacion: string | null;
  created_at: string;
  secretos: Secreto[];
};

type Evento = {
  id: string;
  evento: string;
  codigo: string | null;
  actor_externo_id: string | null;
  actor_externo_nombre: string | null;
  metodo: string | null;
  ruta: string | null;
  created_at: string;
};

type Sucursal = { id: string; nombre: string; codigo_establecimiento: string; activo: boolean };

type Accion =
  | { tipo: "rotar"; credencial: Credencial; gracia: string }
  | { tipo: "vencimiento"; credencial: Credencial; fecha: string }
  | { tipo: "revocar"; credencial: Credencial; motivo: string };

const EVENTOS: Record<string, string> = {
  ALTA: "Alta",
  ROTACION: "Rotación",
  ROTACION_FINALIZADA: "Rotación finalizada",
  SECRETO_RETIRADO: "Secreto retirado",
  REVOCACION: "Revocación",
  VENCIMIENTO: "Venció",
  VENCIMIENTO_ACTUALIZADO: "Vencimiento cambiado",
  USO: "Uso",
  RECHAZO: "Rechazo",
};

const fecha = (valor: string | null) =>
  valor ? new Date(valor).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" }) : "—";

/** `datetime-local` trabaja en hora local; la API recibe ISO con zona. */
const enDiasLocal = (dias: number) => {
  const d = new Date(Date.now() + dias * 86_400_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const aIso = (local: string) => new Date(local).toISOString();

const mensajeError = (error: unknown, alterno: string) => {
  const texto = (error as { message?: string })?.message;
  return typeof texto === "string" && texto.trim() ? texto : alterno;
};

function NoPermission() {
  return (
    <div className="rounded-xl border border-dashed border-blue-400/40 bg-blue-500/10 p-6 font-semibold text-primary">
      Necesitas el permiso <code>users.manage</code> para administrar las integraciones externas.
    </div>
  );
}

function Estado({ credencial }: { credencial: Credencial }) {
  if (credencial.estado === "REVOCADA") {
    return <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-600">Revocada</span>;
  }
  if (credencial.vencida) {
    return <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700">Vencida</span>;
  }
  if (credencial.secretos.some((s) => s.estado === "EN_GRACIA")) {
    return <span className="rounded bg-blue-500/15 px-2 py-0.5 text-xs font-semibold text-blue-600">Rotación en curso</span>;
  }
  return <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700">Activa</span>;
}

/** El secreto sólo existe en esta tarjeta: al cerrarla no se puede recuperar. */
function SecretoUnaVez({ titulo, valor, detalle, onCerrar }: { titulo: string; valor: string; detalle?: string; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Card className="border-amber-400/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-5 w-5" aria-hidden />
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          Copia el secreto ahora y guárdalo cifrado en el servidor del sistema externo. El ERP sólo conserva su
          huella: <strong>no se vuelve a mostrar</strong>.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="break-all rounded bg-muted px-3 py-2 text-sm" data-testid="secreto-integracion">{valor}</code>
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(valor);
              setCopiado(true);
            }}
          >
            {copiado ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copiado ? "Copiado" : "Copiar"}
          </Button>
        </div>
        {detalle && <p className="text-sm text-muted-foreground">{detalle}</p>}
        <Button onClick={onCerrar}>Ya lo guardé</Button>
      </CardContent>
    </Card>
  );
}

export default function IntegracionesExternasPage() {
  const { get, post, put } = useApi({ throwOnError: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [credenciales, setCredenciales] = useState<Credencial[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [alta, setAlta] = useState<{ nombre: string; sistema: string; sucursal_id: string; expira: string } | null>(null);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [secreto, setSecreto] = useState<{ titulo: string; valor: string; detalle?: string } | null>(null);
  const [historial, setHistorial] = useState<{ id: string; eventos: Evento[] } | null>(null);
  // Un reintento del mismo alta reutiliza la clave: la API no crea un duplicado.
  const altaKey = useRef<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lista, sedes] = await Promise.all([get("/integraciones-externas"), get("/sucursales")]);
      if (lista?.success !== true || !Array.isArray(lista.data)) throw new Error("Respuesta incompleta");
      setCredenciales(lista.data);
      setSucursales(Array.isArray(sedes?.data) ? sedes.data.filter((s: Sucursal) => s.activo) : []);
    } catch {
      setError("No se pudieron cargar las integraciones externas. Intenta nuevamente.");
      setCredenciales([]);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const altaValida = useMemo(
    () => Boolean(alta && alta.nombre.trim().length >= 3 && alta.sistema.trim().length >= 2 && alta.sucursal_id && alta.expira),
    [alta],
  );

  const crear = async () => {
    if (!alta || !altaValida) return;
    setTrabajando(true);
    setError(null);
    try {
      altaKey.current ??= `integracion:${crypto.randomUUID()}`;
      const respuesta = await post("/integraciones-externas", {
        nombre: alta.nombre.trim(),
        sistema: alta.sistema.trim(),
        sucursal_id: alta.sucursal_id,
        expira_en: aIso(alta.expira),
        idempotency_key: altaKey.current,
      });
      setSecreto({ titulo: `Credencial creada: ${alta.nombre.trim()}`, valor: respuesta.data.credencial });
      altaKey.current = null;
      setAlta(null);
      await cargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo crear la credencial."));
    } finally {
      setTrabajando(false);
    }
  };

  const ejecutar = async () => {
    if (!accion) return;
    setTrabajando(true);
    setError(null);
    const base = `/integraciones-externas/${accion.credencial.id}`;
    try {
      if (accion.tipo === "rotar") {
        const respuesta = await post(`${base}/rotar`, { gracia_horas: Number(accion.gracia) });
        setSecreto({
          titulo: `Nuevo secreto: ${accion.credencial.nombre}`,
          valor: respuesta.data.credencial,
          detalle: `El secreto anterior sigue válido hasta ${fecha(respuesta.data.gracia_hasta)}. Cuando el sistema externo use el nuevo, finaliza la rotación.`,
        });
      } else if (accion.tipo === "vencimiento") {
        await put(`${base}/vencimiento`, { expira_en: aIso(accion.fecha) });
      } else {
        await post(`${base}/revocar`, { motivo: accion.motivo.trim() });
      }
      setAccion(null);
      await cargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo completar la operación."));
    } finally {
      setTrabajando(false);
    }
  };

  const finalizarRotacion = async (credencial: Credencial) => {
    setError(null);
    try {
      await post(`/integraciones-externas/${credencial.id}/finalizar-rotacion`, {});
      await cargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo finalizar la rotación."));
    }
  };

  const verHistorial = async (credencial: Credencial) => {
    if (historial?.id === credencial.id) return setHistorial(null);
    try {
      const respuesta = await get(`/integraciones-externas/${credencial.id}/eventos?limite=50`);
      setHistorial({ id: credencial.id, eventos: Array.isArray(respuesta?.data) ? respuesta.data : [] });
    } catch {
      setError("No se pudo cargar el historial de la credencial.");
    }
  };

  const accionValida =
    accion?.tipo === "rotar"
      ? Number(accion.gracia) >= 1 && Number(accion.gracia) <= 720
      : accion?.tipo === "vencimiento"
        ? Boolean(accion.fecha)
        : accion?.tipo === "revocar"
          ? accion.motivo.trim().length >= 3
          : false;

  return (
    <div className="space-y-6 p-6">
      <ProtectedComponent modulo="users" recurso="" accion="manage" fallback={<NoPermission />}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <KeyRound className="h-6 w-6" aria-hidden />
              Integraciones externas
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Una credencial permite que otro sistema cobre con boleta o factura en un establecimiento, sin sesión de
              usuario. Sólo vende, consulta y reintenta comprobantes, abre y cierra caja y lee productos de ese
              establecimiento. Cada uso queda en su historial.
            </p>
          </div>
          <Button
            onClick={() => {
              altaKey.current = null;
              setAlta({ nombre: "", sistema: "", sucursal_id: sucursales[0]?.id ?? "", expira: enDiasLocal(180) });
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nueva credencial
          </Button>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm font-medium text-red-600">
            {error}
            <Button variant="outline" className="ml-3" onClick={() => void cargar()}>
              Reintentar lectura
            </Button>
          </div>
        )}

        {secreto && <SecretoUnaVez {...secreto} onCerrar={() => setSecreto(null)} />}

        {alta && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Nueva credencial</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm font-medium">
                  <span>Nombre</span>
                  <Input
                    value={alta.nombre}
                    maxLength={120}
                    onChange={(e) => setAlta({ ...alta, nombre: e.target.value })}
                    placeholder="Integración – Sede Centro"
                  />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  <span>Sistema que la usa</span>
                  <Input
                    value={alta.sistema}
                    maxLength={80}
                    onChange={(e) => setAlta({ ...alta, sistema: e.target.value })}
                    placeholder="Sistema de atención"
                  />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  <span>Establecimiento</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={alta.sucursal_id}
                    onChange={(e) => setAlta({ ...alta, sucursal_id: e.target.value })}
                  >
                    {sucursales.length === 0 && <option value="">No hay establecimientos activos</option>}
                    {sucursales.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.codigo_establecimiento} · {s.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  <span>Vence</span>
                  <Input
                    type="datetime-local"
                    value={alta.expira}
                    min={enDiasLocal(0.05)}
                    max={enDiasLocal(730)}
                    onChange={(e) => setAlta({ ...alta, expira: e.target.value })}
                  />
                  <span className="block text-xs font-normal text-muted-foreground">
                    Entre una hora y dos años. Vencida, responde 401 hasta que la renueves.
                  </span>
                </label>
              </div>
              <div className="flex gap-2">
                <Button onClick={crear} disabled={trabajando || !altaValida}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  {trabajando ? "Creando…" : "Crear y mostrar secreto"}
                </Button>
                <Button variant="ghost" onClick={() => setAlta(null)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {accion && (
          <Card className={accion.tipo === "revocar" ? "border-red-400/50" : undefined}>
            <CardHeader>
              <CardTitle className="text-lg">
                {accion.tipo === "rotar" && `Rotar el secreto de ${accion.credencial.nombre}`}
                {accion.tipo === "vencimiento" && `Cambiar el vencimiento de ${accion.credencial.nombre}`}
                {accion.tipo === "revocar" && `Revocar ${accion.credencial.nombre}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {accion.tipo === "rotar" && (
                <label className="block max-w-xs space-y-1 text-sm font-medium">
                  <span>Horas en que el secreto actual sigue válido</span>
                  <Input
                    type="number"
                    min={1}
                    max={720}
                    value={accion.gracia}
                    onChange={(e) => setAccion({ ...accion, gracia: e.target.value })}
                  />
                  <span className="block text-xs font-normal text-muted-foreground">
                    De 1 a 720. Mientras dure, los dos secretos funcionan y el cambio no corta los cobros.
                  </span>
                </label>
              )}
              {accion.tipo === "vencimiento" && (
                <label className="block max-w-xs space-y-1 text-sm font-medium">
                  <span>Vence</span>
                  <Input
                    type="datetime-local"
                    value={accion.fecha}
                    min={enDiasLocal(0.05)}
                    max={enDiasLocal(730)}
                    onChange={(e) => setAccion({ ...accion, fecha: e.target.value })}
                  />
                </label>
              )}
              {accion.tipo === "revocar" && (
                <>
                  <p className="flex items-start gap-2 text-sm text-red-600">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    El sistema externo deja de poder cobrar en {accion.credencial.sucursal_nombre ?? "su establecimiento"}{" "}
                    desde ya, con todos sus secretos. No se puede deshacer: habría que crear otra credencial.
                  </p>
                  <label className="block max-w-lg space-y-1 text-sm font-medium">
                    <span>Motivo</span>
                    <Input
                      value={accion.motivo}
                      maxLength={500}
                      onChange={(e) => setAccion({ ...accion, motivo: e.target.value })}
                      placeholder="Cambio de proveedor"
                    />
                  </label>
                </>
              )}
              <div className="flex gap-2">
                <Button
                  variant={accion.tipo === "revocar" ? "destructive" : "default"}
                  onClick={ejecutar}
                  disabled={trabajando || !accionValida}
                >
                  {trabajando
                    ? "Guardando…"
                    : accion.tipo === "rotar"
                      ? "Emitir nuevo secreto"
                      : accion.tipo === "vencimiento"
                        ? "Guardar vencimiento"
                        : "Revocar credencial"}
                </Button>
                <Button variant="ghost" onClick={() => setAccion(null)}>
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando integraciones…</p>
        ) : error && credenciales.length === 0 ? null : credenciales.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay credenciales. Crea una por establecimiento y por sistema que vaya a cobrar.
          </p>
        ) : (
          <ul className="space-y-3">
            {credenciales.map((c) => {
              const activa = c.estado === "ACTIVA";
              const enGracia = c.secretos.find((s) => s.estado === "EN_GRACIA");
              return (
                <li key={c.id}>
                  <Card className={activa ? undefined : "opacity-60"}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{c.nombre}</span>
                            <Estado credencial={c} />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {c.sistema} · {c.sucursal_nombre ?? "Establecimiento"} · vence {fecha(c.expira_en)} · último uso{" "}
                            {fecha(c.ultimo_uso_en)}
                          </p>
                          {c.secretos.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Secretos válidos:{" "}
                              {c.secretos
                                .map((s) =>
                                  s.estado === "EN_GRACIA"
                                    ? `erpint_${s.prefijo}_… (anterior, hasta ${fecha(s.valido_hasta)})`
                                    : `erpint_${s.prefijo}_…`,
                                )
                                .join(" · ")}
                            </p>
                          )}
                          {c.motivo_revocacion && (
                            <p className="text-xs text-muted-foreground">
                              Revocada el {fecha(c.revocada_en)}: {c.motivo_revocacion}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {activa && !c.vencida && !enGracia && (
                            <Button size="sm" variant="ghost" onClick={() => setAccion({ tipo: "rotar", credencial: c, gracia: "48" })}>
                              <RefreshCw className="mr-1 h-3.5 w-3.5" />
                              Rotar
                            </Button>
                          )}
                          {activa && enGracia && (
                            <Button size="sm" variant="ghost" onClick={() => void finalizarRotacion(c)}>
                              <Check className="mr-1 h-3.5 w-3.5" />
                              Finalizar rotación
                            </Button>
                          )}
                          {activa && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setAccion({ tipo: "vencimiento", credencial: c, fecha: enDiasLocal(180) })}
                            >
                              <CalendarClock className="mr-1 h-3.5 w-3.5" />
                              Vencimiento
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => void verHistorial(c)}>
                            <History className="mr-1 h-3.5 w-3.5" />
                            Historial
                          </Button>
                          {activa && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600"
                              onClick={() => setAccion({ tipo: "revocar", credencial: c, motivo: "" })}
                            >
                              <Ban className="mr-1 h-3.5 w-3.5" />
                              Revocar
                            </Button>
                          )}
                        </div>
                      </div>
                      {historial?.id === c.id && (
                        <div className="overflow-x-auto">
                          {historial.eventos.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Sin eventos.</p>
                          ) : (
                            <table className="w-full text-left text-sm">
                              <thead className="text-xs text-muted-foreground">
                                <tr>
                                  <th className="py-1 pr-4 font-medium">Fecha</th>
                                  <th className="py-1 pr-4 font-medium">Evento</th>
                                  <th className="py-1 pr-4 font-medium">Persona externa</th>
                                  <th className="py-1 font-medium">Detalle</th>
                                </tr>
                              </thead>
                              <tbody>
                                {historial.eventos.map((e) => (
                                  <tr key={e.id} className="border-t border-border">
                                    <td className="py-1 pr-4 tabular-nums">{fecha(e.created_at)}</td>
                                    <td className="py-1 pr-4">{EVENTOS[e.evento] ?? e.evento}</td>
                                    <td className="py-1 pr-4">
                                      {e.actor_externo_nombre ? `${e.actor_externo_nombre} (${e.actor_externo_id})` : "—"}
                                    </td>
                                    <td className="py-1 text-muted-foreground">
                                      {[e.codigo, e.metodo && e.ruta ? `${e.metodo} ${e.ruta}` : null].filter(Boolean).join(" · ") || "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </ProtectedComponent>
    </div>
  );
}
