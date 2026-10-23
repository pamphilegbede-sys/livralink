import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logErrorToRemote } from '../../services/apiClient';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    errorId: '',
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `ERR-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    return { hasError: true, error, errorId };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[CRITICAL BOUNDARY ERROR]', error, errorInfo);

    // Point 18: Log to central audit trail
    logErrorToRemote({
      message: error.message,
      source: 'React_ErrorBoundary',
      stack: error.stack,
      details: {
        componentStack: errorInfo.componentStack,
        errorId: this.state.errorId,
      },
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[420px] flex-1 flex items-center justify-center p-6 bg-slate-50 font-['Plus_Jakarta_Sans']">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-xl text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100/80 text-amber-600 flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-3xl">warning</span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                {this.props.fallbackTitle || 'Oups ! Un imprévu est survenu'}
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Une anomalie technique a été interceptée et isolée pour protéger vos données et vos livraisons.
              </p>
            </div>

            {/* Error reference tag */}
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-left text-xs space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                <span>Réf. Diagnostic :</span>
                <span className="font-mono text-blue-600 font-bold">{this.state.errorId}</span>
              </div>
              <p className="font-mono text-[11px] text-slate-700 truncate">
                {this.state.error?.message || 'Erreur d\'exécution inattendue'}
              </p>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="min-h-[44px] py-2.5 px-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                <span>Réessayer</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/';
                }}
                className="min-h-[44px] py-2.5 px-3 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">home</span>
                <span>Accueil</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
