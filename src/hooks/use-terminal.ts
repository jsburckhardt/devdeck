"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type TerminalStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export interface UseTerminalOptions {
  wsUrl?: string;
}

export interface UseTerminalReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  status: TerminalStatus;
  isConnected: boolean;
  error: string | null;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
  retry: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 3;

const CATPPUCCIN_THEME = {
  background: "#1e1e2e",
  foreground: "#cdd6f4",
  cursor: "#f5e0dc",
  selectionBackground: "#585b7066",
  black: "#45475a",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#f5c2e7",
  cyan: "#94e2d5",
  white: "#bac2de",
  brightBlack: "#585b70",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#f5c2e7",
  brightCyan: "#94e2d5",
  brightWhite: "#a6adc8",
};

function buildWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8001/api/terminal";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/terminal`;
}

export function useTerminal(options?: UseTerminalOptions): UseTerminalReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const wsUrl = options?.wsUrl ?? buildWsUrl();

  const generationRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const reconnectAttemptRef = useRef(0);
  const connectRef = useRef<(() => void) | null>(null);

  const connect = useCallback(async () => {
    const gen = ++generationRef.current;

    setStatus("connecting");
    setError(null);

    try {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const { WebLinksAddon } = await import("@xterm/addon-web-links");
      const { Unicode11Addon } = await import("@xterm/addon-unicode11");
      await import("@xterm/xterm/css/xterm.css");

      if (gen !== generationRef.current) return;

      // Dispose previous terminal if any
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        lineHeight: 1.5,
        theme: CATPPUCCIN_THEME,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      const unicode11Addon = new Unicode11Addon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.loadAddon(unicode11Addon);
      term.unicode.activeVersion = "11";

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      if (containerRef.current) {
        term.open(containerRef.current);
        fitAddon.fit();
      }

      // Set up ResizeObserver
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      if (containerRef.current) {
        const observer = new ResizeObserver(() => {
          if (fitAddonRef.current && termRef.current) {
            try {
              fitAddonRef.current.fit();
            } catch {
              // ignore fit errors during rapid resize
            }
          }
        });
        observer.observe(containerRef.current);
        resizeObserverRef.current = observer;
      }

      // Close any existing WebSocket before creating a new one
      if (wsRef.current) {
        try {
          wsRef.current.onclose = null;
          wsRef.current.onerror = null;
          wsRef.current.onmessage = null;
          wsRef.current.onopen = null;
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }

      // Connect WebSocket
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      ws.onopen = () => {
        if (gen !== generationRef.current) return;
        setStatus("connected");
        setError(null);
        reconnectAttemptRef.current = 0;
        setReconnectAttempt(0);
        // Send initial resize
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (event: MessageEvent) => {
        if (gen !== generationRef.current) return;
        if (event.data instanceof ArrayBuffer) {
          term.write(decoder.decode(event.data));
        } else if (typeof event.data === "string") {
          // JSON control message from server
          try {
            const msg = JSON.parse(event.data) as { type?: string; message?: string };
            if (msg.type === "error") {
              setError(msg.message ?? "Unknown error");
            }
          } catch {
            // ignore
          }
        }
      };

      ws.onclose = () => {
        if (gen !== generationRef.current) return;
        if (intentionalCloseRef.current) {
          setStatus("disconnected");
          return;
        }
        // Unexpected close — attempt reconnection
        const attempt = reconnectAttemptRef.current + 1;
        reconnectAttemptRef.current = attempt;
        setReconnectAttempt(attempt);

        if (attempt > MAX_RECONNECT_ATTEMPTS) {
          setStatus("failed");
          setError("Connection lost after maximum retries");
          return;
        }

        setStatus("reconnecting");
        const delay = 1000 * Math.pow(2, attempt - 1);
        reconnectTimerRef.current = setTimeout(() => {
          if (gen === generationRef.current) {
            connectRef.current?.();
          }
        }, delay);
      };

      ws.onerror = () => {
        if (gen !== generationRef.current) return;
        setError("WebSocket error");
      };

      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(encoder.encode(data));
        }
      });

      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      });
    } catch (err) {
      if (gen !== generationRef.current) return;
      setStatus("failed");
      setError(String(err));
    }
  }, [wsUrl]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const retry = useCallback(() => {
    intentionalCloseRef.current = false;
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    connect();
  }, [connect]);

  useEffect(() => {
    intentionalCloseRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- connect() is async; setState calls happen in WS event callbacks, not synchronously in the effect body
    connect();

    return () => {
      intentionalCloseRef.current = true;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: increment generation to invalidate stale closures
      generationRef.current++;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, [connect]);

  return {
    containerRef,
    status,
    isConnected: status === "connected",
    error,
    reconnectAttempt,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    retry,
  };
}
