/**
 * Catálogo de permisos asignables a un usuario. Debe reflejar
 * exactamente `backend/src/types/permissions.ts` (PERMISOS). Un
 * usuario con `esAdministrador = true` tiene acceso a todo sin
 * importar esta lista.
 */
export const PERMISOS = ['usuarios', 'iqf', 'pelado', 'asistente_ia'] as const;

export type Permiso = (typeof PERMISOS)[number];

export const PERMISO_LABELS: Record<Permiso, string> = {
  usuarios: 'Usuarios',
  iqf: 'IQF',
  pelado: 'Pelado',
  asistente_ia: 'Asistente IA',
};

export function tienePermiso(
  user: { esAdministrador: boolean; permisos: Permiso[] } | null | undefined,
  permiso: Permiso,
): boolean {
  if (!user) return false;
  return user.esAdministrador || user.permisos.includes(permiso);
}
