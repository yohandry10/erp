import { Skeleton } from "@/components/ui/skeleton"

export function PageLoadingState({ label = "Cargando datos..." }: { label?: string }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <div className="rounded-2xl border border-cyan-400/20 bg-slate-950/65 p-6 shadow-xl shadow-blue-950/20">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-6 h-56 w-full" />
        <p className="mt-4 text-sm text-slate-300">{label}</p>
      </div>
    </div>
  )
}
