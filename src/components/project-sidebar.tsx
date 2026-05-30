"use client";

import { useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import { House, SidebarSimple, X } from "@phosphor-icons/react";
import { WorktreeTree } from "@/components/worktree-tree";
import { closeNavigationTarget, projectRoute, useOpenProjects } from "@/lib/open-projects-context";
import type { CopilotCliState } from "@/lib/types";
import { languageColor } from "@/lib/utils";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "devdeck-sidebar-collapsed";

function readPersistedCollapsedState(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
}

const sidebarCollapsedListeners = new Set<() => void>();

function subscribeToCollapsedState(listener: () => void) {
  sidebarCollapsedListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      sidebarCollapsedListeners.delete(listener);
    };
  }

  function handleStorage(event: StorageEvent) {
    if (event.key === SIDEBAR_COLLAPSED_STORAGE_KEY) {
      listener();
    }
  }

  window.addEventListener("storage", handleStorage);

  return () => {
    sidebarCollapsedListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function persistCollapsedState(collapsed: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  sidebarCollapsedListeners.forEach((listener) => listener());
}

export function ProjectSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { openProjects, closeProject, getCopilotStatus } = useOpenProjects();
  const isCollapsed = useSyncExternalStore(
    subscribeToCollapsedState,
    readPersistedCollapsedState,
    () => false,
  );
  const activeSlug = openProjects.find((project) => pathname === projectRoute(project.slug))?.slug;

  const toggleLabel = isCollapsed ? "Expand sidebar" : "Collapse sidebar";

  function toggleSidebar() {
    persistCollapsedState(!isCollapsed);
  }

  return (
    <nav
      className={`flex shrink-0 flex-col gap-1 overflow-hidden border-r border-border bg-card/50 py-2 transition-[width] duration-200 ease-in-out ${
        isCollapsed ? "w-12" : "w-44"
      }`}
      aria-label="Open projects"
    >
      {/* Home button */}
      <button
        onClick={() => router.push("/")}
        className={`mx-2 flex h-9 items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground ${
          isCollapsed ? "justify-center px-0" : "gap-2 px-2"
        }`}
        aria-label="Go to home page"
        title="Home"
      >
        <House size={20} weight="bold" />
        {!isCollapsed && <span className="text-sm font-medium">Home</span>}
      </button>

      <div className="mx-2 my-1 h-px bg-border" />

      {/* Project tabs */}
      {openProjects.map((project) => {
        const isActive = activeSlug === project.slug;
        const copilotStatus: CopilotCliState = getCopilotStatus(project.slug);
        return (
          <div key={project.slug} className="group relative mx-2 min-w-0">
            <button
              onClick={() => router.push(projectRoute(project.slug))}
              className={`flex h-9 w-full items-center rounded-md text-xs transition-colors ${
                isCollapsed ? "justify-center px-0" : "gap-2 px-2"
              } ${
                isActive
                  ? "bg-primary/15 text-primary ring-2 ring-primary/60"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
              aria-label={`Open project ${project.name}`}
              aria-current={isActive ? "page" : undefined}
              title={project.name}
            >
              <span className="relative">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white ${languageColor(project.language)}`}
                >
                  {project.name.charAt(0).toUpperCase()}
                </span>
                {copilotStatus !== "idle" && <CopilotStatusIndicator status={copilotStatus} />}
              </span>
              {!isCollapsed && <span className="truncate text-sm">{project.name}</span>}
            </button>

            {/* Close button - accessible via keyboard and hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                const navigationTarget = closeNavigationTarget(
                  openProjects,
                  project.slug,
                  activeSlug,
                );
                closeProject(project.slug);
                if (navigationTarget) {
                  router.push(navigationTarget);
                }
              }}
              className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground transition-opacity ${
                isCollapsed
                  ? "opacity-100"
                  : "opacity-0 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
              }`}
              aria-label={`Close project ${project.name}`}
            >
              <X size={10} weight="bold" />
            </button>
            {isActive && (
              <div
                data-testid="active-worktree-wrapper"
                className={isCollapsed ? "hidden" : undefined}
              >
                <WorktreeTree slug={project.slug} />
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={toggleSidebar}
        className="mx-2 mt-auto flex h-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label={toggleLabel}
        aria-expanded={!isCollapsed}
        title={toggleLabel}
      >
        <SidebarSimple size={20} weight="bold" />
      </button>
    </nav>
  );
}

function CopilotStatusIndicator({ status }: { status: CopilotCliState }) {
  const label = status === "running" ? "Copilot CLI running" : "Copilot CLI waiting for input";
  return (
    <span
      className={`absolute -top-0.5 -right-0.5 block h-1.5 w-1.5 rounded-full ${
        status === "running"
          ? "animate-pulse bg-[oklch(0.72_0.19_142)]"
          : "bg-[oklch(0.75_0.18_55)]"
      }`}
      aria-label={label}
      title={label}
      role="status"
    />
  );
}
