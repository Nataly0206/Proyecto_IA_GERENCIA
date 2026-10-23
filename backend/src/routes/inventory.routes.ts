import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getInventory } from '../services/inventory.service';
import {
  getInventoryPreferences,
  InventoryPreferences,
  saveInventoryPreferences,
} from '../services/inventory-preferences.service';

const router = Router();
const DIMENSIONS = new Set([
  'nombreCliente', 'nombreClientePrincipal', 'noOrdenCompra', 'codigoExterno',
  'fechaProduccion', 'codigoItem', 'estiloFinal', 'nombreItem', 'marca', 'talla',
  'empaque', 'tipoItem', 'disponibilidad',
]);

function parsePreferences(value: unknown): InventoryPreferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.rowFields) || input.rowFields.length === 0) return null;
  if (!input.rowFields.every((field) => typeof field === 'string' && DIMENSIONS.has(field))) return null;
  if (new Set(input.rowFields).size !== input.rowFields.length) return null;
  if (!input.filters || typeof input.filters !== 'object' || Array.isArray(input.filters)) return null;

  const filters: Record<string, string[]> = {};
  for (const [field, values] of Object.entries(input.filters)) {
    if (!DIMENSIONS.has(field) || !Array.isArray(values) || values.length > 500) return null;
    if (!values.every((item) => typeof item === 'string' && item.length <= 500)) return null;
    filters[field] = Array.from(new Set(values));
  }
  if (input.weightUnit !== undefined && input.weightUnit !== 'kg' && input.weightUnit !== 'lbs') return null;
  if (input.filterVersion !== undefined && input.filterVersion !== 2) return null;
  return { rowFields: input.rowFields as string[], filters, weightUnit: input.weightUnit === 'lbs' ? 'lbs' : 'kg',
    ...(input.filterVersion === 2 ? { filterVersion: 2 as const } : {}) };
}

router.get('/', asyncHandler(async (_req, res) => {
  res.json({ items: await getInventory() });
}));

router.get('/preferences', asyncHandler(async (_req, res) => {
  const preferences = await getInventoryPreferences(res.locals.authUser.id);
  res.json({ preferences });
}));

router.put('/preferences', asyncHandler(async (req, res) => {
  const preferences = parsePreferences(req.body);
  if (!preferences) {
    res.status(400).json({ error: 'Las preferencias de inventario no son válidas.' });
    return;
  }
  await saveInventoryPreferences(res.locals.authUser.id, preferences);
  res.json({ message: 'Preferencias de inventario guardadas.', preferences });
}));

export default router;
