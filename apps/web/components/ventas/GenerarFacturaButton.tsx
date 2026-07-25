"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import SugerenciaGREModal from "./SugerenciaGREModal";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

interface EmpresaConfig {
  usar_flujo_logistica: boolean;
  gre_automatico_habilitado: boolean;
  gre_obligatorio: boolean;
}

interface GenerarFacturaResponse {
  success: boolean;
  factura_id?: string;
  sugerir_gre?: boolean;
  message?: string;
}

interface GenerarFacturaButtonProps {
  pedidoId: string;
  onSuccess: () => Promise<void>;
  config: EmpresaConfig;
  onGenerated?: (result: {
    facturaId: string | null;
    sugerioGre: boolean;
  }) => void;
}

export default function GenerarFacturaButton({
  pedidoId,
  onSuccess,
  config,
  onGenerated,
}: GenerarFacturaButtonProps) {
  const { post } = useApi();
  const router = useRouter();

  const [showGREModal, setShowGREModal] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [facturaId, setFacturaId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const resolveErrorMessage = (error: unknown): string => {
    if (!error) {
      return "No se pudo generar la factura";
    }

    if (typeof error === "string") {
      return error;
    }

    if (error instanceof Error) {
      const raw = error.message || "No se pudo generar la factura";
      const jsonStart = raw.indexOf("{");
      if (jsonStart !== -1) {
        try {
          const parsed = JSON.parse(raw.slice(jsonStart));
          if (parsed?.message) {
            return parsed.message;
          }
        } catch {
          // ignore JSON parse errors
        }
      }
      return raw;
    }

    if (
      typeof error === "object" &&
      "message" in (error as Record<string, unknown>)
    ) {
      const nestedMessage = (error as Record<string, unknown>).message;
      if (typeof nestedMessage === "string") {
        return resolveErrorMessage(new Error(nestedMessage));
      }
    }

    return "No se pudo generar la factura";
  };

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      console.debug("[GenerarFacturaButton] Generando factura...", {
        pedidoId,
      });

      const response: GenerarFacturaResponse = await post(
        `/ventas/pedidos/${pedidoId}/generar-factura`,
        {},
      );

      console.debug(
        "[GenerarFacturaButton] Respuesta generación factura",
        response,
      );

      const fueExitoso = !!response && response?.success !== false;

      if (!fueExitoso) {
        throw new Error(response?.message || "Error al generar la factura");
      }

      setFacturaId(response?.factura_id || null);
      onGenerated?.({
        facturaId: response?.factura_id || null,
        sugerioGre: !!response?.sugerir_gre,
      });

      // Check if should suggest GRE
      if (response?.sugerir_gre) {
        setShowGREModal(true);
      } else {
        toast({
          title: "Factura generada",
          description: "La factura ha sido generada exitosamente",
        });
        await onSuccess();
        router.refresh();
      }
    } catch (error: any) {
      console.error("Error generating factura:", error);
      toast({
        title: "Error",
        description: resolveErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
      console.debug("[GenerarFacturaButton] Estado generating=false");
    }
  };

  const handleGREModalClose = async (generated: boolean) => {
    setShowGREModal(false);

    if (generated) {
      toast({
        title: "Factura y GRE generados",
        description:
          "La factura y la guía de remisión han sido generadas exitosamente",
      });
    } else {
      toast({
        title: "Factura generada",
        description: "La factura ha sido generada exitosamente",
      });
    }

    await onSuccess();
    router.refresh();
  };

  const handleButtonClick = () => {
    setShowConfirmation(true);
  };

  return (
    <>
      <Button
        onClick={handleButtonClick}
        disabled={generating}
        className="bg-blue-600 hover:bg-blue-700"
      >
        <FileText className="w-4 h-4 mr-2" />
        {generating ? "Generando..." : "Generar Factura"}
      </Button>

      <ConfirmDialog
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleGenerate}
        title="Confirmar factura"
        confirmText="Generar factura"
        variant="success"
        message={
          <div className="space-y-4 text-left">
            <p>¿Desea generar la factura para este pedido?</p>
            <div className="rounded-lg border border-border bg-muted/50 p-4 text-foreground">
              {config.usar_flujo_logistica
                ? "Se emitirá el documento fiscal usando el despacho confirmado."
                : "Se emitirá el documento fiscal y se descontará el stock inmediatamente."}
            </div>
            <p className="text-sm text-muted-foreground">
              La operación queda vinculada a CPE, cuentas por cobrar y
              contabilidad.
            </p>
          </div>
        }
      />

      {/* GRE Suggestion Modal */}
      {showGREModal && (
        <SugerenciaGREModal
          pedidoId={pedidoId}
          facturaId={facturaId}
          config={config}
          onClose={handleGREModalClose}
        />
      )}
    </>
  );
}
