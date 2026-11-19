/**
 * Departamentos de planta (lista oficial de mano de obra directa y de apoyo). Payroll solo distingue
 * "PRODUCCION" para casi toda la planta, así que el departamento sale de la línea de producción de STB.
 * El frontend repite esta lista en PLANT_DEPARTMENT_SECTIONS: si se cambia aquí, cambiarla allá.
 */
export const PLANT_DEPARTMENTS = [
  // Pelado Programada, Tercero y Anillo se muestran unidos en un solo renglón.
  '1.1 Descabezado', '1.2 Clasificado', '1.3 Pelado', '1.4 IQF', '1.5 Salmuera', '1.6 Recepción', '1.7 Cocinado',
  '1.8 Langosta', '1.9 Decoración Anillos', '1.10 Reempaque WSO',
  '2.1 Bodega, empaque, código', '2.2 Calidad, lavandería y POES', '2.3 RRHH, gestión ambiental y mantenimiento',
] as const;
export type PlantDepartment = typeof PLANT_DEPARTMENTS[number];
/** Línea o departamento de Payroll que no corresponde a ningún renglón de la lista (p. ej. Aux. Pesado y Chequeo, Administración). */
export const OTHER_DEPARTMENT = 'Otros (fuera de la lista)';
export const NO_DEPARTMENT = 'Sin departamento asignado';

const norm = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const [descabezado, clasificado, pelado, iqf, salmuera, recepcion, cocinado, langosta, decoracion, reempaque,
  empaque, calidad, rrhh] = PLANT_DEPARTMENTS;

/** Departamento según el proceso y la línea de producción de STB; null si la línea no está en la lista. */
export function departmentFromLine(process: string, line: string): PlantDepartment | null {
  const p = norm(process), l = norm(line);
  if (!p && !l) return null;
  if (/RRHH|GESTION AMBIENTAL|MANTENIMIENTO/.test(l) || p === 'GESTION AMBIENTAL' || p === 'MANTENIMIENTO') return rrhh;
  if (/CALIDAD|LAVANDERIA|POES/.test(l)) return calidad;
  if (p === 'EMPAQUE' || /MASTERIZADO|BODEGA|CODIGO Y ETIQUETA/.test(l)) return empaque;
  if (/REEMPAQUE/.test(l)) return reempaque;
  // Antes que Pelado e IQF: "Decoración/Perforación Anillo" no es Pelado Anillo.
  if (p === 'DECORACION ANILLOS' || /DECORACION|PERFORACION/.test(l)) return decoracion;
  if (p === 'IQF' || /IQF/.test(l)) return iqf;
  if (p === 'SALMUERA' || /SALMUERA/.test(l)) return salmuera;
  if (p === 'RECEPCION' || l === 'RECEPCION') return recepcion;
  if (p === 'COCINADO' || /COCINADO/.test(l)) return cocinado;
  if (p === 'LANGOSTA' || /LANGOSTA/.test(l)) return langosta;
  if (p === 'DESCABEZADO' || /DESCABEZ|DECABEZ/.test(l)) return descabezado;
  // Apoyo Cafetería y Apoyo a Contabilidad cuelgan del proceso Clasificado pero no son clasificado.
  if ((p === 'CLASIFICADO' && !/^APOYO/.test(l)) || /CLASIFICADO/.test(l)) return clasificado;
  if (p === 'PELADO' || /PELADO/.test(l)) return pelado;
  return null;
}

/** Respaldo con el departamento de Payroll, solo para los que identifican un renglón de apoyo. */
export function departmentFromPayroll(department: string): PlantDepartment | null {
  const d = norm(department);
  if (/BODEGA|MASTERIZADO|EXPORTACION/.test(d)) return empaque;
  if (/CALIDAD|LAVANDERIA|POES/.test(d)) return calidad;
  if (/RECURSOS HUMANOS|RRHH|GESTION AMBIENTAL|MANTENIMIENTO/.test(d)) return rrhh;
  return null;
}
