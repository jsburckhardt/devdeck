import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf-8");
}

describe("Issue #81 near-realtime synchronization contract", () => {
  it("uses SSE server-push as primary synchronization with chokidar watchers", () => {
    const workspaceLayout = readRepoFile("src/components/workspace-layout.tsx");
    const useWorktrees = readRepoFile("src/hooks/use-worktrees.ts");
    const eventRoute = readRepoFile("src/app/api/files/events/route.ts");
    const watcherHelper = readRepoFile("src/server/file-tree-sync.ts");
    const hook = readRepoFile("src/hooks/use-file-tree-sync.ts");
    const packageJson = readRepoFile("package.json");

    expect(workspaceLayout).toContain("ROOT_FILE_TREE_POLL_INTERVAL_MS = 5000");
    expect(useWorktrees).toContain("WORKTREE_POLL_INTERVAL_MS = 5000");
    expect(workspaceLayout).toContain("useFileTreeSync");
    expect(workspaceLayout).toContain("fileTreeSyncFallbackActive");
    expect(useWorktrees).toContain("pollingEnabled");
    expect(eventRoute).toContain("text/event-stream");
    expect(eventRoute).toContain("file-tree:ready");
    expect(eventRoute).toContain("file-tree:changed");
    expect(eventRoute).toContain("file-tree:degraded");
    expect(watcherHelper).toContain("FILE_TREE_SYNC_DEBOUNCE_MS = 250");
    expect(watcherHelper).toContain("FILE_TREE_SYNC_FORCE_FLUSH_MS = 1000");
    expect(watcherHelper).toContain("FILE_TREE_SYNC_MAX_PATH_HINTS = 256");
    expect(hook).toContain("EventSource");
    expect(packageJson).toMatch(/"chokidar"/i);
  });

  it("does not add a config-file polling interval surface", () => {
    const configSource = readRepoFile("src/lib/config.ts");

    expect(configSource).not.toMatch(/poll/i);
    expect(configSource).not.toMatch(/fileTreeSync|worktreeSync|syncInterval/);
  });

  it("documents the file-tree sync endpoint, helper, hook, APIs, events, and fallback behavior", () => {
    const llm = readRepoFile("LLM.txt");

    expect(llm).toContain("src/app/api/files/events/route.ts");
    expect(llm).toContain("src/server/file-tree-sync.ts");
    expect(llm).toContain("src/hooks/use-file-tree-sync.ts");
    expect(llm).toContain("file-tree sync status/error/retry APIs");
    expect(llm).toContain("file-tree:ready");
    expect(llm).toContain("file-tree:changed");
    expect(llm).toContain("file-tree:degraded");
    expect(llm).toContain("5000 ms root polling only as degraded fallback");
  });
});
