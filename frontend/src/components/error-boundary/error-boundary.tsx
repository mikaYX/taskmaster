import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { ErrorFallback } from './error-fallback';
import type { ErrorFallbackVariant } from './error-fallback';

interface Props {
  children: ReactNode;
  /** Fallback personnalisé — remplace ErrorFallback si fourni */
  fallback?: ReactNode;
  /** 'page' = plein écran | 'section' = inline par feature (défaut: 'page') */
  variant?: ErrorFallbackVariant;
  /** Nom du contexte affiché dans le fallback (ex: "Tableau de bord") */
  context?: string;
  /** Callback optionnel pour reporter l'erreur vers un service externe */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — capture les erreurs React non rattrapées.
 *
 * Usage global (main.tsx) :
 *   <ErrorBoundary variant="page">
 *     <App />
 *   </ErrorBoundary>
 *
 * Usage par feature (App.tsx) :
 *   <ErrorBoundary variant="section" context="Tableau de bord">
 *     <TaskBoardPage />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const context = this.props.context ?? 'unknown';
    console.error(`[ErrorBoundary:${context}] Uncaught error:`, error, info.componentStack);

    this.props.onError?.(error, info);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <ErrorFallback
          error={this.state.error}
          resetError={this.handleReset}
          variant={this.props.variant ?? 'page'}
          context={this.props.context}
        />
      );
    }

    return this.props.children;
  }
}
