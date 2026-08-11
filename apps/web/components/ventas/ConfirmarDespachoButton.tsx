"use client";

import { useRef, useState } from "react";
import { useApi } from "@/hooks/use-api";
import { toast } from "@/components/ui/use-toast";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

interface ConfirmarDespachoButtonProps {
  pedidoId: string;
  pedidoNumero: string;
  onSuccess?: () => void;
}

export function ConfirmarDespachoButton({
  pedidoId,
  pedidoNumero,
  onSuccess,
}: ConfirmarDespachoButtonProps) {
  const { post } = useApi();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const dispatchKeyRef = useRef<string | null>(null);

  const handleConfirmar = async () => {
    try {
      setLoading(true);
      dispatchKeyRef.current ??= crypto.randomUUID();

      const response = await post(
        `/inventario/logistica/${pedidoId}/confirmar-despacho`,
        { idempotency_key: dispatchKeyRef.current },
      );

      if (response?.success) {
        toast({
          title: "Despacho Confirmado",
          description: `El pedido ${pedidoNumero} ha sido despachado exitosamente`,
        });
        dispatchKeyRef.current = null;
        onSuccess?.();
      } else {
        throw new Error("Error al confirmar despacho");
      }
    } catch (error) {
      console.error("Error confirming despacho:", error);
      toast({
        title: "Error",
        description: "No se pudo confirmar el despacho",
        variant: "destructive",
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setShowConfirmModal(true)}
        variant="success"
        size="sm"
        disabled={loading}
      >
        <Truck className="w-4 h-4" />
        Confirmar Despacho
      </Button>

      <ConfirmDialog
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmar}
        title="Confirmar despacho"
        confirmText="Confirmar despacho"
        variant="warning"
        message={
          <div className="space-y-4 text-left">
            <p>
              ¿Estás seguro de que deseas confirmar el despacho del pedido{" "}
              <strong className="text-foreground">{pedidoNumero}</strong>?
            </p>
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <p className="font-semibold text-foreground">
                Esta acción realizará lo siguiente:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                <li>Descontará el stock real de los productos</li>
                <li>Liberará las reservas de inventario</li>
                <li>Cambiará el estado a &quot;Listo para Facturar&quot;</li>
                <li>Notificará al equipo de ventas</li>
              </ul>
            </div>
            <p className="text-sm text-muted-foreground">
              Esta acción no se puede deshacer.
            </p>
          </div>
        }
      />
    </>
  );
}
