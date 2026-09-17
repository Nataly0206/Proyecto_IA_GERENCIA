import { ReactNode, useMemo } from 'react';
import { Alert, Box, Card, CardContent, LinearProgress, Skeleton, Stack, Typography } from '@mui/material';
import { useWidgetData } from '../../hooks/useDashboardData';
import { formatValue } from '../../utils/format';
import { categoryColor } from '../../utils/categoryColors';

const WSO_A_ENTERO_FACTOR = 0.65;
type ProviderRow = { proveedor: string; libras: number; porcentaje: number; total?: boolean };

export default function MateriaPrimaProveedorCombinedCards({ actions }: { actions?: ReactNode }) {
  const { data, isLoading, isError, error } = useWidgetData('compra-mp-por-proveedor');
  const rows = useMemo<ProviderRow[]>(() => {
    const providers = (data ?? []).map((row) => ({ proveedor: String(row.proveedor ?? 'Sin proveedor'), libras: Number(row.libras ?? 0), porcentaje: Number(row.porcentaje ?? 0) }));
    const total = providers.reduce((sum, row) => sum + row.libras, 0);
    return [...providers, { proveedor: 'TOTAL', libras: total, porcentaje: 100, total: true }];
  }, [data]);

  return <Card sx={{ flexShrink: 0 }}><CardContent sx={{ p: '14px !important' }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1} mb={1}>
      <Box><Typography variant="subtitle2" fontWeight={800}>Materia Prima por Proveedor — WSO y Entero</Typography><Typography variant="caption" color="text.secondary">Rango de fechas seleccionado · Entero equivalente = WSO ÷ 0.65 · fuente: AV_MateriaPrima</Typography></Box>{actions}
    </Stack>
    {isLoading ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 1 }}>{[1,2,3].map((i)=><Skeleton key={i} variant="rounded" height={142}/>)}</Box>
    : isError ? <Alert severity="error">Error al cargar proveedores: {error instanceof Error ? error.message : 'desconocido'}</Alert>
    : (data?.length ?? 0) === 0 ? <Alert severity="info">Sin materia prima registrada en el rango seleccionado.</Alert>
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
