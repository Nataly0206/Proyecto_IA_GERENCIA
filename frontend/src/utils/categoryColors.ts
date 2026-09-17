import { CHART_COLORS } from '../theme';

/** Colores fijos para proveedores operativos: distintos y compartidos entre vistas. */
const PROVIDER_COLORS: Record<string, string> = {
  COEXMAR: '#f97316',
  RIVERMAR: '#2563eb',
  CACESA: '#7c3aed',
  ICASUR: '#dc2626',
  'RECHAZO PROGRAMA 2024': '#059669',
};

function normalize(label: string): string {
  return label.trim().toLocaleUpperCase();
}

/**
 * Color estable por nombre. Los proveedores conocidos tienen colores únicos
 * explícitos; cualquier categoría nueva recibe un HSL derivado del nombre,
 * evitando la repetición causada por reducir el hash a una paleta corta.
 */
export function categoryColor(label: string, palette = CHART_COLORS): string {
  void palette;
  const normalized = normalize(label);
  if (PROVIDER_COLORS[normalized]) return PROVIDER_COLORS[normalized];

  let hash = 2166136261;
  for (const char of normalized) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  const hue = unsigned % 360;
  const saturation = 62 + ((unsigned >>> 9) % 18);
  const lightness = 38 + ((unsigned >>> 17) % 10);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}
