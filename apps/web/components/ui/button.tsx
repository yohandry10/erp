import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

const buttonStyles = {
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap" as const,
    borderRadius: "var(--border-radius)",
    fontSize: "0.95rem",
    fontWeight: "700",
    transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
    cursor: "pointer",
    border: "none",
    textDecoration: "none",
    gap: "0.75rem",
    letterSpacing: "-0.01em",
    outline: "none",
  },
  variants: {
    default: {
      background: "var(--gradient-primary)",
      color: "white",
      boxShadow: "var(--shadow-lg)",
    },
    destructive: {
      background: "var(--gradient-danger)",
      color: "white",
      boxShadow: "var(--shadow-lg)",
    },
    outline: {
      border: "1px solid rgba(255, 255, 255, 0.3)",
      background: "linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.1) 100%)",
      color: "var(--primary-800)",
      backdropFilter: "blur(10px)",
    },
    secondary: {
      background: "linear-gradient(135deg, var(--primary-100), var(--primary-200))",
      color: "var(--primary-800)",
      border: "1px solid var(--primary-300)",
      boxShadow: "var(--shadow-md)",
    },
    ghost: {
      background: "transparent",
      color: "var(--primary-700)",
    },
    link: {
      background: "transparent",
      color: "var(--blue-600)",
      textDecoration: "underline",
      textUnderlineOffset: "4px",
    },
  },
  sizes: {
    default: {
      padding: "1rem 2rem",
      height: "auto",
    },
    sm: {
      padding: "0.75rem 1.5rem",
      fontSize: "0.85rem",
      borderRadius: "var(--border-radius)",
    },
    lg: {
      padding: "1.25rem 2.5rem",
      fontSize: "1rem",
      borderRadius: "var(--border-radius)",
    },
    icon: {
      height: "2.5rem",
      width: "2.5rem",
      padding: "0",
    },
  },
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?: keyof typeof buttonStyles.variants
  size?: keyof typeof buttonStyles.sizes
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, style, onMouseEnter, onMouseLeave, ...props }, ref) => {
    const [isHovered, setIsHovered] = React.useState(false)
    
    const buttonStyle = {
      ...buttonStyles.base,
      ...buttonStyles.variants[variant],
      ...buttonStyles.sizes[size],
      ...(isHovered && variant === "default" && {
        transform: "translateY(-3px) scale(1.02)",
        boxShadow: "var(--shadow-2xl)",
      }),
      ...(isHovered && variant === "secondary" && {
        background: "linear-gradient(135deg, var(--primary-200), var(--primary-300))",
        transform: "translateY(-2px)",
        boxShadow: "var(--shadow-lg)",
      }),
      ...(isHovered && variant === "outline" && {
        background: "rgba(255, 255, 255, 0.3)",
        borderColor: "var(--blue-500)",
      }),
      ...(isHovered && variant === "ghost" && {
        background: "rgba(59, 130, 246, 0.05)",
      }),
      ...(isHovered && variant === "link" && {
        opacity: "0.8",
      }),
      ...style,
    }

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      setIsHovered(true)
      onMouseEnter?.(e)
    }

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      setIsHovered(false)
      onMouseLeave?.(e)
    }

    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={className}
        style={buttonStyle}
        ref={ref}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button } 