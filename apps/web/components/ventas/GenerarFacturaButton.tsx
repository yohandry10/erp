"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/use-permission";
import { invoiceIntentKey, readInvoiceIntent, newInvoiceIntent, readInvoiceOrder, invoiceOrderCanGenerate, sameInvoiceSnapshot, readInvoiceGenerationReceipt, confirmInvoiceFromOrder, type InvoiceIntent, type InvoiceScope, type InvoiceOrder, type InvoiceGenerationReceipt } from "@/lib/ventas/invoice-generation-operation";
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
  canGenerate?: boolean;
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
  canGenerate = true,
  onSuccess,
  config,
  documentType = "FACTURA",
  onGenerated,
}: GenerarFacturaButtonProps) {
  const { get, post } = useApi({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0 });
  const { session } = useAuth();
  const { hasPermission, loading: permissionLoading } = usePermission('ventas', 'generar_factura', 'pedidos');
  const tenantId = session?.user?.tenant_id || '';
  const actorId = session?.user?.id || '';
  const scope: InvoiceScope = { tenantId, actorId, orderId: pedidoId };
  const scopeIdentity = `${tenantId}:${actorId}:${pedidoId}`;
  const activeScope = useRef(scopeIdentity); activeScope.current = scopeIdentity;
  const permission = useRef(false); permission.current = hasPermission && !permissionLoading;
  const epoch = useRef(0);
  const busy = useRef(false);
  const feedbackEpoch = useRef(-1);
  const storedRaw = useRef<string | null>(null);
  const [pending, setPending] = useState<InvoiceIntent | null>(null);
  const [intentReady, setIntentReady] = useState('');
  const [operationError, setOperationError] = useState<string | null>(null);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const [recoveredConfirmation, setRecoveredConfirmation] = useState(false);
  const router = useRouter();

  const [showGREModal, setShowGREModal] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [facturaId, setFacturaId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationFeedback, setGenerationFeedback] = useState<GenerarFacturaResponse | null>(null);
  const visiblePending = intentReady === scopeIdentity && pending?.tenantId === tenantId && pending?.actorId === actorId && pending?.orderId === pedidoId ? pending : null;
  const resolvedDocumentType = visiblePending?.documentType === '03' ? 'BOLETA' : visiblePending ? 'FACTURA' : documentType;
  const documentLabel = resolvedDocumentType === "BOLETA" ? "boleta" : "factura";
  const documentLabelTitle = resolvedDocumentType === "BOLETA" ? "Boleta" : "Factura";

  useEffect(() => {
    epoch.current += 1; busy.current = false; storedRaw.current = null; feedbackEpoch.current = -1;
    setPending(null); setIntentReady(''); setOperationError(null); setRecoveryBlocked(false);
    setGenerating(false); setShowConfirmation(false); setShowGREModal(false); setGenerationFeedback(null); setRecoveredConfirmation(false);
    if (!tenantId || !actorId || !pedidoId) return;
    try {
      const currentScope = { tenantId, actorId, orderId: pedidoId };
      const raw = window.localStorage.getItem(invoiceIntentKey(currentScope));
      if (raw) { const intent = readInvoiceIntent(raw, currentScope); storedRaw.current = raw; setPending(intent); }
    } catch (error) {
      setRecoveryBlocked(true); setOperationError(error instanceof Error ? error.message : 'No se pudo recuperar la generación pendiente. Se conserva sin reemplazarla.');
    }
    setIntentReady(scopeIdentity);
    return () => { epoch.current += 1; };
  }, [tenantId, actorId, pedidoId, scopeIdentity]);

  const showCompletionToast = (
    response: GenerarFacturaResponse | null,
    greGenerated = false,
    recovered = false,
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
        : `${documentLabelTitle} ${recovered ? "recuperada" : "generada"}`,
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
    if (busy.current || recoveryBlocked || intentReady !== scopeIdentity || !permission.current) return;
    const run = epoch.current;
    const current = () => run === epoch.current && activeScope.current === scopeIdentity && permission.current;
    const key = invoiceIntentKey(scope);
    const persist = (intent: InvoiceIntent, expected: string | null) => {
      if (!current()) return false;
      if (window.localStorage.getItem(key) !== expected) throw new Error('La generación pendiente cambió en otra ventana. Se conserva; recargue para revisarla.');
      const raw = JSON.stringify(intent); readInvoiceIntent(raw, scope);
      // Intención durable: datos de negocio e ids de empresa y usuario, sin token ni contraseña.
      // codeql[js/clear-text-storage-of-sensitive-data]
      window.localStorage.setItem(key, raw);
      if (window.localStorage.getItem(key) !== raw) throw new Error('No se pudo guardar y verificar la generación pendiente. No se envió otra operación.');
      storedRaw.current = raw; setPending(intent); return true;
    };
    const readOrder = async () => readInvoiceOrder(await get(`/ventas/pedidos/${pedidoId}`), scope);
    const finish = async (intent: InvoiceIntent, order: InvoiceOrder, receipt?: InvoiceGenerationReceipt, recovered = true) => {
      if (!order.invoiceId) throw new Error('El servidor todavía no confirma el comprobante vinculado. Verifique la generación pendiente.');
      const value = await get(`/cpe/comprobantes/${order.invoiceId}`);
      if (!current()) return;
      const confirmation = confirmInvoiceFromOrder(intent, order, value, receipt);
      if (window.localStorage.getItem(key) !== storedRaw.current) throw new Error('La generación pendiente cambió en otra ventana. Se conserva sin retirarla.');
      window.localStorage.removeItem(key);
      if (window.localStorage.getItem(key) !== null) throw new Error('El comprobante se consultó, pero no se pudo retirar la generación pendiente. Reintente su verificación.');
      storedRaw.current = null; setPending(null); setOperationError(null); setGenerationFeedback(confirmation); setRecoveredConfirmation(recovered); feedbackEpoch.current = run;
      onGenerated?.({ facturaId: confirmation.factura_id, sugerioGre: confirmation.sugerir_gre === true });
      if (confirmation.sugerir_gre === true) { setFacturaId(confirmation.factura_id); setShowGREModal(true); }
      else { showCompletionToast(confirmation, false, recovered); await onSuccess(); if (current()) router.refresh(); }
    };
    busy.current = true; setGenerating(true); setOperationError(null);
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== storedRaw.current) throw new Error('La generación pendiente cambió en otra ventana. Se conserva; recargue para revisarla.');
      let intent = raw ? readInvoiceIntent(raw, scope) : null;
      const order = await readOrder(); if (!current()) return;
      if (intent) {
        if (!sameInvoiceSnapshot(intent.snapshot, order.snapshot)) throw new Error('El pedido cambió desde la generación pendiente. Se conserva; revise la consulta antes de continuar.');
        if (order.invoiceId) { await finish(intent, order); return; }
        if (!invoiceOrderCanGenerate(order, intent.logistics)) throw new Error('El pedido no permite generar este comprobante. Se conserva la operación pendiente.');
        if (intent.stage === 'VERIFY') {
          persist({ ...intent, stage: 'GENERATE' }, raw);
          setOperationError('El servidor aún no registra el comprobante. Puede reintentar la generación pendiente.'); return;
        }
      } else {
        if (!canGenerate) return;
        intent = newInvoiceIntent(order, scope, documentType === 'BOLETA' ? '03' : '01', config.usar_flujo_logistica);
        if (!persist(intent, null)) return;
      }
      const verifying: InvoiceIntent = { ...intent, stage: 'VERIFY' };
      if (!persist(verifying, storedRaw.current)) return;
      const value = await post(`/ventas/pedidos/${pedidoId}/generar-factura`, JSON.parse(verifying.body), { headers: { 'Idempotency-Key': verifying.fiscalKey } });
      if (!current()) return;
      const receipt = readInvoiceGenerationReceipt(value);
      const confirmedOrder = await readOrder(); if (!current()) return;
      await finish(verifying, confirmedOrder, receipt, false);
    } catch (error) {
      if (current()) setOperationError(resolveErrorMessage(error));
    } finally {
      if (current()) { busy.current = false; setGenerating(false); }
    }
  };

  const handleGREModalClose = async (generated: boolean) => {
    if (activeScope.current !== scopeIdentity || feedbackEpoch.current !== epoch.current || !permission.current) return;
    setShowGREModal(false);

    showCompletionToast(generationFeedback, generated, recoveredConfirmation);

    await onSuccess();
    if (activeScope.current === scopeIdentity && feedbackEpoch.current === epoch.current) router.refresh();
  };

  const handleButtonClick = () => {
    if (!canGenerate || !permission.current || intentReady !== scopeIdentity || recoveryBlocked || busy.current) return;
    setShowConfirmation(true);
  };

  if (intentReady !== scopeIdentity || !hasPermission || permissionLoading || (!canGenerate && !visiblePending && !operationError)) return null;
  return (
    <>
      {operationError && <div role="alert" className="w-full rounded-lg border border-destructive/40 p-4 text-sm">{operationError}</div>}
      {visiblePending && <section data-testid="invoice-generation-pending" className="w-full rounded-lg border border-amber-400/40 bg-amber-50/5 p-4">
        <h3 className="font-semibold">Generación pendiente de confirmación</h3>
        <p className="mt-2 text-sm">Pedido {visiblePending.snapshot.number} · {visiblePending.snapshot.currency} {visiblePending.snapshot.total.toFixed(2)}</p>
        <ul className="mt-2 text-sm">{visiblePending.snapshot.lines.map(line => <li key={line.id}>{line.description} · {line.quantity} × {line.price.toFixed(2)}</li>)}</ul>
        <p className="mt-2 text-sm">Consulte el resultado para recuperar el comprobante vinculado sin volver a generarlo.</p>
        <Button className="mt-3" onClick={() => void handleGenerate()} disabled={generating || recoveryBlocked}>
          {generating ? 'Consultando...' : visiblePending.stage === 'VERIFY' ? 'Verificar factura pendiente' : 'Reintentar generación pendiente'}
        </Button>
      </section>}
      {!visiblePending && canGenerate && <Button
        onClick={handleButtonClick}
        disabled={generating || recoveryBlocked}
        className="bg-blue-600 hover:bg-blue-700"
      >
        <FileText className="w-4 h-4 mr-2" />
        {generating ? "Generando..." : `Generar ${documentLabelTitle}`}
      </Button>}

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
