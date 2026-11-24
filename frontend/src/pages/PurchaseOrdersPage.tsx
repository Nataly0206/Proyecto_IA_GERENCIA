import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Alert, Box, Button, Chip, InputAdornment, LinearProgress, MenuItem, Paper, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableFooter, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { apiClient } from '../api/client';
import type { PurchaseOrdersResponse } from '../types/purchaseOrders';
import { filterPurchaseOrders, groupPurchaseOrders } from '../utils/purchaseOrders';

const amount = (value: number) => value.toLocaleString('es-HN', { maximumFractionDigits: 2 });
const time = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' }) : 'No informada';
const tableSx = { '& th': { bgcolor: '#f1f5f9', fontWeight: 800 }, '& td, & th': { px: 1.5, py: 1.2, fontSize: 12.5 }, '& td': { fontVariantNumeric: 'tabular-nums' }, '& tfoot td': { bgcolor: '#f8fafc', fontWeight: 800 } };

export default function PurchaseOrdersPage({ userId }: { userId: string }) {
  const [search, setSearch] = useState('');
  const [client, setClient] = useState('');
  const [size, setSize] = useState('');
  const [delay, setDelay] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const query = useQuery({ queryKey: ['purchase-orders', userId], queryFn: async ({ signal }) => (await apiClient.get<PurchaseOrdersResponse>('/purchase-orders', { signal })).data,
    staleTime: 30_000, refetchInterval: 60_000, retry: 1 });
  const all = query.data?.lines ?? [];
  const lines = filterPurchaseOrders(all, { search, client, size, delay });
  const orders = groupPurchaseOrders(lines);
  const totalKg = lines.reduce((sum, line) => sum + line.pendingKg, 0);
  const totalMasters = lines.reduce((sum, line) => sum + line.pendingMasters, 0);
  const lateOrders = orders.filter(order => order.delayWeeks > 0).length;
  const clients = [...new Set(all.map(line => line.client))].sort((a, b) => a.localeCompare(b, 'es'));
  const sizes = [...new Set(all.map(line => line.size).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(orders.length / rowsPerPage) - 1));
  const resetPage = () => { setPage(0); };
  const clear = () => { setSearch(''); setClient(''); setSize(''); setDelay(''); resetPage(); };
  const hasFilters = !!(search || client || size || delay);
  const error = isAxiosError(query.error) && typeof query.error.response?.data?.error === 'string' ? query.error.response.data.error : 'No se pudieron consultar las órdenes. Intenta actualizar.';
  return <Stack spacing={2} sx={{ py: 1, minWidth: 0 }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} useFlexGap flexWrap="wrap">
      <Stack direction="row" gap={1.25} alignItems="center"><Box sx={{ display: 'flex', p: 1, borderRadius: 2, bgcolor: '#eaf4ff', color: '#2563eb' }}><ReceiptLongOutlinedIcon /></Box><Box><Typography variant="h5" fontWeight={800}>Órdenes de Compra</Typography><Typography variant="body2" color="text.secondary">Contratos y productos pendientes por cliente</Typography></Box></Stack>
      <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? 'Actualizando…' : 'Actualizar'}</Button>
    </Stack>
    {query.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void query.refetch()}>Reintentar</Button>}>{error}{query.data ? ' Se conserva la última consulta correcta; revisa su fecha de actualización.' : ''}</Alert>}
    {query.isLoading ? <Skeleton variant="rounded" height={110} /> : query.data && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
      {[
        { label: 'Órdenes pendientes', value: orders.length, unit: `${new Set(lines.map(line => line.client)).size} clientes · ${lines.length} líneas`, color: '#2563eb' },
        { label: 'Kilos pendientes', value: totalKg, unit: 'kg · líneas filtradas', color: '#0f766e' },
        { label: 'Masters pendientes', value: totalMasters, unit: 'masters · líneas filtradas', color: '#6366f1' },
        { label: 'Órdenes con atraso', value: lateOrders, unit: 'Al menos una semana de atraso', color: '#b45309' },
      ].map(metric => <Paper variant="outlined" key={metric.label} sx={{ p: 2, borderRadius: 3, borderColor: '#e2e8f0', borderTop: `3px solid ${metric.color}` }}><Typography variant="body2" fontWeight={700} color="text.secondary">{metric.label}</Typography><Typography fontSize={{ xs: 27, md: 35 }} fontWeight={800} color={metric.color} sx={{ fontVariantNumeric: 'tabular-nums', my: 0.5 }}>{amount(metric.value)}</Typography><Typography variant="caption" color="text.secondary">{metric.unit}</Typography></Paper>)}
    </Box>}
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
      <Stack direction="row" gap={1.5} useFlexGap flexWrap="wrap">
        <TextField size="small" label="Buscar orden o producto" placeholder="Contrato, cliente, código, producto o talla" value={search} onChange={event => { setSearch(event.target.value); resetPage(); }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlinedIcon fontSize="small" /></InputAdornment> }} sx={{ flex: '1 1 280px' }} />
        <TextField size="small" select label="Cliente" value={client} onChange={event => { setClient(event.target.value); resetPage(); }} sx={{ flex: '1 1 170px' }}><MenuItem value="">Todos los clientes</MenuItem>{[...new Set([...clients, ...(client ? [client] : [])])].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
        <TextField size="small" select label="Talla" value={size} onChange={event => { setSize(event.target.value); resetPage(); }} sx={{ minWidth: 140 }}><MenuItem value="">Todas las tallas</MenuItem>{[...new Set([...sizes, ...(size ? [size] : [])])].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
        <TextField size="small" select label="Atraso" value={delay} onChange={event => { setDelay(event.target.value); resetPage(); }} sx={{ minWidth: 175 }}><MenuItem value="">Todas las órdenes</MenuItem><MenuItem value="late">Con semanas de atraso</MenuItem><MenuItem value="none">Sin semanas de atraso</MenuItem></TextField>
        {hasFilters && <Button size="small" onClick={clear}>Limpiar filtros</Button>}
      </Stack>
    </Paper>
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden', borderColor: '#e2e8f0' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ p: 1.75 }}><Typography fontWeight={800}>Órdenes y contratos</Typography><Chip size="small" label={query.data ? `${orders.length} órdenes · ${lines.length} líneas` : query.isLoading ? 'Consultando…' : 'Sin datos'} variant="outlined" /></Stack>
      {query.isFetching && <LinearProgress sx={{ height: 2 }} />}
      <TableContainer sx={{ maxHeight: '60vh' }}><Table size="small" stickyHeader aria-label="Órdenes de compra pendientes" sx={{ ...tableSx, minWidth: 850 }}>
        <TableHead><TableRow><TableCell>Contrato / orden</TableCell><TableCell>Cliente</TableCell><TableCell>Producto</TableCell><TableCell align="right">Kg pendientes</TableCell><TableCell align="right">Masters pendientes</TableCell><TableCell align="right">Semanas de atraso</TableCell></TableRow></TableHead>
        <TableBody>{orders.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage).map(order => <TableRow key={order.key} hover>
          <TableCell sx={{ fontWeight: 800 }}>{order.contractNumber}</TableCell><TableCell>{order.client}</TableCell><TableCell>{[...new Set(order.lines.map(line => line.product))].map(product => <Typography key={product} variant="body2">{product}</Typography>)}</TableCell><TableCell align="right">{amount(order.pendingKg)}</TableCell><TableCell align="right">{amount(order.pendingMasters)}</TableCell><TableCell align="right"><Chip size="small" label={order.delayWeeks} color={order.delayWeeks > 0 ? 'warning' : 'default'} variant="outlined" /></TableCell>
        </TableRow>)}</TableBody>
        {!!orders.length && <TableFooter><TableRow><TableCell colSpan={3}>Total de líneas filtradas · {lines.length}</TableCell><TableCell align="right">{amount(totalKg)}</TableCell><TableCell align="right">{amount(totalMasters)}</TableCell><TableCell /></TableRow></TableFooter>}
      </Table></TableContainer>
      {!orders.length && !query.isLoading && query.data && <Box sx={{ p: 3, textAlign: 'center' }}><Typography fontWeight={700}>{hasFilters ? 'Sin coincidencias para estos filtros' : 'No hay órdenes pendientes'}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{hasFilters ? 'Prueba otro contrato, producto o cliente.' : 'La fuente no devolvió líneas pendientes en esta consulta.'}</Typography></Box>}
      {!query.data && query.isError && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No hay datos disponibles. Reintenta la consulta.</Typography>}
      <TablePagination component="div" count={orders.length} page={currentPage} rowsPerPage={rowsPerPage} onPageChange={(_, value) => setPage(value)} onRowsPerPageChange={event => { setRowsPerPage(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[10, 25, 50]} labelRowsPerPage="Órdenes por página" labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`} />
    </Paper>
    {query.data && <Stack direction="row" justifyContent="space-between" gap={1} useFlexGap flexWrap="wrap"><Typography variant="caption" color="text.secondary">Actualización de origen: {time(query.data.updatedAt)} · Consulta: {time(query.data.fetchedAt)}</Typography><Typography variant="caption" color="text.secondary">Origen: órdenes de venta · actualización automática cada minuto</Typography></Stack>}
  </Stack>;
}
