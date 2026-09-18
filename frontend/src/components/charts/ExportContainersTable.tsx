import { useMemo, useState } from 'react';
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
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import { DataRow } from '../../types';
import { useWidgetData } from '../../hooks/useDashboardData';
import { formatPeriodo, formatValue } from '../../utils/format';

const HEADER_SX = { fontWeight: 800, bgcolor: '#f1f5f9', color: '#172033', whiteSpace: 'nowrap' } as const;
const TOTAL_SX = { fontWeight: 800, bgcolor: '#e8eef7', borderTop: '2px solid #b8c7d9' } as const;

export default function ExportContainersTable() {
  const { data, isLoading, isError, error, dataUpdatedAt } = useWidgetData('exportaciones-contenedores');
  const [selected, setSelected] = useState<DataRow | null>(null);
  const rows = useMemo(
    () => [...(data ?? [])].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(a.contenedor).localeCompare(String(b.contenedor))),
    [data],
  );
  const detail = (selected?.detalle as DataRow[] | undefined) ?? [];
  const totalLibras = rows.reduce((sum, row) => sum + Number(row.libras ?? 0), 0);
  const totalMasteres = rows.reduce((sum, row) => sum + Number(row.masteres ?? 0), 0);

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
                <TableCell sx={HEADER_SX}>Referencia</TableCell>
                <TableCell sx={HEADER_SX}>Cliente</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Estilos</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Másteres</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Anillos/máster</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Libras totales</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Detalle</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.fecha}|${row.contenedor}|${row.referencia}`} hover>
                  <TableCell>{formatPeriodo(String(row.fecha ?? ''))}</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>{String(row.contenedor ?? '—')}</TableCell>
                  <TableCell>{String(row.referencia ?? '—')}</TableCell>
                  <TableCell>{String(row.cliente ?? '—')}</TableCell>
                  <TableCell align="right">{formatValue(Number(row.estilos ?? 0))}</TableCell>
                  <TableCell align="right">{formatValue(Number(row.masteres ?? 0))}</TableCell>
                  <TableCell align="right">{formatValue(Number(row.anillosXMaster ?? 0), 'decimal')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: 'primary.main' }}>{formatValue(Number(row.libras ?? 0))}</TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="outlined" startIcon={<VisibilityOutlinedIcon />} onClick={() => setSelected(row)} sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
                      Ver detalle
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell sx={TOTAL_SX}>Total</TableCell>
                <TableCell colSpan={4} sx={TOTAL_SX}>{rows.length} contenedores</TableCell>
                <TableCell align="right" sx={TOTAL_SX}>{formatValue(totalMasteres)}</TableCell>
                <TableCell sx={TOTAL_SX} />
                <TableCell align="right" sx={TOTAL_SX}>{formatValue(totalLibras)}</TableCell>
                <TableCell sx={TOTAL_SX} />
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={800}>Detalle del contenedor {String(selected?.contenedor ?? '')}</Typography>
            <Typography variant="caption" color="text.secondary">
              {selected ? `${formatPeriodo(String(selected.fecha))} · ${formatValue(Number(selected.libras ?? 0))} lbs totales` : ''}
            </Typography>
          </Box>
          <IconButton aria-label="Cerrar detalle del contenedor" onClick={() => setSelected(null)}><CloseOutlinedIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 1.5 }}>
          <TableContainer sx={{ maxHeight: '65vh', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <Table size="small" stickyHeader>
              <TableHead><TableRow>
                <TableCell sx={HEADER_SX}>Cliente</TableCell>
                <TableCell sx={HEADER_SX}>Estilo</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Másteres</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Anillos/máster</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Libras</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {detail.map((row, index) => <TableRow key={`${row.cliente}|${row.estilo}|${index}`} hover>
                  <TableCell>{String(row.cliente ?? '—')}</TableCell>
                  <TableCell>{String(row.estilo ?? '—')}</TableCell>
                  <TableCell align="right">{formatValue(Number(row.masteres ?? 0))}</TableCell>
                  <TableCell align="right">{formatValue(Number(row.anillosXMaster ?? 0), 'decimal')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{formatValue(Number(row.libras ?? 0))}</TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
