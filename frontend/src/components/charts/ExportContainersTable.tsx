import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { DataRow } from '../../types';
import { apiClient } from '../../api/client';
import { useWidgetData } from '../../hooks/useDashboardData';
import { formatPeriodo, formatValue } from '../../utils/format';
import { convertPounds, WeightUnit } from '../../utils/weightUnits';

const HEADER_SX = { fontWeight: 800, bgcolor: '#f1f5f9', color: '#172033', whiteSpace: 'nowrap' } as const;
const TOTAL_SX = { fontWeight: 800, bgcolor: '#e8eef7', borderTop: '2px solid #b8c7d9' } as const;

export default function ExportContainersTable({ weightUnit }: { weightUnit: WeightUnit }) {
  const { data, isLoading, isError, error, dataUpdatedAt } = useWidgetData('exportaciones-contenedores');
  const [selected, setSelected] = useState<DataRow | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const downloadTraceability = async () => {
    if (!selected || downloading) return;
    setDownloading(true);
    setDownloadError('');
    try {
      const response = await apiClient.get('/dashboard/exportaciones-contenedor-trazabilidad', {
        params: { fecha: selected.fecha, contenedor: selected.contenedor, referencia: selected.referencia ?? '' },
        responseType: 'blob', timeout: 120000,
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Trazabilidad_${String(selected.contenedor).replace(/[^a-zA-Z0-9_-]/g, '_')}_${selected.fecha}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError('No se pudo descargar la trazabilidad de este contenedor.');
    } finally {
      setDownloading(false);
    }
  };
  const rows = useMemo(
    () => [...(data ?? [])].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(a.contenedor).localeCompare(String(b.contenedor))),
    [data],
  );
  const detailQuery = useQuery<DataRow[]>({
    queryKey: ['exportaciones-contenedor-detalle', selected?.fecha, selected?.contenedor, selected?.referencia],
    queryFn: async () => {
      const { data } = await apiClient.get<DataRow[]>('/dashboard/exportaciones-contenedor-detalle', {
        params: { fecha: selected?.fecha, contenedor: selected?.contenedor, referencia: selected?.referencia ?? '' },
      });
      return data;
    },
    enabled: Boolean(selected),
    staleTime: 15 * 60 * 1000,
  });
  const detail = detailQuery.data ?? [];
  const detailTotalLibras = detail.reduce((sum, row) => sum + Number(row.libras ?? 0), 0);
  const detailTotalAnillos = detail.reduce((sum, row) => sum + Number(row.anillos ?? 0), 0);
  const detailTotalSerial = detail.reduce((sum, row) => sum + Number(row.cantidadSerial ?? 0), 0);
  const totalLibras = rows.reduce((sum, row) => sum + Number(row.libras ?? 0), 0);
  const totalMasteres = rows.reduce((sum, row) => sum + Number(row.masteres ?? 0), 0);
  const totalAnillos = rows.reduce((sum, row) => sum + Number(row.anillos ?? 0), 0);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.9, flexWrap: 'wrap' }}>
        <Inventory2OutlinedIcon color="primary" sx={{ fontSize: 16 }} />
        <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>
          Contenedores Exportados
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
          Una fila por contenedor · rango de fechas del filtro
          {dataUpdatedAt ? ` · actualizado ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ''}
        </Typography>
      </Box>

      {isLoading && <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center' }}><CircularProgress size={32} /></Box>}
      {isError && <Alert severity="error">Error al cargar contenedores: {error instanceof Error ? error.message : 'desconocido'}</Alert>}
      {!isLoading && !isError && rows.length === 0 && <Alert severity="info">Sin contenedores exportados en el rango seleccionado.</Alert>}

      {!isLoading && !isError && rows.length > 0 && (
        <TableContainer sx={{ maxHeight: 440, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={HEADER_SX}>Fecha</TableCell>
                <TableCell sx={HEADER_SX}>Contenedor</TableCell>
                <TableCell sx={HEADER_SX}>Ship</TableCell>
                <TableCell sx={HEADER_SX}>Código embarque</TableCell>
                <TableCell sx={HEADER_SX}>Cliente</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Másteres</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Total anillos</TableCell>
                <TableCell align="right" sx={HEADER_SX}>{weightUnit === 'kg' ? 'Kg totales' : 'Libras totales'}</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Detalle</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.fecha}|${row.contenedor}|${row.referencia}`} hover>
                  <TableCell>{formatPeriodo(String(row.fecha ?? ''))}</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>{String(row.contenedor ?? '—')}</TableCell>
                  <TableCell>{String(row.referencia ?? '—')}</TableCell>
                  <TableCell>{String(row.codigoEmbarque || '—')}</TableCell>
                  <TableCell>{String(row.cliente ?? '—')}</TableCell>
                  <TableCell align="right">{formatValue(Number(row.masteres ?? 0))}</TableCell>
                  <TableCell align="right">{formatValue(Number(row.anillos ?? 0))}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: 'primary.main' }}>{formatValue(convertPounds(Number(row.libras ?? 0), weightUnit), weightUnit === 'kg' ? 'decimal' : 'number')}</TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="outlined" startIcon={<VisibilityOutlinedIcon />} onClick={() => setSelected(row)} sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
                      Ver detalle
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
              <TableRow>
                <TableCell sx={TOTAL_SX}>Total</TableCell>
                <TableCell colSpan={4} sx={TOTAL_SX}>{rows.length} contenedores</TableCell>
                <TableCell align="right" sx={TOTAL_SX}>{formatValue(totalMasteres)}</TableCell>
                <TableCell align="right" sx={TOTAL_SX}>{formatValue(totalAnillos)}</TableCell>
                <TableCell align="right" sx={TOTAL_SX}>{formatValue(convertPounds(totalLibras, weightUnit), weightUnit === 'kg' ? 'decimal' : 'number')}</TableCell>
                <TableCell sx={TOTAL_SX} />
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        fullWidth
        maxWidth="xl"
        PaperProps={{ sx: { height: '92vh', maxHeight: '92vh' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={800}>Detalle del contenedor {String(selected?.contenedor ?? '')}</Typography>
            <Typography variant="caption" color="text.secondary">
              {selected ? `${formatPeriodo(String(selected.fecha))} · ${formatValue(convertPounds(Number(selected.libras ?? 0), weightUnit), weightUnit === 'kg' ? 'decimal' : 'number')} ${weightUnit} totales` : ''}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button variant="contained" size="small" startIcon={<DownloadOutlinedIcon />} onClick={downloadTraceability} disabled={downloading || detailQuery.isLoading || detailQuery.isError || detail.length === 0}>
              {downloading ? 'Descargando…' : 'Descargar Trazabilidad'}
            </Button>
            <IconButton aria-label="Cerrar detalle del contenedor" onClick={() => setSelected(null)}><CloseOutlinedIcon /></IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 1.5, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {downloadError && <Alert severity="error" onClose={() => setDownloadError('')}>{downloadError}</Alert>}
          {detailQuery.isLoading && <Box sx={{ py: 5, display: 'grid', placeItems: 'center' }}><CircularProgress size={32} /></Box>}
          {detailQuery.isError && <Alert severity="error">No se pudo cargar el reporte del contenedor.</Alert>}
          {!detailQuery.isLoading && !detailQuery.isError && detail.length === 0 && <Alert severity="info">Este contenedor no tiene detalle disponible.</Alert>}
          {!detailQuery.isLoading && !detailQuery.isError && detail.length > 0 && (
          <TableContainer sx={{ flex: 1, minHeight: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <Table size="small" stickyHeader sx={{
              '& th, & td': {
                borderRight: '1px solid #cbd5e1',
                borderBottom: '1px solid #cbd5e1',
              },
              '& th:last-of-type, & td:last-of-type': { borderRight: 'none' },
            }}>
              <TableHead><TableRow>
                <TableCell sx={HEADER_SX}>Fecha carga</TableCell>
                <TableCell sx={HEADER_SX}>Cliente</TableCell>
                <TableCell sx={HEADER_SX}>Ship</TableCell>
                <TableCell sx={HEADER_SX}>Código embarque</TableCell>
                <TableCell sx={HEADER_SX}>N.º orden compra</TableCell>
                <TableCell sx={HEADER_SX}>Nombre ítem</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Anillos/máster</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Total anillos</TableCell>
                <TableCell align="right" sx={HEADER_SX}>{weightUnit === 'kg' ? 'Peso kg' : 'Peso libras'}</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Cantidad serial</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {detail.map((row, index) => {
                  const previous = detail[index - 1];
                  const next = detail[index + 1];
                  const groupKey = (item: DataRow) => `${item.fecha}|${item.cliente}|${item.referencia}|${item.codigoEmbarque}`;
                  const orderKey = (item: DataRow) => `${groupKey(item)}|${item.ordenCompra}`;
                  const sameOrderAsPrevious = previous && orderKey(previous) === orderKey(row);
                  const endOfOrder = !next || orderKey(next) !== orderKey(row);
                  const firstGroupRow = !previous || groupKey(previous) !== groupKey(row);
                  const groupRows = firstGroupRow ? detail.filter((item) => groupKey(item) === groupKey(row)) : [];
                  const groupOrderCounts = firstGroupRow
                    ? groupRows.reduce<Map<string, number>>((counts, item) => {
                      const key = orderKey(item);
                      counts.set(key, (counts.get(key) ?? 0) + 1);
                      return counts;
                    }, new Map())
                    : new Map<string, number>();
                  const groupRowSpan = groupRows.length
                    + Array.from(groupOrderCounts.values()).filter((count) => count > 1).length;
                  const orderRows = endOfOrder ? detail.filter((item) => orderKey(item) === orderKey(row)) : [];
                  const currentOrderRows = sameOrderAsPrevious
                    ? []
                    : detail.filter((item) => orderKey(item) === orderKey(row));
                  const groupedCellSx = {
                    verticalAlign: 'middle', textAlign: 'center', fontWeight: 600,
                    bgcolor: '#f8fafc', borderRight: '2px solid #94a3b8 !important',
                  } as const;
                  return [
                    <TableRow key={`item-${index}`} hover sx={!sameOrderAsPrevious ? {
                      '& > td': { borderTop: '2px solid #b8c7d9' },
                    } : undefined}>
                      {firstGroupRow && <TableCell rowSpan={groupRowSpan} sx={groupedCellSx}>{formatPeriodo(String(row.fecha ?? ''))}</TableCell>}
                      {firstGroupRow && <TableCell rowSpan={groupRowSpan} sx={groupedCellSx}>{String(row.cliente || '—')}</TableCell>}
                      {firstGroupRow && <TableCell rowSpan={groupRowSpan} sx={groupedCellSx}>{String(row.referencia || '—')}</TableCell>}
                      {firstGroupRow && <TableCell rowSpan={groupRowSpan} sx={groupedCellSx}>{String(row.codigoEmbarque || '—')}</TableCell>}
                      {!sameOrderAsPrevious && <TableCell rowSpan={currentOrderRows.length} sx={groupedCellSx}>{String(row.ordenCompra || '—')}</TableCell>}
                      <TableCell>{String(row.item || '—')}</TableCell>
                      <TableCell align="right">{formatValue(Number(row.anillosPorMaster ?? 0))}</TableCell>
                      <TableCell align="right">{formatValue(Number(row.anillos ?? 0))}</TableCell>
                      <TableCell align="right">{formatValue(convertPounds(Number(row.libras ?? 0), weightUnit), 'decimal')}</TableCell>
                      <TableCell align="right">{formatValue(Number(row.cantidadSerial ?? 0))}</TableCell>
                    </TableRow>,
                    ...(endOfOrder && orderRows.length > 1 ? [
                      <TableRow key={`subtotal-${index}`} sx={{
                        bgcolor: '#eaf1f9',
                        '& > td': { borderTop: '2px solid #94a3b8', borderBottom: '2px solid #94a3b8' },
                      }}>
                        <TableCell colSpan={2} sx={{ fontWeight: 700 }}>{String(row.ordenCompra || 'Sin orden')} Total</TableCell>
                        <TableCell />
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{formatValue(orderRows.reduce((sum, item) => sum + Number(item.anillos ?? 0), 0))}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{formatValue(convertPounds(orderRows.reduce((sum, item) => sum + Number(item.libras ?? 0), 0), weightUnit), 'decimal')}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{formatValue(orderRows.reduce((sum, item) => sum + Number(item.cantidadSerial ?? 0), 0))}</TableCell>
                      </TableRow>,
                    ] : []),
                  ];
                })}
                <TableRow>
                  <TableCell colSpan={7} sx={TOTAL_SX}>Total general</TableCell>
                  <TableCell align="right" sx={TOTAL_SX}>{formatValue(detailTotalAnillos)}</TableCell>
                  <TableCell align="right" sx={TOTAL_SX}>{formatValue(convertPounds(detailTotalLibras, weightUnit), 'decimal')}</TableCell>
                  <TableCell align="right" sx={TOTAL_SX}>{formatValue(detailTotalSerial)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
