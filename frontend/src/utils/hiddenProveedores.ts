import { Dispatch, SetStateAction, useEffect, useState } from 'react';

const STORAGE_KEY = 'compra-mp-proveedores-wso-entero-ocultos:v1';

function readHidden(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${userId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Proveedores ocultos en "Materia Prima por Proveedor — WSO y Entero",
 * compartidos entre las cards y el detalle por talla para que ambos
 * respeten la misma selección del usuario.
 */
export function useHiddenProveedores(userId: string): [Set<string>, Dispatch<SetStateAction<Set<string>>>] {
  const [hidden, setHidden] = useState<Set<string>>(() => readHidden(userId));

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(Array.from(hidden)));
    } catch {
      // La selección continúa funcionando durante la sesión si el almacenamiento está bloqueado.
    }
  }, [hidden, userId]);

  return [hidden, setHidden];
}
