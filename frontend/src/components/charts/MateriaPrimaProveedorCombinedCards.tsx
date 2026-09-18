import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Checkbox, Divider, FormControlLabel, LinearProgress, Popover, Skeleton, Stack, Typography } from '@mui/material';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import { useWidgetData } from '../../hooks/useDashboardData';
import { formatValue } from '../../utils/format';
import { categoryColor } from '../../utils/categoryColors';

const WSO_A_ENTERO_FACTOR = 0.65;
const STORAGE_KEY = 'compra-mp-proveedores-wso-entero-ocultos:v1';
type ProviderRow = { proveedor: string; libras: number; porcentaje: number; total?: boolean };

function readHidden(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${userId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

export default function MateriaPrimaProveedorCombinedCards({ userId, actions }: { userId: string; actions?: ReactNode }) {
  const { data, isLoading, isError, error } = useWidgetData('compra-mp-por-proveedor');
  const [hidden, setHidden] = useState<Set<string>>(() => readHidden(userId));
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const providers = useMemo<ProviderRow[]>(() => (data ?? []).map((row) => ({
    proveedor: String(row.proveedor ?? 'Sin proveedor'),
    libras: Number(row.libras ?? 0),
    porcentaje: 0,
  })), [data]);
  const providerNames = useMemo(() => providers.map((row) => row.proveedor).sort(), [providers]);
  const rows = useMemo<ProviderRow[]>(() => {
    const visible = providers.filter((row) => !hidden.has(row.proveedor));
    const total = visible.reduce((sum, row) => sum + row.libras, 0);
    return [
      ...visible.map((row) => ({ ...row, porcentaje: total > 0 ? row.libras / total * 100 : 0 })),
      ...(visible.length > 0 ? [{ proveedor: 'TOTAL', libras: total, porcentaje: 100, total: true }] : []),
    ];
  }, [hidden, providers]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(Array.from(hidden)));
    } catch {
      // La selección continúa funcionando durante la sesión si el almacenamiento está bloqueado.
    }
  }, [hidden, userId]);

  const toggleProvider = (provider: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(provider)) next.delete(provider); else next.add(provider);
      return next;
    });
  };
  const visibleCount = providerNames.length - providerNames.filter((provider) => hidden.has(provider)).length;

  return <Card sx={{ flexShrink: 0 }}><CardContent sx={{ p: '14px !important' }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1} mb={1}>
      <Box><Typography variant="subtitle2" fontWeight={800}>Materia Prima por Proveedor — WSO y Entero</Typography><Typography variant="caption" color="text.secondary">Rango de fechas seleccionado · Entero equivalente = WSO ÷ 0.65 · fuente: AV_MateriaPrima</Typography></Box>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'flex-end', sm: 'initial' }} flexWrap="wrap" useFlexGap>
        <Button size="small" variant="outlined" startIcon={<PeopleAltOutlinedIcon sx={{ fontSize: 16 }} />}
          onClick={(event) => setAnchorEl(event.currentTarget)} sx={{ fontSize: 11, fontWeight: 700, py: 0.4 }}>
          Proveedores ({visibleCount}/{providerNames.length})
        </Button>
        {actions}
      </Stack>
    </Stack>
    <Popover open={Boolean(anchorEl)} anchorEl={anchorEl} onClose={() => setAnchorEl(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
      <Box sx={{ p: 1.5, minWidth: 220, maxHeight: 320, overflowY: 'auto' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
          <Typography variant="caption" fontWeight={800} color="text.secondary">PROVEEDORES</Typography>
          <Stack direction="row" spacing={1}>
            <Button size="small" sx={{ fontSize: 11, minWidth: 0, p: 0 }} onClick={() => setHidden(new Set())}>Todos</Button>
            <Button size="small" sx={{ fontSize: 11, minWidth: 0, p: 0 }} onClick={() => setHidden(new Set(providerNames))}>Ninguno</Button>
          </Stack>
        </Stack>
        <Divider sx={{ mb: 0.5 }} />
        <Stack spacing={0}>
          {providerNames.map((provider) => <FormControlLabel key={provider}
            sx={{ '& .MuiFormControlLabel-label': { fontSize: 13 }, ml: 0 }}
            control={<Checkbox size="small" checked={!hidden.has(provider)} onChange={() => toggleProvider(provider)} />}
            label={provider} />)}
          {providerNames.length === 0 && <Typography variant="caption" color="text.secondary">Sin proveedores en el período.</Typography>}
        </Stack>
      </Box>
    </Popover>
    {isLoading ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 1 }}>{[1,2,3].map((i)=><Skeleton key={i} variant="rounded" height={142}/>)}</Box>
    : isError ? <Alert severity="error">Error al cargar proveedores: {error instanceof Error ? error.message : 'desconocido'}</Alert>
    : (data?.length ?? 0) === 0 ? <Alert severity="info">Sin materia prima registrada en el rango seleccionado.</Alert>
    : rows.length === 0 ? <Alert severity="info">Ningún proveedor seleccionado — marca al menos uno en “Proveedores”.</Alert>
    : <Box sx={{ display:'grid', gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',lg:`repeat(${Math.max(rows.length,1)},minmax(0,1fr))`}, gap:1 }}>
      {rows.map((row)=>{const color=row.total?'#164a8b':categoryColor(row.proveedor);return <Box key={row.proveedor} sx={{border:1,borderColor:row.total?'primary.main':'divider',borderTop:`3px solid ${color}`,borderRadius:1.5,bgcolor:row.total?'rgba(22,74,139,.06)':'background.paper',overflow:'hidden',minWidth:0}}>
        <Typography title={row.proveedor} fontWeight={800} textAlign="center" noWrap sx={{px:1.25,py:.8,fontSize:12,borderBottom:1,borderColor:'divider',color:row.total?'primary.main':'text.primary'}}>{row.proveedor}</Typography>
        <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))'}}>{[
          {label:'WSO',value:row.libras,unit:'lbs de materia prima'},
          {label:'ENTERO',value:row.libras/WSO_A_ENTERO_FACTOR,unit:'lbs enteras (equiv.)'},
        ].map((metric,index)=><Box key={metric.label} sx={{p:1.1,textAlign:'center',borderLeft:index?1:0,borderColor:'divider',minWidth:0}}><Typography variant="caption" fontWeight={800} color="text.secondary">{metric.label}</Typography><Typography fontWeight={800} sx={{fontSize:{xs:20,xl:22},lineHeight:1.2}}>{formatValue(metric.value)}</Typography><Typography variant="caption" color="text.secondary" sx={{fontSize:10,lineHeight:1.15,display:'block'}}>{metric.unit}</Typography></Box>)}</Box>
        <Box sx={{px:1.25,pb:1}}><LinearProgress variant="determinate" value={Math.min(row.porcentaje,100)} sx={{height:4,borderRadius:2,bgcolor:`${color}20`,'& .MuiLinearProgress-bar':{bgcolor:color}}}/><Typography variant="caption" fontWeight={700} sx={{color,display:'block',textAlign:'center',mt:.35,fontSize:10.5}}>{row.total?'100% del total':`${row.porcentaje.toFixed(1)}% del total`}</Typography></Box>
      </Box>})}
    </Box>}
  </CardContent></Card>;
}
