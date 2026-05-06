"use client";

import { useTerminal } from "@/hooks/use-terminal";
import { WarningCircle, Spinner, ArrowClockwise } from "@phosphor-icons/react";

export function TerminalPanel() {
  const {
    containerRef,
    status,
    isConnected,
    error,
    reconnectAttempt,
    maxReconnectAttempts,
    retry,
  } = useTerminal();

  return (
    <div data-testid="terminal-panel" className="flex h-full flex-col bg-[#1e1e2e]">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-card/50 px-3">
        <span className="font-mono text-xs text-muted-foreground">Terminal</span>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              isConnected
                ? "bg-green-500"
                : status === "reconnecting"
                  ? "animate-pulse bg-yellow-500"
                  : status === "failed"
                    ? "bg-red-500"
                    : "bg-muted-foreground/30"
            }`}
          />
          <span className="text-[10px] text-muted-foreground">
            {status === "connected"
              ? "Connected"
              : status === "reconnecting"
                ? "Reconnecting..."
                : status === "connecting"
                  ? "Connecting..."
                  : status === "failed"
                    ? "Failed"
                    : "Disconnected"}
          </span>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} data-testid="terminal-container" className="h-full w-full p-1" />
        {status === "connecting" && (
          <StatusOverlay>
            <Spinner size={20} className="animate-spin" />
            <span>Connecting…</span>
          </StatusOverlay>
        )}
        {status === "reconnecting" && (
          <StatusOverlay>
            <ArrowClockwise size={20} className="animate-spin" />
            <span>
              Reconnecting… (attempt {reconnectAttempt}/{maxReconnectAttempts})
            </span>
          </StatusOverlay>
        )}
        {status === "failed" && (
          <StatusOverlay>
            <WarningCircle size={20} />
            <span>{error || "Connection lost"}</span>
            <button
              onClick={retry}
              className="mt-1 rounded bg-secondary px-3 py-1 text-xs text-secondary-foreground hover:bg-accent"
            >
              Retry
            </button>
          </StatusOverlay>
        )}
      </div>
    </div>
  );
}

function StatusOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#1e1e2e]/80 text-xs text-muted-foreground">
      {children}
    </div>
  );
}
