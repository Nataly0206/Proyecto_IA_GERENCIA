export const INVENTORY_FILTER_VERSION = 2;

const LEGACY_CLIENTS: Record<string, string> = {
  'FRANCIA DP': 'FRANCIA DP',
  'FRANCIA DP 2026 FRESCO': 'FRANCIA DP',
  'LABEYRIE FINE FOODS FRANCE': 'FRANCIA DP',
  'LFF UK': 'LFF UK',
  'LFF UK 2026 FRESCO': 'LFF UK',
  'LYONS SEAFOODS LTD': 'LFF UK',
};

// Migrate only the old default pair. Keep deliberate individual client filters,
// and mark new preferences so users can select that same pair explicitly later.
export function migrateInventoryFilters<T extends Partial<Record<string, string[]>>>(
  filters: T, version: unknown,
): T {
  if (version === INVENTORY_FILTER_VERSION) return filters;
  const clients = filters.nombreCliente;
  if (!clients || clients.length !== 2) return filters;
  const principals = clients.map(client => LEGACY_CLIENTS[client]);
  if (!principals.includes('FRANCIA DP') || !principals.includes('LFF UK')) return filters;
  const migrated = { ...filters };
  delete migrated.nombreCliente;
  if (!migrated.nombreClientePrincipal?.length) {
    Object.assign(migrated, { nombreClientePrincipal: ['FRANCIA DP', 'LFF UK'] });
  }
  return migrated;
}
