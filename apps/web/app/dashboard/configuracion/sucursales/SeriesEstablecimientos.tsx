"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { ProtectedComponent } from "@/components/auth/ProtectedComponent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";

type Sucursal = {
  id: string;
  nombre: string;
  codigo_establecimiento: string;
  es_principal: boolean;
  activo: boolean;
};
type Serie = {
  id: string;
  serie: string;
  tipo_documento: string;
  sucursal_id: string | null;
  correlativo_actual: number | null;
};

const TIPOS = [
  { value: "BOLETA", label: "Boleta", prefijo: "B" },
  { value: "FACTURA", label: "Factura", prefijo: "F" },
  { value: "NOTA_CREDITO", label: "Nota de crédito", prefijo: "" },
  { value: "NOTA_DEBITO", label: "Nota de débito", prefijo: "" },
];
const etiqueta = (tipo: string) =>
  TIPOS.find((item) => item.value === tipo)?.label ?? tipo;

/**
 * Series fiscales por establecimiento anexo. La casa matriz usa las series de
 * la configuración de la empresa; cada anexo necesita las suyas para que su
 * POS emita con su propio código de establecimiento.
 */
export function SeriesEstablecimientos({ sucursales }: { sucursales: Sucursal[] }) {
  const { get, post } = useApi({ throwOnError: true });
  const [series, setSeries] = useState<Serie[]>([]);
  const [form, setForm] = useState<{ sucursalId: string; tipo: string; serie: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intents = useRef(new Map<string, string>());

  const cargar = useCallback(async () => {
    try {
      const response = await get("/configuracion/series");
      setSeries(Array.isArray(response?.data) ? response.data : []);
    } catch {
      setError("No se pudieron cargar las series.");
    }
  }, [get]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async () => {
    if (!form) return;
    const serie = form.serie.trim().toUpperCase();
    setSaving(true);
    setError(null);
    const signature = JSON.stringify({ ...form, serie });
    if (!intents.current.has(signature)) intents.current.set(signature, `serie:${crypto.randomUUID()}`);
    try {
      await post(
        `/sucursales/${form.sucursalId}/series`,
        { tipo_documento: form.tipo, serie },
        { headers: { "idempotency-key": intents.current.get(signature)! } },
      );
      intents.current.delete(signature);
      setForm(null);
      await cargar();
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "No se pudo registrar la serie.");
    } finally {
      setSaving(false);
    }
  };

  const activas = sucursales.filter((sucursal) => sucursal.activo);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5" /> Series por establecimiento
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          La casa matriz emite con las series de la configuración de la empresa.
          Registre aquí las series de cada anexo (por ejemplo B002 y F002): el POS
          de una caja del anexo emite con ellas.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        )}
        <ul className="space-y-3">
          {activas.map((sucursal) => {
            const propias = series.filter((serie) => serie.sucursal_id === sucursal.id);
            return (
              <li key={sucursal.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">
                    {sucursal.codigo_establecimiento} · {sucursal.nombre}
                  </strong>
                  <ProtectedComponent modulo="configuracion" recurso="sucursales" accion="update">
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Agregar serie a ${sucursal.nombre}`}
                      onClick={() => {
                        setError(null);
                        setForm({ sucursalId: sucursal.id, tipo: "BOLETA", serie: "" });
                      }}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Agregar serie
                    </Button>
                  </ProtectedComponent>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {propias.length === 0
                    ? sucursal.es_principal
                      ? "Usa las series de la configuración de la empresa."
                      : "Sin series: el POS de este establecimiento no podrá emitir comprobantes."
                    : propias
                        .map((serie) => `${etiqueta(serie.tipo_documento)} ${serie.serie} (último ${serie.correlativo_actual ?? 0})`)
                        .join(" · ")}
                </p>
                {form?.sucursalId === sucursal.id && (
                  <form
                    className="mt-3 flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void guardar();
                    }}
                  >
                    <label className="text-sm">
                      Tipo
                      <select
                        aria-label="Tipo"
                        className="mt-1 block rounded-md border bg-background px-3 py-2"
                        value={form.tipo}
                        onChange={(event) => setForm({ ...form, tipo: event.target.value })}
                      >
                        {TIPOS.map((tipo) => (
                          <option key={tipo.value} value={tipo.value}>
                            {tipo.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Serie
                      <Input
                        className="mt-1 w-28 uppercase"
                        value={form.serie}
                        maxLength={4}
                        placeholder={(TIPOS.find((tipo) => tipo.value === form.tipo)?.prefijo || "B") + "002"}
                        onChange={(event) =>
                          setForm({ ...form, serie: event.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase() })
                        }
                      />
                    </label>
                    <Button type="submit" size="sm" disabled={saving || !/^[FB][A-Z0-9]{3}$/.test(form.serie)}>
                      {saving ? "Guardando…" : "Guardar serie"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setForm(null)} disabled={saving}>
                      Cancelar
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
