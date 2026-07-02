"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { House, SidebarSimple, X } from "@phosphor-icons/react";
import { WorktreeTree } from "@/components/worktree-tree";
import { projectRoute, useOpenProjects } from "@/lib/open-projects-context";
import type { CopilotCliState } from "@/lib/types";
import { languageColor } from "@/lib/utils";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "devdeck-sidebar-collapsed";
type ActiveCopilotCliState = Extract<CopilotCliState, "running" | "waiting">;

function isActiveCopilotStatus(status: CopilotCliState): status is ActiveCopilotCliState {
  return status === "running" || status === "waiting";
}

function copilotStatusLabel(status: ActiveCopilotCliState) {
  return status === "running" ? "Copilot CLI running" : "Copilot CLI waiting for input";
}

function CopilotBotIcon() {
  return (
    <svg
      data-testid="copilot-bot-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M7.5 6.5 6.5 3.5" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16.5 6.5 17.5 3.5" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3.5 11.5h3v5h-3a1.5 1.5 0 0 1-1.5-1.5v-2A1.5 1.5 0 0 1 3.5 11.5Z" fill="#60a5fa" />
      <path d="M17.5 11.5h3A1.5 1.5 0 0 1 22 13v2a1.5 1.5 0 0 1-1.5 1.5h-3v-5Z" fill="#60a5fa" />
      <rect x="5" y="6" width="14" height="15" rx="3.5" fill="#d8b4fe" />
      <rect x="6.5" y="9" width="11" height="7.5" rx="2" fill="#1e3a8a" />
      <circle cx="9.5" cy="12.75" r="1.15" fill="#67e8f9" />
      <circle cx="14.5" cy="12.75" r="1.15" fill="#67e8f9" />
      <path d="M10 18h4" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function readPersistedCollapsedState(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistCollapsedState(collapsed: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Storage can be disabled; keep the in-memory sidebar state usable.
  }
}

export function ProjectSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { openProjects, requestProjectClose, clearProjectCloseRequest, getCopilotStatus } =
    useOpenProjects();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const activeProject = openProjects.find((project) => pathname === projectRoute(project.slug));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: hydrate from localStorage after SSR to avoid mismatch
    setIsCollapsed(readPersistedCollapsedState());

    function handleStorage(event: StorageEvent) {
      if (event.key === SIDEBAR_COLLAPSED_STORAGE_KEY) {
        setIsCollapsed(readPersistedCollapsedState());
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const toggleLabel = isCollapsed ? "Expand sidebar" : "Collapse sidebar";

  const toggleSidebar = useCallback(() => {
    setIsCollapsed((collapsed) => {
      const nextCollapsed = !collapsed;
      persistCollapsedState(nextCollapsed);
      return nextCollapsed;
    });
  }, []);

  return (
    <nav
      className={`flex shrink-0 flex-col gap-1 overflow-hidden border-r border-border bg-card/50 py-2 transition-[width] duration-200 ease-in-out ${
        isCollapsed ? "w-12" : "w-44"
      }`}
      aria-label="Open projects"
    >
      <div data-testid="project-sidebar-header" className="shrink-0">
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
      </div>

      <div
        data-testid="project-sidebar-scroll-region"
        className="min-h-0 flex-1 space-y-1 overflow-y-auto"
      >
        {openProjects.map((project) => {
          const isActive = activeProject?.slug === project.slug;
          const copilotStatus: CopilotCliState = getCopilotStatus(project.slug);
          const hasActiveCopilotStatus = isActiveCopilotStatus(copilotStatus);
          const activeCopilotLabel = hasActiveCopilotStatus
            ? copilotStatusLabel(copilotStatus)
            : undefined;

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
                    data-testid={`project-badge-${project.slug}`}
                    title={project.name}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${
                      hasActiveCopilotStatus
                        ? copilotStatus === "running"
                          ? "animate-pulse bg-transparent"
                          : "bg-transparent ring-2 ring-[oklch(0.75_0.18_55)]"
                        : `text-[10px] font-bold text-white ${languageColor(project.language)}`
                    }`}
                  >
                    {hasActiveCopilotStatus ? (
                      <CopilotBotIcon />
                    ) : (
                      project.name.charAt(0).toUpperCase()
                    )}
                  </span>
                  {activeCopilotLabel && (
                    <span
                      className="sr-only"
                      role="status"
                      aria-label={activeCopilotLabel}
                      title={activeCopilotLabel}
                    >
                      {activeCopilotLabel}
                    </span>
                  )}
                </span>
                {!isCollapsed && <span className="truncate text-sm">{project.name}</span>}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const normalizedSlug = project.slug.trim();
                  const request = requestProjectClose(project.slug, activeProject?.slug ?? null);
                  if (!request.accepted || !request.target) {
                    return;
                  }

                  try {
                    router.push(request.target);
                  } catch {
                    clearProjectCloseRequest(normalizedSlug);
                    console.error("Failed to navigate after closing project", {
                      slug: normalizedSlug,
                      target: request.target,
                    });
                  }
                }}
                className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground transition-opacity ${
                  isCollapsed
                    ? "opacity-100"
                    : "opacity-0 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                }`}
                aria-label={`Close project ${project.name}`}
              >
                <X size={10} weight="bold" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      <div
        data-testid="selected-project-detail"
        className="border-t border-border px-2 py-2"
        aria-label={
          activeProject ? `Selected project ${activeProject.name}` : "No project selected"
        }
        role="status"
        aria-live="polite"
      >
        {!isCollapsed && (
          <div className="mb-2 px-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {activeProject ? "Selected project" : "Selected workspace"}
            </div>
          </div>
        )}
        {activeProject ? (
          <div data-testid="active-worktree-wrapper" className={isCollapsed ? "hidden" : ""}>
            <WorktreeTree slug={activeProject.slug} />
          </div>
        ) : (
          <div
            data-testid="selected-project-empty-state"
            className={isCollapsed ? "flex justify-center py-1" : "px-2 py-1"}
          >
            <span className="text-[11px] text-muted-foreground" aria-hidden="true">
              {isCollapsed ? "○" : "No project selected"}
            </span>
            {!isCollapsed && (
              <span className="mt-1 block text-xs text-muted-foreground">
                Select a project to view its workspace context.
              </span>
            )}
          </div>
        )}
      </div>

      <div data-testid="project-sidebar-footer" className="shrink-0 pt-1">
        <button
          onClick={toggleSidebar}
          className="mx-2 flex h-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={toggleLabel}
          aria-expanded={!isCollapsed}
          title={toggleLabel}
        >
          <SidebarSimple size={20} weight="bold" />
        </button>
      </div>
    </nav>
  );
}
