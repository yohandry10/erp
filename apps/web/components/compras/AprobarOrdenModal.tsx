"use client";

import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AprobarOrdenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (comentarios?: string) => Promise<void>;
  ordenNumero: string;
}

export default function AprobarOrdenModal({
  isOpen,
  onClose,
  onConfirm,
  ordenNumero,
}: AprobarOrdenModalProps) {
  const [comentarios, setComentarios] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      await onConfirm(comentarios || undefined);
      setComentarios("");
      onClose();
    } catch (error) {
      console.error("Error al aprobar orden:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setComentarios("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="border-border bg-card text-card-foreground sm:max-w-lg"
        onEscapeKeyDown={(event) => loading && event.preventDefault()}
        onInteractOutside={(event) => loading && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <CheckCircle className="h-5 w-5" aria-hidden="true" />
            </span>
            Aprobar orden de compra
          </DialogTitle>
          <DialogDescription>
            ¿Está seguro que desea aprobar la orden de compra{" "}
            <strong className="text-foreground">{ordenNumero}</strong>?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="comentarios-aprobacion">Comentarios (opcional)</Label>
          <Textarea
            id="comentarios-aprobacion"
            value={comentarios}
            onChange={(event) => setComentarios(event.target.value)}
            disabled={loading}
            placeholder="Agregue comentarios sobre la aprobación..."
            rows={4}
            className="min-h-28"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="success"
            onClick={() => void handleConfirm()}
            disabled={loading}
          >
            {loading ? (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {loading ? "Aprobando..." : "Aprobar orden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
