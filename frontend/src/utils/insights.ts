import { IqfRateRow, NetProcessRow } from '../types';
import { formatPeriodo, formatValue } from './format';

export interface Insight {
  text: string;
  severity: 'success' | 'info' | 'warning' | 'error';
}

interface InsightInput {
  procesos?: NetProcessRow[];
  diario?: IqfRateRow[];
  mensual?: IqfRateRow[];
}

/**
 * Promedio ponderado por número de grupos para un período: misma fórmula
 * de los Grand Total del reporte oficial "RENDIMIENTOS IQF X HORA".
 */
function promediosPorPeriodo(rows: IqfRateRow[]): Map<string, number> {
  const acc = new Map<string, { rateSum: number; grupos: number }>();
  for (const row of rows) {
    const a = acc.get(row.periodo) ?? { rateSum: 0, grupos: 0 };
    a.rateSum += row.librasPorHora * row.grupos;
    a.grupos += row.grupos;
    acc.set(row.periodo, a);
  }
  const result = new Map<string, number>();
  for (const [periodo, a] of acc) {
    if (a.grupos > 0) result.set(periodo, a.rateSum / a.grupos);
  }
  return result;
}

function promedioGlobal(rows: IqfRateRow[]): number | null {
  const grupos = rows.reduce((acc, r) => acc + r.grupos, 0);
  if (grupos === 0) return null;
  return rows.reduce((acc, r) => acc + r.librasPorHora * r.grupos, 0) / grupos;
}

/**
 * Observaciones gerenciales calculadas automáticamente a partir de los
 * mismos datos que alimentan los 3 reportes del dashboard.
 */
export function buildInsights({ procesos, diario, mensual }: InsightInput): Insight[] {
  const insights: Insight[] = [];

  if (procesos && procesos.length > 0) {
    const total = procesos.reduce((acc, p) => acc + p.libras, 0);
    insights.push({
      text: `Libras congeladas netas del período: ${formatValue(total)} lbs (sin FRESH TAIL ni reempaque).`,
      severity: 'info',
    });

    const top = [...procesos].sort((a, b) => b.libras - a.libras)[0];
    insights.push({
      text: `${top.proceso} lidera la producción con el ${top.porcentaje.toFixed(1)}% (${formatValue(top.libras)} lbs).`,
      severity: 'info',
    });
  }

  if (diario && diario.length > 0) {
    const promedio = promedioGlobal(diario);
    const horas = diario.reduce((acc, d) => acc + d.horas, 0);
    if (promedio !== null) {
      insights.push({
        text: `Rendimiento IQF promedio del período: ${formatValue(promedio, 'decimal')} lbs/hora en ${formatValue(horas, 'decimal')} horas trabajadas.`,
        severity: 'info',
      });
    }

    const porDia = promediosPorPeriodo(diario);
    const mejor = [...porDia.entries()].sort((a, b) => b[1] - a[1])[0];
    if (mejor) {
      insights.push({
        text: `Mejor día IQF: ${formatPeriodo(mejor[0])} con ${formatValue(mejor[1], 'decimal')} lbs/hora.`,
        severity: 'success',
      });
    }
  }

  if (mensual && mensual.length > 0) {
    const porMes = promediosPorPeriodo(mensual);
    const meses = [...porMes.keys()].sort();
    if (meses.length >= 2) {
      const actual = meses[meses.length - 1];
      const anterior = meses[meses.length - 2];
      const rateActual = porMes.get(actual)!;
      const rateAnterior = porMes.get(anterior)!;
      if (rateAnterior > 0) {
        const variacion = ((rateActual - rateAnterior) / rateAnterior) * 100;
        const signo = variacion >= 0 ? '+' : '';
        insights.push({
          text: `${formatPeriodo(actual)} va en ${formatValue(rateActual, 'decimal')} lbs/hora IQF: ${signo}${variacion.toFixed(1)}% vs ${formatPeriodo(anterior)} (${formatValue(rateAnterior, 'decimal')}).`,
          severity: variacion >= 0 ? 'success' : 'warning',
        });
      }
    }
  }

  return insights;
}
