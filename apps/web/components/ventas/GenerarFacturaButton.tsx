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
  warnings?: string[];
  is_demo_representation?: boolean;
}

interface GenerarFacturaButtonProps {
  pedidoId: string;
  onSuccess: () => Promise<void>;
  config: EmpresaConfig;
  documentType?: "FACTURA" | "BOLETA";
  onGenerated?: (result: {
    facturaId: string | null;
    sugerioGre: boolean;
  }) => void;
}

export default function GenerarFacturaButton({
  pedidoId,
  onSuccess,
  config,
  documentType = "FACTURA",
  onGenerated,
}: GenerarFacturaButtonProps) {
  const { post } = useApi({ throwOnError: true });
  const router = useRouter();

  const [showGREModal, setShowGREModal] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [facturaId, setFacturaId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationFeedback, setGenerationFeedback] = useState<GenerarFacturaResponse | null>(null);
  const documentLabel = documentType === "BOLETA" ? "boleta" : "factura";
  const documentLabelTitle = documentType === "BOLETA" ? "Boleta" : "Factura";

  const showCompletionToast = (
    response: GenerarFacturaResponse | null,
    greGenerated = false,
  ) => {
    if (response?.is_demo_representation === true) {
      toast({
        title: "Muestra demo generada",
        description:
          response.warnings?.[0] ||
          "Comprobante de muestra local, sin transmisión ni validez DIAN",
      });
      return;
    }

    toast({
      title: greGenerated
        ? `${documentLabelTitle} y GRE generadas`
        : `${documentLabelTitle} generada`,
      description: greGenerated
        ? `La ${documentLabel} y la guía de remisión han sido generadas exitosamente`
        : `La ${documentLabel} ha sido generada exitosamente`,
    });
  };

  const resolveErrorMessage = (error: unknown): string => {
    if (!error) {
      return `No se pudo generar la ${documentLabel}`;
    }

    if (typeof error === "string") {
      return error;
    }

    if (error instanceof Error) {
      const raw = error.message || `No se pudo generar la ${documentLabel}`;
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

    return `No se pudo generar la ${documentLabel}`;
  };

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      console.debug("[GenerarFacturaButton] Generando comprobante...", {
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
        throw new Error(response?.message || `Error al generar la ${documentLabel}`);
      }

      setFacturaId(response?.factura_id || null);
      setGenerationFeedback(response);
      onGenerated?.({
        facturaId: response?.factura_id || null,
        sugerioGre: !!response?.sugerir_gre,
      });

      // Check if should suggest GRE
      if (response?.sugerir_gre) {
        setShowGREModal(true);
      } else {
        showCompletionToast(response);
        await onSuccess();
        router.refresh();
      }
    } catch (error: any) {
      console.error("Error generating fiscal document:", error);
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

    showCompletionToast(generationFeedback, generated);

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
        {generating ? "Generando..." : `Generar ${documentLabelTitle}`}
      </Button>

      <ConfirmDialog
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleGenerate}
        title={`Confirmar ${documentLabel}`}
        confirmText={`Generar ${documentLabel}`}
        variant="success"
        message={
          <div className="space-y-4 text-left">
            <p>¿Desea generar la {documentLabel} para este pedido?</p>
            <div className="rounded-lg border border-border bg-muted/50 p-4 text-foreground">
              {config.usar_flujo_logistica
                ? "Se generará el comprobante usando el despacho confirmado."
                : "Se generará el comprobante y se descontará el stock inmediatamente."}
            </div>
            <p className="text-sm text-muted-foreground">
              La operación queda vinculada a CPE, cuentas por cobrar y
              contabilidad. La emisión fiscal sólo se confirma con la respuesta
              de la autoridad; en una cuenta demo se crea una muestra local.
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
