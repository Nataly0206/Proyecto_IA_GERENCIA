import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { AiChartResult, AiMessage } from '../../types';
import { sendAiChat } from '../../api/dashboard.api';
import DynamicChart from '../charts/DynamicChart';

const PANEL_WIDTH = 420;

const EXAMPLE_PROMPTS = [
  'Muéstrame la producción total por proceso este mes',
  'Gráfica de libras netas de IQF de los últimos 3 meses por línea',
  'Compara el Turno A vs Turno B en producción neta',
  '¿Cuáles son los procesos con más producción este año?',
];

/* ------------------------------------------------------------------ */
/* Gráfica inline generada por IA                                      */
/* ------------------------------------------------------------------ */

function AiInlineChart({ result, index }: { result: AiChartResult; index: number }) {
  const config = {
    ...result.config,
    id: result.config.id || `ai-chart-${index}`,
    height: 220,
  };

  if (!result.rows || result.rows.length === 0) return null;

  return (
    <Card
      variant="outlined"
      sx={{ mt: 1.5, borderColor: 'primary.light', bgcolor: 'background.paper' }}
    >
      <CardContent sx={{ pb: '12px !important', pt: 1.5, px: 1.5 }}>
        <Typography variant="caption" fontWeight={700} color="primary" display="block" mb={0.5}>
          {config.title}
        </Typography>
        {config.subtitle && (
          <Typography variant="caption" color="text.secondary" display="block" mb={1}>
            {config.subtitle}
          </Typography>
        )}
        <DynamicChart config={config as Parameters<typeof DynamicChart>[0]['config']} data={result.rows} />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Burbuja de mensaje                                                   */
/* ------------------------------------------------------------------ */

function MessageBubble({ msg }: { msg: AiMessage }) {
  const isUser = msg.role === 'user';
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        mb: 1.5,
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ maxWidth: '95%' }}>
        {!isUser && (
          <SmartToyOutlinedIcon
            color="primary"
            sx={{ fontSize: 16, mt: 0.75, flexShrink: 0 }}
          />
        )}

        <Box sx={{ flex: 1 }}>
          <Paper
            elevation={0}
            sx={{
              px: 1.5,
              py: 1,
              borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              bgcolor: isUser ? 'primary.main' : 'grey.100',
              color: isUser ? 'primary.contrastText' : 'text.primary',
              display: 'inline-block',
              maxWidth: '100%',
            }}
          >
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {msg.content}
            </Typography>
          </Paper>

          {!isUser && msg.charts && msg.charts.length > 0 && (
            <Box sx={{ mt: 0.5, width: '100%' }}>
              {msg.charts.map((chart, i) => (
                <AiInlineChart key={chart.config.id || i} result={chart} index={i} />
              ))}
            </Box>
          )}

          <Typography variant="caption" color="text.disabled" sx={{ mt: 0.25, display: 'block' }}>
            {new Date(msg.timestamp).toLocaleTimeString('es', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Typography>
        </Box>

        {isUser && (
          <PersonOutlineIcon sx={{ fontSize: 16, mt: 0.75, color: 'text.secondary', flexShrink: 0 }} />
        )}
      </Stack>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Panel principal                                                      */
/* ------------------------------------------------------------------ */

interface AiAssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function AiAssistantPanel({ open, onClose }: AiAssistantPanelProps) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll al fondo cuando llegan mensajes nuevos
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Foco al abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  async function handleSend(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMsg: AiMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const response = await sendAiChat(nextHistory);
      const assistantMsg: AiMessage = {
        role: 'assistant',
        content: response.message,
        charts: response.charts,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error al contactar el asistente. Verifica que el backend esté corriendo.',
      );
      // Quitar el mensaje del usuario si falló
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handleClear() {
    setMessages([]);
    setError(null);
  }

  const isEmpty = messages.length === 0;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: PANEL_WIDTH },
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
    >
      {/* Cabecera */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <SmartToyOutlinedIcon color="primary" />
          <Box>
            <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
              Asistente IA
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Análisis de producción · PlantaEmpacadora
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row">
          {!isEmpty && (
            <Tooltip title="Limpiar conversación">
              <IconButton size="small" onClick={handleClear} aria-label="Limpiar">
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton onClick={onClose} size="small" aria-label="Cerrar panel">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      {/* Área de mensajes */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1.5 }}>
        {isEmpty && !loading && (
          <Box>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Haz una pregunta sobre la producción y el asistente generará gráficas automáticamente. Ejemplos:
            </Typography>
            <Stack spacing={1}>
              {EXAMPLE_PROMPTS.map((prompt) => (
                <Paper
                  key={prompt}
                  variant="outlined"
                  onClick={() => void handleSend(prompt)}
                  sx={{
                    p: 1.25,
                    cursor: 'pointer',
                    borderRadius: 2,
                    '&:hover': { bgcolor: 'primary.50', borderColor: 'primary.main' },
                    transition: 'all 0.15s',
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    "{prompt}"
                  </Typography>
                </Paper>
              ))}
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Typography variant="caption" color="text.disabled">
              El agente puede consultar la base de datos SQL en tiempo real y generar visualizaciones según tus preguntas.
            </Typography>
          </Box>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <SmartToyOutlinedIcon color="primary" sx={{ fontSize: 16 }} />
            <Paper
              elevation={0}
              sx={{
                px: 1.5,
                py: 1,
                borderRadius: '16px 16px 16px 4px',
                bgcolor: 'grey.100',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <CircularProgress size={12} />
              <Typography variant="body2" color="text.secondary">
                Consultando base de datos…
              </Typography>
            </Paper>
          </Box>
        )}

        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
          bgcolor: 'background.paper',
        }}
      >
        <TextField
          fullWidth
          size="small"
          multiline
          maxRows={4}
          placeholder="Escribe una pregunta sobre la producción…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          inputRef={inputRef}
          InputProps={{
            sx: { borderRadius: 3, pr: 0.5 },
            endAdornment: (
              <InputAdornment position="end">
                <Tooltip title="Enviar (Enter)">
                  <span>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => void handleSend()}
                      disabled={!input.trim() || loading}
                      aria-label="Enviar mensaje"
                    >
                      <SendIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </InputAdornment>
            ),
          }}
        />
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
          Enter para enviar · Shift+Enter para nueva línea
        </Typography>
      </Box>
    </Drawer>
  );
}
