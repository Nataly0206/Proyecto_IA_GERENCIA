import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { apiClient } from '../api/client';

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
  const [preferencesUserId, setPreferencesUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPreferencesUserId(null);
    apiClient.get<{ hiddenProviders: string[] | null }>('/dashboard/compra-mp-preferencias-proveedores')
      .then(({ data }) => {
        if (!active) return;
        setHidden(Array.isArray(data.hiddenProviders) ? new Set(data.hiddenProviders) : readHidden(userId));
        setPreferencesUserId(userId);
      })
      .catch(() => {
        if (active) setHidden(readHidden(userId));
      });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(Array.from(hidden)));
    } catch {
      // La selección continúa funcionando durante la sesión si el almacenamiento está bloqueado.
    }
  }, [hidden, userId]);

  useEffect(() => {
    if (preferencesUserId !== userId) return;
    const timeout = window.setTimeout(() => {
      void apiClient.put('/dashboard/compra-mp-preferencias-proveedores', {
        hiddenProviders: Array.from(hidden),
      }).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [hidden, preferencesUserId, userId]);

  return [hidden, setHidden];
}
