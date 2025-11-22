'use client'

interface CpeDocument {
  id: string
  tipoComprobante: string
  serie: string
  numero: number
  fechaEmision: string
  cliente: string
  clienteRuc: string
  total: number
  moneda: string
  estado: 'BORRADOR' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO'
  estadoSunat?: string
  observaciones?: string
  fechaCreacion: string
}

interface Props {
  documents: CpeDocument[]
  onView: (id: string, tipo: string) => void
  onSend: (id: string) => void
  onGre: (doc: CpeDocument) => void
}

const estadoColor: Record<string, string> = {
  ACEPTADO: 'bg-emerald-600',
  ENVIADO: 'bg-amber-500',
  RECHAZADO: 'bg-red-600',
  BORRADOR: 'bg-slate-500',
}

export function ComprobantesTable({ documents, onView, onSend, onGre }: Props) {
  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="p-2">Tipo</th>
            <th className="p-2">Serie</th>
            <th className="p-2">Número</th>
            <th className="p-2">Fecha</th>
            <th className="p-2">Cliente</th>
            <th className="p-2">Total</th>
            <th className="p-2">Estado</th>
            <th className="p-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id} className="border-b hover:bg-slate-50">
              <td className="p-2">{doc.tipoComprobante}</td>
              <td className="p-2">{doc.serie}</td>
              <td className="p-2">{doc.numero}</td>
              <td className="p-2">{doc.fechaEmision}</td>
              <td className="p-2">
                <div className="flex flex-col">
                  <span>{doc.cliente}</span>
                  <span className="text-xs text-slate-500">{doc.clienteRuc}</span>
                </div>
              </td>
              <td className="p-2">
                {doc.moneda} {Number(doc.total).toFixed(2)}
              </td>
              <td className="p-2">
                <span className={`px-2 py-1 text-xs text-white rounded ${estadoColor[doc.estado] || 'bg-slate-500'}`}>
                  {doc.estado}
                </span>
              </td>
              <td className="p-2 space-x-2">
                <button className="btn btn-xs" onClick={() => onView(doc.id, doc.tipoComprobante)}>Ver</button>
                <button className="btn btn-xs" onClick={() => onSend(doc.id)}>Enviar SUNAT</button>
                <button className="btn btn-xs" onClick={() => onGre(doc)}>GRE</button>
              </td>
            </tr>
          ))}
          {documents.length === 0 && (
            <tr>
              <td className="p-4 text-center text-slate-500" colSpan={8}>
                No hay comprobantes
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
