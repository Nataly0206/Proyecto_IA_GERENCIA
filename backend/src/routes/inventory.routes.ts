import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getInventory } from '../services/inventory.service';
import {
  getInventoryPreferences,
  InventoryPreferences,
  saveInventoryPreferences,
} from '../services/inventory-preferences.service';

import { planPreload, LoadLine, ITEM_FIELDS } from '../services/preload-planner';
import { listPreloads, savePreload, getPreload, updatePreload, listLoadEdits, deletePreload } from '../services/preload.service';

import { buildLoadReport, exportLoadReport } from '../services/load-report';

import { editCandidates, applyLoadEdit } from '../services/load-edit';

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

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validItemKey(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 5000) return false;
  try {
    const fields = JSON.parse(value);
    return Array.isArray(fields) && fields.length === ITEM_FIELDS.length && fields.every(field => typeof field === 'string' && field.length <= 500);
  } catch { return false; }
}

router.get('/preloads', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if ((from !== undefined && !validDate(from)) || (to !== undefined && !validDate(to)) || (typeof from === 'string' && typeof to === 'string' && from > to)) {
    res.status(400).json({ error: 'El rango de fechas de las cargas no es válido.' });
    return;
  }
  res.json({ requests: await listPreloads(from as string | undefined, to as string | undefined) });
}));

router.get('/preloads/:id/edit', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) { res.status(400).json({ error: 'Carga no válida.' }); return; }
  const load = await getPreload(id);
  if (!load) { res.status(404).json({ error: 'Carga no encontrada.' }); return; }
  res.json({ revision: load.revision, groups: editCandidates(load.items, await getInventory()), edits: await listLoadEdits(id) });
}));

router.put('/preloads/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { revision, lines, reason, notes } = req.body ?? {};
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647 || !Number.isSafeInteger(revision) || revision <= 0 || typeof reason !== 'string' || !reason.trim() || reason.length > 2000 || typeof notes !== 'string' || notes.length > 2000) {
    res.status(400).json({ error: 'Revisa el motivo, la referencia y los datos de la carga.' }); return;
  }
  const load = await getPreload(id);
  if (!load) { res.status(404).json({ error: 'Carga no encontrada.' }); return; }
  if (load.revision !== revision) { res.status(409).json({ error: 'Otra persona modificó esta carga. Cierra y vuelve a abrir la edición.' }); return; }
  const items = applyLoadEdit(load.items, await getInventory(), lines);
  const next = await updatePreload(id, revision, res.locals.authUser.id, reason.trim(), { notes: notes.trim(), filters: load.filters, items });
  if (!next) { res.status(409).json({ error: 'Otra persona modificó esta carga. Cierra y vuelve a abrir la edición.' }); return; }
  res.json({ revision: next });
}));

router.delete('/preloads/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id), revision = req.body?.revision;
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647 || !Number.isSafeInteger(revision) || revision <= 0) {
    res.status(400).json({ error: 'La carga o su revisión no es válida.' }); return;
  }
  if (!await getPreload(id)) { res.status(404).json({ error: 'Carga no encontrada.' }); return; }
  if (!await deletePreload(id, revision, res.locals.authUser.id)) {
    res.status(409).json({ error: 'La carga cambió. Actualiza el historial antes de eliminarla.' }); return;
  }
  res.json({ message: 'Carga eliminada. El registro y su historial se conservan.' });
}));

router.get('/preloads/:id/report', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647 || (req.query.unit !== undefined && req.query.unit !== 'lbs' && req.query.unit !== 'kg') || (req.query.format !== undefined && req.query.format !== 'pdf')) {
    res.status(400).json({ error: 'La carga o el formato no es válido.' }); return;
  }
  const load = await getPreload(id);
  if (!load) { res.status(404).json({ error: 'Carga no encontrada.' }); return; }
  const report = buildLoadReport(load.items, req.query.unit === 'kg' ? 'kg' : 'lbs');
  if (req.query.format === 'pdf') {
    const buffer = await exportLoadReport(report, id, load.createdAt);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Carga-${id}.pdf"`);
    res.send(Buffer.from(buffer)); return;
  }
  res.json(report);
}));

router.post('/preloads', asyncHandler(async (req, res) => {
  const { lines, filters, notes = '' } = req.body ?? {};
  if (!Array.isArray(lines) || !lines.length || lines.length > 500
    || lines.some(line => !line || !validItemKey(line.key) || !Number.isSafeInteger(line.quantity) || line.quantity <= 0)
    || new Set(lines.map(line => line.key)).size !== lines.length
    || typeof notes !== 'string' || notes.length > 2000
    || !filters || typeof filters !== 'object' || Array.isArray(filters)
    || Object.entries(filters).some(([key, values]) => !DIMENSIONS.has(key) || !Array.isArray(values) || values.length > 500 || values.some(value => typeof value !== 'string' || value.length > 500))) {
    res.status(400).json({ error: 'Revisa los ítems, cantidades y filtros de la solicitud.' });
    return;
  }
  const items = planPreload(await getInventory(), filters, lines as LoadLine[]);
  res.status(201).json({ request: await savePreload(res.locals.authUser.id, { notes: notes.trim(), filters, items }) });
}));

export default router;
