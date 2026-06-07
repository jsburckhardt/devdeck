"use client";

import { useEffect, useState } from "react";
import { useTerminal } from "@/hooks/use-terminal";
import { useTerminalTheme } from "@/hooks/use-terminal-theme";
import type { TerminalThemeDefinition } from "@/hooks/use-terminal-theme";
import { useOpenProjects } from "@/lib/open-projects-context";
import {
  WarningCircle,
  Spinner,
  ArrowClockwise,
  LockSimple,
  Palette,
  Check,
  Keyboard,
} from "@phosphor-icons/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface TerminalPanelProps {
  slug?: string;
  worktree?: string;
}

type TerminalHelperKey = "tab" | "up" | "right";

const TERMINAL_HELPER_KEYS: TerminalHelperKey[] = ["tab", "up", "right"];

const TERMINAL_HELPER_SEQUENCES: Record<
  TerminalHelperKey,
  { label: string; display: string; plain: string; ctrl: string }
> = {
  tab: { label: "Tab", display: "Tab", plain: "\x09", ctrl: "\x1b[27;5;9~" },
  up: { label: "Up", display: "↑", plain: "\x1b[A", ctrl: "\x1b[1;5A" },
  right: { label: "Right", display: "→", plain: "\x1b[C", ctrl: "\x1b[1;5C" },
};

