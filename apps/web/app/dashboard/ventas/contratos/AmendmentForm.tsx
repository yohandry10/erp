"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Campo, Catalogo, control } from "./ContractForm";
import { cantidad, Contrato, Opcion, Orden } from "./types";

export function RevisionFields({
  referencia,
  motivo,
  onReferencia,
  onMotivo,
}: {
  referencia: string;
  motivo: string;
  onReferencia: (value: string) => void;
  onMotivo: (value: string) => void;
}) {
  return (
    <>
      <Campo label="Referencia del documento de cambio">
        <Input
          aria-label="Referencia del documento de cambio"
          required
          maxLength={80}
          value={referencia}
          onChange={(e) => onReferencia(e.target.value)}
        />
      </Campo>
      <Campo label="Motivo del cambio">
        <textarea
          aria-label="Motivo del cambio"
          className={control}
          required
          minLength={5}
          maxLength={1000}
          value={motivo}
          onChange={(e) => onMotivo(e.target.value)}
        />
      </Campo>
    </>
  );
}

type RevisionLinea = {
  key: string;
  id?: string;
  producto_id: string;
  nombre: string;
  codigo: string;
  cantidad: string;
  precio: string;
  minimo: number;
  referenciada: boolean;
};
export function AmendmentForm({
  contrato,
  busy,
  onSubmit,
  onCancel,
}: {
  contrato: Contrato;
  busy: boolean;
  onSubmit: (payload: object) => void;
  onCancel: () => void;
}) {
  const [referencia, setReferencia] = useState("");
  const [motivo, setMotivo] = useState("");
  const [asunto, setAsunto] = useState(contrato.asunto);
  const [hasta, setHasta] = useState(contrato.vigencia_hasta);
  const [observaciones, setObservaciones] = useState(
    contrato.observaciones || "",
  );
  const [responsable, setResponsable] = useState<Opcion | null>({
    id: contrato.responsable_id,
    nombre: contrato.responsable_nombre || "Responsable actual",
  });
  const [producto, setProducto] = useState<Opcion | null>(null);
  const [lineas, setLineas] = useState<RevisionLinea[]>(() =>
    contrato.lineas.map((l) => ({
      key: l.id,
      id: l.id,
      producto_id: l.producto_id,
      nombre: l.descripcion,
      codigo: l.codigo_producto,
      cantidad: String(l.cantidad),
      precio: String(l.precio_unitario),
      minimo: Number(l.cantidad_en_oc),
      referenciada: contrato.ordenes.some((o) =>
        o.lineas.some((ol) => ol.contrato_linea_id === l.id),
      ),
    })),
  );
  const minimumDate = [
    contrato.vigencia_desde,
    ...contrato.ordenes
      .filter((o) => o.estado === "ACTIVA")
      .map((o) => o.fecha_emision),
    ...contrato.entregas
      .filter((e) => e.estado === "PROGRAMADA")
      .map((e) => e.fecha_programada),
  ]
    .sort()
    .at(-1);
  const cambiar = (key: string, values: Partial<RevisionLinea>) =>
    setLineas((rows) =>
      rows.map((l) => (l.key === key ? { ...l, ...values } : l)),
    );
  return (
    <form
      className="space-y-4 border-b border-border pb-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (responsable && lineas.length)
          onSubmit({
            version: contrato.version,
            referencia,
            motivo,
            asunto,
            vigencia_hasta: hasta,
            responsable_id: responsable.id,
            observaciones,
            lineas: lineas.map((l) => ({
              ...(l.id ? { id: l.id } : {}),
              producto_id: l.producto_id,
              cantidad: Number(l.cantidad),
              precio_unitario: Number(l.precio),
            })),
          });
      }}
    >
      <h3 className="font-semibold">Registrar adenda</h3>
      <p className="max-w-prose text-sm text-muted-foreground">
        Se conserva el cliente, número, moneda e inicio de vigencia. Los nuevos
        precios se aplican a futuras OC; las existentes conservan sus precios.
      </p>
      <fieldset disabled={busy} className="space-y-4">
        <RevisionFields
          referencia={referencia}
          motivo={motivo}
          onReferencia={setReferencia}
          onMotivo={setMotivo}
        />
        <Campo label="Objeto de la adenda">
          <Input
            aria-label="Objeto de la adenda"
            required
            minLength={3}
            maxLength={200}
            value={asunto}
            onChange={(e) => setAsunto(e.target.value)}
          />
        </Campo>
        <Campo label="Nueva vigencia hasta">
          <Input
            aria-label="Nueva vigencia hasta"
            required
            type="date"
            min={minimumDate}
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </Campo>
        <Catalogo
          tipo="responsables"
          label="Responsable de la adenda"
          value={responsable}
          onChange={setResponsable}
          disabled={busy}
        />
        <div className="divide-y divide-border border-y border-border">
          {lineas.map((l, index) => (
            <div key={l.key} className="space-y-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-medium">
                  {l.codigo} · {l.nombre}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || l.referenciada || lineas.length === 1}
                  aria-label={`Retirar línea ${index + 1}`}
                  onClick={() =>
                    setLineas((rows) => rows.filter((r) => r.key !== l.key))
                  }
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Retirar
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo
                  label={`Cantidad contratada (mínimo ${cantidad(l.minimo)})`}
                >
                  <Input
                    aria-label={`Cantidad adenda línea ${index + 1}`}
                    required
                    type="number"
                    min={Math.max(0.0001, l.minimo)}
                    step="0.0001"
                    value={l.cantidad}
                    onChange={(e) =>
                      cambiar(l.key, { cantidad: e.target.value })
                    }
                  />
                </Campo>
                <Campo label={`Precio para futuras OC (${contrato.moneda})`}>
                  <Input
                    aria-label={`Precio adenda línea ${index + 1}`}
                    required
                    type="number"
                    min="0"
                    step="0.000001"
                    value={l.precio}
                    onChange={(e) => cambiar(l.key, { precio: e.target.value })}
                  />
                </Campo>
              </div>
              {l.referenciada && (
                <p className="text-xs text-muted-foreground">
                  Esta línea tiene OC en su historial y debe conservarse.
                </p>
              )}
            </div>
          ))}
        </div>
        {lineas.length < 200 && (
          <div className="space-y-2">
            <Catalogo
              tipo="productos"
              label="Producto adicional"
              value={producto}
              onChange={setProducto}
              disabled={busy}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!producto || busy}
              onClick={() => {
                if (producto) {
                  setLineas((rows) => [
                    ...rows,
                    {
                      key: crypto.randomUUID(),
                      producto_id: producto.id,
                      nombre: producto.nombre,
                      codigo: producto.codigo || "",
                      cantidad: "1",
                      precio: "0",
                      minimo: 0,
                      referenciada: false,
                    },
                  ]);
                  setProducto(null);
                }
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Añadir producto a la adenda
            </Button>
          </div>
        )}
        <Campo label="Observaciones de la adenda">
          <textarea
            aria-label="Observaciones de la adenda"
            className={control}
            maxLength={2000}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </Campo>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !responsable || !lineas.length}>
          Confirmar adenda
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

