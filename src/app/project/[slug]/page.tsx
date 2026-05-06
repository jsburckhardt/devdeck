"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Spinner } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { Header } from "@/components/header";
import type { Project } from "@/lib/types";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((projects: Project[]) => {
        const found = projects.find((p) => p.slug === slug);
        if (found) {
          setProject(found);
        } else {
          setError("Project not found");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="flex h-screen flex-col">
        <Header backAction={() => router.push("/")} title={slug} />
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={32} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex h-screen flex-col">
        <Header backAction={() => router.push("/")} title={slug} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <p className="text-sm">{error ?? "Project not found"}</p>
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-accent"
          >
            <ArrowLeft size={14} />
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <Header backAction={() => router.push("/")} title={project.name} />
      <WorkspaceProvider>
        <div className="min-h-0 flex-1">
          <WorkspaceLayout project={project} />
        </div>
      </WorkspaceProvider>
    </div>
  );
}
