"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike | undefined;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike | undefined;
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex?: number;
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

type AdvisoryPermissionState = "unknown" | "prompt" | "granted" | "denied";

interface PermissionStatusLike {
  state: string;
  onchange: (() => void) | null;
}

interface PermissionsLike {
  query: (descriptor: { name: "microphone" }) => Promise<PermissionStatusLike>;
}

export type VoiceInputStatus =
  | "unsupported"
  | "insecure-context"
  | "permission-needed"
  | "listening"
  | "transcribing"
  | "ready-to-send"
  | "denied"
  | "errored";

type VoiceInputPhase =
  | "idle"
  | "listening"
  | "transcribing"
  | "ready-to-send"
  | "denied"
  | "errored";

export type VoiceInputErrorCode =
  | "unsupported"
  | "insecure-context"
  | "not-allowed"
  | "service-not-allowed"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "aborted"
  | "start-failed"
  | "unknown";

export interface VoiceInputError {
  code: VoiceInputErrorCode;
  message: string;
  status: "unsupported" | "insecure-context" | "denied" | "errored";
}

export interface UseVoiceInputOptions {
  /**
   * Any panel/terminal context identifier. Changes invalidate active recognition
   * callbacks and clear transient transcripts so late browser events cannot
   * update a stale terminal panel.
   */
  contextKey?: string | number | null;
}

export interface UseVoiceInputReturn {
  isSupported: boolean;
  /**
   * Backwards-compatible support signal. Inaccessible states are represented by
   * status/canStart rather than by hiding the microphone entry point.
   */
  isAvailable: boolean;
  isSecureContext: boolean;
  canStart: boolean;
  isListening: boolean;
  status: VoiceInputStatus;
  permissionState: AdvisoryPermissionState;
  interimTranscript: string;
  finalTranscript: string;
  error: string | null;
  errorDetails: VoiceInputError | null;
  errorMessage: string | null;
  start: () => boolean;
  stop: () => void;
  cancel: () => void;
  clear: () => void;
}

function resolveSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function isBrowserSecureContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext === true;
}

function getRecognitionLanguage(): string {
  if (typeof navigator === "undefined") {
    return "en-US";
  }

  return navigator.language || "en-US";
}

function detachRecognitionHandlers(recognition: SpeechRecognitionLike) {
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
}

function stopRecognition(recognition: SpeechRecognitionLike, preferAbort: boolean) {
  try {
    if (preferAbort && recognition.abort) {
      recognition.abort();
      return;
    }

    recognition.stop();
  } catch {
    // Browser implementations may throw when stop/abort races with natural end.
  }
}

function normalizePermissionState(state: string | undefined): AdvisoryPermissionState {
  if (state === "granted" || state === "prompt" || state === "denied") {
    return state;
  }

  return "unknown";
}

function makeVoiceError(code: VoiceInputErrorCode): VoiceInputError {
  switch (code) {
    case "unsupported":
      return {
        code,
        status: "unsupported",
        message:
          "Voice input is not supported in this browser. Try a browser with SpeechRecognition support.",
      };
    case "insecure-context":
      return {
        code,
        status: "insecure-context",
        message:
          "Voice input requires HTTPS or localhost. Open DevDeck in a secure browser context to use the microphone.",
      };
    case "not-allowed":
      return {
        code,
        status: "denied",
        message:
          "Microphone permission was denied. Update browser or site settings to allow microphone access for DevDeck.",
      };
    case "service-not-allowed":
      return {
        code,
        status: "denied",
        message:
          "Speech recognition is blocked by the browser or site policy. Check browser speech and microphone settings.",
      };
    case "no-speech":
      return {
        code,
        status: "errored",
        message: "No speech was detected. Try again and speak after starting voice input.",
      };
    case "audio-capture":
      return {
        code,
        status: "errored",
        message:
          "No microphone was found or it is unavailable. Check your microphone and browser input settings.",
      };
    case "network":
      return {
        code,
        status: "errored",
        message:
          "Speech recognition had a network or service problem. Check connectivity and try again.",
      };
    case "aborted":
      return {
        code,
        status: "errored",
        message: "Speech recognition was cancelled. Try again when you are ready to speak.",
      };
    case "start-failed":
      return {
        code,
        status: "errored",
        message: "Voice input failed to start. Check microphone access and try again.",
      };
    case "unknown":
    default:
      return {
        code: "unknown",
        status: "errored",
        message: "Voice input encountered an unexpected recognition error. Try again.",
      };
  }
}

function normalizeRecognitionError(event: SpeechRecognitionErrorEventLike): VoiceInputError {
  switch (event.error) {
    case "not-allowed":
    case "service-not-allowed":
    case "no-speech":
    case "audio-capture":
    case "network":
    case "aborted":
      return makeVoiceError(event.error);
    default:
      return makeVoiceError("unknown");
  }
}

function deriveStatus({
  isSupported,
  isSecureContext,
  permissionState,
  phase,
}: {
  isSupported: boolean;
  isSecureContext: boolean;
  permissionState: AdvisoryPermissionState;
  phase: VoiceInputPhase;
}): VoiceInputStatus {
  if (!isSupported) {
    return "unsupported";
  }

  if (!isSecureContext) {
    return "insecure-context";
  }

  if (permissionState === "denied" || phase === "denied") {
    return "denied";
  }

  if (phase === "errored") {
    return "errored";
  }

  if (phase === "ready-to-send") {
    return "ready-to-send";
  }

  if (phase === "transcribing") {
    return "transcribing";
  }

  if (phase === "listening") {
    return "listening";
  }

  return "permission-needed";
}

function collectTranscripts(event: SpeechRecognitionEventLike) {
  const finalParts: string[] = [];
  const interimParts: string[] = [];

  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    const transcript = result?.[0]?.transcript;

    if (!result || typeof transcript !== "string") {
      continue;
    }

    if (result.isFinal) {
      finalParts.push(transcript);
    } else {
      interimParts.push(transcript);
    }
  }

  return {
    finalTranscript: finalParts.join(""),
    hasFinalTranscript: finalParts.length > 0,
    interimTranscript: interimParts.join(""),
    hasInterimTranscript: interimParts.length > 0,
  };
}

export function useVoiceInput({
  contextKey = null,
}: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const [phase, setPhase] = useState<VoiceInputPhase>("idle");
  const [permissionState, setPermissionState] = useState<AdvisoryPermissionState>("unknown");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [errorDetails, setErrorDetails] = useState<VoiceInputError | null>(null);

  const phaseRef = useRef(phase);
  const permissionStateRef = useRef(permissionState);
  const interimTranscriptRef = useRef(interimTranscript);
  const finalTranscriptRef = useRef(finalTranscript);
  const errorRef = useRef(errorDetails);
  const generationRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mountedRef = useRef(true);
  const contextKeyRef = useRef(contextKey);
  const didMountContextRef = useRef(false);

  const setPhaseState = useCallback((nextPhase: VoiceInputPhase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);

  const setPermissionStateValue = useCallback((nextState: AdvisoryPermissionState) => {
    permissionStateRef.current = nextState;
    setPermissionState(nextState);
  }, []);

  const setInterimTranscriptState = useCallback((nextTranscript: string) => {
    interimTranscriptRef.current = nextTranscript;
    setInterimTranscript(nextTranscript);
  }, []);

  const setFinalTranscriptState = useCallback((nextTranscript: string) => {
    finalTranscriptRef.current = nextTranscript;
    setFinalTranscript(nextTranscript);
  }, []);

  const setErrorState = useCallback((nextError: VoiceInputError | null) => {
    errorRef.current = nextError;
    setErrorDetails(nextError);
  }, []);

  const clearState = useCallback(() => {
    setInterimTranscriptState("");
    setFinalTranscriptState("");
    setErrorState(null);
    setPhaseState("idle");
  }, [setErrorState, setFinalTranscriptState, setInterimTranscriptState, setPhaseState]);

  const cleanupRecognition = useCallback(
    ({
      clearTranscripts,
      preferAbort,
      updateState,
    }: {
      clearTranscripts: boolean;
      preferAbort: boolean;
      updateState: boolean;
    }) => {
      generationRef.current += 1;

      const recognition = recognitionRef.current;
      recognitionRef.current = null;

      if (recognition) {
        detachRecognitionHandlers(recognition);
        stopRecognition(recognition, preferAbort);
      }

      if (!updateState || !mountedRef.current) {
        return;
      }

      if (clearTranscripts) {
        clearState();
        return;
      }

      setInterimTranscriptState("");
      setErrorState(null);
      setPhaseState(finalTranscriptRef.current ? "ready-to-send" : "idle");
    },
    [clearState, setErrorState, setInterimTranscriptState, setPhaseState],
  );

  const isCurrentSession = useCallback((generation: number, recognition: SpeechRecognitionLike) => {
    return (
      mountedRef.current &&
      generationRef.current === generation &&
      recognitionRef.current === recognition
    );
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      cleanupRecognition({ clearTranscripts: true, preferAbort: true, updateState: false });
    };
  }, [cleanupRecognition]);

  useEffect(() => {
    if (!didMountContextRef.current) {
      didMountContextRef.current = true;
      contextKeyRef.current = contextKey;
      return;
    }

    if (contextKeyRef.current === contextKey) {
      return;
    }

    contextKeyRef.current = contextKey;
    cleanupRecognition({ clearTranscripts: true, preferAbort: true, updateState: true });
  }, [cleanupRecognition, contextKey]);

  const isSupported = resolveSpeechRecognitionConstructor() !== null;
  const isSecureContext = isBrowserSecureContext();

  useEffect(() => {
    if (!isSupported || !isSecureContext || typeof navigator === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- advisory browser permission state mirrors external browser capability
      setPermissionStateValue("unknown");
      return;
    }

    const permissions = (navigator as unknown as { permissions?: PermissionsLike }).permissions;
    if (!permissions?.query) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- unsupported Permissions API is an advisory unknown state
      setPermissionStateValue("unknown");
      return;
    }

    let cancelled = false;
    let permissionStatus: PermissionStatusLike | null = null;

    function applyPermissionState(nextState: AdvisoryPermissionState) {
      if (cancelled || !mountedRef.current) {
        return;
      }

      setPermissionStateValue(nextState);

      if (nextState === "denied") {
        cleanupRecognition({ clearTranscripts: false, preferAbort: true, updateState: false });
        setInterimTranscriptState("");
        setErrorState(makeVoiceError("not-allowed"));
        setPhaseState("denied");
        return;
      }

      if (phaseRef.current === "denied" && errorRef.current?.status === "denied") {
        setErrorState(null);
        setPhaseState(finalTranscriptRef.current ? "ready-to-send" : "idle");
      }
    }

    permissions
      .query({ name: "microphone" })
      .then((status) => {
        if (cancelled || !mountedRef.current) {
          return;
        }

        permissionStatus = status;
        applyPermissionState(normalizePermissionState(status.state));
        status.onchange = () => applyPermissionState(normalizePermissionState(status.state));
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) {
          setPermissionStateValue("unknown");
        }
      });

    return () => {
      cancelled = true;
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, [
    cleanupRecognition,
    isSecureContext,
    isSupported,
    setErrorState,
    setInterimTranscriptState,
    setPermissionStateValue,
    setPhaseState,
  ]);

  const start = useCallback(() => {
    const Recognition = resolveSpeechRecognitionConstructor();
    if (!Recognition) {
      setErrorState(makeVoiceError("unsupported"));
      setPhaseState("idle");
      return false;
    }

    if (!isBrowserSecureContext()) {
      setErrorState(makeVoiceError("insecure-context"));
      setPhaseState("idle");
      return false;
    }

    if (permissionStateRef.current === "denied" || phaseRef.current === "denied") {
      setErrorState(makeVoiceError("not-allowed"));
      setPhaseState("denied");
      return false;
    }

    if (recognitionRef.current) {
      return false;
    }

    generationRef.current += 1;
    const generation = generationRef.current;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = getRecognitionLanguage();

    recognition.onresult = (event) => {
      if (!isCurrentSession(generation, recognition)) {
        return;
      }

      const transcripts = collectTranscripts(event);
      if (transcripts.hasFinalTranscript) {
        setFinalTranscriptState(transcripts.finalTranscript);
        setInterimTranscriptState("");
        setErrorState(null);
        setPhaseState("ready-to-send");
        return;
      }

      if (transcripts.hasInterimTranscript) {
        setInterimTranscriptState(transcripts.interimTranscript);
        setPhaseState("transcribing");
      }
    };

    recognition.onerror = (event) => {
      if (!isCurrentSession(generation, recognition)) {
        return;
      }

      const normalizedError = normalizeRecognitionError(event);
      recognitionRef.current = null;
      detachRecognitionHandlers(recognition);
      stopRecognition(recognition, false);
      setInterimTranscriptState("");
      setErrorState(normalizedError);
      setPhaseState(normalizedError.status === "denied" ? "denied" : "errored");
    };

    recognition.onend = () => {
      if (!isCurrentSession(generation, recognition)) {
        return;
      }

      recognitionRef.current = null;
      detachRecognitionHandlers(recognition);
      setInterimTranscriptState("");
      setPhaseState(finalTranscriptRef.current ? "ready-to-send" : "idle");
    };

    recognitionRef.current = recognition;
    setInterimTranscriptState("");
    setFinalTranscriptState("");
    setErrorState(null);
    setPhaseState("listening");

    try {
      recognition.start();
      return true;
    } catch {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }

      detachRecognitionHandlers(recognition);
      setInterimTranscriptState("");
      setErrorState(makeVoiceError("start-failed"));
      setPhaseState("errored");
      return false;
    }
  }, [
    isCurrentSession,
    setErrorState,
    setFinalTranscriptState,
    setInterimTranscriptState,
    setPhaseState,
  ]);

  const stop = useCallback(() => {
    cleanupRecognition({ clearTranscripts: false, preferAbort: false, updateState: true });
  }, [cleanupRecognition]);

  const cancel = useCallback(() => {
    cleanupRecognition({ clearTranscripts: true, preferAbort: true, updateState: true });
  }, [cleanupRecognition]);

  const clear = useCallback(() => {
    cleanupRecognition({ clearTranscripts: true, preferAbort: true, updateState: true });
  }, [cleanupRecognition]);

  const status = deriveStatus({
    isSupported,
    isSecureContext,
    permissionState,
    phase,
  });
  const isListening = status === "listening" || status === "transcribing";
  const canStart =
    isSupported &&
    isSecureContext &&
    permissionState !== "denied" &&
    phase !== "denied" &&
    !isListening;

  return {
    isSupported,
    isAvailable: isSupported,
    isSecureContext,
    canStart,
    isListening,
    status,
    permissionState,
    interimTranscript,
    finalTranscript,
    error: errorDetails?.message ?? null,
    errorDetails,
    errorMessage: errorDetails?.message ?? null,
    start,
    stop,
    cancel,
    clear,
  };
}
