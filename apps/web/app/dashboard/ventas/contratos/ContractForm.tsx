"use client";

import { FormEvent, ReactNode, useRef, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";
import { Contrato, Opcion } from "./types";

export const control =
  "min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function Campo({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

export function Catalogo({
  tipo,
  label,
  value,
  onChange,
  disabled,
}: {
  tipo: "clientes" | "productos" | "responsables";
  label: string;
  value: Opcion | null;
  onChange: (value: Opcion | null) => void;
  disabled?: boolean;
}) {
  const { get } = useApi({ throwOnError: true, showErrorToast: false });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Opcion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState(false);
  const request = useRef(0);
  const buscar = async (nextPage = 1) => {
    const seq = ++request.current;
    setBusy(true);
    setError("");
    setOpened(true);
    try {
      const response = await get(`/api/ventas/contratos/catalogos/${tipo}`, {
        params: { busqueda: query, pagina: nextPage, limite: 25 },
      });
      if (seq === request.current) {
        setRows(response.data.items);
        setPage(nextPage);
      }
    } catch (err: unknown) {
      if (seq === request.current)
        setError(
          err instanceof Error ? err.message : "No se pudo buscar. Reintente.",
        );
    } finally {
      if (seq === request.current) setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onChange(null);
              setOpened(false);
            }}
          >
            Cambiar
          </Button>
        )}
      </div>
      {value ? (
        <p className="min-h-10 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
          {value.codigo ? `${value.codigo} · ` : ""}
          {value.nombre}
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <Input
              aria-label={`Buscar ${label.toLowerCase()}`}
              value={query}
              maxLength={120}
              disabled={disabled || busy}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void buscar();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled || busy}
              aria-label={`Buscar ${label.toLowerCase()}`}
              onClick={() => void buscar()}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
          {busy && (
            <p role="status" className="text-sm text-muted-foreground">
              Buscando…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {opened && !busy && !error && (
            <>
              {rows.length ? (
                <select
                  aria-label={`Seleccionar ${label.toLowerCase()}`}
                  value=""
                  className={control}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(
                      rows.find((row) => row.id === e.target.value) || null,
                    )
                  }
                >
                  <option value="">Seleccionar…</option>
                  {rows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.codigo ? `${row.codigo} · ` : ""}
                      {row.nombre}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No hay resultados para esta búsqueda.
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || page === 1}
                  onClick={() => void buscar(page - 1)}
                >
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  Página {page}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || rows.length < 25}
                  onClick={() => void buscar(page + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

type FormLine = {
  key: string;
  producto: Opcion | null;
  cantidad: string;
  precio: string;
};
const nuevaLinea = (): FormLine => ({
  key: crypto.randomUUID(),
  producto: null,
  cantidad: "",
  precio: "",
});

export function ContractForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: Contrato;
  busy: boolean;
  onSubmit: (payload: object) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    numero: initial?.numero || "",
    asunto: initial?.asunto || "",
    moneda: initial?.moneda || "PEN",
    vigencia_desde: initial?.vigencia_desde || "",
    vigencia_hasta: initial?.vigencia_hasta || "",
    observaciones: initial?.observaciones || "",
  });
  const [cliente, setCliente] = useState<Opcion | null>(
    initial ? { id: initial.cliente_id, nombre: initial.cliente_nombre } : null,
  );
  const [responsable, setResponsable] = useState<Opcion | null>(
    initial
      ? {
          id: initial.responsable_id,
          nombre: initial.responsable_nombre || "Responsable actual",
        }
      : null,
  );
  const [lineas, setLineas] = useState<FormLine[]>(
    initial?.lineas.map((l) => ({
      key: l.id,
      producto: {
        id: l.producto_id,
        nombre: l.descripcion,
        codigo: l.codigo_producto,
      },
      cantidad: String(l.cantidad),
      precio: String(l.precio_unitario),
    })) || [nuevaLinea()],
  );
  const [error, setError] = useState("");
  const update = (key: string, values: Partial<FormLine>) =>
    setLineas((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...values } : row)),
    );
  const guardar = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!cliente || !responsable || lineas.some((l) => !l.producto)) {
      setError(
        "Seleccione cliente, responsable y un producto para cada línea.",
      );
      return;
    }
    if (form.vigencia_hasta < form.vigencia_desde) {
      setError("La fecha final debe ser igual o posterior a la inicial.");
      return;
    }
    onSubmit({
      ...form,
      cliente_id: cliente.id,
      responsable_id: responsable.id,
      ...(initial ? { version: initial.version } : {}),
      lineas: lineas.map((l) => ({
        producto_id: l.producto!.id,
        cantidad: Number(l.cantidad),
        precio_unitario: Number(l.precio),
      })),
    });
  };
  return (
    <form onSubmit={guardar} className="space-y-6">
      <h2 className="text-xl font-semibold">
        {initial ? "Editar borrador" : "Nuevo contrato de suministro"}
      </h2>
      <fieldset disabled={busy} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Número del contrato">
            <Input
              required
              maxLength={80}
              value={form.numero}
              onChange={(e) => setForm({ ...form, numero: e.target.value })}
            />
          </Campo>
          <Campo label="Moneda">
            <select
              aria-label="Moneda"
              className={control}
              value={form.moneda}
              onChange={(e) => setForm({ ...form, moneda: e.target.value })}
            >
              {["PEN", "USD", "EUR", "COP", "ARS"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Campo>
          <div className="sm:col-span-2">
            <Campo label="Objeto del contrato">
              <Input
                required
                minLength={3}
                maxLength={200}
                value={form.asunto}
                onChange={(e) => setForm({ ...form, asunto: e.target.value })}
              />
            </Campo>
          </div>
          <Catalogo
            tipo="clientes"
            label="Cliente"
            value={cliente}
            onChange={setCliente}
            disabled={busy}
          />
          <Catalogo
            tipo="responsables"
            label="Responsable"
            value={responsable}
            onChange={setResponsable}
            disabled={busy}
          />
          <Campo label="Vigencia desde">
            <Input
              required
              type="date"
              value={form.vigencia_desde}
              onChange={(e) =>
                setForm({ ...form, vigencia_desde: e.target.value })
              }
            />
          </Campo>
          <Campo label="Vigencia hasta">
            <Input
              required
              type="date"
              min={form.vigencia_desde}
              value={form.vigencia_hasta}
              onChange={(e) =>
                setForm({ ...form, vigencia_hasta: e.target.value })
              }
            />
          </Campo>
        </div>
        <div className="space-y-4">
          <h3 className="font-semibold">Productos contratados</h3>
          {lineas.map((l, i) => (
            <div
              key={l.key}
              className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]"
            >
              <Catalogo
                tipo="productos"
                label={`Producto de la línea ${i + 1}`}
                value={l.producto}
                onChange={(producto) => update(l.key, { producto })}
                disabled={busy}
              />
              <Campo label={`Cantidad de la línea ${i + 1}`}>
                <Input
                  required
                  type="number"
                  min="0.0001"
                  max="99999999999999"
                  step="0.0001"
                  value={l.cantidad}
                  onChange={(e) => update(l.key, { cantidad: e.target.value })}
                />
              </Campo>
              <Campo label={`Precio sin impuestos de la línea ${i + 1}`}>
                <Input
                  required
                  type="number"
                  min="0"
                  max="999999999999"
                  step="0.000001"
                  value={l.precio}
                  onChange={(e) => update(l.key, { precio: e.target.value })}
                />
              </Campo>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="self-end"
                aria-label={`Quitar línea ${i + 1}`}
                disabled={lineas.length === 1}
                onClick={() =>
                  setLineas((rows) => rows.filter((row) => row.key !== l.key))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={lineas.length >= 200}
            onClick={() => setLineas((rows) => [...rows, nuevaLinea()])}
          >
            <Plus className="mr-2 h-4 w-4" />
            Agregar producto
          </Button>
        </div>
        <Campo label="Observaciones">
          <textarea
            className={control}
            rows={3}
            maxLength={2000}
            value={form.observaciones}
            onChange={(e) =>
              setForm({ ...form, observaciones: e.target.value })
            }
          />
        </Campo>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar borrador"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
