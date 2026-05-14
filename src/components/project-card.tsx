"use client";

import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Folder,
  Clock,
  DotsThreeVertical,
  PencilSimple,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { projectRoute } from "@/lib/open-projects-context";
import type { Project } from "@/lib/types";
import { languageColor } from "@/lib/utils";

interface ProjectCardProps {
  project: Project;
  onEdit?: (project: Project) => void;
  onRemove?: (project: Project) => void;
}

export function ProjectCard({ project, onEdit, onRemove }: ProjectCardProps) {
  const router = useRouter();

  const handleClick = () => {
    if (project.available === false) return;
    router.push(projectRoute(project.slug));
  };

  const formattedDate = project.lastModified
    ? new Date(project.lastModified).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const isUnavailable = project.available === false;
  const hasActions = onEdit || onRemove;

  return (
    <div
      data-testid="project-card"
      role="button"
      aria-disabled={isUnavailable || undefined}
      tabIndex={isUnavailable ? -1 : 0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`group relative flex cursor-pointer flex-col gap-3 rounded-lg border border-border bg-card p-6 text-left transition-all duration-200 hover:scale-[1.02] hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 active:scale-[0.98] ${isUnavailable ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {isUnavailable ? (
            <Warning
              size={20}
              weight="duotone"
              className="text-destructive"
              data-testid="unavailable-indicator"
            />
          ) : (
            <Folder size={20} weight="duotone" className="text-primary" />
          )}
          <h3 className="font-mono text-sm font-semibold text-card-foreground">{project.name}</h3>
          {project.source === "manual" && (
            <span
              className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
              data-testid="manual-badge"
            >
              manual
            </span>
          )}
        </div>
        {hasActions && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                data-testid="card-menu-button"
                onClick={(e) => e.stopPropagation()}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Project options"
              >
                <DotsThreeVertical size={18} weight="bold" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className="z-50 min-w-[160px] overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                {onEdit && (
                  <DropdownMenu.Item
                    data-testid="edit-button"
                    onSelect={() => onEdit(project)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground outline-none transition-colors hover:bg-muted focus:bg-muted"
                  >
                    <PencilSimple size={16} />
                    Update Project
                  </DropdownMenu.Item>
                )}
                {onRemove && (
                  <DropdownMenu.Item
                    data-testid="remove-button"
                    onSelect={() => onRemove(project)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive outline-none transition-colors hover:bg-destructive/10 focus:bg-destructive/10"
                  >
                    <Trash size={16} />
                    Delete Project
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2">
        {project.description}
      </p>

      <div className="mt-auto flex items-center gap-3 pt-2">
        {project.language && (
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${languageColor(project.language)}`}
            />
            <span className="text-xs text-muted-foreground">{project.language}</span>
          </div>
        )}
        {formattedDate && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock size={12} />
            <span>{formattedDate}</span>
          </div>
        )}
      </div>
    </div>
  );
}
