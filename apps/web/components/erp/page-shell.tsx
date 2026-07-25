import * as React from "react"

import { cn } from "@/lib/utils"

type PageShellProps = {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function PageShell({
  title,
  description,
  actions,
  children,
  className,
}: PageShellProps) {
  return (
    <main
      className={cn(
        "mx-auto w-full max-w-[1600px] space-y-5 p-4 text-foreground group-data-[erp-theme=light]/dashboard:text-foreground md:p-6",
        className,
      )}
    >
      <header className="rounded-3xl border border-cyan-400/20 bg-card/80 p-5 shadow-2xl shadow-blue-950/30 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-white/90 group-data-[erp-theme=light]/dashboard:shadow-slate-200/70">
        <div className="flex flex-col gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-normal text-white group-data-[erp-theme=light]/dashboard:text-foreground md:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80 md:text-base">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="w-full">{actions}</div> : null}
        </div>
      </header>
      {children}
    </main>
  )
}
