import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import { ChartConfig, DataRow } from '../../types';
import ChartWidget from './ChartWidget';
import PeladoTallaWidget from './PeladoTallaWidget';
import { peladoWidgets } from '../../config/dashboardConfig';
import { usePeladoLibrasHoy, usePeladoLibrasHoyTalla, usePeladoPorSala } from '../../hooks/useDashboardData';
import { getPeladoSizeLeaders } from '../../utils/peladoTallas';
import { useFilters } from '../../context/FiltersContext';

const BASE_TITLE = 'Libras Peladas por Estilo';
const BASE_SUBTITLE = 'Día y semana: rango seleccionado · mes: año seleccionado · turno del filtro';

const dailyTableConfig: ChartConfig = {
  ...peladoWidgets[0],
  title: BASE_TITLE,
  subtitle: BASE_SUBTITLE,
  altChartType: undefined,
  trendChartType: undefined,
  showAverageRow: true,
  extraColumns: [
    {
      field: 'horasTrabajadas',
      label: 'Horas Trabajadas',
      unit: 'h · planta',
      format: 'decimal',
    },
    {
      field: 'personas',
      label: 'Personas',
      unit: 'únicas por período',
      format: 'number',
    },
  ],
};

type Vista = 'total' | 'dia' | 'semana' | 'mes';

/**
 * Libras peladas por estilo totalizadas sobre el rango de fechas y turno
 * elegidos en GlobalFilters (a diferencia de PeladoLibrasHoyCards, que
 * siempre muestra el día actual).
 */
