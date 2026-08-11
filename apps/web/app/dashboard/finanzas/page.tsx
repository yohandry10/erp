import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Building2,
  Landmark,
  FileText,
  Scale,
  WalletCards,
} from "lucide-react";

const financialSurfaces = [
  {
    title: "Cuentas por cobrar",
    description:
      "Saldos de clientes, vencimientos, cobranzas y trazabilidad documental.",
    href: "/dashboard/finanzas/cxc",
    icon: ArrowDownLeft,
  },
  {
    title: "Cuentas por pagar",
    description:
      "Obligaciones con proveedores, vencimientos y pagos asociados.",
    href: "/dashboard/finanzas/cxp",
    icon: ArrowUpRight,
  },
  {
    title: "Cuentas bancarias",
    description: "Bancos, monedas, saldos y movimientos por cuenta financiera.",
    href: "/dashboard/finanzas/bancos",
    icon: Landmark,
  },
  {
    title: "Ajustes fiscales y anticipos",
    description:
      "Retenciones, percepciones, detracciones y anticipos enlazados a CxC, CxP y bancos.",
    href: "/dashboard/finanzas/ajustes-fiscales",
    icon: FileText,
  },
  {
    title: "Tesorería",
    description: "Programación, lotes de pago y proyección de flujo de caja.",
    href: "/dashboard/finanzas/tesoreria",
    icon: WalletCards,
  },
  {
    title: "Conciliación bancaria",
    description:
      "Cruce de extractos y movimientos internos con diferencias auditables.",
    href: "/dashboard/finanzas/conciliacion",
    icon: Scale,
  },
  {
    title: "Reportes financieros",
    description:
      "Posición de caja, vencimientos y controles para la revisión contable.",
    href: "/dashboard/finanzas/reportes",
    icon: BarChart3,
  },
] as const;

export default function FinanzasPage() {
  return (
    <div className="min-h-full bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="rounded-3xl border border-cyan-400/20 bg-card/80 p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-primary">
              <Building2 className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                ERP Finance Center
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">
                Finanzas y tesorería
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Acceso central a cobranzas, pagos, bancos, conciliación y
                reportes conectados con Contabilidad.
              </p>
            </div>
          </div>
        </header>

        <section aria-labelledby="financial-surfaces-heading">
          <div className="mb-4">
            <h2 id="financial-surfaces-heading" className="text-lg font-bold">
              Flujos financieros principales
            </h2>
            <p className="text-sm text-muted-foreground">
              Cada operación conserva su documento, contraparte y asiento de
              origen.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {financialSurfaces.map(
              ({ title, description, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="group min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-400/40 hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-foreground group-hover:text-primary">
                        {title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </div>
                </Link>
              ),
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
