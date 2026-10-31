import { Button } from '@/components/ui/button'

export default function FinanceReportStatus({ loading, retry }: { loading: boolean; retry: () => void }) {
  return <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground">
    {loading ? <p role="status">Cargando reporte financiero...</p> : <>
      <p role="alert">No se pudo consultar el reporte completo. Reintente para recuperar los datos actuales.</p>
      <Button type="button" onClick={retry} className="mt-4">Reintentar</Button>
    </>}
  </div>
}
