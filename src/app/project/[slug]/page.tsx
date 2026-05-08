"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Spinner } from "@phosphor-icons/react";
import { use, useEffect, useState } from "react";
import { Header } from "@/components/header";
import { useOpenProjects } from "@/lib/open-projects-context";
import type { Project } from "@/lib/types";

export default function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { openProject, openProjects } = useOpenProjects();
  const isAlreadyOpen = openProjects.some((p) => p.slug === slug);
  const [loading, setLoading] = useState(!isAlreadyOpen);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAlreadyOpen) return;

    fetch("/api/projects")
      .then((res) => res.json())
      .then((projects: Project[]) => {
        const found = projects.find((p) => p.slug === slug);
        if (found) {
          openProject(found);
        } else {
          setError("Project not found");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [slug, isAlreadyOpen, openProject]);

  // Layout renders the workspace for open projects — page returns nothing
  if (isAlreadyOpen) {
    return null;
  }

  if (loading) {
    return (
      <>
        <Header backAction={() => router.push("/")} title={slug} />
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={32} className="animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header backAction={() => router.push("/")} title={slug} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <p className="text-sm">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-accent"
          >
            <ArrowLeft size={14} />
            Back to projects
          </button>
        </div>
      </>
    );
  }

  return null;
}
