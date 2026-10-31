"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import {
  AlmacenLotes,
  Politica,
  ReservaDocumento,
  cantidad,
  control,
  estadoLote,
  fecha,
  ubicacionTexto,
} from "./types";

function Campo({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Acciones({ busy, onCancel, label }: { busy: boolean; onCancel: () => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy}>
        {busy ? "Guardando…" : label}
      </Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  );
}

const decimales = (value: string) => /^\d+(\.\d{1,4})?$/.test(value.trim());
const suma = (values: number[]) => Number(values.reduce((t, v) => t + v, 0).toFixed(4));

export function PolicyForm({
  politica,
  busy,
  onCancel,
  onSubmit,
}: {
  politica: Politica;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: Politica) => void;
}) {
  const [controla, setControla] = useState(politica.controla_lote);
  const [vencimiento, setVencimiento] = useState(politica.requiere_vencimiento);
  const [dias, setDias] = useState(String(politica.dias_minimos_vida_util));
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{1,4}$/.test(dias) || Number(dias) > 3650) {
      setError("La vida útil mínima debe ser un número entero de 0 a 3650 días.");
      return;
    }
    setError("");
    onSubmit({
      controla_lote: controla,
      requiere_vencimiento: vencimiento,
      dias_minimos_vida_util: Number(dias),
      version: politica.version,
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-md border border-border p-4" aria-label="Política de lote">
      <fieldset className="space-y-3" disabled={busy}>
        <legend className="font-semibold">Política de lote</legend>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
            checked={controla}
            onChange={(e) => setControla(e.target.checked)}
          />
          <span>
            <span className="font-medium">Controlar existencias por lote</span>
            <span className="block text-muted-foreground">
              Recepciones y ajustes exigirán lote; reservas y despachos elegirán lotes por vencimiento.
              El stock actual queda sin lote hasta regularizarlo.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
            checked={vencimiento}
            onChange={(e) => setVencimiento(e.target.checked)}
          />
          <span>
            <span className="font-medium">Exigir fecha de vencimiento en lotes nuevos</span>
          </span>
        </label>
        <div className="max-w-xs">
          <Campo
            label="Vida útil mínima (días)"
            hint="Margen exigido entre la fecha de entrega o de hoy y el vencimiento al reservar o despachar."
          >
            <input
              className={control}
              inputMode="numeric"
              value={dias}
              onChange={(e) => setDias(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </Campo>
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Acciones busy={busy} onCancel={onCancel} label="Guardar política" />
    </form>
  );
}

type FilaRegularizacion = { lote: string; fecha_vencimiento: string; ubicacion_id: string; cantidad: string };
const filaVacia = (): FilaRegularizacion => ({ lote: "", fecha_vencimiento: "", ubicacion_id: "", cantidad: "" });

export function RegularizeForm({
  almacen,
  requiereVencimiento,
  busy,
  onCancel,
  onSubmit,
}: {
  almacen: AlmacenLotes;
  requiereVencimiento: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: object) => void;
}) {
  const { get } = useApi({ showErrorToast: false, throwOnError: true });
  const [ubicaciones, setUbicaciones] = useState<{ id: string; codigo: string; nombre: string }[]>([]);
  const [ubicacionesError, setUbicacionesError] = useState(false);
  const [filas, setFilas] = useState<FilaRegularizacion[]>([filaVacia()]);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let vigente = true;
    get(`/api/inventario/almacenes/${almacen.almacen_id}/ubicaciones`)
      .then((r: any) => vigente && setUbicaciones(Array.isArray(r?.data) ? r.data : []))
      .catch(() => vigente && setUbicacionesError(true));
    return () => {
      vigente = false;
    };
  }, [get, almacen.almacen_id]);
  const total = suma(filas.map((f) => (decimales(f.cantidad) ? Number(f.cantidad) : 0)));
  const cambiar = (i: number, campo: keyof FilaRegularizacion, value: string) =>
    setFilas((actual) => actual.map((f, j) => (j === i ? { ...f, [campo]: value } : f)));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (filas.some((f) => !f.lote.trim() || !decimales(f.cantidad) || Number(f.cantidad) <= 0)) {
      setError("Cada línea necesita lote y una cantidad positiva con hasta 4 decimales.");
      return;
    }
    if (requiereVencimiento && filas.some((f) => !f.fecha_vencimiento)) {
      setError("El producto exige fecha de vencimiento en los lotes nuevos.");
      return;
    }
    if (total > Number(almacen.stock_sin_lote)) {
      setError(`Solo hay ${cantidad(almacen.stock_sin_lote)} sin lote en este almacén.`);
      return;
    }
    if (motivo.trim().length < 5) {
      setError("Indique el motivo y la evidencia (mínimo 5 caracteres).");
      return;
    }
    setError("");
    onSubmit({
      almacen_id: almacen.almacen_id,
      motivo: motivo.trim(),
      lineas: filas.map((f) => ({
        lote: f.lote.trim(),
        ...(f.fecha_vencimiento ? { fecha_vencimiento: f.fecha_vencimiento } : {}),
        ...(f.ubicacion_id ? { ubicacion_id: f.ubicacion_id } : {}),
        cantidad: Number(f.cantidad),
      })),
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-md border border-border p-4" aria-label="Regularizar stock sin lote">
      <div>
        <h4 className="font-semibold">Regularizar stock sin lote</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Asigna a lotes el stock que entró sin evidencia de lote. No mueve cantidades ni el kardex físico:
          solo documenta a qué lote pertenece. Disponible para asignar: {cantidad(almacen.stock_sin_lote)}.
        </p>
      </div>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="sr-only">Lotes a registrar</legend>
        {filas.map((f, i) => (
          <div key={i} className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_10rem_1fr_8rem_auto] sm:items-end">
            <Campo label="Lote">
              <input className={control} maxLength={80} value={f.lote} onChange={(e) => cambiar(i, "lote", e.target.value)} />
            </Campo>
            <Campo label={requiereVencimiento ? "Vence" : "Vence (opcional)"}>
              <input type="date" className={control} value={f.fecha_vencimiento} onChange={(e) => cambiar(i, "fecha_vencimiento", e.target.value)} />
            </Campo>
            <Campo label="Ubicación">
              <select className={control} value={f.ubicacion_id} onChange={(e) => cambiar(i, "ubicacion_id", e.target.value)}>
                <option value="">Sin ubicación</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo} · {u.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Cantidad">
              <input className={`${control} text-right tabular-nums`} inputMode="decimal" value={f.cantidad} onChange={(e) => cambiar(i, "cantidad", e.target.value)} />
            </Campo>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Quitar línea ${i + 1}`}
              disabled={filas.length === 1}
              onClick={() => setFilas((actual) => actual.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {ubicacionesError && (
          <p className="text-xs text-muted-foreground">No se pudieron cargar las ubicaciones; puede registrar sin ubicación.</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" disabled={filas.length >= 100} onClick={() => setFilas((a) => [...a, filaVacia()])}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar lote
          </Button>
          <span className="text-sm tabular-nums">Total a regularizar: {cantidad(total)}</span>
        </div>
        <Campo label="Motivo y evidencia">
          <textarea className={`${control} min-h-20`} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Acciones busy={busy} onCancel={onCancel} label="Registrar regularización" />
    </form>
  );
}

export function ReassignForm({
  almacen,
  documento,
  busy,
  onCancel,
  onSubmit,
}: {
  almacen: AlmacenLotes;
  documento: ReservaDocumento;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: object) => void;
}) {
  // Un saldo admite lo disponible más lo que el propio documento ya tiene en él.
  const opciones = useMemo(
    () =>
      almacen.saldos
        .map((s) => {
          const propio = documento.lineas
            .filter((l) => l.lote_id === s.lote_id && l.ubicacion_id === s.ubicacion_id)
            .reduce((t, l) => t + Number(l.cantidad), 0);
          return { ...s, propio, maximo: Number((Number(s.disponible) + propio).toFixed(4)) };
        })
        .filter((s) => s.maximo > 0),
    [almacen.saldos, documento.lineas],
  );
  const clave = (s: { lote_id: string; ubicacion_id: string | null }) => `${s.lote_id}:${s.ubicacion_id ?? ""}`;
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(opciones.map((s) => [clave(s), s.propio ? String(s.propio) : ""])),
  );
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const total = suma(opciones.map((s) => (decimales(valores[clave(s)] || "0") ? Number(valores[clave(s)] || 0) : 0)));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const elegidas = opciones.filter((s) => Number(valores[clave(s)] || 0) > 0);
    if (opciones.some((s) => valores[clave(s)] && !decimales(valores[clave(s)]))) {
      setError("Use cantidades positivas con hasta 4 decimales.");
      return;
    }
    const excedida = elegidas.find((s) => Number(valores[clave(s)]) > s.maximo);
    if (excedida) {
      setError(`El lote ${excedida.lote} solo admite ${cantidad(excedida.maximo)}.`);
      return;
    }
    if (total !== Number(documento.total)) {
      setError(`Reparta exactamente ${cantidad(documento.total)}; lleva ${cantidad(total)}.`);
      return;
    }
    if (motivo.trim().length < 5) {
      setError("Indique el motivo de la reasignación (mínimo 5 caracteres).");
      return;
    }
    setError("");
    onSubmit({
      almacen_id: almacen.almacen_id,
      referencia_id: documento.referencia_id,
      motivo: motivo.trim(),
      lineas: elegidas.map((s) => ({ lote_id: s.lote_id, ubicacion_id: s.ubicacion_id, cantidad: Number(valores[clave(s)]) })),
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-md border border-border p-4" aria-label="Reasignar lotes de la reserva">
      <div>
        <h4 className="font-semibold">
          Reasignar lotes · {documento.pedido_numero ? `Pedido ${documento.pedido_numero}` : "Documento"}
        </h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Reparta los {cantidad(documento.total)} reservados entre uno o varios lotes. La base vuelve a exigir
          vencimiento y vida útil para la fecha de entrega del contrato.
        </p>
      </div>
      <fieldset disabled={busy}>
        <legend className="sr-only">Cantidad por lote</legend>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="p-2">Lote</th>
                <th scope="col" className="p-2">Vence</th>
                <th scope="col" className="p-2 text-right">Admite</th>
                <th scope="col" className="w-36 p-2 text-right">Reservar</th>
              </tr>
            </thead>
            <tbody>
              {opciones.map((s) => (
                <tr key={clave(s)} className="border-b border-border">
                  <td className="p-2">
                    <span className="font-medium">{s.lote}</span>
                    <span className="block text-xs text-muted-foreground">{ubicacionTexto(s)}</span>
                  </td>
                  <td className="p-2">
                    {fecha(s.fecha_vencimiento)}
                    <span className={`block text-xs ${estadoLote[s.estado].className}`}>{estadoLote[s.estado].label}</span>
                  </td>
                  <td className="p-2 text-right">{cantidad(s.maximo)}</td>
                  <td className="p-2 text-right">
                    <input
                      aria-label={`Cantidad del lote ${s.lote}`}
                      className={`${control} text-right tabular-nums`}
                      inputMode="decimal"
                      value={valores[clave(s)] ?? ""}
                      onChange={(e) => setValores((v) => ({ ...v, [clave(s)]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-right text-sm tabular-nums">
          Asignado {cantidad(total)} de {cantidad(documento.total)}
        </p>
        <div className="mt-3">
          <Campo label="Motivo">
            <textarea className={`${control} min-h-20`} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Acciones busy={busy} onCancel={onCancel} label="Reasignar reserva" />
    </form>
  );
}
