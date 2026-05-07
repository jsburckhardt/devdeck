"use client";

import { useEffect, useState, useCallback } from "react";
import { Spinner, Folder, Plus } from "@phosphor-icons/react";
import { Header } from "@/components/header";
import { ProjectCard } from "@/components/project-card";
import { AddProjectDialog } from "@/components/add-project-dialog";
import { EditProjectDialog } from "@/components/edit-project-dialog";
import { RemoveProjectDialog } from "@/components/remove-project-dialog";
import type { Project } from "@/lib/types";

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
      <Folder size={48} weight="duotone" className="opacity-40" />
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">No projects found</h2>
        <p className="mt-1 text-sm">
          Click &quot;Add Project&quot; to track a project, or add projects to your workspace
          directory.
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [removeProject, setRemoveProject] = useState<Project | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadProjects() {
      try {
        const res = await fetch(
          "/api/projects",
          refreshKey > 0 ? { cache: "no-store" } : undefined,
        );
        if (!res.ok) throw new Error("Failed to load projects");
        const data: Project[] = await res.json();
        if (!cancelled) {
          setProjects(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProjects();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const refreshProjects = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">
                Projects
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Select a project to open the workspace
              </p>
            </div>
            <button
              data-testid="add-project-button"
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-card/80"
            >
              <Plus size={16} />
              Add Project
            </button>
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
                <ProjectCard
                  key={project.slug}
                  project={project}
                  onEdit={(p) => setEditProject(p)}
                  onRemove={(p) => setRemoveProject(p)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <AddProjectDialog open={addOpen} onOpenChange={setAddOpen} onSuccess={refreshProjects} />

      {editProject && (
        <EditProjectDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditProject(null);
          }}
          onSuccess={refreshProjects}
          project={editProject}
        />
      )}

      {removeProject && (
        <RemoveProjectDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setRemoveProject(null);
          }}
          onSuccess={refreshProjects}
          project={removeProject}
        />
      )}
    </div>
  );
}
