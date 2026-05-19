import * as React from "react"
import { cn } from "@/lib/utils"

export interface H2Props extends React.HTMLAttributes<HTMLHeadingElement> {}

const H2 = React.forwardRef<HTMLHeadingElement, H2Props>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn("relative m-0 flex items-center gap-3 text-3xl font-extrabold text-slate-800", className)}
      {...props}
    />
  )
)
H2.displayName = "H2"

export { H2 }