export default function PeladoEstiloWidget() {
  const [tallaOpen, setTallaOpen] = useState(false);
  const [vista, setVista] = useState<Vista>('total');
  const { filters } = useFilters();
  const { data: hoy } = usePeladoLibrasHoy();
  const { data: tallasHoy, isError: tallasHoyError } = usePeladoLibrasHoyTalla(vista === 'dia');
  const lideresHoy = getPeladoSizeLeaders(!tallasHoyError ? tallasHoy?.tallas ?? [] : []);
  const { data: actividad, isError: actividadError } = usePeladoPorSala();
  const personasActivas = actividad?.salas.reduce((total, sala) => total + sala.personasActivas, 0) ?? 0;
  const rendimientoHoy = !actividadError && hoy && actividad?.dia === hoy.dia && personasActivas > 0
    ? (hoy.librasPorHoraPromedio ?? 0) / personasActivas
    : null;
  const { data: tallasPorDia } = useQuery<DataRow[]>({
    queryKey: ['dashboard', 'pelado-talla-dominante-diaria:v1', filters],
    queryFn: async ({ signal }) => (await apiClient.get<DataRow[]>('/dashboard/pelado-por-talla-dia', {
      params: filters,
      signal,
    })).data,
    enabled: vista === 'dia',
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const tallasDominantes = useMemo(() => {
    const totals = new Map<string, { talla: string; libras: number }[]>();
    for (const row of tallasPorDia ?? []) {
      const periodo = String(row.periodo ?? '');
      if (!periodo) continue;
      const sizes = totals.get(periodo) ?? [];
      sizes.push({ talla: String(row.talla ?? ''), libras: Number(row.libras ?? 0) });
      totals.set(periodo, sizes);
    }
    return new Map([...totals].map(([periodo, sizes]) => [periodo, getPeladoSizeLeaders(sizes)]));
  }, [tallasPorDia]);
  const year = filters.fechaFinal.slice(0, 4);
  const queryParams = { periodo: vista === 'total' ? 'dia' : vista, ...(vista === 'mes' ? { fechaInicial: `${year}-01-01`, fechaFinal: `${year}-12-31` } : {}) };

  const config = useMemo<ChartConfig>(() => vista === 'total' ? {
    ...dailyTableConfig,
    type: 'cards',
    subtitle: 'Total acumulado · rango de fechas y turno seleccionados',
    xField: 'estilo',
    seriesField: undefined,
    extraColumns: undefined,
    showAverageRow: false,
    sort: { field: 'libras', direction: 'desc' },
    showTotalCard: true,
    unitLabel: 'lbs peladas',
  } : {
    ...dailyTableConfig,
    stickyFirstColumnMobile: vista === 'dia',
    stickyFirstColumn: vista === 'semana' || vista === 'mes',
    mobileSummaryOnly: vista === 'dia',
    trailingTextColumns: vista === 'dia' ? [
      { field: 'tallaDominante', label: 'Talla Prom' },
      { field: 'tallaSiguiente', label: 'Talla Sig' },
    ] : undefined,
    hourlyPerPersonColumn: vista === 'dia' ? { hoursField: 'horasTrabajadas', peopleField: 'personas', valueField: 'rendimientoPorPersona' } : undefined,
    xLabel: vista === 'dia' ? 'Fecha' : vista === 'semana' ? 'Semana' : 'Mes',
    ...(vista === 'mes' ? {
      dailyAverageColumn: { daysField: 'diasTrabajados', label: 'Promedio por día', unit: 'lbs / días trabajados' },
    } : {}),
  }, [vista]);
  const transformRows = (rows: DataRow[]): DataRow[] => {
    if (vista === 'total') {
      const totals = new Map<string, number>();
      for (const row of rows) {
        const estilo = String(row.estilo ?? 'Sin estilo');
        const libras = Number(row.libras ?? 0);
        totals.set(estilo, (totals.get(estilo) ?? 0) + (Number.isFinite(libras) ? libras : 0));
      }
      const total = Array.from(totals.values()).reduce((sum, libras) => sum + libras, 0);
      return Array.from(totals, ([estilo, libras]) => ({
        estilo,
        libras,
        porcentaje: total > 0 ? Math.round((libras / total) * 10000) / 100 : 0,
      }));
    }
    if (vista === 'dia') {
      return rows.map((row) => ({
        ...row,
        tallaDominante: (!filters.turno && hoy && row.periodo === hoy.dia
          ? tallasHoy?.dia === hoy.dia ? lideresHoy.principal : null
          : tallasDominantes.get(String(row.periodo))?.principal) ?? null,
        tallaSiguiente: (!filters.turno && hoy && row.periodo === hoy.dia
          ? tallasHoy?.dia === hoy.dia ? lideresHoy.siguiente : null
          : tallasDominantes.get(String(row.periodo))?.siguiente) ?? null,
        ...(!filters.turno && hoy && row.periodo === hoy.dia
          ? { rendimientoPorPersona: rendimientoHoy }
          : {}),
      }));
    }
    if (vista !== 'mes' || rows.length === 0) return rows;
    const styles = Array.from(new Set(rows.map((row) => String(row.estilo))));
    const present = new Set(rows.map((row) => `${row.periodo}|${row.estilo}`));
    const empty: DataRow[] = [];
    for (let month = 1; month <= 12; month += 1) {
      const periodo = `${year}-${String(month).padStart(2, '0')}`;
      for (const estilo of styles) {
        if (!present.has(`${periodo}|${estilo}`)) empty.push({ periodo, estilo, libras: 0, horasTrabajadas: 0, personas: 0, diasTrabajados: 0 });
      }
    }
    return [...rows, ...empty];
  };

  const chartWidget = (
    <ChartWidget
      autoHeight
      config={config}
      queryParams={queryParams}
      transform={transformRows}
      actions={
        <Stack direction="row" spacing={1}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={vista}
            onChange={(_e, next: Vista | null) => next && setVista(next)}
            sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.5, fontSize: 11, fontWeight: 700, lineHeight: 1 } }}
          >
            <ToggleButton value="total" aria-label="Vista de cards acumuladas">Total</ToggleButton>
            <ToggleButton value="dia" aria-label="Vista por día">Día</ToggleButton>
            <ToggleButton value="semana" aria-label="Vista por semana">Semana</ToggleButton>
            <ToggleButton value="mes" aria-label="Vista por mes">Mes</ToggleButton>
          </ToggleButtonGroup>
          <Button
            size="small"
            variant="outlined"
            startIcon={<VisibilityOutlinedIcon />}
            onClick={() => setTallaOpen(true)}
            sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}
          >
            Ver por talla
          </Button>
        </Stack>
      }
    />
  );

  return (
    <>
      <Box sx={{ flexShrink: 0 }}>{chartWidget}</Box>
      <Dialog open={tallaOpen} onClose={() => setTallaOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          Detalle de Libras Peladas por Talla
          <IconButton aria-label="Cerrar detalle por talla" onClick={() => setTallaOpen(false)}>
            <CloseOutlinedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 1.5 }}>
          {tallaOpen && <PeladoTallaWidget />}
        </DialogContent>
      </Dialog>
    </>
  );
}
