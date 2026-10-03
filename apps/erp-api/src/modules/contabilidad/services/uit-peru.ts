import { BadRequestException } from '@nestjs/common';

// DS 309-2023-EF, 260-2024-EF y 301-2025-EF. La UIT corresponde al ejercicio,
// incluso cuando se calcula o rectifica un período anterior durante otro año.
const UIT_POR_EJERCICIO: Readonly<Record<number, number>> = Object.freeze({
  2024: 5150,
  2025: 5350,
  2026: 5500,
});

export function uitPeruPorEjercicio(ejercicio: number): number {
  const uit = UIT_POR_EJERCICIO[ejercicio];
  if (!uit) {
    throw new BadRequestException(`No hay UIT verificada para el ejercicio ${ejercicio}.`);
  }
  return uit;
}
