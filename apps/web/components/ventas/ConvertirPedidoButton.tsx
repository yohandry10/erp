"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { toast } from "@/components/ui/use-toast";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

interface ConvertirPedidoButtonProps {
  cotizacionId: string;
  onSuccess?: (pedidoId?: string, payload?: any) => void;
  disabled?: boolean;
}

export default function ConvertirPedidoButton({
  cotizacionId,
  onSuccess,
  disabled = false,
}: ConvertirPedidoButtonProps) {
  const { post } = useApi();
  const [converting, setConverting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleConvert = async () => {
    try {
      setConverting(true);

      const response = await post(
        `/api/ventas/cotizaciones/${cotizacionId}/convertir-pedido`,
        {},
      );

      if (response?.success) {
        const payload = response.data;
        const pedidoId = payload?.pedido_id;

        if (onSuccess) {
          onSuccess(pedidoId, payload);
        } else {
          toast({
            title: "Éxito",
            description: "Cotización convertida a pedido exitosamente",
          });
        }
      } else {
        throw new Error(
          response?.message || "Error al convertir la cotización",
        );
      }
    } catch (error: any) {
      console.error("Error converting cotización:", error);
      toast({
        title: "Error",
        description:
          error.message || "No se pudo convertir la cotización a pedido",
        variant: "destructive",
      });
    } finally {
      setConverting(false);
    }
  };

  const handleClick = () => {
    setShowConfirmation(true);
  };

  const handleCancel = () => {
    if (!converting) {
      setShowConfirmation(false);
    }
  };

  const isDisabled = disabled || converting;

  return (
    <>
      <Button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        variant="success"
      >
        {converting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Convirtiendo...
          </>
        ) : (
          <>
            <ArrowRight className="w-4 h-4" />
            Convertir a Pedido
          </>
        )}
      </Button>

      <ConfirmDialog
        isOpen={showConfirmation}
        onClose={handleCancel}
        onConfirm={handleConvert}
        title="Confirmar conversión"
        confirmText="Convertir a pedido"
        variant="success"
        message={
          <div className="space-y-4 text-left">
            <p>
              ¿Está seguro de convertir esta cotización a pedido de venta? Su
              estado cambiará a{" "}
              <strong className="text-emerald-400">CONVERTIDA</strong> y se
              creará un nuevo pedido.
            </p>
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <p className="font-semibold text-foreground">Al confirmar:</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                <li>Se generará un pedido vinculado a la cotización</li>
                <li>El stock se reservará después, al confirmar el pedido</li>
                <li>Se actualizarán el historial y la auditoría</li>
              </ul>
            </div>
            <p className="text-sm text-muted-foreground">
              Esta acción no se puede deshacer automáticamente.
            </p>
          </div>
        }
      />
    </>
  );
}
