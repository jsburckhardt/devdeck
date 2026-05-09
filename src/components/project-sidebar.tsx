"use client";

import { useRouter, usePathname } from "next/navigation";
import { House, X } from "@phosphor-icons/react";
import { useOpenProjects } from "@/lib/open-projects-context";
import { languageColor } from "@/lib/utils";

export function ProjectSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { openProjects, closeProject } = useOpenProjects();

  return (
    <nav
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-card/50 py-2"
      aria-label="Open projects"
    >
      {/* Home button */}
      <button
        onClick={() => router.push("/")}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label="Go to home page"
        title="Home"
      >
        <House size={20} weight="bold" />
      </button>

      <div className="mx-auto my-1 h-px w-6 bg-border" />

      {/* Project tabs */}
      {openProjects.map((project) => {
        const isActive = pathname === `/project/${project.slug}`;
        return (
          <div key={project.slug} className="group relative">
            <button
              onClick={() => router.push(`/project/${project.slug}`)}
              className={`flex h-9 w-9 items-center justify-center rounded-md text-xs font-bold text-white transition-colors ${
                isActive
                  ? `${languageColor(project.language)} ring-2 ring-primary/60`
                  : `${languageColor(project.language)} opacity-60 hover:opacity-100`
              }`}
              aria-label={`Open project ${project.name}`}
              aria-current={isActive ? "page" : undefined}
              title={project.name}
            >
              {project.name.charAt(0).toUpperCase()}
            </button>

            {/* Close button - accessible via keyboard and hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeProject(project.slug);
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
