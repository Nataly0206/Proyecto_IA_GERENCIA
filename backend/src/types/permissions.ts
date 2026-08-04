/**
 * Catálogo de permisos asignables a un usuario (independientes del bit
 * `es_administrador`, que sigue siendo un superusuario implícito con
 * acceso a todo y no se otorga desde la UI). Cada vista nueva del
 * dashboard debe agregar su clave aquí para poder gatearse.
 */
export const PERMISOS = ['usuarios', 'iqf', 'pelado', 'asistente_ia'] as const;

export type Permiso = (typeof PERMISOS)[number];

export function esPermisoValido(valor: unknown): valor is Permiso {
  return typeof valor === 'string' && (PERMISOS as readonly string[]).includes(valor);
}
