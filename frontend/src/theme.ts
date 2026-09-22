import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#164a8b' },
    secondary: { main: '#0f766e' },
    success: { main: '#2e7d32' },
    warning: { main: '#d99000' },
    error: { main: '#c62828' },
    background: {
      default: '#f5f7fb',
      paper: '#ffffff',
    },
    divider: '#dfe6ef',
    text: {
      primary: '#172033',
      secondary: '#64748b',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h6: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { height: '100%', WebkitTextSizeAdjust: '100%' },
        body: {
          height: '100%',
          overscrollBehavior: 'none',
          WebkitTapHighlightColor: 'transparent',
        },
        '#root': { height: '100%' },
        '@media (max-width:600px)': {
          'input, select, textarea': { fontSize: '16px !important' },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 14px 34px rgba(17, 24, 39, 0.06)',
          border: '1px solid rgba(148, 163, 184, 0.22)',
          backgroundImage: 'none',
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: 16,
          '&:last-child': { paddingBottom: 16 },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          color: '#172033',
          borderBottom: '1px solid rgba(148, 163, 184, 0.22)',
          boxShadow: '0 10px 28px rgba(17, 24, 39, 0.04)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 700,
          minHeight: 40,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          '@media (pointer: coarse)': { minWidth: 44, minHeight: 44 },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          '@media (max-width:600px)': {
            margin: 0,
            width: '100%',
            maxWidth: '100% !important',
            height: '100dvh',
            maxHeight: '100dvh',
            borderRadius: 0,
          },
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          '@media (max-width:600px)': {
            padding: '16px',
            paddingTop: 'max(16px, env(safe-area-inset-top))',
          },
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: { '@media (max-width:600px)': { padding: '16px' } },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          '@media (max-width:600px)': {
            position: 'sticky',
            bottom: 0,
            padding: '12px 16px max(12px, env(safe-area-inset-bottom))',
            background: '#fff',
            borderTop: '1px solid #dfe6ef',
            '& > button': { flex: 1 },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { whiteSpace: 'nowrap' },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
    },
  },
});

export const CHART_COLORS = [
  '#1565c0',
  '#00897b',
  '#f9a825',
  '#e53935',
  '#6a1b9a',
  '#00acc1',
  '#7cb342',
  '#fb8c00',
];
