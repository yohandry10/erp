import * as React from "react"
import { cn } from "@/lib/utils"

const h1Styles = {
  base: {
    fontSize: "3.5rem",
    fontWeight: "900",
    background: "var(--gradient-primary)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    marginBottom: "0.75rem",
    letterSpacing: "-0.05em",
    lineHeight: "1.1",
    margin: "0",
  },
}

export interface H1Props extends React.HTMLAttributes<HTMLHeadingElement> {}

const H1 = React.forwardRef<HTMLHeadingElement, H1Props>(
  ({ className, style, ...props }, ref) => (
    <h1
      ref={ref}
      className={className}
      style={{
        ...h1Styles.base,
        ...style,
      }}
      {...props}
    />
  )
)
H1.displayName = "H1"

export { H1 }

