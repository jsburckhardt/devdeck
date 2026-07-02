import { test, expect, type Page } from "@playwright/test";
import { ensureProject, openAuthed, expectTerminalConnected, projectRoot } from "./helpers";

const TERMINAL_PROJECT_SLUG = "terminal-target";

async function openFirstProjectTerminal(page: Page) {
  await ensureProject(TERMINAL_PROJECT_SLUG, {
    description: "Deterministic Playwright fixture for terminal flows",
  });
  await openAuthed(page);

  // Wait for projects to load and click the first one
  await page.waitForSelector('[data-testid="project-card"]', { timeout: 10000 });
  await page.getByRole("button", { name: new RegExp(TERMINAL_PROJECT_SLUG) }).click();

  // Wait for workspace to load and terminal panel to appear
  await page.waitForSelector('[data-testid="terminal-panel"]', { timeout: 10000 });

  // Check terminal connected
  await expectTerminalConnected(page);
}

async function expectNoTerminalHorizontalOverflow(page: Page) {
  await expect(page.locator('[data-testid="terminal-container"] .xterm')).toBeVisible({
    timeout: 15000,
  });

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const tolerance = 1;
          const host = document.querySelector('[data-testid="terminal-container"]');
          const measurements = [
            ["terminal-container", host],
            ["xterm", host?.querySelector(".xterm") ?? null],
            ["xterm-viewport", host?.querySelector(".xterm-viewport") ?? null],
            ["xterm-screen", host?.querySelector(".xterm-screen") ?? null],
          ] as const;

          return measurements.flatMap(([name, element]) => {
            if (!(element instanceof HTMLElement)) {
              return [`${name}:missing`];
            }

            const overflow = element.scrollWidth - element.clientWidth;
            return overflow > tolerance
              ? [`${name}:${element.scrollWidth}>${element.clientWidth}`]
              : [];
          });
        }),
      { timeout: 15000 },
    )
    .toEqual([]);
}

async function expectTerminalLine(page: Page, expectedLine: string) {
  await expect
    .poll(
      async () => {
        const rows = await page
          .locator('[data-testid="terminal-container"] .xterm-rows > div')
          .evaluateAll((rows) => rows.map((row) => row.textContent?.trim() ?? ""));

        // xterm can wrap very narrow/mobile rows between characters. Check both
        // row-preserving text and a compact row join so the assertion still
        // proves the terminal emitted the marker without depending on wrapping.
        return `${rows.join("\n")}\n${rows.join("")}`;
      },
      { timeout: 5000 },
    )
    .toContain(expectedLine);
}

async function installCoarsePointerTabletEmulation(page: Page) {
  await page.addInitScript(() => {
    const originalMatchMedia = window.matchMedia.bind(window);
    const createMediaQueryList = (query: string, matches: boolean): MediaQueryList =>
      ({
        matches,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
      }) as MediaQueryList;

    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    window.matchMedia = (query: string): MediaQueryList => {
      if (query === "(pointer: coarse)" || query === "(any-pointer: coarse)") {
        return createMediaQueryList(query, true);
      }
      return originalMatchMedia(query);
    };
  });
}

async function expectRenderedTerminalFontSize(page: Page, expectedFontSize: string) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const host = document.querySelector('[data-testid="terminal-container"]');
          const candidates = [
            host?.querySelector(".xterm"),
            host?.querySelector(".xterm-rows"),
            host?.querySelector(".xterm-screen"),
            host?.querySelector(".xterm-rows > div"),
            host?.querySelector(".xterm-helper-textarea"),
          ];
          return [
            ...new Set(
              candidates
                .filter((element): element is HTMLElement => element instanceof HTMLElement)
                .map((element) => getComputedStyle(element).fontSize),
            ),
          ];
        }),
      { timeout: 5000 },
    )
    .toContain(expectedFontSize);
}

async function installMockSpeechRecognition(page: Page) {
  await page.addInitScript(() => {
    interface MockRecognitionResultEvent {
      resultIndex: number;
      results: Array<{
        isFinal: boolean;
        length: number;
        0: { transcript: string };
      }>;
    }

    interface MockSpeechRecognitionWindow extends Window {
      SpeechRecognition?: new () => MockSpeechRecognition;
      webkitSpeechRecognition?: new () => MockSpeechRecognition;
      __devdeckSpeechRecognitionInstances?: MockSpeechRecognition[];
      __devdeckEmitSpeechResult?: (transcript: string, isFinal: boolean) => void;
      __devdeckEndSpeechRecognition?: () => void;
    }

    class MockSpeechRecognition {
      continuous = true;
      interimResults = false;
      lang = "";
      onresult: ((event: MockRecognitionResultEvent) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        const speechWindow = window as MockSpeechRecognitionWindow;
        speechWindow.__devdeckSpeechRecognitionInstances ??= [];
        speechWindow.__devdeckSpeechRecognitionInstances.push(this);
      }

      stop() {
        this.onend?.();
      }

      abort() {
        this.onend?.();
      }

      emitResult(transcript: string, isFinal: boolean) {
        this.onresult?.({
          resultIndex: 0,
          results: [
            {
              isFinal,
              length: 1,
              0: { transcript },
            },
          ],
        });
      }
    }

    const speechWindow = window as MockSpeechRecognitionWindow;
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: {
        query: async ({ name }: { name: string }) => ({
          state: name === "microphone" ? "prompt" : "granted",
          onchange: null,
        }),
      },
    });
    Object.defineProperty(speechWindow, "SpeechRecognition", {
      configurable: true,
      value: MockSpeechRecognition,
    });
    Object.defineProperty(speechWindow, "webkitSpeechRecognition", {
      configurable: true,
      value: MockSpeechRecognition,
    });
    speechWindow.__devdeckEmitSpeechResult = (transcript, isFinal) => {
      speechWindow.__devdeckSpeechRecognitionInstances?.at(-1)?.emitResult(transcript, isFinal);
    };
    speechWindow.__devdeckEndSpeechRecognition = () => {
      speechWindow.__devdeckSpeechRecognitionInstances?.at(-1)?.onend?.();
    };
  });
}

