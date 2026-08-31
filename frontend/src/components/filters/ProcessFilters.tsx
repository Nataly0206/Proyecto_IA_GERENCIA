import { ReactNode, useState } from 'react';
import { Box, Collapse, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import GlobalFilters from './GlobalFilters';

/**
 * Cabecera de filtros colapsable, idéntica a la de la página de Pelado y
 * el Dashboard. Se reutiliza en todas las páginas de los módulos de
 * proceso para mantener el mismo diseño y comportamiento.
 */
export default function ProcessFilters({
  title = 'Filtros',
  subtitle = 'Ajusta el período y turno de los reportes',
  hint,
}: {
  title?: string;
  subtitle?: string;
  /** Nota adicional bajo los filtros (p. ej. de qué depende cada widget). */
  hint?: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Paper
      elevation={0}
      sx={{
        px: { xs: 1.5, sm: 1.75 },
        py: 1.25,
        border: 1,
        borderColor: 'divider',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 32, gap: 1 }}>
        <Box
          sx={{
            width: 30,
            height: 30,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 1,
            bgcolor: 'rgba(22, 74, 139, 0.08)',
            color: 'primary.main',
          }}
        >
          <TuneOutlinedIcon sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" color="text.primary" fontWeight={800}>
            {title}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: { xs: 'none', sm: 'block' } }}
          >
            {subtitle}
          </Typography>
        </Box>
        <Tooltip title={open ? 'Ocultar filtros' : 'Mostrar filtros'}>
          <IconButton
            size="small"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Ocultar filtros' : 'Mostrar filtros'}
            aria-expanded={open}
            sx={{ color: 'text.secondary' }}
          >
            {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Tooltip>
      </Box>
      <Collapse in={open}>
        <Box sx={{ pt: 1.25 }}>
          <GlobalFilters />
          {hint && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {hint}
            </Typography>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
