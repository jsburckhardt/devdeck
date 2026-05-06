"use client";

import React from "react";
import { WarningCircle } from "@phosphor-icons/react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return <PanelError onRetry={this.reset} />;
    }
    return this.props.children;
  }
}

export function PanelError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <WarningCircle size={32} />
      <p className="text-sm">Something went wrong</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-accent"
        >
          Try again
        </button>
      )}
    </div>
  );
}
