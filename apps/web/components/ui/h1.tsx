import * as React from "react"
import { cn } from "@/lib/utils"

export interface H1Props extends React.HTMLAttributes<HTMLHeadingElement> {}

const H1 = React.forwardRef<HTMLHeadingElement, H1Props>(
  ({ className, ...props }, ref) => (
    <h1
      ref={ref}
      className={cn(
        "m-0 mb-3 bg-gradient-to-r from-blue-800 via-blue-500 to-cyan-500 bg-clip-text text-[3.5rem] font-black leading-[1.1] text-transparent",
        className,
      )}
      {...props}
    />
  )
)
H1.displayName = "H1"

export { H1 }

