import * as React from "react"
import { cn } from "@/lib/utils"

const cardStyles = {
  card: {
    background: "linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.1) 100%)",
    backdropFilter: "blur(20px) saturate(180%)",
    borderRadius: "var(--border-radius-lg)",
    border: "1px solid rgba(255, 255, 255, 0.3)",
    boxShadow: "var(--shadow-xl)",
    color: "var(--primary-800)",
  },
  header: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1.5rem",
    padding: "2rem",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: "700",
    lineHeight: "1.2",
    letterSpacing: "-0.025em",
    color: "var(--primary-900)",
    margin: "0",
  },
  description: {
    fontSize: "0.95rem",
    color: "var(--primary-600)",
    fontWeight: "500",
    margin: "0",
  },
  content: {
    padding: "2rem",
    paddingTop: "0",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    padding: "2rem",
    paddingTop: "0",
  },
}

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => (
  <div
    ref={ref}
    className={className}
    style={{
      ...cardStyles.card,
      ...style,
    }}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => (
  <div
    ref={ref}
    className={className}
    style={{
      ...cardStyles.header,
      ...style,
    }}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, style, ...props }, ref) => (
  <h3
    ref={ref}
    className={className}
    style={{
      ...cardStyles.title,
      ...style,
    }}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, style, ...props }, ref) => (
  <p
    ref={ref}
    className={className}
    style={{
      ...cardStyles.description,
      ...style,
    }}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => (
  <div
    ref={ref}
    className={className}
    style={{
      ...cardStyles.content,
      ...style,
    }}
    {...props}
  />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => (
  <div
    ref={ref}
    className={className}
    style={{
      ...cardStyles.footer,
      ...style,
    }}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } 