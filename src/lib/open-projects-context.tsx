"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CopilotCliState, PerProjectWorkspaceState, Project } from "./types";

interface OpenProjectsContextValue {
  openProjects: Project[];
  openProject: (project: Project) => void;
  closeProject: (slug: string) => void;
  requestProjectClose: (
    slug: string,
    activeSlug: string | null,
  ) => {
    accepted: boolean;
    target: string | null;
    reason?: "invalid-slug" | "pending";
  };
  clearProjectCloseRequest: (slug: string) => void;
  saveWorkspaceState: (slug: string, state: PerProjectWorkspaceState) => void;
  restoreWorkspaceState: (slug: string) => PerProjectWorkspaceState | undefined;
  updateCopilotStatus: (slug: string, status: CopilotCliState) => void;
  getCopilotStatus: (slug: string) => CopilotCliState;
}

const STORAGE_KEY = "devdeck-open-projects";

const OpenProjectsContext = createContext<OpenProjectsContextValue | undefined>(undefined);

function normalizeProjectSlug(slug: string): string {
  return slug.trim();
}

export function projectRoute(slug: string): string {
  return `/project/${encodeURIComponent(slug)}`;
}

export function closeNavigationTarget(
  openProjects: readonly Pick<Project, "slug">[],
  closedSlug: string,
  activeSlug: string | null | undefined,
): string | null {
  const normalizedClosedSlug = normalizeProjectSlug(closedSlug);
  const normalizedActiveSlug = activeSlug ? normalizeProjectSlug(activeSlug) : null;

  if (!normalizedClosedSlug || normalizedActiveSlug !== normalizedClosedSlug) {
    return null;
  }

  const closedIndex = openProjects.findIndex(
    (project) => normalizeProjectSlug(project.slug) === normalizedClosedSlug,
  );
  if (closedIndex === -1) {
    return null;
  }

  const remainingProjects = openProjects.filter(
    (project) => normalizeProjectSlug(project.slug) !== normalizedClosedSlug,
  );
  if (remainingProjects.length === 0) {
    return "/";
  }

  const targetProject = remainingProjects[closedIndex] ?? remainingProjects[closedIndex - 1];
  return targetProject ? projectRoute(normalizeProjectSlug(targetProject.slug)) : "/";
}

function readSlugsFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSlugsToStorage(slugs: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
}

