import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cn } from "@/lib/utils"

const labelStyles = {
  base: {
    display: "block",
    marginBottom: "0.75rem",
    fontWeight: "700",
    color: "var(--primary-800)",
    fontSize: "0.9rem",
    lineHeight: "1.2",
    cursor: "pointer",
  },
  disabled: {
    cursor: "not-allowed",
    opacity: "0.7",
  },
}

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, style, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={className}
    style={{
      ...labelStyles.base,
      ...style,
    }}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label } 