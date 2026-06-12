import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceInput } from "./use-voice-input";

type SpeechRecognitionGlobalName = "SpeechRecognition" | "webkitSpeechRecognition";

interface MockRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly 0: { transcript: string };
}

interface MockRecognitionResultEvent {
  readonly resultIndex?: number;
  readonly results: MockRecognitionResult[];
}

interface MockRecognitionErrorEvent {
  readonly error?: string;
}

interface MockSpeechWindow extends Window {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
}

interface MockPermissionStatus {
  state: string;
  onchange: (() => void) | null;
}

interface MockNavigator extends Navigator {
  permissions?: unknown;
}

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];

  continuous = true;
  interimResults = false;
  lang = "";
  onresult: ((event: MockRecognitionResultEvent) => void) | null = null;
  onerror: ((event: MockRecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }
}

const originalSecureContextDescriptor = Object.getOwnPropertyDescriptor(window, "isSecureContext");
const originalPermissionsDescriptor = Object.getOwnPropertyDescriptor(navigator, "permissions");

function speechWindow(): MockSpeechWindow {
  return window as MockSpeechWindow;
}

function mockNavigator(): MockNavigator {
  return navigator as MockNavigator;
}

function clearSpeechRecognitionGlobals() {
  Reflect.deleteProperty(speechWindow(), "SpeechRecognition");
  Reflect.deleteProperty(speechWindow(), "webkitSpeechRecognition");
}

function installSpeechRecognition(name: SpeechRecognitionGlobalName = "SpeechRecognition") {
  Object.defineProperty(speechWindow(), name, {
    configurable: true,
    writable: true,
    value: MockSpeechRecognition,
  });
}

function setSecureContext(isSecureContext: boolean) {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: isSecureContext,
  });
}

function restoreSecureContext() {
  if (originalSecureContextDescriptor) {
    Object.defineProperty(window, "isSecureContext", originalSecureContextDescriptor);
    return;
  }

  Reflect.deleteProperty(window, "isSecureContext");
}

function setPermissionsApi(value: unknown) {
  Object.defineProperty(mockNavigator(), "permissions", {
    configurable: true,
    value,
  });
}

function clearPermissionsApi() {
  if (originalPermissionsDescriptor) {
    Object.defineProperty(navigator, "permissions", originalPermissionsDescriptor);
    return;
  }

  Reflect.deleteProperty(mockNavigator(), "permissions");
}

function installPermissionsApi(state: string) {
  const permissionStatus: MockPermissionStatus = { state, onchange: null };
  const query = vi.fn().mockResolvedValue(permissionStatus);
  setPermissionsApi({ query });
  return { permissionStatus, query };
}

function createResultEvent(
  results: Array<{ isFinal: boolean; transcript: string }>,
  resultIndex = 0,
): MockRecognitionResultEvent {
  return {
    resultIndex,
    results: results.map((result) => ({
      isFinal: result.isFinal,
      length: 1,
      0: { transcript: result.transcript },
    })),
  };
}

