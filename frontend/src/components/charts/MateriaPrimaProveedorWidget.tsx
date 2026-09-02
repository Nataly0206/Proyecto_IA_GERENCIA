import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  Popover,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import InsertChartOutlinedIcon from '@mui/icons-material/InsertChartOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import { ChartConfig, CompraMpMateriaPrimaRow, DataRow } from '../../types';
import { useWidgetData } from '../../hooks/useDashboardData';
import PivotTable from './PivotTable';
import DynamicChart from './DynamicChart';
import ErrorBoundary from '../ErrorBoundary';

const STORAGE_KEY = 'compra-mp-proveedores-ocultos:v1';

type Dimension = 'proveedor' | 'gramaje';
type ViewMode = 'chart' | 'table' | 'trend';

function readHidden(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${userId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Tarjeta única de "Materia Prima por Proveedor/Gramaje — Mensual": libras
 * recibidas por año/mes/gramaje/proveedor, con un selector de proveedores
 * (checklist persistida en localStorage por usuario) que decide qué
 * proveedores se dibujan. Ventana fija de 3 meses (endpoint
 * `compra-mp-materia-prima`, independiente del filtro de fechas). Antes
 * había dos tarjetas separadas (una fija por proveedor + esta); se
 * fusionaron en una sola porque, con el toggle en "Proveedor", mostraban
 * exactamente los mismos datos.
 *
 * A diferencia de los demás widgets, no usa <ChartWidget /> porque necesita
 * filtrar y re-agregar los datos en el navegador antes de graficar (el
 * filtro de proveedores debe aplicar tanto agrupando por proveedor como
 * por gramaje) — renderiza PivotTable/DynamicChart directamente, igual que
 * hace ChartWidget internamente.
 */
export default function MateriaPrimaProveedorWidget({ userId, height }: { userId: string; height?: number }) {
  const { data, isLoading, isError, error } = useWidgetData('compra-mp-materia-prima');
  const rows = (data ?? []) as CompraMpMateriaPrimaRow[];

  const [dimension, setDimension] = useState<Dimension>('proveedor');
  const [view, setView] = useState<ViewMode>('chart');
  const [hidden, setHidden] = useState<Set<string>>(() => readHidden(userId));
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const proveedores = useMemo(
    () => Array.from(new Set(rows.map((r) => r.proveedor))).sort(),
    [rows],
  );

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(Array.from(hidden)));
    } catch {
      // El almacenamiento puede estar bloqueado o lleno; el filtro sigue funcionando en esta sesión.
    }
  }, [hidden, userId]);

  const toggleProveedor = (proveedor: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(proveedor)) next.delete(proveedor); else next.add(proveedor);
      return next;
    });
  };

  const visibleCount = proveedores.length - proveedores.filter((p) => hidden.has(p)).length;

  /** Filas visibles, re-agregadas a { periodo, serie, libras } — una fila
   *  por (mes, serie) para que PivotTable / DynamicChart puedan pivotear. */
  const chartRows: DataRow[] = useMemo(() => {
    const map = new Map<string, { periodo: string; serie: string; libras: number }>();
    for (const r of rows) {
      if (hidden.has(r.proveedor)) continue;
      const serie = dimension === 'proveedor' ? r.proveedor : r.gramaje;
      const key = `${r.mes}|${serie}`;
      const acc = map.get(key) ?? { periodo: r.mes, serie, libras: 0 };
      acc.libras += r.libras;
      map.set(key, acc);
    }
    return Array.from(map.values()).map((c) => ({ ...c, libras: Number(c.libras.toFixed(2)) }));
  }, [rows, hidden, dimension]);

  const dimensionLabel = dimension === 'proveedor' ? 'Proveedor' : 'Gramaje';
  const baseConfig: ChartConfig = {
    id: 'compra-mp-materia-prima',
    type: view === 'table' ? 'table' : view === 'trend' ? 'line' : 'column',
    title: `Materia Prima por ${dimensionLabel} — Mensual`,
    subtitle: 'Últimos 3 meses · desglosado por año, mes y gramaje · fuente: AV_MateriaPrima',
    endpoint: 'compra-mp-materia-prima',
    xField: 'periodo',
    xLabel: 'Mes',
    yField: 'libras',
    seriesField: 'serie',
    totalAggregation: 'sum',
    valueFormat: 'number',
    height,
  };

  return (
    <Card sx={{ height: { xs: 'auto', md: '100%' }, minHeight: 0 }}>
      <CardContent sx={{ height: { xs: 'auto', md: '100%' }, display: 'flex', flexDirection: 'column', p: '14px !important' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={{ xs: 1, sm: 1.5 }} mb={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={800} lineHeight={1.2} sx={{ fontSize: { xs: 15, sm: 14 } }}>
              {baseConfig.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
              {baseConfig.subtitle}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'flex-end', sm: 'initial' }} sx={{ flexShrink: 0, flexWrap: 'wrap', rowGap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PeopleAltOutlinedIcon sx={{ fontSize: 16 }} />}
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{ fontSize: 11, fontWeight: 700, py: 0.4 }}
            >
              Proveedores ({visibleCount}/{proveedores.length})
            </Button>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={dimension}
              onChange={(_e, next: Dimension | null) => next && setDimension(next)}
              sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.5, fontSize: 11, fontWeight: 700, lineHeight: 1 } }}
            >
              <ToggleButton value="proveedor" aria-label="Por proveedor">Proveedor</ToggleButton>
              <ToggleButton value="gramaje" aria-label="Por gramaje">Gramaje</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={view}
              onChange={(_e, next: ViewMode | null) => next && setView(next)}
              sx={{ '& .MuiToggleButton-root': { p: 0.75, lineHeight: 1 } }}
            >
              <ToggleButton value="table" aria-label="Vista de tabla">
                <Tooltip title="Tabla"><TableChartOutlinedIcon sx={{ fontSize: 14 }} /></Tooltip>
              </ToggleButton>
              <ToggleButton value="chart" aria-label="Vista de gráfica">
                <Tooltip title="Gráfica comparativa"><InsertChartOutlinedIcon sx={{ fontSize: 14 }} /></Tooltip>
              </ToggleButton>
              <ToggleButton value="trend" aria-label="Vista de tendencia">
                <Tooltip title="Gráfica de tendencia"><TimelineOutlinedIcon sx={{ fontSize: 14 }} /></Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Stack>

        <Popover
          open={Boolean(anchorEl)}
          anchorEl={anchorEl}
          onClose={() => setAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <Box sx={{ p: 1.5, minWidth: 220, maxHeight: 320, overflowY: 'auto' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
              <Typography variant="caption" fontWeight={800} color="text.secondary">PROVEEDORES</Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" sx={{ fontSize: 11, minWidth: 0, p: 0 }} onClick={() => setHidden(new Set())}>Todos</Button>
                <Button size="small" sx={{ fontSize: 11, minWidth: 0, p: 0 }} onClick={() => setHidden(new Set(proveedores))}>Ninguno</Button>
              </Stack>
            </Stack>
            <Divider sx={{ mb: 0.5 }} />
            <Stack spacing={0}>
              {proveedores.map((proveedor) => (
                <FormControlLabel
                  key={proveedor}
                  sx={{ '& .MuiFormControlLabel-label': { fontSize: 13 }, ml: 0 }}
                  control={
                    <Checkbox
                      size="small"
                      checked={!hidden.has(proveedor)}
                      onChange={() => toggleProveedor(proveedor)}
                    />
                  }
                  label={proveedor}
                />
              ))}
              {proveedores.length === 0 && (
                <Typography variant="caption" color="text.secondary">Sin proveedores en el período.</Typography>
              )}
            </Stack>
          </Box>
        </Popover>

        {isLoading && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: height ?? 340 }}>
            <CircularProgress size={32} />
          </Box>
        )}

        {isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Error al cargar datos: {error instanceof Error ? error.message : 'desconocido'}
          </Alert>
        )}

        {!isLoading && !isError && chartRows.length === 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            {rows.length === 0
              ? 'Sin datos de materia prima en los últimos 3 meses.'
              : 'Ningún proveedor seleccionado — marca al menos uno en "Proveedores".'}
          </Alert>
        )}

        {!isLoading && !isError && chartRows.length > 0 && (
          <ErrorBoundary label="Error al renderizar el widget">
            <Box sx={{ flex: 1, minHeight: 0 }}>
              {view === 'table' ? (
                <PivotTable config={baseConfig} data={chartRows} />
              ) : (
                <DynamicChart config={baseConfig} data={chartRows} />
              )}
            </Box>
          </ErrorBoundary>
        )}
      </CardContent>
    </Card>
  );
}
