'use client'

import { formatFiscalDocumentNumber } from '@/lib/fiscal-document-number'

interface CpeDocument {
  id: string
  tipoDocumento?: string
  tipoComprobante: string
  serie: string
  numero: number
  fechaEmision: string
  cliente: string
  clienteRuc: string
  total: number
  moneda: string
  estado: 'BORRADOR' | 'FIRMADO' | 'ENVIADO' | 'ACEPTADO' | 'ERROR' | 'RECHAZADO' | 'ANULADO'
  estadoSunat?: string
  isDemoRepresentation?: boolean
  observaciones?: string
  fechaCreacion: string
}

interface Props {
  documents: CpeDocument[]
  onView: (id: string, tipo: string) => void
  onPdf?: (id: string) => void
  onSend: (id: string) => void
  onSign?: (id: string) => void
  onCancel?: (doc: CpeDocument) => void
  onGre?: (doc: CpeDocument) => void
  fiscalLabel: string
  canSend: boolean
  countryCode?: string
}

const estadoColor: Record<string, string> = {
  MUESTRA_LOCAL: 'border-amber-300/30 bg-amber-300/10 text-amber-700 dark:text-amber-200',
  ACEPTADO: 'border-cyan-300/30 bg-cyan-300/10 text-primary',
  FIRMADO: 'border-blue-300/30 bg-blue-300/10 text-primary dark:text-blue-200',
  ENVIADO: 'border-sky-300/30 bg-sky-300/10 text-primary dark:text-sky-200',
  ERROR: 'border-amber-300/30 bg-amber-300/10 text-amber-700 dark:text-amber-200',
  RECHAZADO: 'border-border/30 bg-slate-300/10 text-foreground',
  ANULADO: 'border-border/30 bg-slate-400/10 text-foreground/90',
  BORRADOR: 'border-border/30 bg-slate-400/10 text-foreground/90',
}

export function ComprobantesTable({ documents, onView, onPdf, onSend, onSign, onCancel, onGre, fiscalLabel, canSend, countryCode }: Props) {
  const isColombia = String(countryCode || '').toUpperCase() === 'CO'
  const canUseSunatCancellation = String(countryCode || '').toUpperCase() === 'PE'
  return (
    <div className="overflow-auto rounded-2xl border border-cyan-400/10">
      <table className="min-w-full !bg-card/80 text-sm">
        <thead className="!bg-card/90 text-xs uppercase tracking-[0.12em] text-primary/80">
          <tr className="text-left">
            <th className="!bg-card/90 p-3">Tipo</th>
            {isColombia ? (
              <th className="!bg-card/90 p-3" colSpan={2}>Número DIAN</th>
            ) : (
              <>
                <th className="!bg-card/90 p-3">Serie</th>
                <th className="!bg-card/90 p-3">Numero</th>
              </>
            )}
            <th className="!bg-card/90 p-3">Fecha</th>
            <th className="!bg-card/90 p-3">Cliente</th>
            <th className="!bg-card/90 p-3">Total</th>
            <th className="!bg-card/90 p-3">Estado</th>
            <th className="!bg-card/90 p-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cyan-400/10">
          {documents.map((doc) => {
            const type = String(doc.tipoDocumento || doc.tipoComprobante).toUpperCase()
            const isNote = ['07', '08', '91', '92'].some((code) => type.includes(code)) || type.includes('NOTA')
            const displayState = doc.isDemoRepresentation ? 'MUESTRA_LOCAL' : doc.estado
            const canSendDocument = !doc.isDemoRepresentation
              && canSend
              && ['FIRMADO', 'ERROR'].includes(doc.estado)
            return (
            <tr key={doc.id} className="bg-card/50 text-foreground/90 transition hover:bg-card/80">
              <td className="p-3 font-semibold text-foreground">{doc.tipoComprobante}</td>
              {isColombia ? (
                <td className="p-3 font-mono text-foreground" colSpan={2}>
                  {formatFiscalDocumentNumber('CO', doc.serie, doc.numero)}
                </td>
              ) : (
                <>
                  <td className="p-3 font-mono text-foreground">{doc.serie}</td>
                  <td className="p-3 font-mono text-foreground">{doc.numero}</td>
                </>
              )}
              <td className="p-3 text-muted-foreground">{doc.fechaEmision}</td>
              <td className="p-3">
                <div className="flex flex-col">
                  <span className="font-semibold text-foreground">{doc.cliente}</span>
                  <span className="text-xs text-cyan-100/55">{doc.clienteRuc}</span>
                </div>
              </td>
              <td className="p-3 font-bold text-primary">
                {doc.moneda} {Number(doc.total).toFixed(2)}
              </td>
              <td className="p-3">
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${estadoColor[displayState] || estadoColor.BORRADOR}`}
                  data-testid={`cpe-status-${doc.id}`}
                >
                  {doc.isDemoRepresentation ? 'MUESTRA LOCAL' : doc.estado}
                </span>
              </td>
              <td className="p-3">
                <div className="flex flex-wrap justify-end gap-2">
                <button className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-cyan-400/15" onClick={() => onView(doc.id, doc.tipoDocumento || doc.tipoComprobante)}>Vista A4</button>
                <button className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-cyan-400/15" onClick={() => onPdf?.(doc.id)}>Descargar A4</button>
                {isNote && doc.estado === 'BORRADOR' && onSign && (
                  <button
                    className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-400/15 dark:text-amber-200"
                    onClick={() => onSign(doc.id)}
                    data-testid={`sign-note-${doc.id}`}
                  >
                    Firmar
                  </button>
                )}
                <button
                  className="rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-primary dark:text-blue-200 hover:bg-blue-500/15 disabled:opacity-40"
                  onClick={() => canSendDocument && onSend(doc.id)}
                  disabled={!canSendDocument}
                  title={doc.isDemoRepresentation
                    ? 'Las muestras locales nunca se transmiten a la autoridad fiscal'
                    : !canSend
                    ? `Envío a ${fiscalLabel} no disponible`
                    : doc.estado === 'RECHAZADO'
                      ? 'El rechazo fiscal es definitivo y no se reintenta'
                      : !canSendDocument
                        ? 'El comprobante no está en un estado enviable'
                        : `Enviar a ${fiscalLabel}`}
                >
                  Enviar {fiscalLabel}
                </button>
                {onGre && (
                  <button className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-cyan-400/15" onClick={() => onGre(doc)}>GRE</button>
                )}
                {canUseSunatCancellation && onCancel && doc.estado !== 'ANULADO' && ['01', '03', 'FACTURA', 'BOLETA'].some((tipo) => String(doc.tipoDocumento || doc.tipoComprobante).toUpperCase().includes(tipo)) && (
                  <button
                    className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-500/15 dark:text-red-300"
                    onClick={() => onCancel(doc)}
                    data-testid={`open-cpe-cancellation-${doc.id}`}
                  >
                    Anulación
                  </button>
                )}
                </div>
              </td>
            </tr>
            )
          })}
          {documents.length === 0 && (
            <tr className="bg-card/50">
              <td className="p-8 text-center text-muted-foreground" colSpan={8}>
                No hay comprobantes
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
