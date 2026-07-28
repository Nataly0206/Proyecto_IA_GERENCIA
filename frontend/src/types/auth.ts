export interface AuthUser {
  id: string;
  usuario: string;
  nombre: string;
  correo: string;
  esAdministrador: boolean;
  debeCambiarPassword: boolean;
}