export function CancelOrderForm({
  orden,
  busy,
  onSubmit,
  onCancel,
}: {
  orden: Orden;
  busy: boolean;
  onSubmit: (payload: object) => void;
  onCancel: () => void;
}) {
  const [referencia, setReferencia] = useState("");
  const [motivo, setMotivo] = useState("");
  const hasSchedules = orden.lineas.some(
    (l) => Number(l.cantidad_programada) > 0,
  );
  return (
    <form
      className="space-y-4 border-b border-border pb-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!hasSchedules)
          onSubmit({ version: orden.version, referencia, motivo });
      }}
    >
      <h3 className="font-semibold">Anular OC {orden.numero}</h3>
      <p className="text-sm text-muted-foreground">
        La anulación libera las cantidades del contrato y conserva el historial
        de la OC.
      </p>
      {hasSchedules ? (
        <p role="alert" className="text-sm text-destructive">
          Anule primero las entregas programadas vigentes de esta OC.
        </p>
      ) : (
        <fieldset disabled={busy} className="space-y-4">
          <RevisionFields
            referencia={referencia}
            motivo={motivo}
            onReferencia={setReferencia}
            onMotivo={setMotivo}
          />
        </fieldset>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || hasSchedules}>
          Confirmar anulación de OC
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
        >
          Volver al contrato
        </Button>
      </div>
    </form>
  );
}

export function RevisionChanges({
  anterior,
  actual,
}: {
  anterior?: Record<string, unknown>;
  actual: Record<string, unknown>;
}) {
  if (!anterior) return null;
  const names: Record<string, string> = {
    asunto: "Objeto",
    vigencia_hasta: "Vigencia hasta",
    numero: "Número",
    fecha_emision: "Emisión",
    estado: "Estado",
    observaciones: "Observaciones",
    responsable_nombre: "Responsable",
  };
  type SnapshotLine = {
    id?: string;
    descripcion?: string;
    contrato_linea_id?: string;
    cantidad: number;
    precio_unitario: number;
  };
  const previous = (anterior.lineas || []) as SnapshotLine[];
  const current = (actual.lineas || []) as SnapshotLine[];
  const changes = Object.entries(names)
    .filter(([key]) => anterior[key] !== actual[key])
    .map(
      ([key, label]) =>
        `${label}: ${anterior[key] || "Sin dato"} → ${actual[key] || "Sin dato"}`,
    );
  for (const line of current) {
    const old = previous.find((l) => l.id === line.id);
    const label = line.descripcion || `Línea ${current.indexOf(line) + 1}`;
    if (!old)
      changes.push(
        `${label}: añadida, cantidad ${cantidad(line.cantidad)}, precio ${line.precio_unitario}`,
      );
    else if (
      Number(old.cantidad) !== Number(line.cantidad) ||
      Number(old.precio_unitario) !== Number(line.precio_unitario)
    )
      changes.push(
        `${label}: cantidad ${cantidad(old.cantidad)} → ${cantidad(line.cantidad)}; precio ${old.precio_unitario} → ${line.precio_unitario}`,
      );
  }
  for (const line of previous)
    if (!current.some((l) => l.id === line.id))
      changes.push(`${line.descripcion || "Línea"}: retirada`);
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {changes.map((change, i) => (
        <li key={i} className="break-words">
          {change}
        </li>
      ))}
    </ul>
  );
}
