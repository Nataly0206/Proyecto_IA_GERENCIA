import { Component, ErrorInfo, ReactNode } from 'react';
import { Alert } from '@mui/material';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Texto mostrado cuando el contenido falla */
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Aísla fallos de render: si un widget lanza un error, se muestra una
 * alerta en su tarjeta en lugar de desmontar todo el dashboard.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <Alert severity="error">
          {this.props.label ?? 'Error al renderizar este componente'}: {this.state.error.message}
        </Alert>
      );
    }
    return this.props.children;
  }
}
