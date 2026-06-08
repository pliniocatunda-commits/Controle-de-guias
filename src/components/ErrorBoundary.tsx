import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-red-50 border border-red-150 rounded-2xl max-w-2xl mx-auto my-8 font-sans space-y-4 shadow-sm">
          <div className="flex items-center gap-3 text-red-700">
            <AlertTriangle className="w-8 h-8 shrink-0" />
            <div>
              <h2 className="text-base font-black uppercase tracking-tight">{this.props.fallbackTitle || 'Houve um erro nesta seção'}</h2>
              <p className="text-xs text-red-600/90 font-medium mt-0.5">Ocorreu uma falha inesperada ao tentar renderizar estes controles.</p>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-xl border border-red-100 text-[11px] font-mono text-gray-700 overflow-x-auto max-h-40 leading-normal select-all">
            <p className="font-bold text-red-700 mb-1">{this.state.error?.toString()}</p>
            <p className="whitespace-pre text-gray-450">{this.state.error?.stack}</p>
          </div>

          <button 
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all active:scale-[0.98]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Recarregar Sistema
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
