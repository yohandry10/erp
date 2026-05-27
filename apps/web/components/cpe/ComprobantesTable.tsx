'use client'

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
  estado: 'BORRADOR' | 'FIRMADO' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO' | 'ANULADO'
  estadoSunat?: string
  observaciones?: string
  fechaCreacion: string
}

interface Props {
  documents: CpeDocument[]
  onView: (id: string, tipo: string) => void
  onPdf?: (id: string) => void
  onSend: (id: string) => void
  onGre: (doc: CpeDocument) => void
  fiscalLabel: string
  canSend: boolean
}

const estadoColor: Record<string, string> = {
  ACEPTADO: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
  FIRMADO: 'border-blue-300/30 bg-blue-300/10 text-blue-100',
  ENVIADO: 'border-sky-300/30 bg-sky-300/10 text-sky-100',
  RECHAZADO: 'border-slate-300/30 bg-slate-300/10 text-slate-100',
  ANULADO: 'border-slate-400/30 bg-slate-400/10 text-slate-200',
  BORRADOR: 'border-slate-400/30 bg-slate-400/10 text-slate-200',
}

export function ComprobantesTable({ documents, onView, onPdf, onSend, onGre, fiscalLabel, canSend }: Props) {
  return (
    <div className="overflow-auto rounded-2xl border border-cyan-400/10">
      <table className="min-w-full !bg-slate-950/80 text-sm">
        <thead className="!bg-slate-900/90 text-xs uppercase tracking-[0.12em] text-cyan-200/70">
          <tr className="text-left">
            <th className="!bg-slate-900/90 p-3">Tipo</th>
            <th className="!bg-slate-900/90 p-3">Serie</th>
            <th className="!bg-slate-900/90 p-3">Numero</th>
            <th className="!bg-slate-900/90 p-3">Fecha</th>
            <th className="!bg-slate-900/90 p-3">Cliente</th>
            <th className="!bg-slate-900/90 p-3">Total</th>
            <th className="!bg-slate-900/90 p-3">Estado</th>
            <th className="!bg-slate-900/90 p-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cyan-400/10">
          {documents.map((doc) => (
            <tr key={doc.id} className="bg-slate-950/50 text-slate-200 transition hover:bg-slate-900/80">
              <td className="p-3 font-semibold text-slate-100">{doc.tipoComprobante}</td>
              <td className="p-3 font-mono text-slate-100">{doc.serie}</td>
              <td className="p-3 font-mono text-slate-100">{doc.numero}</td>
              <td className="p-3 text-slate-300">{doc.fechaEmision}</td>
              <td className="p-3">
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-100">{doc.cliente}</span>
                  <span className="text-xs text-cyan-100/55">{doc.clienteRuc}</span>
                </div>
              </td>
              <td className="p-3 font-bold text-cyan-50">
                {doc.moneda} {Number(doc.total).toFixed(2)}
              </td>
              <td className="p-3">
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${estadoColor[doc.estado] || estadoColor.BORRADOR}`}>
                  {doc.estado}
                </span>
              </td>
              <td className="p-3">
                <div className="flex flex-wrap justify-end gap-2">
                <button className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-50 hover:bg-cyan-400/15" onClick={() => onView(doc.id, doc.tipoDocumento || doc.tipoComprobante)}>Ver</button>
                <button className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-50 hover:bg-cyan-400/15" onClick={() => onPdf?.(doc.id)}>PDF</button>
                <button
                  className="rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-100 hover:bg-blue-500/15 disabled:opacity-40"
                  onClick={() => canSend && onSend(doc.id)}
                  disabled={!canSend}
                  title={!canSend ? `Envío a ${fiscalLabel} no disponible` : `Enviar a ${fiscalLabel}`}
                >
                  Enviar {fiscalLabel}
                </button>
                <button className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-50 hover:bg-cyan-400/15" onClick={() => onGre(doc)}>GRE</button>
                </div>
              </td>
            </tr>
          ))}
          {documents.length === 0 && (
            <tr className="bg-slate-950/50">
              <td className="p-8 text-center text-slate-400" colSpan={8}>
                No hay comprobantes
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
