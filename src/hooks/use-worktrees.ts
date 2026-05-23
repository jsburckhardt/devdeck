"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Worktree } from "@/lib/types";

interface UseWorktreesReturn {
  worktrees: Worktree[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useWorktrees(slug: string | undefined): UseWorktreesReturn {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);

  const fetchWorktrees = useCallback(async (targetSlug: string) => {
    // Abort any in-flight request
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/worktrees?slug=${encodeURIComponent(targetSlug)}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Worktree[];
      if (!controller.signal.aborted) {
        setWorktrees(data);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err));
        setWorktrees([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset state synchronously when slug becomes undefined; no infinite loop risk
      setWorktrees([]);
      setLoading(false);
      setError(null);
      return;
    }
    void fetchWorktrees(slug);
    return () => {
      inFlightRef.current?.abort();
    };
  }, [slug, fetchWorktrees]);

  const refresh = useCallback(() => {
    if (slug) void fetchWorktrees(slug);
  }, [slug, fetchWorktrees]);

  return { worktrees, loading, error, refresh };
}
