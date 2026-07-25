import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type StatusTone = "success" | "warning" | "danger" | "info" | "neutral"

const toneClasses: Record<StatusTone, string> = {
  success: "border-cyan-300/25 bg-cyan-300/10 text-primary",
  warning: "border-amber-300/25 bg-amber-300/10 text-amber-400 dark:text-amber-200",
  danger: "border-border/25 bg-slate-300/10 text-foreground",
  info: "border-blue-300/25 bg-blue-300/10 text-primary dark:text-blue-200",
  neutral: "border-cyan-400/20 bg-card/70 text-foreground/90",
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
