"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorktreeListResponse, WorktreeSummary } from "@/lib/types";

interface UseWorktreesReturn {
  response: WorktreeListResponse | null;
  worktrees: WorktreeSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const WORKTREE_POLL_INTERVAL_MS = 5000;

interface UseWorktreesOptions {
  pollingEnabled?: boolean;
}

type FetchWorktreesMode = "foreground" | "poll";

interface InFlightWorktreesRequest {
  slug: string;
  activeWorktreeId: string | null;
  controller: AbortController;
  promise: Promise<void>;
}

function withClientActiveState(
  response: WorktreeListResponse,
  activeWorktreeId: string | null,
): WorktreeListResponse {
  return {
    ...response,
    root: { ...response.root, active: activeWorktreeId === null },
    worktrees: response.worktrees.map((worktree) => ({
      ...worktree,
      active: activeWorktreeId === worktree.id,
    })),
  };
}

export function useWorktrees(
  slug: string | undefined,
  activeWorktreeIdOrOptions: string | null | UseWorktreesOptions = null,
  maybeOptions: UseWorktreesOptions = {},
): UseWorktreesReturn {
  const activeWorktreeId =
    typeof activeWorktreeIdOrOptions === "object" ? null : activeWorktreeIdOrOptions;
  const options =
    typeof activeWorktreeIdOrOptions === "object" && activeWorktreeIdOrOptions !== null
      ? activeWorktreeIdOrOptions
      : maybeOptions;
  const pollingEnabled = options.pollingEnabled ?? false;
  const [response, setResponse] = useState<WorktreeListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeSlugRef = useRef<string | undefined>(slug);
  const activeWorktreeIdRef = useRef<string | null>(activeWorktreeId);
  const inFlightRef = useRef<InFlightWorktreesRequest | null>(null);

  const fetchWorktrees = useCallback(
    async (targetSlug: string, targetActiveWorktreeId: string | null, mode: FetchWorktreesMode) => {
      if (
        mode === "poll" &&
        (activeSlugRef.current !== targetSlug ||
          activeWorktreeIdRef.current !== targetActiveWorktreeId)
      ) {
        return;
      }

      const existingRequest = inFlightRef.current;
      if (
        existingRequest?.slug === targetSlug &&
        existingRequest.activeWorktreeId === targetActiveWorktreeId
      ) {
        if (mode === "poll") return existingRequest.promise;
        existingRequest.controller.abort();
      } else {
        existingRequest?.controller.abort();
      }

      const isPoll = mode === "poll";
      const controller = new AbortController();
      const request: InFlightWorktreesRequest = {
        slug: targetSlug,
        activeWorktreeId: targetActiveWorktreeId,
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
          const params = new URLSearchParams({ slug: targetSlug });
          if (targetActiveWorktreeId) params.set("activeWorktree", targetActiveWorktreeId);
          const res = await fetch(`/api/worktrees?${params.toString()}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const rawData = (await res.json()) as WorktreeListResponse | WorktreeSummary[];
          if (
            controller.signal.aborted ||
            activeSlugRef.current !== targetSlug ||
            activeWorktreeIdRef.current !== targetActiveWorktreeId
          ) {
            return;
          }
          if (Array.isArray(rawData)) {
            setResponse({
              projectSlug: targetSlug,
              status: "available",
              root: { id: null, name: "Project root", active: targetActiveWorktreeId === null },
              worktrees: rawData,
            });
          } else {
            setResponse(withClientActiveState(rawData, targetActiveWorktreeId));
          }
          setError(null);
        } catch (err) {
          if (
            controller.signal.aborted ||
            activeSlugRef.current !== targetSlug ||
            activeWorktreeIdRef.current !== targetActiveWorktreeId
          ) {
            return;
          }
          setError(err instanceof Error ? err.message : String(err));
          if (!isPoll) {
            setResponse(null);
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
    },
    [],
  );

  useEffect(() => {
    activeSlugRef.current = slug;
    activeWorktreeIdRef.current = activeWorktreeId;

    if (!slug) {
      inFlightRef.current?.controller.abort();
      inFlightRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset state synchronously when slug becomes undefined; no infinite loop risk
      setResponse(null);
      setLoading(false);
      setError(null);
      return;
    }

    void fetchWorktrees(slug, activeWorktreeId, "foreground");
    return () => {
      if (
        inFlightRef.current?.slug === slug &&
        inFlightRef.current.activeWorktreeId === activeWorktreeId
      ) {
        inFlightRef.current.controller.abort();
        inFlightRef.current = null;
      }
    };
  }, [slug, activeWorktreeId, fetchWorktrees]);

  useEffect(() => {
    if (
      !slug ||
      !pollingEnabled ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }

    let intervalId: number | undefined;
    const refresh = () => {
      void fetchWorktrees(slug, activeWorktreeId, "poll");
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
  }, [slug, activeWorktreeId, pollingEnabled, fetchWorktrees]);

  const refresh = useCallback(() => {
    if (slug) void fetchWorktrees(slug, activeWorktreeId, "foreground");
  }, [slug, activeWorktreeId, fetchWorktrees]);

  return { response, worktrees: response?.worktrees ?? [], loading, error, refresh };
}
