import * as React from "react"
import { LucideIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type EmptyStateProps = {
  title: string
  description?: string
  icon?: LucideIcon
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <Card className={cn("border-dashed border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20", className)}>
      <CardContent className="flex flex-col items-center justify-center px-6 py-10 text-center">
        {Icon ? (
          <div className="mb-4 rounded-full border border-cyan-400/20 bg-cyan-400/10 p-3 text-primary">
            <Icon className="h-6 w-6" />
          </div>
        ) : null}
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {description ? (
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
        ) : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </CardContent>
    </Card>
  )
}
