import * as React from "react"
import { cn } from "@/lib/utils"

const inputStyles = {
  base: {
    width: "100%",
    padding: "1rem 1.25rem",
    border: "1px solid rgba(255, 255, 255, 0.3)",
    borderRadius: "var(--border-radius)",
    fontSize: "0.95rem",
    transition: "all 0.3s ease",
    background: "linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.1) 100%)",
    backdropFilter: "blur(10px)",
    color: "var(--primary-900)",
    outline: "none",
  },
  focus: {
    borderColor: "var(--blue-500)",
    boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.2)",
    background: "rgba(255, 255, 255, 0.3)",
  },
  disabled: {
    cursor: "not-allowed",
    opacity: "0.5",
  },
}

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, style, onFocus, onBlur, disabled, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false)

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true)
      onFocus?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false)
      onBlur?.(e)
    }

    const inputStyle = {
      ...inputStyles.base,
      ...(isFocused && inputStyles.focus),
      ...(disabled && inputStyles.disabled),
      ...style,
    }

    return (
      <input
        type={type}
        className={className}
        style={inputStyle}
        disabled={disabled}
        ref={ref}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input } 