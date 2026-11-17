/** Unifica separadores y agrupa 61/70 Alto, Normal y Bajo sin modificar la BD. */
export function normalizarTalla(talla: string): string {
  const nombre = talla.trim().replace(/(\d)\s*[-–—/]\s*(?=\d)/g, '$1/');
  return /^61\/70(?:\s+(?:ALTO|NORMAL|BAJO))?$/i.test(nombre) ? '61/70' : nombre;
}

/** Tallas con más libras; conserva todos los rangos empatados. */
export function tallaMasPelada(tallas: { talla: string; libras: number }[]): string | null {
  const acumulado = new Map<string, number>();
  for (const { talla, libras } of tallas) {
    const nombre = normalizarTalla(talla);
    if (!nombre || /^sin\s*talla$/i.test(nombre) || !Number.isFinite(libras) || libras <= 0) continue;
    acumulado.set(nombre, (acumulado.get(nombre) ?? 0) + libras);
  }
  const maximo = Math.max(0, ...acumulado.values());
  return [...acumulado].filter(([, libras]) => libras === maximo)
    .map(([talla]) => talla).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).join(' · ') || null;
}
