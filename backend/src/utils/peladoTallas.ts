/** Unifica el separador de los rangos sin modificar el catálogo de la BD. */
export function normalizarTalla(talla: string): string {
  return talla.trim().replace(/(\d)\s*[-–—/]\s*(?=\d)/g, '$1/');
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
