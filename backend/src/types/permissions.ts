/**
 * Catálogo de permisos asignables a un usuario (independientes del bit
 * `es_administrador`, que sigue siendo un superusuario implícito con
 * acceso a todo y no se otorga desde la UI). Cada vista nueva del
 * dashboard debe agregar su clave aquí para poder gatearse.
 */
export const PERMISOS = [
  'compra_materia_prima',
  'recepcion',
  'descabezado',
  'clasificado',
  'pelado',
  'iqf',
  'exportaciones',
  'inventario',
  'usuarios',
  'asistente_ia',
  'detalles_desarrollador',
] as const;

export type Permiso = (typeof PERMISOS)[number];

export function esPermisoValido(valor: unknown): valor is Permiso {
  return typeof valor === 'string' && (PERMISOS as readonly string[]).includes(valor);
}
