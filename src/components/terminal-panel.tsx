"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTerminal } from "@/hooks/use-terminal";
import { useTerminalTheme } from "@/hooks/use-terminal-theme";
import { useVoiceInput } from "@/hooks/use-voice-input";
import type { TerminalThemeDefinition } from "@/hooks/use-terminal-theme";
import {
  WarningCircle,
  Spinner,
  ArrowClockwise,
  LockSimple,
  Palette,
  Check,
  Keyboard,
  Microphone,
} from "@phosphor-icons/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface TerminalPanelProps {
  workspace?: {
    slug: string;
    worktreeId: string | null;
    label: string;
  };
}

type TerminalHelperKey = "tab" | "up" | "right";

const TERMINAL_HELPER_KEYS: TerminalHelperKey[] = ["tab", "up", "right"];
const MAX_VOICE_REVIEW_LENGTH = 500;

const TERMINAL_HELPER_SEQUENCES: Record<
  TerminalHelperKey,
  { label: string; display: string; plain: string; ctrl: string }
> = {
  tab: { label: "Tab", display: "Tab", plain: "\x09", ctrl: "\x1b[27;5;9~" },
  up: { label: "Up", display: "↑", plain: "\x1b[A", ctrl: "\x1b[1;5A" },
  right: { label: "Right", display: "→", plain: "\x1b[C", ctrl: "\x1b[1;5C" },
};

type VoicePanelStatus =
  | "unsupported"
  | "insecure-context"
  | "permission-needed"
  | "listening"
  | "transcribing"
  | "ready-to-send"
  | "denied"
  | "errored";

function getVoiceControlLabel({
  isListening,
  isTerminalInputUnavailable,
  status,
}: {
  isListening: boolean;
  isTerminalInputUnavailable: boolean;
  status: VoicePanelStatus;
}) {
  if (isListening) {
    return "Stop terminal voice input";
  }

  if (isTerminalInputUnavailable) {
    return "Terminal voice input unavailable while terminal is disconnected";
  }

  if (status === "unsupported") {
    return "Terminal voice input unsupported";
  }

  if (status === "insecure-context") {
    return "Terminal voice input requires a secure context";
  }

  if (status === "denied") {
    return "Terminal voice input permission denied";
  }

  return "Start terminal voice input";
}

function getVoiceStatusMessage({
  isTerminalInputUnavailable,
  status,
}: {
  isTerminalInputUnavailable: boolean;
  status: VoicePanelStatus;
}) {
  if (isTerminalInputUnavailable) {
    return "Voice input is unavailable while terminal input is disconnected.";
  }

  switch (status) {
    case "unsupported":
      return "Voice input is not supported in this browser.";
    case "insecure-context":
      return "Voice input requires HTTPS or localhost.";
    case "listening":
      return "Listening for speech…";
    case "transcribing":
      return "Transcribing speech…";
    case "ready-to-send":
      return "Review the voice transcript before sending.";
    case "denied":
      return "Microphone permission needs attention.";
    case "errored":
      return "Voice input needs attention.";
    case "permission-needed":
    default:
      return "Voice input ready. Start dictation with the microphone button.";
  }
}

function getVoiceAlertMessage({
  errorMessage,
  status,
}: {
  errorMessage: string | null;
  status: VoicePanelStatus;
}) {
  if (status === "insecure-context") {
    return (
      errorMessage ??
      "Voice input requires HTTPS or localhost. Open DevDeck in a secure browser context."
    );
  }

  if (status === "denied" || status === "errored") {
    return errorMessage ?? "Voice input is unavailable. Check microphone settings and try again.";
  }

  return null;
}