describe("useVoiceInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockSpeechRecognition.instances = [];
    clearSpeechRecognitionGlobals();
    clearPermissionsApi();
    setSecureContext(true);
  });

  afterEach(() => {
    clearSpeechRecognitionGlobals();
    clearPermissionsApi();
    restoreSecureContext();
  });

  it("TV1: safely reports unsupported, standard support, and webkit support", () => {
    const { result, rerender } = renderHook(() => useVoiceInput());

    expect(result.current.isSupported).toBe(false);
    expect(result.current.isAvailable).toBe(false);
    expect(result.current.status).toBe("unsupported");
    expect(result.current.canStart).toBe(false);

    installSpeechRecognition("webkitSpeechRecognition");
    rerender();

    expect(result.current.isSupported).toBe(true);
    expect(result.current.status).toBe("permission-needed");
    expect(result.current.canStart).toBe(true);

    clearSpeechRecognitionGlobals();
    installSpeechRecognition("SpeechRecognition");
    rerender();

    expect(result.current.isSupported).toBe(true);
    expect(result.current.status).toBe("permission-needed");
  });

  it("TV1: blocks insecure starts before constructing recognition", () => {
    installSpeechRecognition();
    setSecureContext(false);
    const { result } = renderHook(() => useVoiceInput());

    expect(result.current.status).toBe("insecure-context");

    let started = true;
    act(() => {
      started = result.current.start();
    });

    expect(started).toBe(false);
    expect(result.current.isListening).toBe(false);
    expect(result.current.errorDetails?.code).toBe("insecure-context");
    expect(result.current.errorMessage).toMatch(/HTTPS or localhost/i);
    expect(MockSpeechRecognition.instances).toHaveLength(0);
  });

  it("TV1: treats missing or unavailable Permissions API as unknown rather than failure", async () => {
    installSpeechRecognition();
    const { result, rerender } = renderHook(() => useVoiceInput());

    expect(result.current.permissionState).toBe("unknown");
    expect(result.current.status).toBe("permission-needed");
    expect(result.current.error).toBeNull();

    setPermissionsApi({ query: vi.fn().mockRejectedValue(new Error("unsupported")) });
    rerender();

    await waitFor(() => expect(result.current.permissionState).toBe("unknown"));
    expect(result.current.status).toBe("permission-needed");
    expect(result.current.error).toBeNull();
  });

  it("TV1: maps advisory microphone permission states including denied", async () => {
    installSpeechRecognition();
    const { permissionStatus, query } = installPermissionsApi("prompt");
    const { result } = renderHook(() => useVoiceInput());

    await waitFor(() => expect(result.current.permissionState).toBe("prompt"));
    expect(query).toHaveBeenCalledWith({ name: "microphone" });
    expect(result.current.status).toBe("permission-needed");

    act(() => {
      permissionStatus.state = "granted";
      permissionStatus.onchange?.();
    });
    expect(result.current.permissionState).toBe("granted");
    expect(result.current.status).toBe("permission-needed");

    act(() => {
      permissionStatus.state = "denied";
      permissionStatus.onchange?.();
    });

    expect(result.current.permissionState).toBe("denied");
    expect(result.current.status).toBe("denied");
    expect(result.current.errorDetails?.code).toBe("not-allowed");
    expect(result.current.canStart).toBe(false);

    let started = true;
    act(() => {
      started = result.current.start();
    });

    expect(started).toBe(false);
    expect(MockSpeechRecognition.instances).toHaveLength(0);
  });

  it("TV2: configures one-shot recognition with interim results and language fallback", () => {
    installSpeechRecognition();
    const { result } = renderHook(() => useVoiceInput());

    let started = false;
    act(() => {
      started = result.current.start();
    });

    expect(started).toBe(true);
    expect(result.current.status).toBe("listening");
    expect(MockSpeechRecognition.instances).toHaveLength(1);

    const recognition = MockSpeechRecognition.instances[0];
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(recognition.continuous).toBe(false);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.lang).toBe(navigator.language || "en-US");
  });

  it("TV2: tracks interim and final transcripts without terminal dispatch", () => {
    installSpeechRecognition();
    const { result } = renderHook(() => useVoiceInput());

    act(() => {
      result.current.start();
    });
    const recognition = MockSpeechRecognition.instances[0];

    act(() => {
      recognition.onresult?.(createResultEvent([{ isFinal: false, transcript: "draft text" }]));
    });

    expect(result.current.status).toBe("transcribing");
    expect(result.current.interimTranscript).toBe("draft text");
    expect(result.current.finalTranscript).toBe("");

    act(() => {
      recognition.onresult?.(
        createResultEvent(
          [
            { isFinal: false, transcript: "ignored earlier draft" },
            { isFinal: true, transcript: "hello && pwd" },
          ],
          1,
        ),
      );
    });

    expect(result.current.status).toBe("ready-to-send");
    expect(result.current.interimTranscript).toBe("");
    expect(result.current.finalTranscript).toBe("hello && pwd");
  });

  it("TV3: normalizes known recognition errors and cleans up handlers", () => {
    const expected: Array<[string | undefined, "denied" | "errored", string]> = [
      ["not-allowed", "denied", "Microphone permission was denied"],
      ["service-not-allowed", "denied", "Speech recognition is blocked"],
      ["no-speech", "errored", "No speech was detected"],
      ["audio-capture", "errored", "No microphone was found"],
      ["network", "errored", "network or service problem"],
      ["aborted", "errored", "cancelled"],
      [undefined, "errored", "unexpected recognition error"],
    ];

    for (const [errorCode, status, message] of expected) {
      MockSpeechRecognition.instances = [];
      installSpeechRecognition();
      const { result, unmount } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.start();
      });
      const recognition = MockSpeechRecognition.instances[0];

      act(() => {
        recognition.onerror?.({ error: errorCode });
      });

      expect(result.current.status).toBe(status);
      expect(result.current.errorMessage).toMatch(new RegExp(message, "i"));
      expect(recognition.stop).toHaveBeenCalledTimes(1);
      expect(recognition.onresult).toBeNull();
      expect(recognition.onerror).toBeNull();
      expect(recognition.onend).toBeNull();

      unmount();
    }
  });

  it("TV3: supports stop, cancel, clear, and ignores late callbacks after cancel", () => {
    installSpeechRecognition();
    const { result } = renderHook(() => useVoiceInput());

    act(() => {
      result.current.start();
    });
    const stoppedRecognition = MockSpeechRecognition.instances[0];

    act(() => {
      stoppedRecognition.onresult?.(createResultEvent([{ isFinal: false, transcript: "partial" }]));
    });
    expect(result.current.status).toBe("transcribing");

    act(() => {
      result.current.stop();
    });

    expect(stoppedRecognition.stop).toHaveBeenCalledTimes(1);
    expect(stoppedRecognition.onresult).toBeNull();
    expect(result.current.status).toBe("permission-needed");
    expect(result.current.interimTranscript).toBe("");

    act(() => {
      result.current.start();
    });
    const cancelledRecognition = MockSpeechRecognition.instances[1];
    const lateResult = cancelledRecognition.onresult;

    act(() => {
      cancelledRecognition.onresult?.(
        createResultEvent([{ isFinal: true, transcript: "will be cleared" }]),
      );
    });
    expect(result.current.finalTranscript).toBe("will be cleared");

    act(() => {
      result.current.cancel();
    });

    expect(cancelledRecognition.abort).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("permission-needed");
    expect(result.current.finalTranscript).toBe("");

    act(() => {
      lateResult?.(createResultEvent([{ isFinal: true, transcript: "late stale text" }]));
    });

    expect(result.current.finalTranscript).toBe("");

    act(() => {
      result.current.start();
    });
    act(() => {
      MockSpeechRecognition.instances[2].onresult?.(
        createResultEvent([{ isFinal: true, transcript: "clear me" }]),
      );
    });
    expect(result.current.finalTranscript).toBe("clear me");

    act(() => {
      result.current.clear();
    });

    expect(result.current.finalTranscript).toBe("");
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("permission-needed");
  });

  it("TV2: ignores late callbacks after context changes", () => {
    installSpeechRecognition();
    const { result, rerender } = renderHook(({ contextKey }) => useVoiceInput({ contextKey }), {
      initialProps: { contextKey: "project-one:.trees/a" },
    });

    act(() => {
      result.current.start();
    });
    const recognition = MockSpeechRecognition.instances[0];
    const lateResult = recognition.onresult;
    const lateError = recognition.onerror;

    rerender({ contextKey: "project-two:.trees/a" });

    expect(recognition.abort).toHaveBeenCalledTimes(1);
    expect(result.current.finalTranscript).toBe("");
    expect(result.current.status).toBe("permission-needed");

    act(() => {
      lateResult?.(createResultEvent([{ isFinal: true, transcript: "stale" }]));
      lateError?.({ error: "network" });
    });

    expect(result.current.finalTranscript).toBe("");
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("permission-needed");
  });

  it("TV3: stops active recognition and detaches handlers on unmount", () => {
    installSpeechRecognition();
    const { result, unmount } = renderHook(() => useVoiceInput());

    act(() => {
      result.current.start();
    });

    const recognition = MockSpeechRecognition.instances[0];
    const lateResult = recognition.onresult;
    unmount();

    expect(recognition.abort).toHaveBeenCalledTimes(1);
    expect(recognition.onresult).toBeNull();
    expect(recognition.onerror).toBeNull();
    expect(recognition.onend).toBeNull();

    expect(() =>
      lateResult?.(createResultEvent([{ isFinal: true, transcript: "after unmount" }])),
    ).not.toThrow();
  });
});
