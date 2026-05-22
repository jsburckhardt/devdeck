"use client";

import { useTerminal } from "@/hooks/use-terminal";
import { useTerminalTheme } from "@/hooks/use-terminal-theme";
import type { TerminalThemeDefinition } from "@/hooks/use-terminal-theme";
import {
  WarningCircle,
  Spinner,
  ArrowClockwise,
  LockSimple,
  Palette,
  Check,
} from "@phosphor-icons/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface TerminalPanelProps {
  slug?: string;
}

export function TerminalPanel({ slug }: TerminalPanelProps) {
  const { themeId, theme, setThemeId, themes } = useTerminalTheme();
  const {
    containerRef,
    status,
    isConnected,
    error,
    reconnectAttempt,
    maxReconnectAttempts,
    retry,
  } = useTerminal({ slug, theme: theme.colors });

  const isUnauthorized = error?.toLowerCase().includes("unauthorized");

  return (
    <div
      data-testid="terminal-panel"
      className="flex h-full flex-col"
      style={{ backgroundColor: theme.colors.background }}
    >
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-card/50 px-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-muted-foreground">Terminal</span>
          <ThemePicker themes={themes} activeThemeId={themeId} onSelect={setThemeId} />
        </div>
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
                    ? isUnauthorized
                      ? "Unauthorized"
                      : "Failed"
                    : "Disconnected"}
          </span>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} data-testid="terminal-container" className="h-full w-full p-1" />
        {status === "connecting" && (
          <StatusOverlay bgColor={theme.colors.background}>
            <Spinner size={20} className="animate-spin" />
            <span>Connecting…</span>
          </StatusOverlay>
        )}
        {status === "reconnecting" && (
          <StatusOverlay bgColor={theme.colors.background}>
            <ArrowClockwise size={20} className="animate-spin" />
            <span>
              Reconnecting… (attempt {reconnectAttempt}/{maxReconnectAttempts})
            </span>
          </StatusOverlay>
        )}
        {status === "failed" && isUnauthorized && (
          <StatusOverlay bgColor={theme.colors.background}>
            <LockSimple size={20} />
            <span>Unauthorized — please reload with a valid token</span>
          </StatusOverlay>
        )}
        {status === "failed" && !isUnauthorized && (
          <StatusOverlay bgColor={theme.colors.background}>
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

function StatusOverlay({
  children,
  bgColor,
}: {
  children: React.ReactNode;
  bgColor: string | undefined;
}) {
  return (
    <div
      data-testid="status-overlay"
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground"
      style={{ backgroundColor: (bgColor ?? "#1e1e2e") + "cc" }}
    >
      {children}
    </div>
  );
}

function ThemePicker({
  themes,
  activeThemeId,
  onSelect,
}: {
  themes: TerminalThemeDefinition[];
  activeThemeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex items-center rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title="Terminal theme"
          aria-label="Terminal theme"
          data-testid="theme-picker-trigger"
        >
          <Palette size={14} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 max-h-72 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg"
          sideOffset={4}
          align="end"
        >
          <DropdownMenu.RadioGroup value={activeThemeId} onValueChange={onSelect}>
            {themes.map((t) => (
              <DropdownMenu.RadioItem
                key={t.id}
                value={t.id}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-popover-foreground outline-none hover:bg-accent hover:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                data-testid={`theme-option-${t.id}`}
              >
                <span className="flex gap-0.5">
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-border"
                    style={{ backgroundColor: t.colors.background }}
                  />
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-border"
                    style={{ backgroundColor: t.colors.foreground }}
                  />
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-border"
                    style={{ backgroundColor: t.colors.green }}
                  />
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-border"
                    style={{ backgroundColor: t.colors.blue }}
                  />
                </span>
                <span className="flex-1">{t.label}</span>
                <DropdownMenu.ItemIndicator>
                  <Check size={12} className="text-primary" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