export function TerminalPanel({ slug, worktree }: TerminalPanelProps) {
  const { themeId, theme, setThemeId, themes } = useTerminalTheme();
  const {
    containerRef,
    status,
    isConnected,
    error,
    reconnectAttempt,
    maxReconnectAttempts,
    retry,
    terminalMode,
    isFallback,
    copilotStatus,
    sendInput,
    focusTerminal,
  } = useTerminal({ slug, worktree, theme: theme.colors });
  const { updateCopilotStatus } = useOpenProjects();

  useEffect(() => {
    if (slug) {
      // Only propagate copilotStatus when terminal is connected; force "idle" otherwise
      updateCopilotStatus(slug, isConnected ? copilotStatus : "idle");
    }
  }, [slug, copilotStatus, isConnected, updateCopilotStatus]);

  const [isKeyboardHelperOpen, setKeyboardHelperOpen] = useState(false);
  const [isCtrlActive, setCtrlActive] = useState(false);
  const isTerminalInputUnavailable = !isConnected;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient helper UI when terminal context changes
    setKeyboardHelperOpen(false);
    setCtrlActive(false);
  }, [slug, worktree]);

  useEffect(() => {
    if (!isConnected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- close helper when terminal input becomes unavailable
      setKeyboardHelperOpen(false);
      setCtrlActive(false);
    }
  }, [isConnected]);

  function closeKeyboardHelper() {
    setKeyboardHelperOpen(false);
    setCtrlActive(false);
  }

  useEffect(() => {
    if (!isKeyboardHelperOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setKeyboardHelperOpen(false);
        setCtrlActive(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isKeyboardHelperOpen]);

  function toggleKeyboardHelper() {
    if (isKeyboardHelperOpen) {
      closeKeyboardHelper();
      return;
    }

    setKeyboardHelperOpen(true);
  }

  function handleCtrlPress() {
    if (isTerminalInputUnavailable) {
      return;
    }

    setCtrlActive((active) => !active);
  }

  function handleHelperKeyPress(key: TerminalHelperKey) {
    if (isTerminalInputUnavailable) {
      return;
    }

    const sequence = isCtrlActive
      ? TERMINAL_HELPER_SEQUENCES[key].ctrl
      : TERMINAL_HELPER_SEQUENCES[key].plain;

    sendInput(sequence);
    focusTerminal();

    if (isCtrlActive) {
      setCtrlActive(false);
    }
  }

  const isUnauthorized = error?.toLowerCase().includes("unauthorized");

  const [showFallbackNotice, setShowFallbackNotice] = useState(false);

  useEffect(() => {
    if (isFallback) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derive local UI state from hook prop; no infinite loop risk
      setShowFallbackNotice(true);
      const timer = setTimeout(() => setShowFallbackNotice(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowFallbackNotice(false);
    }
  }, [isFallback]);

  return (
    <div
      data-testid="terminal-panel"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      style={{ backgroundColor: theme.colors.background }}
    >
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-card/50 px-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-muted-foreground">
            Terminal{worktree ? ` · ${worktree.replace(/^\.trees\//, "")}` : ""}
          </span>
          <ThemePicker themes={themes} activeThemeId={themeId} onSelect={setThemeId} />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleKeyboardHelper}
            className="flex items-center rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            title="Terminal keyboard helper"
            aria-label="Terminal keyboard helper"
            aria-pressed={isKeyboardHelperOpen}
            data-testid="keyboard-helper-toggle"
          >
            <Keyboard size={14} aria-hidden="true" />
          </button>
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
          {terminalMode !== "unknown" && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground uppercase tracking-wide">
              {terminalMode}
            </span>
          )}
        </div>
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="h-full w-full min-h-0 min-w-0 overflow-hidden p-1">
            <div
              ref={containerRef}
              data-testid="terminal-container"
              className="h-full w-full min-h-0 min-w-0 overflow-hidden"
            />
          </div>
        </div>
        {isKeyboardHelperOpen && (
          <TerminalKeyboardHelper
            ctrlActive={isCtrlActive}
            disabled={isTerminalInputUnavailable}
            onClose={closeKeyboardHelper}
            onCtrlPress={handleCtrlPress}
            onKeyPress={handleHelperKeyPress}
          />
        )}
        {showFallbackNotice && (
          <div
            className="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded bg-yellow-900/90 px-3 py-1 text-xs text-yellow-200"
            role="status"
            aria-label="Terminal fallback notification"
          >
            tmux session unavailable — using shell
          </div>
        )}
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

interface TerminalKeyboardHelperProps {
  ctrlActive: boolean;
  disabled: boolean;
  onClose: () => void;
  onCtrlPress: () => void;
  onKeyPress: (key: TerminalHelperKey) => void;
}

function TerminalKeyboardHelper({
  ctrlActive,
  disabled,
  onClose,
  onCtrlPress,
  onKeyPress,
}: TerminalKeyboardHelperProps) {
  return (
    <div
      data-testid="terminal-keyboard-helper"
      role="toolbar"
      aria-label="Terminal keyboard helper keys"
      className="shrink-0 border-t border-border bg-card/95 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.18)]"
    >
      <div className="flex items-center gap-1 overflow-x-auto">
        <HelperKeyButton
          label="Ctrl"
          title="Ctrl modifier"
          disabled={disabled}
          pressed={ctrlActive}
          onClick={onCtrlPress}
          data-testid="terminal-helper-key-ctrl"
        >
          Ctrl
        </HelperKeyButton>
        {TERMINAL_HELPER_KEYS.map((key) => {
          const definition = TERMINAL_HELPER_SEQUENCES[key];
          return (
            <HelperKeyButton
              key={key}
              label={definition.label}
              title={definition.label}
              disabled={disabled}
              onClick={() => onKeyPress(key)}
              data-testid={"terminal-helper-key-" + key}
            >
              {definition.display}
            </HelperKeyButton>
          );
        })}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title="Close keyboard helper"
          aria-label="Close keyboard helper"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function HelperKeyButton({
  children,
  disabled,
  label,
  pressed,
  title,
  onClick,
  ...buttonProps
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  pressed?: boolean;
  title: string;
  onClick: () => void;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...buttonProps}
      disabled={disabled}
      aria-disabled={disabled ? "true" : "false"}
      aria-label={label}
      aria-pressed={pressed}
      tabIndex={disabled ? -1 : undefined}
      title={title}
      onClick={disabled ? undefined : onClick}
      className="rounded border border-border bg-background/80 px-3 py-1.5 font-mono text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
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