test("terminal connects, fits without horizontal overflow, and executes commands", async ({
  page,
}) => {
  await openFirstProjectTerminal(page);
  await expectNoTerminalHorizontalOverflow(page);

  // Type a command in the terminal
  const terminalContainer = page.locator('[data-testid="terminal-container"]');
  await terminalContainer.click();
  await page.keyboard.type("echo hello-devdeck\n");

  // Wait for output
  await expectTerminalLine(page, "hello-devdeck");
  await expectNoTerminalHorizontalOverflow(page);
});

test("terminal keeps fitting without horizontal overflow after layout changes", async ({
  page,
}) => {
  await openFirstProjectTerminal(page);
  await expectNoTerminalHorizontalOverflow(page);

  await page.getByRole("button", { name: "Hide File Preview" }).click();
  await expectNoTerminalHorizontalOverflow(page);

  await page.getByRole("button", { name: "Hide Explorer" }).click();
  await expectNoTerminalHorizontalOverflow(page);

  await expect(page.locator('[data-testid="terminal-panel"]').getByText("Connected")).toBeVisible();
});

test.describe("touch tablet terminal font size", () => {
  test.use({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
    isMobile: true,
  });

  test("renders at 12px while connected and contained", async ({ page }) => {
    await installCoarsePointerTabletEmulation(page);
    await openFirstProjectTerminal(page);

    await expectRenderedTerminalFontSize(page, "12px");
    await expect(
      page.locator('[data-testid="terminal-panel"]').getByText("Connected"),
    ).toBeVisible();
    await expectNoTerminalHorizontalOverflow(page);
  });
});

test("mobile keyboard helper sends an arrow key without disconnecting", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirstProjectTerminal(page);

  const marker = "M68";
  const rawModeProbe =
    'node -e "console.log(\\\"RDY\\\");process.stdin.setRawMode(true);process.stdin.resume();let b=[];process.stdin.on(\\"data\\",d=>{b.push(...d);if(b.length>=3){console.log(b[0]===27&&b[1]===91&&b[2]===65?\\"M68\\":\\"BAD\\");process.exit(0)}})"';
  const terminalContainer = page.locator("[data-testid=terminal-container]");
  await terminalContainer.click();
  await page.keyboard.type(rawModeProbe);
  await page.keyboard.press("Enter");
  await expectTerminalLine(page, "RDY");

  await page.getByRole("button", { name: "Terminal keyboard helper" }).click();
  const helperToolbar = page.getByRole("toolbar", { name: "Terminal keyboard helper keys" });
  await expect(helperToolbar).toBeVisible();

  await helperToolbar.getByRole("button", { name: "Up" }).click();
  await expectTerminalLine(page, marker);

  await expect(page.locator("[data-testid=terminal-panel]").getByText("Connected")).toBeVisible();
});

test("terminal voice input reviews mocked speech before sending to xterm", async ({ page }) => {
  await installMockSpeechRecognition(page);
  await openFirstProjectTerminal(page);

  const terminalContainer = page.locator('[data-testid="terminal-container"]');
  await terminalContainer.click();
  await page.getByRole("button", { name: "Start terminal voice input" }).click();

  await page.evaluate(() => {
    const speechWindow = window as typeof window & {
      __devdeckEmitSpeechResult?: (transcript: string, isFinal: boolean) => void;
    };
    speechWindow.__devdeckEmitSpeechResult?.("draft voice transcript", false);
  });
  await expect(page.getByTestId("voice-interim-transcript")).toContainText(
    "draft voice transcript",
  );

  await page.evaluate(() => {
    const speechWindow = window as typeof window & {
      __devdeckEmitSpeechResult?: (transcript: string, isFinal: boolean) => void;
      __devdeckEndSpeechRecognition?: () => void;
    };
    speechWindow.__devdeckEmitSpeechResult?.("echo SHOULD_NOT_SEND", true);
    speechWindow.__devdeckEndSpeechRecognition?.();
  });

  const reviewField = page.getByLabel("Review voice transcript");
  await expect(reviewField).toHaveValue("echo SHOULD_NOT_SEND");
  await reviewField.fill("printf 'VOICE_E2E\\n'");
  await page.getByRole("button", { name: "Send + Enter" }).click();

  await expectTerminalLine(page, "VOICE_E2E");
  await expect(page.locator("[data-testid=terminal-panel]").getByText("Connected")).toBeVisible();
  await expectNoTerminalHorizontalOverflow(page);
});

test("rejects access without token", async ({ page }) => {
  // Clear cookies to ensure no existing auth
  await page.context().clearCookies();

  // Visit without token — should get 401 Access Denied
  const response = await page.goto("/");
  expect(response?.status()).toBe(401);
  await expect(page.locator("text=Access Denied")).toBeVisible({ timeout: 5000 });
});

test("project root terminal starts in the selected project context", async ({ page }) => {
  const projectPath = projectRoot(TERMINAL_PROJECT_SLUG);
  await openFirstProjectTerminal(page);

  const terminalContainer = page.locator('[data-testid="terminal-container"]');
  await terminalContainer.click();
  await page.keyboard.type("pwd\n");

  await expectTerminalLine(page, projectPath);
});
