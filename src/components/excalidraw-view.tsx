"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Spinner, WarningCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/theme-provider";

const ExcalidrawReact = dynamic(
  () => import("@excalidraw/excalidraw").then((m) => ({ default: m.Excalidraw })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Spinner size={24} className="animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

// Excalidraw's upstream type exports are broken (@excalidraw/math missing, esModuleInterop
// issues), so we define a minimal local interface matching the initialData shape.
interface ExcalidrawScene {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

function parseScene(content: string): { scene: ExcalidrawScene } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return { error: `JSON parse error: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).elements)
  ) {
    return { error: "Not a valid Excalidraw scene: missing or invalid 'elements' array." };
  }
  return { scene: parsed as ExcalidrawScene };
}

export function ExcalidrawView({ content }: { content: string }) {
  const { theme } = useTheme();
  const parsed = useMemo(() => parseScene(content), [content]);

  if ("error" in parsed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <WarningCircle size={36} className="text-amber-500" />
        <p className="text-sm font-medium text-foreground">Invalid Excalidraw file</p>
        <p className="max-w-sm text-center text-xs font-mono">{parsed.error}</p>
      </div>
    );
  }

  const { elements, appState, files } = parsed.scene;
  return (
    <div className="h-full w-full">
      <ExcalidrawReact
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- upstream types are broken
        initialData={{ elements, appState, files, scrollToContent: true } as any}
        viewModeEnabled={true}
        theme={theme === "dark" ? "dark" : "light"}
      />
    </div>
  );
}
