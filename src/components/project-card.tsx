"use client";

import { useRouter } from "next/navigation";
import { Code, Folder, Clock, PencilSimple, Trash, Warning } from "@phosphor-icons/react";
import type { Project } from "@/lib/types";

interface ProjectCardProps {
  project: Project;
  onEdit?: (project: Project) => void;
  onRemove?: (project: Project) => void;
}

function languageColor(language?: string): string {
  switch (language) {
    case "TypeScript":
      return "bg-blue-500";
    case "JavaScript":
      return "bg-yellow-500";
    case "Python":
      return "bg-green-500";
    case "Rust":
      return "bg-orange-500";
    case "Go":
      return "bg-cyan-500";
    case "Ruby":
      return "bg-red-500";
    case "Java":
      return "bg-amber-700";
    default:
      return "bg-muted-foreground";
  }
}

export function ProjectCard({ project, onEdit, onRemove }: ProjectCardProps) {
  const router = useRouter();

  const handleClick = () => {
    if (project.available === false) return;
    router.push(`/project/${project.slug}`);
  };

  const formattedDate = project.lastModified
    ? new Date(project.lastModified).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const isUnavailable = project.available === false;

  return (
    <div
      data-testid="project-card"
      role="button"
      tabIndex={0}
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
        <div className="flex items-center gap-1">
          {onEdit && (
            <button
              data-testid="edit-button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(project);
              }}
              className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
              aria-label="Edit project"
            >
              <PencilSimple size={16} />
            </button>
          )}
          {onRemove && (
            <button
              data-testid="remove-button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(project);
              }}
              className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-destructive"
              aria-label="Remove project"
            >
              <Trash size={16} />
            </button>
          )}
          <Code
            size={16}
            className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
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
