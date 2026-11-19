import { normalizarTalla } from './peladoTallas';
import type { PeladoTallaRow } from '../types/dashboard.types';

export interface PeelingPersonSize {
  talla: string; id: number; libras: number; horas: number; sinHoras: number;
}
type Person = { libras: number; horas: number; sinHoras: number };

/** Horas-persona registradas en TRABAJADOS, sin multiplicarlas nuevamente por el personal. */
export function peelingSizePerformance(records: PeelingPersonSize[]): PeladoTallaRow[] {
  const sizes = new Map<string, Map<number, Person>>();
  const plant = new Map<number, Person>();
  // Planta conciliada: por persona, solo sus tallas con horas que cuadran (no se descarta a la persona entera).
  const plantReconciled = new Map<number, Person>();
  const add = (people: Map<number, Person>, row: PeelingPersonSize) => {
    const value = people.get(row.id) ?? { libras: 0, horas: 0, sinHoras: 0 };
    value.libras += row.libras; value.horas += row.horas; value.sinHoras += row.sinHoras;
    people.set(row.id, value);
  };
  for (const row of records) {
    if (row.id <= 0 || !Number.isFinite(row.libras) || row.libras <= 0) continue;
    const talla = normalizarTalla(row.talla || 'Sin talla');
    const people = sizes.get(talla) ?? new Map<number, Person>();
    add(people, row); sizes.set(talla, people); add(plant, row);
    if (!row.sinHoras && row.horas > 0) add(plantReconciled, row);
  }
  const summarize = (people: Map<number, Person>) => {
    const values = [...people.values()];
    const libras = values.reduce((sum, row) => sum + row.libras, 0);
    // Solo personas cuyas libras de pagos cuadran con las pesadas: sus horas TRABAJADOS son confiables.
    // Las demás no entran ni en libras ni en horas, así el rendimiento no se infla.
    const reconciled = values.filter(row => !row.sinHoras && row.horas > 0);
    const librasConHoras = reconciled.reduce((sum, row) => sum + row.libras, 0);
    const horas = reconciled.reduce((sum, row) => sum + row.horas, 0);
    const complete = reconciled.length === values.length;
    const rendimiento = horas > 0 ? librasConHoras / horas : null;
    // Solo agregados anónimos: no se envían IDs ni nombres al navegador.
    const rendimientosPersonas = values.filter(row => !row.sinHoras && row.horas > 0)
      .map(row => ({ libras: row.libras, horas: row.horas, rendimiento: row.libras / row.horas }))
      .sort((a, b) => b.rendimiento - a.rendimiento || b.libras - a.libras);
    return { libras, librasConHoras, horas, rendimiento, complete, rendimientosPersonas };
  };
  const total = summarize(plant);
  const totalReconciled = summarize(plantReconciled);
  return [...sizes].map(([talla, people]) => {
    const row = summarize(people);
    return {
      talla, libras: row.libras, porcentaje: total.libras > 0 ? row.libras / total.libras * 100 : 0,
      personas: people.size, horasPelado: row.complete ? row.horas : null,
      librasConHoras: row.librasConHoras, horasPersona: row.horas,
      librasHoraPersona: row.rendimiento, personasPlanta: plant.size,
      horasPeladoPlanta: total.complete ? total.horas : null,
      librasHoraPersonaPlanta: totalReconciled.rendimiento,
      rendimientosPersonas: row.rendimientosPersonas,
      rendimientosPersonasPlanta: totalReconciled.rendimientosPersonas,
    };
  }).sort((a, b) => b.libras - a.libras);
}
