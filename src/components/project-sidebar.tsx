"use client";

import { useRouter, usePathname } from "next/navigation";
import { House, X } from "@phosphor-icons/react";
import { closeNavigationTarget, projectRoute, useOpenProjects } from "@/lib/open-projects-context";
import type { CopilotCliState } from "@/lib/types";
import { languageColor } from "@/lib/utils";

export function ProjectSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { openProjects, closeProject, getCopilotStatus } = useOpenProjects();
  const activeSlug = openProjects.find((project) => pathname === projectRoute(project.slug))?.slug;

  return (
    <nav
      className="flex w-44 shrink-0 flex-col gap-1 border-r border-border bg-card/50 py-2"
      aria-label="Open projects"
    >
      {/* Home button */}
      <button
        onClick={() => router.push("/")}
        className="mx-2 flex h-9 w-full items-center gap-2 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label="Go to home page"
        title="Home"
      >
        <House size={20} weight="bold" />
        <span className="text-sm font-medium">Home</span>
      </button>

      <div className="mx-2 my-1 h-px w-full bg-border" />

      {/* Project tabs */}
      {openProjects.map((project) => {
        const isActive = activeSlug === project.slug;
        const copilotStatus: CopilotCliState = getCopilotStatus(project.slug);
        return (
          <div key={project.slug} className="group relative mx-2">
            <button
              onClick={() => router.push(projectRoute(project.slug))}
              className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-xs transition-colors ${
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
              <span className="truncate text-sm">{project.name}</span>
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
              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
              aria-label={`Close project ${project.name}`}
            >
              <X size={10} weight="bold" />
            </button>
          </div>
        );
      })}
    </nav>
  );
}

function CopilotStatusIndicator({ status }: { status: CopilotCliState }) {
  const label = status === "running" ? "Copilot CLI running" : "Copilot CLI waiting for input";
  return (
    <span
      className={`absolute -top-0.5 -right-0.5 block h-1.5 w-1.5 rounded-full ${
        status === "running" ? "animate-pulse bg-green-500" : "bg-amber-500"
      }`}
      aria-label={label}
      title={label}
      role="status"
    />
  );
}
