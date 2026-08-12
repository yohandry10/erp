'use client'

export interface GuiaModulo {
  /** Nombre de la pantalla, tal como la reconoce el usuario. */
  titulo: string
  /** Para qué sirve esta pantalla, en una o dos frases y sin jerga. */
  queEs: string
  /** Acciones concretas que la persona puede realizar aquí. */
  quePuedesHacer: string[]
  /** Qué otros módulos alimenta o de cuáles depende. Es lo que nadie adivina solo. */
  conectaCon: string[]
}
