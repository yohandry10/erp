import * as React from "react"
import { LucideIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type MetricCardProps = {
  title: string
  value: React.ReactNode
  description?: React.ReactNode
  icon?: LucideIcon
  tone?: "default" | "success" | "warning" | "danger" | "info"
  className?: string
}

const toneClasses = {
  default: "border-slate-400/20 bg-slate-400/10 text-slate-100 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-slate-100 group-data-[erp-theme=light]/dashboard:text-slate-700",
  success: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100 group-data-[erp-theme=light]/dashboard:border-cyan-200 group-data-[erp-theme=light]/dashboard:bg-cyan-50 group-data-[erp-theme=light]/dashboard:text-cyan-700",
  warning: "border-amber-300/25 bg-amber-300/10 text-amber-100 group-data-[erp-theme=light]/dashboard:border-amber-200 group-data-[erp-theme=light]/dashboard:bg-amber-50 group-data-[erp-theme=light]/dashboard:text-amber-700",
  danger: "border-slate-300/25 bg-slate-300/10 text-slate-100 group-data-[erp-theme=light]/dashboard:border-slate-300 group-data-[erp-theme=light]/dashboard:bg-slate-100 group-data-[erp-theme=light]/dashboard:text-slate-700",
  info: "border-blue-300/25 bg-blue-300/10 text-blue-100 group-data-[erp-theme=light]/dashboard:border-blue-200 group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700",
}

export function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  tone = "default",
  className,
}: MetricCardProps) {
  return (
    <Card className={cn("overflow-hidden border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950 group-data-[erp-theme=light]/dashboard:shadow-slate-200/70", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70 group-data-[erp-theme=light]/dashboard:text-blue-700">
          {title}
        </CardTitle>
        {Icon ? (
          <span className={cn("rounded-xl border p-2", toneClasses[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-normal text-white group-data-[erp-theme=light]/dashboard:text-slate-950">
          {value}
        </div>
        {description ? (
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">
            {description}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
