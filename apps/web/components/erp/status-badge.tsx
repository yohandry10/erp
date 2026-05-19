import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type StatusTone = "success" | "warning" | "danger" | "info" | "neutral"

const toneClasses: Record<StatusTone, string> = {
  success: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  warning: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  danger: "border-slate-300/25 bg-slate-300/10 text-slate-100",
  info: "border-blue-300/25 bg-blue-300/10 text-blue-100",
  neutral: "border-cyan-400/20 bg-slate-950/70 text-slate-200",
}

export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode
  tone?: StatusTone
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn(toneClasses[tone], className)}>
      {children}
    </Badge>
  )
}
