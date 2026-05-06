"use client";

import { useRouter } from "next/navigation";
import { Code, Folder, Clock } from "@phosphor-icons/react";
import type { Project } from "@/lib/types";

interface ProjectCardProps {
  project: Project;
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

export function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/project/${project.slug}`);
  };

  const formattedDate = project.lastModified
    ? new Date(project.lastModified).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <button
      onClick={handleClick}
      className="group relative flex flex-col gap-3 rounded-lg border border-border bg-card p-6 text-left transition-all duration-200 hover:scale-[1.02] hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 active:scale-[0.98]"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Folder size={20} weight="duotone" className="text-primary" />
          <h3 className="font-mono text-sm font-semibold text-card-foreground">{project.name}</h3>
        </div>
        <Code
          size={16}
          className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        />
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
    </button>
  );
}
