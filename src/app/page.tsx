"use client";

import { useEffect, useState } from "react";
import { Spinner, Folder } from "@phosphor-icons/react";
import { Header } from "@/components/header";
import { ProjectCard } from "@/components/project-card";
import type { Project } from "@/lib/types";

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
      <Folder size={48} weight="duotone" className="opacity-40" />
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">No projects found</h2>
        <p className="mt-1 text-sm">
          Add projects to your workspace directory or set{" "}
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
            DEVDECK_PROJECTS_DIR
          </code>
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load projects");
        return res.json();
      })
      .then((data: Project[]) => {
        setProjects(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="mb-8">
            <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">
              Projects
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a project to open the workspace
            </p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <Spinner size={32} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && projects.length === 0 && <EmptyState />}

          {!loading && !error && projects.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard key={project.slug} project={project} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
