import {
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';

const PANEL_WIDTH = 360;

const EXAMPLE_PROMPTS = [
  'Muéstrame la producción de IQF PEELED de los últimos 6 meses',
  'Compara Turno A contra Turno B',
  'Muéstrame un gráfico de pastel',
];

interface AiAssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Panel lateral "Asistente IA" (Fase 2).
 *
 * En la siguiente versión, este panel enviará comandos en lenguaje natural
 * a un agente que responderá con objetos ChartConfig (JSON). Como todos los
 * gráficos del dashboard ya se renderizan vía <DynamicChart config={...} />,
 * el agente podrá crear visualizaciones nuevas sin cambios de código.
 */
export default function AiAssistantPanel({ open, onClose }: AiAssistantPanelProps) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: PANEL_WIDTH }, p: 2 } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <SmartToyOutlinedIcon color="primary" />
          <Typography variant="h6">Asistente IA</Typography>
        </Stack>
        <IconButton onClick={onClose} aria-label="Cerrar panel">
          <CloseIcon />
        </IconButton>
      </Stack>

      <Chip label="Disponible en Fase 2" color="primary" size="small" sx={{ mb: 2 }} />

      <Typography variant="body2" color="text.secondary" mb={2}>
        Próximamente podrás generar gráficos dinámicamente escribiendo comandos en
        lenguaje natural. Ejemplos:
      </Typography>

      <Stack spacing={1} mb={2}>
        {EXAMPLE_PROMPTS.map((prompt) => (
          <Paper key={prompt} variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="body2">“{prompt}”</Typography>
          </Paper>
        ))}
      </Stack>

      <Divider sx={{ mb: 2 }} />

      <Typography variant="caption" color="text.secondary" mb={1} display="block">
        El agente responderá con configuraciones JSON como esta, que el dashboard ya
        sabe renderizar:
      </Typography>
      <Paper
        variant="outlined"
        sx={{ p: 1.5, bgcolor: '#f8fafc', fontFamily: 'monospace', fontSize: 12, mb: 2 }}
      >
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(
            {
              type: 'bar',
              title: 'Libras netas por proceso',
              endpoint: 'libras-netas-proceso',
              xField: 'proceso',
              yField: 'libras',
            },
            null,
            2,
          )}
        </pre>
      </Paper>

      <Box sx={{ mt: 'auto' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Escribe un comando... (Fase 2)"
          disabled
        />
      </Box>
    </Drawer>
  );
}
