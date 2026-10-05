import type { IqfShiftComparison } from '../types';

export function iqfShiftMetrics(turno: IqfShiftComparison) {
  // Activo en este turno significa que tuvo producción, aunque ahora esté detenido.
  const activos = turno.lineas.filter((linea) => linea.libras > 0);
  const completo = activos.length > 0 && activos.every((linea) => linea.librasPorHora !== null);
  const sumatoria = completo
    ? activos.reduce((sum, linea) => sum + (linea.librasPorHora ?? 0), 0)
    : null;
  return {
    turno: turno.turno,
    equipos: activos.length,
    sumatoria,
    promedio: sumatoria === null ? null : sumatoria / activos.length,
  };
}

export function compareIqfShifts(turnos: IqfShiftComparison[]) {
  const a = turnos.find((turno) => turno.turno === 'A');
  const b = turnos.find((turno) => turno.turno === 'B');
  if (!a || !b) return null;
  const promedioA = iqfShiftMetrics(a).promedio;
  const promedioB = iqfShiftMetrics(b).promedio;
  if (promedioA === null || promedioB === null) return null;
  if (promedioA === promedioB) return { mayor: null, menor: null, porcentaje: 0 };
  const mayor = promedioA > promedioB ? 'A' : 'B';
  const menor = mayor === 'A' ? 'B' : 'A';
  const base = Math.min(promedioA, promedioB);
  return {
    mayor,
    menor,
    porcentaje: base > 0 ? (Math.max(promedioA, promedioB) - base) / base * 100 : null,
  };
}
