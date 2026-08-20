"use client";

import { useEffect, useRef, useState } from "react";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PlanillaEditarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  planilla: any;
}

/**
 * Edición de una planilla en borrador.
 *
 * Sólo período y observaciones: son los únicos campos que acepta
 * `actualizar_planilla_borrador_tx_495`. Los importes no se editan a mano, se
 * recalculan; el pago y los asientos los rechaza el backend explícitamente.
 * Cambiar el período dispara la comprobación de duplicados del writer, así que
 * el error que llega de ahí se muestra tal cual.
 */
export default function PlanillaEditarModal({
  isOpen,
  onClose,
  onSuccess,
  planilla,
}: PlanillaEditarModalProps) {
  // El error del writer (período duplicado, documento fuera de borrador) es lo
  // que el usuario necesita leer: se muestra dentro del modal en vez de en un
  // toast que aparece detrás de él.
  const { put } = useApi({ throwOnError: true, showErrorToast: false });
  const [periodo, setPeriodo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKeyRef = useRef("");

  // El writer guarda la nota en metadata.observaciones, no en una columna.
  const observacionOriginal = String(
    planilla?.observaciones ?? planilla?.metadata?.observaciones ?? "",
  );

  useEffect(() => {
    if (!isOpen) return;
    setPeriodo(String(planilla?.periodo ?? ""));
    setObservaciones(observacionOriginal);
    setError("");
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
  }, [isOpen, planilla, observacionOriginal]);

  const cerrarModal = () => {
    idempotencyKeyRef.current = "";
    onClose();
  };

  const handleGuardar = async () => {
    if (!planilla?.id) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
      setError("El período debe tener el formato AAAA-MM.");
      return;
    }

    const periodoCambio = periodo !== String(planilla?.periodo ?? "");
    const observacionesCambio = observaciones.trim() !== observacionOriginal.trim();
    if (!periodoCambio && !observacionesCambio) {
      setError("No hay cambios que guardar.");
      return;
    }

    try {
      setGuardando(true);
      setError("");
      const response = await put(`/api/rrhh/planillas/${planilla.id}`, {
        idempotency_key: idempotencyKeyRef.current,
        ...(periodoCambio ? { periodo } : {}),
        ...(observacionesCambio ? { observaciones: observaciones.trim() } : {}),
      });
      if (!response?.success) {
        throw new Error(response?.message || "No se pudo actualizar la planilla");
      }
      onSuccess();
      idempotencyKeyRef.current = "";
      onClose();
    } catch (updateError: any) {
      console.error("Error actualizando la planilla:", updateError);
      setError(updateError?.message || "No se pudo actualizar la planilla");
    } finally {
      setGuardando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !guardando && cerrarModal()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] border-border bg-card p-0 text-card-foreground sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle>Editar planilla {planilla?.periodo}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Sólo se editan el período y las observaciones, y sólo mientras la
            planilla está en borrador. Los importes se obtienen del cálculo, no
            se escriben a mano.
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Período</span>
            <input
              type="month"
              value={periodo}
              onChange={(event) => setPeriodo(event.target.value)}
              disabled={guardando}
              className="rounded-md border border-input bg-background px-3 py-2 font-normal"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Observaciones</span>
            <textarea
              value={observaciones}
              onChange={(event) => setObservaciones(event.target.value)}
              disabled={guardando}
              rows={4}
              maxLength={1000}
              placeholder="Notas internas sobre esta planilla"
              className="rounded-md border border-input bg-background px-3 py-2 font-normal"
            />
          </label>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={cerrarModal} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
