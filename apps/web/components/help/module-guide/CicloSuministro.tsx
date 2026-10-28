'use client'

import { useState } from 'react'
import Link from 'next/link'

type Paso = { texto: string; ruta: string; pantalla: string }
type Funcion = { perfil: string; rol: string; pasos: Paso[] }

/**
 * Capacitación por función del ciclo de suministro: qué hace cada perfil y en
 * qué pantalla, en el orden en que ocurre. Los perfiles coinciden con los roles
 * del sistema, así que lo que se enseña es lo que cada persona puede hacer.
 */
const FUNCIONES: Funcion[] = [
  {
    perfil: 'Responsable de suministro',
    rol: 'SUMINISTRO',
    pasos: [
      { texto: 'Registrar el contrato con sus líneas y activarlo', ruta: '/dashboard/ventas/contratos', pantalla: 'Contratos' },
      { texto: 'Registrar cada OC del cliente y programar sus entregas', ruta: '/dashboard/ventas/contratos', pantalla: 'Contratos' },
      { texto: 'Vincular el pedido de cada entrega para despacharla', ruta: '/dashboard/ventas/contratos', pantalla: 'Contratos' },
      { texto: 'Revisar el estado de cuenta y la base de facturación', ruta: '/dashboard/ventas/contratos', pantalla: 'Contratos' },
      { texto: 'Configurar reglas de penalidad y calcular al corte', ruta: '/dashboard/ventas/contratos', pantalla: 'Contratos' },
      { texto: 'Configurar y atender alertas', ruta: '/dashboard/alertas', pantalla: 'Alertas' },
      { texto: 'Seguir el tablero y exportar el corte', ruta: '/dashboard/tablero-suministro', pantalla: 'Tablero' },
    ],
  },
  {
    perfil: 'Almacén',
    rol: 'ALMACEN',
    pasos: [
      { texto: 'Recibir mercadería con lote y vencimiento', ruta: '/dashboard/inventario/recepciones', pantalla: 'Recepciones' },
      { texto: 'Despachar el pedido; los lotes se asignan por vencimiento', ruta: '/dashboard/inventario/logistica/listo-despacho', pantalla: 'Listo para despacho' },
      { texto: 'Registrar la recepción del cliente con su acta', ruta: '/dashboard/ventas/contratos', pantalla: 'Contratos' },
      { texto: 'Revisar lotes por vencer y regularizar', ruta: '/dashboard/inventario/lotes', pantalla: 'Lotes' },
    ],
  },
  {
    perfil: 'Finanzas',
    rol: 'FINANZAS',
    pasos: [
      { texto: 'Facturar el pedido; contra conformidad, sólo con aceptación total', ruta: '/dashboard/ventas/pedidos', pantalla: 'Pedidos' },
      { texto: 'Registrar cobros y notas de crédito', ruta: '/dashboard/finanzas/cxc', pantalla: 'Cuentas por cobrar' },
      { texto: 'Conciliar el estado de cuenta del contrato', ruta: '/dashboard/ventas/contratos', pantalla: 'Contratos' },
    ],
  },
  {
    perfil: 'Gerencia',
    rol: 'GERENCIA',
    pasos: [
      { texto: 'Aprobar, observar o descartar penalidades calculadas por otra persona', ruta: '/dashboard/ventas/contratos', pantalla: 'Contratos' },
      { texto: 'Seguir los indicadores y abrir su detalle', ruta: '/dashboard/tablero-suministro', pantalla: 'Tablero' },
      { texto: 'Atender las alertas escaladas', ruta: '/dashboard/alertas', pantalla: 'Alertas' },
    ],
  },
  {
    perfil: 'Administrador',
    rol: 'ADMIN',
    pasos: [
      { texto: 'Asignar a cada persona su perfil', ruta: '/dashboard/usuarios', pantalla: 'Usuarios' },
      { texto: 'Ensayar, importar y conciliar la migración desde FOX', ruta: '/dashboard/migracion-fox', pantalla: 'Migración FOX' },
      { texto: 'Emitir y revocar credenciales de Power BI', ruta: '/dashboard/tablero-suministro', pantalla: 'Tablero' },
    ],
  },
]

export function CicloSuministro() {
  const [abierto, setAbierto] = useState<string>(FUNCIONES[0].rol)
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Perfiles" className="flex flex-wrap gap-2">
        {FUNCIONES.map((f) => (
          <button
            key={f.rol}
            type="button"
            role="tab"
            aria-selected={abierto === f.rol}
            onClick={() => setAbierto(f.rol)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              abierto === f.rol
                ? 'border-primary bg-primary/10 font-medium'
                : 'border-cyan-400/15 hover:bg-cyan-400/5 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:hover:bg-muted/40'
            }`}
          >
            {f.perfil}
          </button>
        ))}
      </div>
      {FUNCIONES.filter((f) => f.rol === abierto).map((f) => (
        <div key={f.rol} role="tabpanel" aria-label={f.perfil}>
          <p className="m-0 mb-2 text-xs text-muted-foreground">
            Perfil del sistema: <span className="font-mono">{f.rol}</span>
          </p>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {f.pasos.map((p, i) => (
              <li
                key={`${f.rol}-${i}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-cyan-400/15 bg-card/50 px-3 py-2 text-sm group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30"
              >
                <span>
                  <span className="mr-2 font-semibold tabular-nums text-muted-foreground">{i + 1}.</span>
                  {p.texto}
                </span>
                <Link href={p.ruta} className="text-xs font-medium text-primary underline-offset-2 hover:underline">
                  {p.pantalla}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