export function OpenProjectsProvider({ children }: { children: React.ReactNode }) {
  const [openProjects, setOpenProjects] = useState<Project[]>([]);
  const workspaceCache = useRef<Map<string, PerProjectWorkspaceState>>(new Map());
  const pendingCloseSlugs = useRef<Set<string>>(new Set());
  const [copilotStatuses, setCopilotStatuses] = useState<Map<string, CopilotCliState>>(new Map());
  const hydrated = useRef(false);

  useEffect(() => {
    return () => pendingCloseSlugs.current.clear();
  }, []);

  // Hydrate from localStorage + API on mount, merging with any projects opened during fetch
  useEffect(() => {
    const slugs = readSlugsFromStorage();
    if (slugs.length === 0) {
      hydrated.current = true;
      return;
    }

    fetch("/api/projects")
      .then((res) => res.json())
      .then((allProjects: Project[]) => {
        const projectMap = new Map(allProjects.map((p) => [p.slug, p]));
        const hydratedProjects: Project[] = [];
        for (const slug of slugs) {
          const project = projectMap.get(slug);
          if (project) {
            hydratedProjects.push(project);
          }
        }
        // Merge with current state to avoid overwriting projects opened during fetch
        setOpenProjects((prev) => {
          const existingSlugs = new Set(prev.map((p) => p.slug));
          const merged = [...prev];
          for (const p of hydratedProjects) {
            if (!existingSlugs.has(p.slug)) {
              merged.push(p);
            }
          }
          writeSlugsToStorage(merged.map((p) => p.slug));
          return merged;
        });
        hydrated.current = true;
      })
      .catch(() => {
        hydrated.current = true;
      });
  }, []);

  // Persist slug list to localStorage whenever openProjects changes
  useEffect(() => {
    if (!hydrated.current) return;
    writeSlugsToStorage(openProjects.map((p) => p.slug));
  }, [openProjects]);

  useEffect(() => {
    const openSlugs = new Set(
      openProjects.map((project) => normalizeProjectSlug(project.slug)).filter(Boolean),
    );
    for (const slug of pendingCloseSlugs.current) {
      if (!openSlugs.has(slug)) {
        pendingCloseSlugs.current.delete(slug);
      }
    }
  }, [openProjects]);

  const openProject = useCallback((project: Project) => {
    setOpenProjects((prev) => {
      if (prev.some((p) => p.slug === project.slug)) {
        return prev;
      }
      return [...prev, project];
    });
  }, []);

  const closeProject = useCallback((slug: string) => {
    const normalizedSlug = normalizeProjectSlug(slug);
    if (!normalizedSlug) return;

    workspaceCache.current.delete(normalizedSlug);
    setCopilotStatuses((prev) => {
      if (!prev.has(normalizedSlug)) return prev;
      const next = new Map(prev);
      next.delete(normalizedSlug);
      return next;
    });
    setOpenProjects((prev) =>
      prev.filter((project) => normalizeProjectSlug(project.slug) !== normalizedSlug),
    );
  }, []);

  const clearProjectCloseRequest = useCallback((slug: string) => {
    const normalizedSlug = normalizeProjectSlug(slug);
    if (normalizedSlug) {
      pendingCloseSlugs.current.delete(normalizedSlug);
    }
  }, []);

  const requestProjectClose = useCallback(
    (slug: string, activeSlug: string | null) => {
      const normalizedSlug = normalizeProjectSlug(slug);
      if (!normalizedSlug) {
        return { accepted: false, target: null, reason: "invalid-slug" as const };
      }

      if (pendingCloseSlugs.current.has(normalizedSlug)) {
        return { accepted: false, target: null, reason: "pending" as const };
      }

      pendingCloseSlugs.current.add(normalizedSlug);
      const normalizedActiveSlug = activeSlug ? normalizeProjectSlug(activeSlug) : null;
      const target =
        normalizedActiveSlug === normalizedSlug
          ? (closeNavigationTarget(openProjects, normalizedSlug, normalizedActiveSlug) ?? "/")
          : null;

      closeProject(normalizedSlug);
      return { accepted: true, target };
    },
    [closeProject, openProjects],
  );

  const saveWorkspaceState = useCallback((slug: string, state: PerProjectWorkspaceState) => {
    workspaceCache.current.set(slug, state);
  }, []);

  const restoreWorkspaceState = useCallback(
    (slug: string): PerProjectWorkspaceState | undefined => {
      return workspaceCache.current.get(slug);
    },
    [],
  );

  const updateCopilotStatus = useCallback((slug: string, status: CopilotCliState) => {
    setCopilotStatuses((prev) => {
      if (prev.get(slug) === status) return prev;
      const next = new Map(prev);
      next.set(slug, status);
      return next;
    });
  }, []);

  const getCopilotStatus = useCallback(
    (slug: string): CopilotCliState => {
      return copilotStatuses.get(slug) ?? "idle";
    },
    [copilotStatuses],
  );

  const value = useMemo(
    () => ({
      openProjects,
      openProject,
      closeProject,
      requestProjectClose,
      clearProjectCloseRequest,
      saveWorkspaceState,
      restoreWorkspaceState,
      updateCopilotStatus,
      getCopilotStatus,
    }),
    [
      openProjects,
      openProject,
      closeProject,
      requestProjectClose,
      clearProjectCloseRequest,
      saveWorkspaceState,
      restoreWorkspaceState,
      updateCopilotStatus,
      getCopilotStatus,
    ],
  );

  return <OpenProjectsContext.Provider value={value}>{children}</OpenProjectsContext.Provider>;
}

export function useOpenProjects(): OpenProjectsContextValue {
  const context = useContext(OpenProjectsContext);
  if (!context) {
    throw new Error("useOpenProjects must be used within an OpenProjectsProvider");
  }
  return context;
}
