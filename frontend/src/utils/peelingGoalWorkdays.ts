/** Días de lunes a sábado desde hoy (si es laborable) hasta el fin de mes.
 * Los valores corresponden a la fecha de Honduras; month es de 1 a 12.
 */
export function remainingPeelingGoalWorkdays(year: number, month: number, day: number): number {
  const cursor = new Date(Date.UTC(year, month - 1, day));
  let remaining = 0;
  while (cursor.getUTCFullYear() === year && cursor.getUTCMonth() === month - 1) {
    if (cursor.getUTCDay() !== 0) remaining += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return remaining;
}
