import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf-8");
}

describe("Issue #81 near-realtime synchronization contract", () => {
  it("uses fixed client polling without server-push or watcher dependencies", () => {
    const workspaceLayout = readRepoFile("src/components/workspace-layout.tsx");
    const useWorktrees = readRepoFile("src/hooks/use-worktrees.ts");
    const packageJson = readRepoFile("package.json");

    expect(workspaceLayout).toContain("ROOT_FILE_TREE_POLL_INTERVAL_MS = 5000");
    expect(useWorktrees).toContain("WORKTREE_POLL_INTERVAL_MS = 5000");
    expect(workspaceLayout).not.toMatch(/EventSource|Server-Sent Events|chokidar/);
    expect(useWorktrees).not.toMatch(/EventSource|Server-Sent Events|chokidar/);
    expect(packageJson).not.toMatch(/"chokidar"|"eventsource"/i);
  });

  it("does not add a config-file polling interval surface", () => {
    const configSource = readRepoFile("src/lib/config.ts");

    expect(configSource).not.toMatch(/poll/i);
    expect(configSource).not.toMatch(/fileTreeSync|worktreeSync|syncInterval/);
  });
});