export function TerminalPanel({ workspace }: TerminalPanelProps = {}) {
  const { themeId, theme, setThemeId, themes } = useTerminalTheme();
  const voicePanelId = useId();
  const voiceReviewFieldId = `${voicePanelId}-review`;
  const voiceDisclosureId = `${voicePanelId}-disclosure`;
  const voiceReviewRef = useRef<HTMLTextAreaElement>(null);
  const firstVoiceSendButtonRef = useRef<HTMLButtonElement>(null);
  const lastAppliedFinalTranscriptRef = useRef("");
  const previousVoiceContextRef = useRef<string | null>(null);
  const previousTerminalContextRef = useRef<string | null>(null);
  const terminalContextKey = workspace
    ? `${workspace.slug}:${workspace.worktreeId ?? "root"}`
    : "default";
  const terminalContextLabel = workspace?.label ?? "Host terminal";
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
  } = useTerminal({
    theme: theme.colors,
    ...(workspace ? { workspace: { slug: workspace.slug, worktreeId: workspace.worktreeId } } : {}),
  });
  const {
    isSupported: isVoiceInputSupported,
    isListening: isVoiceInputListening,
    canStart: canStartVoiceInput,
    status: voiceInputStatus,
    interimTranscript: voiceInterimTranscript,
    finalTranscript: voiceFinalTranscript,
    errorMessage: voiceInputError,
    start: startVoiceInput,
    stop: stopVoiceInput,
    cancel: cancelVoiceInput,
    clear: clearVoiceInput,
  } = useVoiceInput({
    contextKey: workspace
      ? `${isConnected ? "connected" : "disconnected"}:${terminalContextKey}`
      : isConnected
        ? "connected"
        : "disconnected",
  });
  const [reviewText, setReviewText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [shouldFocusVoiceReview, setShouldFocusVoiceReview] = useState(false);
  const [restartNotice, setRestartNotice] = useState<string | null>(null);

  const [isKeyboardHelperOpen, setKeyboardHelperOpen] = useState(false);
  const [isCtrlActive, setCtrlActive] = useState(false);
  const isTerminalInputUnavailable = !isConnected;
  const isVoiceStartBlocked =
    isTerminalInputUnavailable ||
    !isVoiceInputSupported ||
    voiceInputStatus === "insecure-context" ||
    voiceInputStatus === "denied" ||
    (!isVoiceInputListening && !canStartVoiceInput);
  const isVoiceControlDisabled =
    isTerminalInputUnavailable || (!isVoiceInputListening && isVoiceStartBlocked);
  const voiceInputLabel = getVoiceControlLabel({
    isListening: isVoiceInputListening,
    isTerminalInputUnavailable,
    status: voiceInputStatus,
  });
  const voiceStatusMessage = getVoiceStatusMessage({
    isTerminalInputUnavailable,
    status: voiceInputStatus,
  });
  const voiceAlertMessage = getVoiceAlertMessage({
    errorMessage: voiceInputError,
    status: voiceInputStatus,
  });
  const isVoiceReviewReady = voiceInputStatus === "ready-to-send" || reviewText.length > 0;
  const isVoicePanelVisible =
    isVoiceInputListening ||
    voiceInputStatus === "transcribing" ||
    isVoiceReviewReady ||
    Boolean(voiceInterimTranscript) ||
    Boolean(voiceAlertMessage) ||
    Boolean(validationError) ||
    Boolean(sendError);

  const clearLocalVoiceState = useCallback(() => {
    lastAppliedFinalTranscriptRef.current = "";
    setReviewText("");
    setValidationError(null);
    setSendError(null);
    setShouldFocusVoiceReview(false);
  }, []);

  const handleCancelVoiceInput = useCallback(() => {
    cancelVoiceInput();
    clearLocalVoiceState();
    focusTerminal();
  }, [cancelVoiceInput, clearLocalVoiceState, focusTerminal]);

  const handleVoiceReviewChange = useCallback((value: string) => {
    setReviewText(value);
    setValidationError(null);
    setSendError(null);
  }, []);

  const focusVoiceReviewField = useCallback(() => {
    const target = voiceReviewRef.current ?? firstVoiceSendButtonRef.current;
    target?.focus();
  }, []);

  const handleVoiceSend = useCallback(
    (appendEnter: boolean) => {
      setValidationError(null);
      setSendError(null);

      if (reviewText.trim().length === 0) {
        setValidationError("Review text is empty. Edit the transcript before sending.");
        focusVoiceReviewField();
        return;
      }

      if (reviewText.length > MAX_VOICE_REVIEW_LENGTH) {
        setValidationError("Voice review text must be 500 characters or fewer before sending.");
        focusVoiceReviewField();
        return;
      }

      const input = appendEnter ? `${reviewText}\r` : reviewText;
      const sent = sendInput(input);
      if (!sent) {
        setSendError(
          "Terminal input is unavailable. Reconnect and retry sending the reviewed text.",
        );
        focusVoiceReviewField();
        return;
      }

      clearVoiceInput();
      clearLocalVoiceState();
      focusTerminal();
    },
    [
      clearLocalVoiceState,
      clearVoiceInput,
      focusTerminal,
      focusVoiceReviewField,
      reviewText,
      sendInput,
    ],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient helper UI on connect/disconnect changes
    setKeyboardHelperOpen(false);
    setCtrlActive(false);
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- close helper when terminal input becomes unavailable
      setKeyboardHelperOpen(false);
      setCtrlActive(false);
    }
  }, [isConnected]);

  useEffect(() => {
    const nextVoiceContext = isConnected ? "connected" : "disconnected";

    if (previousVoiceContextRef.current === null) {
      previousVoiceContextRef.current = nextVoiceContext;
      return;
    }

    if (previousVoiceContextRef.current === nextVoiceContext) {
      return;
    }

    previousVoiceContextRef.current = nextVoiceContext;
    clearVoiceInput();
    clearLocalVoiceState();
  }, [clearLocalVoiceState, clearVoiceInput, isConnected]);

  useEffect(() => {
    return () => {
      clearVoiceInput();
    };
  }, [clearVoiceInput]);

  useEffect(() => {
    if (!voiceFinalTranscript) {
      return;
    }

    if (lastAppliedFinalTranscriptRef.current === voiceFinalTranscript) {
      return;
    }

    lastAppliedFinalTranscriptRef.current = voiceFinalTranscript;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- final browser transcript opens the user review field
    setReviewText(voiceFinalTranscript);
    setValidationError(null);
    setSendError(null);
    setShouldFocusVoiceReview(true);
  }, [voiceFinalTranscript]);

  useEffect(() => {
    if (!shouldFocusVoiceReview || !isVoicePanelVisible) {
      return;
    }

    focusVoiceReviewField();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot focus request has been consumed
    setShouldFocusVoiceReview(false);
  }, [focusVoiceReviewField, isVoicePanelVisible, shouldFocusVoiceReview]);

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

  useEffect(() => {
    if (!isVoicePanelVisible && !isVoiceInputListening) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCancelVoiceInput();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCancelVoiceInput, isVoiceInputListening, isVoicePanelVisible]);

  function toggleKeyboardHelper() {
    if (isKeyboardHelperOpen) {
      closeKeyboardHelper();
      return;
    }

    setKeyboardHelperOpen(true);
  }

  function toggleVoiceInput() {
    if (isVoiceControlDisabled) {
      return;
    }

    if (isVoiceInputListening) {
      stopVoiceInput();
      return;
    }

    startVoiceInput();
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

  useEffect(() => {
    if (previousTerminalContextRef.current === null) {
      previousTerminalContextRef.current = terminalContextKey;
      return;
    }

    if (previousTerminalContextRef.current === terminalContextKey) return;
    previousTerminalContextRef.current = terminalContextKey;
    setRestartNotice(`Terminal restarted in ${terminalContextLabel}`);
    const timer = setTimeout(() => setRestartNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [terminalContextKey, terminalContextLabel]);

  return (
    <div
      data-testid="terminal-panel"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      style={{ backgroundColor: theme.colors.background }}
    >
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-card/50 px-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-muted-foreground">Terminal</span>
          <span
            className="max-w-40 truncate rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
            title={terminalContextLabel}
          >
            {terminalContextLabel}
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
          <button
            type="button"
            onClick={toggleVoiceInput}
            disabled={isVoiceControlDisabled}
            aria-disabled={isVoiceControlDisabled ? "true" : "false"}
            aria-label={voiceInputLabel}
            aria-pressed={isVoiceInputListening}
            aria-controls={isVoicePanelVisible ? voicePanelId : undefined}
            title={voiceInputLabel}
            data-testid="voice-input-toggle"
            className={`flex items-center rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50 ${
              isVoiceInputListening ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Microphone size={14} aria-hidden="true" />
          </button>
          <span
            role="status"
            aria-live="polite"
            data-testid="voice-input-status"
            title={voiceStatusMessage}
            className="max-w-56 truncate text-[10px] text-muted-foreground"
          >
            {voiceStatusMessage}
          </span>
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
        {isVoicePanelVisible && (
          <section
            id={voicePanelId}
            data-testid="voice-input-panel"
            aria-label="Terminal voice input review"
            className="shrink-0 border-t border-border bg-card/95 px-3 py-2 text-xs shadow-[0_-8px_24px_rgba(0,0,0,0.18)]"
          >
            <div className="flex flex-col gap-2">
              <p role="status" aria-live="polite" className="text-muted-foreground">
                {voiceStatusMessage}
              </p>
              {voiceAlertMessage && (
                <p
                  role="alert"
                  data-testid="voice-input-alert"
                  className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive"
                >
                  {voiceAlertMessage}
                </p>
              )}
              {voiceInterimTranscript && (
                <div className="rounded border border-border bg-background/70 p-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Interim transcript
                  </span>
                  <p
                    data-testid="voice-interim-transcript"
                    aria-live="polite"
                    className="mt-1 whitespace-pre-wrap text-foreground"
                  >
                    {voiceInterimTranscript}
                  </p>
                </div>
              )}
              {isVoiceReviewReady && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={voiceReviewFieldId} className="font-medium text-foreground">
                    Review voice transcript
                  </label>
                  <textarea
                    id={voiceReviewFieldId}
                    ref={voiceReviewRef}
                    value={reviewText}
                    onChange={(event) => handleVoiceReviewChange(event.target.value)}
                    aria-describedby={voiceDisclosureId}
                    className="min-h-16 resize-y rounded border border-border bg-background p-2 font-mono text-xs text-foreground outline-none focus:border-primary"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {reviewText.length}/{MAX_VOICE_REVIEW_LENGTH} characters
                  </span>
                </div>
              )}
              <p id={voiceDisclosureId} className="text-[10px] text-muted-foreground">
                Browser or vendor speech processing may occur. Send + Enter behaves like typed
                terminal input and may enter shell history.
              </p>
              {validationError && (
                <p
                  role="alert"
                  data-testid="voice-validation-alert"
                  className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive"
                >
                  {validationError}
                </p>
              )}
              {sendError && (
                <p
                  role="alert"
                  data-testid="voice-send-alert"
                  className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive"
                >
                  {sendError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {isVoiceReviewReady && (
                  <>
                    <button
                      type="button"
                      ref={firstVoiceSendButtonRef}
                      onClick={() => handleVoiceSend(false)}
                      disabled={isTerminalInputUnavailable}
                      aria-disabled={isTerminalInputUnavailable ? "true" : "false"}
                      className="rounded border border-border bg-background px-2 py-1 font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Send text
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVoiceSend(true)}
                      disabled={isTerminalInputUnavailable}
                      aria-disabled={isTerminalInputUnavailable ? "true" : "false"}
                      className="rounded border border-border bg-background px-2 py-1 font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Send + Enter
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleCancelVoiceInput}
                  className="rounded border border-border px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          </section>
        )}
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
        {restartNotice && (
          <div
            className="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded bg-primary/90 px-3 py-1 text-xs text-primary-foreground"
            role="status"
            aria-label="Terminal context restart notification"
          >
            {restartNotice}
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
