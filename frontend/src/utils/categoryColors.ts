import { CHART_COLORS } from '../theme';

/** Color estable por nombre: la misma categoría conserva el color aunque cambie el orden. */
export function categoryColor(label: string, palette = CHART_COLORS): string {
  let hash = 0;
  for (const char of label.trim().toLocaleUpperCase()) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}
