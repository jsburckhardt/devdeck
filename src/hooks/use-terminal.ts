"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ITheme } from "@xterm/xterm";
import type { CopilotCliState } from "@/lib/types";
import { TERMINAL_THEMES } from "./use-terminal-theme";

export type TerminalStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export interface UseTerminalOptions {
  wsUrl?: string;
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
  copilotStatus: CopilotCliState;
  sendInput: (data: string) => boolean;
  focusTerminal: () => boolean;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const WS_CLOSE_UNAUTHORIZED = 4401;
const WS_CLOSE_UNSUPPORTED_CONTEXT = 1008;

const DEFAULT_THEME = TERMINAL_THEMES[0].colors;

export type TerminalFontSize = 11 | 12 | 13;

interface TerminalFontSizeMediaQueryResult {
  matches: boolean;
}

interface TerminalFontSizeWindowSource {
  innerWidth?: number | null;
  matchMedia?: (query: string) => TerminalFontSizeMediaQueryResult;
}

interface TerminalFontSizeDocumentSource {
  documentElement?: {
    clientWidth?: number | null;
  } | null;
}

interface TerminalFontSizeNavigatorSource {
  maxTouchPoints?: number | null;
}

export interface TerminalFontSizeInput {
  layoutViewportWidth?: number | null;
  primaryCoarsePointer?: boolean | null;
  anyCoarsePointer?: boolean | null;
  maxTouchPoints?: number | null;
  window?: TerminalFontSizeWindowSource | null;
  document?: TerminalFontSizeDocumentSource | null;
  navigator?: TerminalFontSizeNavigatorSource | null;
}

const PHONE_LAYOUT_VIEWPORT_MAX = 600;
const PRIMARY_COARSE_LAYOUT_VIEWPORT_MAX = 1366;
const FALLBACK_TOUCH_LAYOUT_VIEWPORT_MAX = 1024;

interface ContainerSizeSnapshot {
  width: number;
  height: number;
}

interface TerminalSizeSnapshot {
  cols: number;
  rows: number;
}

function hasOwnKey(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeNumericInput(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveWindowSource(input: TerminalFontSizeInput): TerminalFontSizeWindowSource | null {
  if (hasOwnKey(input, "window")) {
    return input.window ?? null;
  }

  return typeof window === "undefined" ? null : window;
}

function resolveDocumentSource(
  input: TerminalFontSizeInput,
): TerminalFontSizeDocumentSource | null {
  if (hasOwnKey(input, "document")) {
    return input.document ?? null;
  }

  return typeof document === "undefined" ? null : document;
}

function resolveNavigatorSource(
  input: TerminalFontSizeInput,
): TerminalFontSizeNavigatorSource | null {
  if (hasOwnKey(input, "navigator")) {
    return input.navigator ?? null;
  }

  return typeof navigator === "undefined" ? null : navigator;
}

function readLayoutViewportWidth(input: TerminalFontSizeInput): number | null {
  if (hasOwnKey(input, "layoutViewportWidth")) {
    return normalizeNumericInput(input.layoutViewportWidth);
  }

  const windowSource = resolveWindowSource(input);
  const innerWidth = normalizeNumericInput(windowSource?.innerWidth);
  if (innerWidth != null) {
    return innerWidth;
  }

  const documentSource = resolveDocumentSource(input);
  return normalizeNumericInput(documentSource?.documentElement?.clientWidth);
}

function readMediaQueryMatch(
  input: TerminalFontSizeInput,
  inputKey: "primaryCoarsePointer" | "anyCoarsePointer",
  query: string,
): boolean {
  if (hasOwnKey(input, inputKey)) {
    return input[inputKey] === true;
  }

  const windowSource = resolveWindowSource(input);
  try {
    return windowSource?.matchMedia?.(query).matches === true;
  } catch {
    return false;
  }
}

function readMaxTouchPoints(input: TerminalFontSizeInput): number {
  if (hasOwnKey(input, "maxTouchPoints")) {
    return Math.max(0, normalizeNumericInput(input.maxTouchPoints) ?? 0);
  }

  return Math.max(0, normalizeNumericInput(resolveNavigatorSource(input)?.maxTouchPoints) ?? 0);
}

export function getTerminalFontSize(input: TerminalFontSizeInput = {}): TerminalFontSize {
  const layoutViewportWidth = readLayoutViewportWidth(input);
  if (layoutViewportWidth == null) {
    return 13;
  }

  if (layoutViewportWidth <= PHONE_LAYOUT_VIEWPORT_MAX) {
    return 11;
  }

  if (
    readMediaQueryMatch(input, "primaryCoarsePointer", "(pointer: coarse)") &&
    layoutViewportWidth <= PRIMARY_COARSE_LAYOUT_VIEWPORT_MAX
  ) {
    return 12;
  }

  const hasFallbackTouch =
    readMediaQueryMatch(input, "anyCoarsePointer", "(any-pointer: coarse)") ||
    readMaxTouchPoints(input) > 0;
  if (hasFallbackTouch && layoutViewportWidth <= FALLBACK_TOUCH_LAYOUT_VIEWPORT_MAX) {
    return 12;
  }

  return 13;
}

function addMediaQueryChangeListener(query: string, listener: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  let mediaQueryList: MediaQueryList;
  try {
    mediaQueryList = window.matchMedia(query);
  } catch {
    return () => {};
  }

  const handleChange = () => listener();
  if (typeof mediaQueryList.addEventListener === "function") {
    mediaQueryList.addEventListener("change", handleChange);
    return () => {
      mediaQueryList.removeEventListener("change", handleChange);
    };
  }

  if (typeof mediaQueryList.addListener === "function") {
    mediaQueryList.addListener(handleChange);
    return () => {
      mediaQueryList.removeListener(handleChange);
    };
  }

  return () => {};
}

function normalizeContainerSize(
  rect: Pick<DOMRectReadOnly, "width" | "height">,
): ContainerSizeSnapshot | null {
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function buildWsUrl(cols?: number, rows?: number): string {
  if (typeof window === "undefined") return "ws://localhost:8001/api/terminal";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}/api/terminal`;
  const params = new URLSearchParams();
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
  const [copilotStatus, setCopilotStatus] = useState<CopilotCliState>("idle");
  const statusRef = useRef<TerminalStatus>("disconnected");

  const baseWsUrl = options?.wsUrl ?? buildWsUrl();

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
  const inputEncoderRef = useRef<TextEncoder | null>(null);
  const lastFitContainerSizeRef = useRef<ContainerSizeSnapshot | null>(null);
  const resizeDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentTerminalSizeRef = useRef<TerminalSizeSnapshot | null>(null);
  const lastTerminalFontSizeRef = useRef<TerminalFontSize | null>(null);
  const responsiveFontSizeCleanupRef = useRef<(() => void) | null>(null);

  const setTerminalStatus = useCallback((nextStatus: TerminalStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const sendInput = useCallback((data: string) => {
    const ws = wsRef.current;
    if (!ws || statusRef.current !== "connected" || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      inputEncoderRef.current ??= new TextEncoder();
      ws.send(inputEncoderRef.current.encode(data));
      return true;
    } catch {
      return false;
    }
  }, []);

  const focusTerminal = useCallback(() => {
    const term = termRef.current;
    if (!term) {
      return false;
    }

    try {
      term.focus();
      return true;
    } catch {
      return false;
    }
  }, []);

  // Keep themeRef in sync so connect() always sees the latest theme
  useEffect(() => {
    themeRef.current = options?.theme;
  }, [options?.theme]);

  const clearResizeDebounce = useCallback(() => {
    if (resizeDebounceTimerRef.current) {
      clearTimeout(resizeDebounceTimerRef.current);
      resizeDebounceTimerRef.current = null;
    }
  }, []);

  const disconnectResizeObserver = useCallback(() => {
    clearResizeDebounce();
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
  }, [clearResizeDebounce]);

  const readContainerSize = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect ? normalizeContainerSize(rect) : null;
  }, []);

  const fitContainerToUsableSize = useCallback(
    ({ force = false }: { force?: boolean } = {}) => {
      if (!fitAddonRef.current || !termRef.current) {
        return false;
      }

      const size = readContainerSize();
      if (!size) {
        lastFitContainerSizeRef.current = null;
        return false;
      }

      const previousSize = lastFitContainerSizeRef.current;
      if (
        !force &&
        previousSize &&
        previousSize.width === size.width &&
        previousSize.height === size.height
      ) {
        return false;
      }

      try {
        fitAddonRef.current.fit();
        lastFitContainerSizeRef.current = size;
        return true;
      } catch {
        // ignore fit errors during rapid resize or teardown
        return false;
      }
    },
    [readContainerSize],
  );

  const clearResponsiveFontSizeListeners = useCallback(() => {
    responsiveFontSizeCleanupRef.current?.();
    responsiveFontSizeCleanupRef.current = null;
  }, []);

  const applyTerminalFontSizeTier = useCallback(() => {
    const term = termRef.current;
    if (!term) {
      return false;
    }

    const nextFontSize = getTerminalFontSize();
    if (lastTerminalFontSizeRef.current === nextFontSize) {
      return false;
    }

    term.options.fontSize = nextFontSize;
    lastTerminalFontSizeRef.current = nextFontSize;
    fitContainerToUsableSize({ force: true });
    return true;
  }, [fitContainerToUsableSize]);

  const scheduleFit = useCallback(() => {
    clearResizeDebounce();
    resizeDebounceTimerRef.current = setTimeout(() => {
      resizeDebounceTimerRef.current = null;
      fitContainerToUsableSize();
    }, 150);
  }, [clearResizeDebounce, fitContainerToUsableSize]);

  const setupResponsiveFontSizeListeners = useCallback(() => {
    clearResponsiveFontSizeListeners();

    if (typeof window === "undefined") {
      return;
    }

    const cleanupFns: Array<() => void> = [];
    const handleLayoutViewportChange = () => {
      if (!applyTerminalFontSizeTier()) {
        scheduleFit();
      }
    };
    const handlePointerCapabilityChange = () => {
      applyTerminalFontSizeTier();
    };
    const handleVisualViewportResize = () => {
      scheduleFit();
    };

    window.addEventListener("resize", handleLayoutViewportChange);
    window.addEventListener("orientationchange", handleLayoutViewportChange);
    cleanupFns.push(
      () => window.removeEventListener("resize", handleLayoutViewportChange),
      () => window.removeEventListener("orientationchange", handleLayoutViewportChange),
      addMediaQueryChangeListener("(pointer: coarse)", handlePointerCapabilityChange),
      addMediaQueryChangeListener("(any-pointer: coarse)", handlePointerCapabilityChange),
    );

    const visualViewport = window.visualViewport;
    if (visualViewport && typeof visualViewport.addEventListener === "function") {
      visualViewport.addEventListener("resize", handleVisualViewportResize);
      cleanupFns.push(() => {
        visualViewport.removeEventListener("resize", handleVisualViewportResize);
      });
    }

    responsiveFontSizeCleanupRef.current = () => {
      cleanupFns.splice(0).forEach((cleanup) => {
        try {
          cleanup();
        } catch {
          // Ignore cleanup errors during browser teardown.
        }
      });
    };
  }, [applyTerminalFontSizeTier, clearResponsiveFontSizeListeners, scheduleFit]);

  const sendResizeMessage = useCallback((cols: number, rows: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }

    const previousSize = lastSentTerminalSizeRef.current;
    if (previousSize && previousSize.cols === cols && previousSize.rows === rows) {
      return false;
    }

    wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
    lastSentTerminalSizeRef.current = { cols, rows };
    return true;
  }, []);

  const connect = useCallback(async () => {
    const gen = ++generationRef.current;

    setTerminalStatus("connecting");
    setError(null);
    setTerminalMode("unknown");
    setIsFallback(false);
    setCopilotStatus("idle");
    lastFitContainerSizeRef.current = null;
    lastSentTerminalSizeRef.current = null;
    lastTerminalFontSizeRef.current = null;
    disconnectResizeObserver();
    clearResponsiveFontSizeListeners();

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
      fitAddonRef.current = null;

      const terminalFontSize = getTerminalFontSize();
      lastTerminalFontSizeRef.current = terminalFontSize;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: terminalFontSize,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        lineHeight: 1.0,
        customGlyphs: true,
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
      setupResponsiveFontSizeListeners();

      if (containerRef.current) {
        term.open(containerRef.current);
      }

      // Register onResize BEFORE fitAddon.fit() so the handler captures
      // the first resize event triggered by fit().
      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        sendResizeMessage(cols, rows);
      });

      if (containerRef.current) {
        fitContainerToUsableSize({ force: true });
      }

      // Set up ResizeObserver
      if (containerRef.current) {
        const observer = new ResizeObserver(() => {
          if (fitAddonRef.current && termRef.current) {
            scheduleFit();
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

      // Build WebSocket URL with current terminal dimensions
      const wsUrlObj = new URL(baseWsUrl, window.location.href);
      wsUrlObj.searchParams.set("cols", String(term.cols));
      wsUrlObj.searchParams.set("rows", String(term.rows));

      // Connect WebSocket — cookie is sent automatically by the browser
      const ws = new WebSocket(wsUrlObj.toString());
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      const decoder = new TextDecoder();

      ws.onopen = () => {
        if (gen !== generationRef.current) return;
        setTerminalStatus("connected");
        setError(null);
        reconnectAttemptRef.current = 0;
        setReconnectAttempt(0);
        // Send initial resize
        sendResizeMessage(term.cols, term.rows);
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
              copilotState?: string;
            };
            if (msg.type === "error") {
              setError(msg.message ?? "Unknown error");
            } else if (msg.type === "setup") {
              setTerminalMode(msg.mode ?? "shell");
              if (msg.fallback) {
                setIsFallback(true);
                term.clear();
              }
            } else if (msg.type === "status") {
              const state = msg.copilotState;
              setCopilotStatus(
                state === "running" || state === "waiting" || state === "idle" ? state : "idle",
              );
            }
          } catch {
            // ignore
          }
        }
      };

      ws.onclose = (event: CloseEvent) => {
        if (gen !== generationRef.current) return;

        // Clear copilot status on any close path — stale running/waiting is misleading
        setCopilotStatus("idle");

        // Unauthorized — do not reconnect
        if (event.code === WS_CLOSE_UNAUTHORIZED) {
          setTerminalStatus("failed");
          setError("Unauthorized — please reload with a valid token");
          return;
        }

        if (event.code === WS_CLOSE_UNSUPPORTED_CONTEXT) {
          setTerminalStatus("failed");
          setError("Project-scoped terminals are not supported by the default terminal.");
          return;
        }

        if (intentionalCloseRef.current) {
          setTerminalStatus("disconnected");
          return;
        }
        // Unexpected close — attempt reconnection
        const attempt = reconnectAttemptRef.current + 1;
        reconnectAttemptRef.current = attempt;
        setReconnectAttempt(attempt);

        if (attempt > MAX_RECONNECT_ATTEMPTS) {
          setTerminalStatus("failed");
          setError("Connection lost after maximum retries");
          return;
        }

        setTerminalStatus("reconnecting");
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
        if (gen === generationRef.current) {
          sendInput(data);
        }
      });
    } catch (err) {
      if (gen !== generationRef.current) return;
      setTerminalStatus("failed");
      setError(String(err));
    }
  }, [
    baseWsUrl,
    clearResponsiveFontSizeListeners,
    disconnectResizeObserver,
    fitContainerToUsableSize,
    scheduleFit,
    sendInput,
    sendResizeMessage,
    setTerminalStatus,
    setupResponsiveFontSizeListeners,
  ]);

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
      statusRef.current = "disconnected";

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      disconnectResizeObserver();
      clearResponsiveFontSizeListeners();
      lastFitContainerSizeRef.current = null;
      lastSentTerminalSizeRef.current = null;
      lastTerminalFontSizeRef.current = null;
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
      fitAddonRef.current = null;
    };
  }, [clearResponsiveFontSizeListeners, connect, disconnectResizeObserver]);

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
    copilotStatus,
    sendInput,
    focusTerminal,
  };
}
