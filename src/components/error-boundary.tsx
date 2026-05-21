"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallbackName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error inside ErrorBoundary:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center p-6 min-h-[400px]">
          <div className="relative overflow-hidden w-full max-w-lg rounded-2xl border border-rose-500/20 bg-slate-900/80 backdrop-blur-md p-8 text-center shadow-2xl">
            <div className="absolute inset-0 bg-rose-500/5 pointer-events-none" />
            
            <div className="relative z-10 flex flex-col items-center space-y-4">
              <div className="h-14 w-14 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20 text-rose-500 animate-pulse">
                <AlertTriangle className="w-7 h-7" />
              </div>

              <h2 className="text-xl font-bold text-white tracking-tight">
                {this.props.fallbackName || "Workspace"} Error Detected
              </h2>

              <p className="text-sm text-slate-400 max-w-md leading-relaxed">
                An unexpected error occurred while rendering this interface. This might be due to a state mismatch or network desynchronization.
              </p>

              {this.state.error && (
                <div className="w-full text-left bg-slate-950/80 border border-slate-800 rounded-lg p-4 font-mono text-xs text-rose-400 overflow-x-auto max-h-32">
                  {this.state.error.stack || this.state.error.message}
                </div>
              )}

              <button
                onClick={this.handleReset}
                className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-sm transition-all duration-250 shadow-lg shadow-rose-600/20 hover:scale-[1.02]"
              >
                <RefreshCw className="w-4 h-4" />
                Reset Panel State
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
