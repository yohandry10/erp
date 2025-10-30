import * as React from "react"
import { cn } from "@/lib/utils"

const h2Styles = {
  base: {
    fontSize: "2rem",
    fontWeight: "800",
    color: "var(--primary-800)",
    margin: "0",
    position: "relative" as const,
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
}

export interface H2Props extends React.HTMLAttributes<HTMLHeadingElement> {}

const H2 = React.forwardRef<HTMLHeadingElement, H2Props>(
  ({ className, style, ...props }, ref) => (
    <h2
      ref={ref}
      className={className}
      style={{
        ...h2Styles.base,
        ...style,
      }}
      {...props}
    />
  )
)
H2.displayName = "H2"

export { H2 }

