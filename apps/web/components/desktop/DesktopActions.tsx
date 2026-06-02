'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTauri } from '@/hooks/useTauri';
import { toast } from 'sonner';
import { 
  FileSignature, 
  Send, 
  FileText, 
  Printer, 
  Download,
  Loader2
} from 'lucide-react';

interface DesktopActionsProps {
  xmlContent?: string;
  documentType?: 'factura' | 'boleta' | 'guia' | 'nota_credito';
  onStatusChange?: (status: string) => void;
}

export default function DesktopActions({ 
  xmlContent, 
  documentType = 'factura',
  onStatusChange 
}: DesktopActionsProps) {
  const { 
    isDesktop, 
    config,
    loading,
    signXML, 
    sendToSUNAT, 
    generatePDF, 
    savePDF,
    printDocument,
    getPrinters
  } = useTauri();

  const [signedXml, setSignedXml] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [documentStatus, setDocumentStatus] = useState<string>('PENDIENTE');

  if (!isDesktop) {
    return (
      <div className="p-4 bg-muted/50 rounded-lg">
        <p className="text-sm text-muted-foreground">
          Las funciones de firma digital, envío a SUNAT e impresión directa 
          están disponibles solo en la aplicación desktop.
        </p>
      </div>
    );
  }

  if (!config?.certificado_path) {
    return (
      <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <p className="text-sm text-orange-800">
          Configura tu certificado digital en la sección de configuración 
          para usar las funciones de firma y envío.
        </p>
      </div>
    );
  }

  const handleSign = async () => {
    if (!xmlContent) {
      toast.error('No hay contenido XML para firmar');
      return;
    }

    const signed = await signXML(xmlContent);
    if (signed) {
      setSignedXml(signed);
      setDocumentStatus('FIRMADO');
      onStatusChange?.('FIRMADO');
      toast.success('Documento firmado correctamente');
    }
  };

  const handleSendToSUNAT = async () => {
    if (!signedXml) {
      toast.error('Primero debes firmar el documento');
      return;
    }

    const response = await sendToSUNAT(signedXml);
    if (response) {
      if (response.includes('aceptado')) {
        setDocumentStatus('ACEPTADO');
        onStatusChange?.('ACEPTADO');
      } else if (response.includes('Ticket')) {
        setDocumentStatus('ENVIADO');
        onStatusChange?.('ENVIADO');
      } else if (response.includes('PENDIENTE_ENVIO')) {
        setDocumentStatus('PENDIENTE_ENVIO');
        onStatusChange?.('PENDIENTE_ENVIO');
      }
    }
  };

  const handleGeneratePDF = async () => {
    const xmlToUse = signedXml || xmlContent;
    if (!xmlToUse) {
      toast.error('No hay contenido para generar PDF');
      return;
    }

    const pdf = await generatePDF(xmlToUse);
    if (pdf) {
      setPdfData(pdf);
      toast.success('PDF generado correctamente');
    }
  };

  const handleSavePDF = async () => {
    if (!pdfData) {
      toast.error('Primero genera el PDF');
      return;
    }

    const filename = `${documentType}_${Date.now()}.pdf`;
    const success = await savePDF(pdfData, filename);
    if (!success) {
      toast.error('Error al guardar PDF');
    }
  };

  const handlePrint = async () => {
    if (!pdfData) {
      toast.error('Primero genera el PDF');
      return;
    }

    const printers = await getPrinters();
    if (printers.length === 0) {
      toast.error('No se encontraron impresoras');
      return;
    }

    // Usar la primera impresora disponible o mostrar selector
    const success = await printDocument(pdfData, printers[0]);
    if (!success) {
      toast.error('Error al imprimir');
    }
  };

  return (
    <div className="space-y-4">
      {/* Estado del documento */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Estado:</span>
        <Badge 
          variant={
            documentStatus === 'ACEPTADO' ? 'default' :
            documentStatus === 'FIRMADO' ? 'secondary' :
            documentStatus === 'ENVIADO' ? 'outline' : 'secondary'
          }
        >
          {documentStatus}
        </Badge>
      </div>

      {/* Acciones principales */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleSign}
          disabled={loading || !xmlContent}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSignature className="h-4 w-4" />
          )}
          Firmar XML
        </Button>

        <Button
          onClick={handleSendToSUNAT}
          disabled={loading || !signedXml}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Enviar/encolar SUNAT
        </Button>

        <Button
          onClick={handleGeneratePDF}
          disabled={loading || (!signedXml && !xmlContent)}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          Generar PDF
        </Button>

        {pdfData && (
          <>
            <Button
              onClick={handleSavePDF}
              disabled={loading}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Guardar PDF
            </Button>

            <Button
              onClick={handlePrint}
              disabled={loading}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
          </>
        )}
      </div>

      {/* Información adicional */}
      {config.offline_mode && (
        <div className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
          Modo offline: Los documentos se guardarán localmente y se enviarán cuando vuelvas a estar online.
        </div>
      )}
    </div>
  );
}
