import { Fragment, ReactNode, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  IconButton,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { DashboardEndpoint } from '../../types';
import { useWidgetData } from '../../hooks/useDashboardData';
import { formatValue } from '../../utils/format';

interface GroupedItemsTableProps {
  title: string;
  icon: ReactNode;
  endpoint: DashboardEndpoint;
  subtitle?: string;
  emptyText?: string;
  maxHeight?: number;
}

interface ItemNode {
  item: string;
  pesoLibras: number;
  cantidadSerial: number;
}
interface ProveedorNode {
  proveedor: string;
  pesoLibras: number;
  cantidadSerial: number;
  items: ItemNode[];
}
interface TipoNode {
  tipo: string;
  pesoLibras: number;
  cantidadSerial: number;
  proveedores: ProveedorNode[];
}

const HEADER_SX = { fontWeight: 800, bgcolor: '#f1f5f9', color: '#172033' } as const;
const TOTAL_SX = { fontWeight: 800, bgcolor: '#f8fafc' } as const;

function buildTree(rows: { tipo: string; proveedor: string; item: string; pesoLibras: number; cantidadSerial: number }[]): TipoNode[] {
  const tipos = new Map<string, Map<string, ItemNode[]>>();
  for (const r of rows) {
    const proveedores = tipos.get(r.tipo) ?? new Map<string, ItemNode[]>();
    tipos.set(r.tipo, proveedores);
    const items = proveedores.get(r.proveedor) ?? [];
    proveedores.set(r.proveedor, items);
    items.push({ item: r.item, pesoLibras: r.pesoLibras, cantidadSerial: r.cantidadSerial });
  }
  const sum = (items: ItemNode[], key: 'pesoLibras' | 'cantidadSerial') =>
    items.reduce((acc, i) => acc + i[key], 0);
  return Array.from(tipos.entries())
    .map(([tipo, proveedores]): TipoNode => {
      const proveedorNodes = Array.from(proveedores.entries())
        .map(([proveedor, items]): ProveedorNode => {
          const sorted = [...items].sort((a, b) => a.item.localeCompare(b.item));
          return {
            proveedor,
            items: sorted,
            pesoLibras: sum(sorted, 'pesoLibras'),
            cantidadSerial: sum(sorted, 'cantidadSerial'),
          };
        })
        .sort((a, b) => a.proveedor.localeCompare(b.proveedor));
      const allItems = proveedorNodes.flatMap((p) => p.items);
      return {
        tipo,
        proveedores: proveedorNodes,
        pesoLibras: sum(allItems, 'pesoLibras'),
        cantidadSerial: sum(allItems, 'cantidadSerial'),
      };
    })
    .sort((a, b) => a.tipo.localeCompare(b.tipo));
}

/**
 * Tabla agrupada Tipo → Proveedor → Item (expandible/colapsable), con
 * subtotal por proveedor y total general — reproduce la tabla dinámica de
 * Excel/Power BI que ya usa el cliente para materia prima. A diferencia de
 * `PivotTable` (fecha × categoría) o `WidgetDataTable` (lista plana), esta
 * es una jerarquía de 3 niveles con filas de subtotal intercaladas.
 */
export default function GroupedItemsTable({
  title,
  icon,
  endpoint,
  subtitle,
  emptyText = 'Sin datos para los filtros seleccionados.',
  maxHeight = 460,
}: GroupedItemsTableProps) {
  const { data, isLoading, isError, error, dataUpdatedAt } = useWidgetData(endpoint);
  const [collapsedTipos, setCollapsedTipos] = useState<Set<string>>(new Set());
  const [collapsedProveedores, setCollapsedProveedores] = useState<Set<string>>(new Set());

  const tree = useMemo(
    () => buildTree((data ?? []) as { tipo: string; proveedor: string; item: string; pesoLibras: number; cantidadSerial: number }[]),
    [data],
  );
  const grandTotal = useMemo(
    () => ({
      pesoLibras: tree.reduce((acc, t) => acc + t.pesoLibras, 0),
      cantidadSerial: tree.reduce((acc, t) => acc + t.cantidadSerial, 0),
    }),
    [tree],
  );

  const toggleTipo = (tipo: string) =>
    setCollapsedTipos((prev) => {
      const next = new Set(prev);
      if (next.has(tipo)) next.delete(tipo); else next.add(tipo);
      return next;
    });
  const toggleProveedor = (key: string) =>
    setCollapsedProveedores((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.75} mb={0.9} flexWrap="wrap" useFlexGap>
        {icon}
        <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
            {subtitle}
            {dataUpdatedAt ? ` · actualizado ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ''}
          </Typography>
        )}
      </Stack>

      {isLoading && <Skeleton variant="rounded" height={260} />}

      {isError && (
        <Alert severity="error" sx={{ py: 0.5 }}>
          Error al cargar datos: {error instanceof Error ? error.message : 'desconocido'}
        </Alert>
      )}

      {!isLoading && !isError && tree.length === 0 && (
        <Alert severity="info" sx={{ py: 0.5 }}>
          {emptyText}
        </Alert>
      )}

      {!isLoading && !isError && tree.length > 0 && (
        <TableContainer sx={{ maxHeight, borderRadius: 1, border: '1px solid rgba(148, 163, 184, 0.18)' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={HEADER_SX}>Tipo / Proveedor / Item</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Peso Libras</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Cantidad Serial</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tree.map((t) => {
                const tipoOpen = !collapsedTipos.has(t.tipo);
                return (
                  <Fragment key={t.tipo}>
                    <TableRow hover>
                      <TableCell sx={{ fontWeight: 700 }}>
                        <Stack direction="row" alignItems="center" spacing={0.25}>
                          <IconButton size="small" onClick={() => toggleTipo(t.tipo)} sx={{ p: 0.25 }}>
                            {tipoOpen ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                          </IconButton>
                          <span>{t.tipo}</span>
                        </Stack>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{formatValue(t.pesoLibras, 'number')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{formatValue(t.cantidadSerial, 'number')}</TableCell>
                    </TableRow>
                    {tipoOpen && t.proveedores.map((p) => {
                      const key = `${t.tipo}|${p.proveedor}`;
                      const provOpen = !collapsedProveedores.has(key);
                      return (
                        <Fragment key={key}>
                          <TableRow hover>
                            <TableCell sx={{ pl: 4 }}>
                              <Stack direction="row" alignItems="center" spacing={0.25}>
                                <IconButton size="small" onClick={() => toggleProveedor(key)} sx={{ p: 0.25 }}>
                                  {provOpen ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                                </IconButton>
                                <span>{p.proveedor}</span>
                              </Stack>
                            </TableCell>
                            <TableCell align="right">{formatValue(p.pesoLibras, 'number')}</TableCell>
                            <TableCell align="right">{formatValue(p.cantidadSerial, 'number')}</TableCell>
                          </TableRow>
                          {provOpen && p.items.map((i) => (
                            <TableRow key={i.item} hover>
                              <TableCell sx={{ pl: 8, color: 'text.secondary' }}>{i.item}</TableCell>
                              <TableCell align="right">{formatValue(i.pesoLibras, 'number')}</TableCell>
                              <TableCell align="right">{formatValue(i.cantidadSerial, 'number')}</TableCell>
                            </TableRow>
                          ))}
                          {provOpen && (
                            <TableRow>
                              <TableCell sx={{ pl: 4, fontWeight: 700, fontStyle: 'italic' }}>{p.proveedor} Total</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, fontStyle: 'italic' }}>{formatValue(p.pesoLibras, 'number')}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, fontStyle: 'italic' }}>{formatValue(p.cantidadSerial, 'number')}</TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
              <TableRow>
                <TableCell sx={TOTAL_SX}>Grand Total</TableCell>
                <TableCell align="right" sx={TOTAL_SX}>{formatValue(grandTotal.pesoLibras, 'number')}</TableCell>
                <TableCell align="right" sx={TOTAL_SX}>{formatValue(grandTotal.cantidadSerial, 'number')}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
