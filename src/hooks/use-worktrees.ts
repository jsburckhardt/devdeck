"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Worktree } from "@/lib/types";

interface UseWorktreesReturn {
  worktrees: Worktree[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const WORKTREE_POLL_INTERVAL_MS = 5000;

type FetchWorktreesMode = "foreground" | "poll";

interface InFlightWorktreesRequest {
  slug: string;
  controller: AbortController;
  promise: Promise<void>;
}

export function useWorktrees(slug: string | undefined): UseWorktreesReturn {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeSlugRef = useRef<string | undefined>(slug);
  const inFlightRef = useRef<InFlightWorktreesRequest | null>(null);

  const fetchWorktrees = useCallback(async (targetSlug: string, mode: FetchWorktreesMode) => {
    if (mode === "poll" && activeSlugRef.current !== targetSlug) return;

    const existingRequest = inFlightRef.current;
    if (existingRequest?.slug === targetSlug) {
      if (mode === "poll") return existingRequest.promise;
      existingRequest.controller.abort();
    } else {
      existingRequest?.controller.abort();
    }

    const isPoll = mode === "poll";
    const controller = new AbortController();
    const request: InFlightWorktreesRequest = {
      slug: targetSlug,
      controller,
      promise: Promise.resolve(),
    };
    inFlightRef.current = request;

    request.promise = (async () => {
      if (!isPoll) {
        setLoading(true);
        setError(null);
      }

      try {
        const res = await fetch(`/api/worktrees?slug=${encodeURIComponent(targetSlug)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Worktree[];
        if (controller.signal.aborted || activeSlugRef.current !== targetSlug) return;
        setWorktrees(data);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted || activeSlugRef.current !== targetSlug) return;
        setError(err instanceof Error ? err.message : String(err));
        if (!isPoll) {
          setWorktrees([]);
        }
      } finally {
        if (inFlightRef.current?.controller === controller) {
          inFlightRef.current = null;
        }
        if (!isPoll && !controller.signal.aborted && activeSlugRef.current === targetSlug) {
          setLoading(false);
        }
      }
    })();

    return request.promise;
  }, []);

  useEffect(() => {
    activeSlugRef.current = slug;

    if (!slug) {
      inFlightRef.current?.controller.abort();
      inFlightRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset state synchronously when slug becomes undefined; no infinite loop risk
      setWorktrees([]);
      setLoading(false);
      setError(null);
      return;
    }

    void fetchWorktrees(slug, "foreground");
    return () => {
      if (inFlightRef.current?.slug === slug) {
        inFlightRef.current.controller.abort();
        inFlightRef.current = null;
      }
    };
  }, [slug, fetchWorktrees]);

  useEffect(() => {
    if (!slug || typeof window === "undefined" || typeof document === "undefined") return;

    let intervalId: number | undefined;
    const refresh = () => {
      void fetchWorktrees(slug, "poll");
    };
    const stopPolling = () => {
      if (intervalId === undefined) return;
      window.clearInterval(intervalId);
      intervalId = undefined;
    };
    const startPolling = () => {
      if (document.visibilityState === "hidden" || intervalId !== undefined) return;
      intervalId = window.setInterval(refresh, WORKTREE_POLL_INTERVAL_MS);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopPolling();
        return;
      }

      refresh();
      startPolling();
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [slug, fetchWorktrees]);

  const refresh = useCallback(() => {
    if (slug) void fetchWorktrees(slug, "foreground");
  }, [slug, fetchWorktrees]);

  return { worktrees, loading, error, refresh };
}
