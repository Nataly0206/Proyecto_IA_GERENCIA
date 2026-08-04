import { Permiso } from '../config/permissions';

export interface AuthUser {
  id: string;
  usuario: string;
  nombre: string;
  correo: string;
  esAdministrador: boolean;
  debeCambiarPassword: boolean;
  permisos: Permiso[];
  activo: boolean;
}

/**
 * Normaliza la respuesta del backend antes de usarla en el front: un
 * backend desplegado antes del sistema de permisos no manda `permisos`
 * ni `activo`, y sin este resguardo cualquier `user.permisos.includes(...)`
 * revienta en tiempo de ejecución (pantalla en blanco).
 */
export function normalizeAuthUser(user: AuthUser): AuthUser {
  return { ...user, permisos: user.permisos ?? [], activo: user.activo ?? true };
}
