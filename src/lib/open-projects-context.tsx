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
import { useRouter } from "next/navigation";
import type { PerProjectWorkspaceState, Project } from "./types";

interface OpenProjectsContextValue {
  openProjects: Project[];
  openProject: (project: Project) => void;
  closeProject: (slug: string) => void;
  saveWorkspaceState: (slug: string, state: PerProjectWorkspaceState) => void;
  restoreWorkspaceState: (slug: string) => PerProjectWorkspaceState | undefined;
}

const STORAGE_KEY = "devdeck-open-projects";

const OpenProjectsContext = createContext<OpenProjectsContextValue | undefined>(undefined);

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
  const router = useRouter();
  const [openProjects, setOpenProjects] = useState<Project[]>([]);
  const workspaceCache = useRef<Map<string, PerProjectWorkspaceState>>(new Map());
  const hydrated = useRef(false);

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

  // Navigate home when all projects are closed
  useEffect(() => {
    if (hydrated.current && openProjects.length === 0 && readSlugsFromStorage().length > 0) {
      // Projects were just cleared — but only navigate if we had projects before
    }
  }, [openProjects, router]);

  const openProject = useCallback((project: Project) => {
    setOpenProjects((prev) => {
      if (prev.some((p) => p.slug === project.slug)) {
        return prev;
      }
      return [...prev, project];
    });
  }, []);

  const closeProject = useCallback(
    (slug: string) => {
      workspaceCache.current.delete(slug);
      setOpenProjects((prev) => {
        const next = prev.filter((p) => p.slug !== slug);
        if (next.length === 0) {
          // Defer navigation to avoid side effect in updater
          queueMicrotask(() => router.push("/"));
        }
        return next;
      });
    },
    [router],
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

  const value = useMemo(
    () => ({
      openProjects,
      openProject,
      closeProject,
      saveWorkspaceState,
      restoreWorkspaceState,
    }),
    [openProjects, openProject, closeProject, saveWorkspaceState, restoreWorkspaceState],
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
