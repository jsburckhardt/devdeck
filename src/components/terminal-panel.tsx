"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { WarningCircle } from "@phosphor-icons/react";

const TERMINAL_WS_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/terminal`
    : "ws://localhost:8001/api/terminal";

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!containerRef.current) return;

    // Close any existing connection before creating a new one
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const { Terminal } = await import("@xterm/xterm");
    const { FitAddon } = await import("@xterm/addon-fit");
    const { WebLinksAddon } = await import("@xterm/addon-web-links");

    // Load xterm CSS
    await import("@xterm/xterm/css/xterm.css");

    if (termRef.current) {
      termRef.current.dispose();
    }

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      lineHeight: 1.5,
      theme: {
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
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect to WebSocket terminal server
    try {
      const ws = new WebSocket(TERMINAL_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        // Send initial resize
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (event) => {
        term.write(event.data);
      };

      ws.onclose = () => {
        setConnected(false);
      };

      ws.onerror = () => {
        setError("Terminal server not available. Start it with: npm run terminal");
        setConnected(false);
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }));
        }
      });

      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      });
    } catch {
      setError("Failed to connect to terminal server");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- connect() is async and sets state in event callbacks
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, [connect]);

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      if (fitAddonRef.current && termRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {
          // Ignore fit errors during rapid resize
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex h-full flex-col bg-[#1e1e2e]">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-card/50 px-3">
        <span className="font-mono text-xs text-muted-foreground">Terminal</span>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-muted-foreground/30"}`}
          />
          <span className="text-[10px] text-muted-foreground">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-muted-foreground">
          <WarningCircle size={24} />
          <p className="text-center text-xs">{error}</p>
          <button
            onClick={connect}
            className="mt-1 rounded bg-secondary px-3 py-1 text-xs text-secondary-foreground hover:bg-accent"
          >
            Retry
          </button>
        </div>
      ) : (
        <div ref={containerRef} className="min-h-0 flex-1 p-1" />
      )}
    </div>
  );
}
