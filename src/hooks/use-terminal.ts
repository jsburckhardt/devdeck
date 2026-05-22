"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ITheme } from "@xterm/xterm";
import { TERMINAL_THEMES } from "./use-terminal-theme";

export type TerminalStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export interface UseTerminalOptions {
  wsUrl?: string;
  slug?: string;
  theme?: ITheme;
}

export type TerminalMode = "unknown" | "tmux" | "shell";

export interface UseTerminalReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  status: TerminalStatus;
  isConnected: boolean;
  error: string | null;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
  retry: () => void;
  terminalMode: TerminalMode;
  isFallback: boolean;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const WS_CLOSE_UNAUTHORIZED = 4401;

const DEFAULT_THEME = TERMINAL_THEMES[0].colors;

function buildWsUrl(slug?: string, cols?: number, rows?: number): string {
  if (typeof window === "undefined") return "ws://localhost:8001/api/terminal";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}/api/terminal`;
  const params = new URLSearchParams();
  if (slug) params.set("slug", slug);
  if (cols != null) params.set("cols", String(cols));
  if (rows != null) params.set("rows", String(rows));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function useTerminal(options?: UseTerminalOptions): UseTerminalReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [terminalMode, setTerminalMode] = useState<TerminalMode>("unknown");
  const [isFallback, setIsFallback] = useState(false);

  const baseWsUrl = options?.wsUrl ?? buildWsUrl(options?.slug);

  const generationRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const reconnectAttemptRef = useRef(0);
  const connectRef = useRef<(() => void) | null>(null);
  const themeRef = useRef<ITheme | undefined>(options?.theme);

  // Keep themeRef in sync so connect() always sees the latest theme
  useEffect(() => {
    themeRef.current = options?.theme;
  }, [options?.theme]);

  const connect = useCallback(async () => {
    const gen = ++generationRef.current;

    setStatus("connecting");
    setError(null);
    setTerminalMode("unknown");
    setIsFallback(false);

    try {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const { WebLinksAddon } = await import("@xterm/addon-web-links");
      const { Unicode11Addon } = await import("@xterm/addon-unicode11");
      const { ClipboardAddon } = await import("@xterm/addon-clipboard");
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
        theme: themeRef.current ?? DEFAULT_THEME,
        allowProposedApi: true,
        screenReaderMode: true,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      const unicode11Addon = new Unicode11Addon();
      const clipboardAddon = new ClipboardAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.loadAddon(unicode11Addon);
      term.loadAddon(clipboardAddon);
      term.unicode.activeVersion = "11";

      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if (event.type === "keydown" && (event.ctrlKey || event.metaKey) && event.key === "v") {
          if (window.isSecureContext && navigator.clipboard?.readText) {
            navigator.clipboard
              .readText()
              .then((text) => {
                if (text) term.paste(text);
              })
              .catch(() => {});
            return false;
          }
          // Fall back to default browser paste in non-secure contexts
          return true;
        }
        return true;
      });

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      if (containerRef.current) {
        term.open(containerRef.current);
      }

      // Register onResize BEFORE fitAddon.fit() so the handler captures
      // the first resize event triggered by fit().
      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      });

      if (containerRef.current) {
        fitAddon.fit();
      }

      // Set up ResizeObserver
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      if (containerRef.current) {
        let resizeTimer: ReturnType<typeof setTimeout> | null = null;
        const observer = new ResizeObserver(() => {
          if (fitAddonRef.current && termRef.current) {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
              try {
                fitAddonRef.current?.fit();
              } catch {
                // ignore fit errors during rapid resize
              }
            }, 150);
          }
        });
        observer.observe(containerRef.current);
        resizeObserverRef.current = observer;

        // Store the timer cleanup for the effect cleanup
        const originalDisconnect = observer.disconnect.bind(observer);
        observer.disconnect = () => {
          if (resizeTimer) clearTimeout(resizeTimer);
          originalDisconnect();
        };
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

      // Build WebSocket URL with current terminal dimensions
      const wsUrlObj = new URL(baseWsUrl, window.location.href);
      wsUrlObj.searchParams.set("cols", String(term.cols));
      wsUrlObj.searchParams.set("rows", String(term.rows));

      // Connect WebSocket — cookie is sent automatically by the browser
      const ws = new WebSocket(wsUrlObj.toString());
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
            const msg = JSON.parse(event.data) as {
              type?: string;
              message?: string;
              mode?: "tmux" | "shell";
              fallback?: boolean;
              reason?: string;
            };
            if (msg.type === "error") {
              setError(msg.message ?? "Unknown error");
            } else if (msg.type === "setup") {
              setTerminalMode(msg.mode ?? "shell");
              if (msg.fallback) {
                setIsFallback(true);
                term.clear();
              }
            }
          } catch {
            // ignore
          }
        }
      };

      ws.onclose = (event: CloseEvent) => {
        if (gen !== generationRef.current) return;

        // Unauthorized — do not reconnect
        if (event.code === WS_CLOSE_UNAUTHORIZED) {
          setStatus("failed");
          setError("Unauthorized — please reload with a valid token");
          return;
        }

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
    } catch (err) {
      if (gen !== generationRef.current) return;
      setStatus("failed");
      setError(String(err));
    }
  }, [baseWsUrl]);

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

  // Runtime theme update without reconnection
  useEffect(() => {
    if (termRef.current && options?.theme) {
      termRef.current.options.theme = options.theme;
    }
  }, [options?.theme]);

  return {
    containerRef,
    status,
    isConnected: status === "connected",
    error,
    reconnectAttempt,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    retry,
    terminalMode,
    isFallback,
  };
}
