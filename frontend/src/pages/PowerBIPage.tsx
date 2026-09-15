import { Box, Paper, Stack, Typography } from '@mui/material';
import PowerBIReportContainer from '../components/powerbi/PowerBIReportContainer';

export default function PowerBIPage() {
  return (
    <Stack sx={{ height: '100%', minHeight: 0, py: 1 }} spacing={1.25}>
      <Box>
        <Typography variant="h5" fontWeight={800}>Power BI</Typography>
        <Typography color="text.secondary">Consulta el reporte corporativo sin salir del dashboard.</Typography>
      </Box>
      <Paper elevation={0} sx={{ flex: 1, minHeight: 500, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
        <PowerBIReportContainer />
      </Paper>
    </Stack>
  );
}
