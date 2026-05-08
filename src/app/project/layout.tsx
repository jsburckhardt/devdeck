"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ProjectSidebar } from "@/components/project-sidebar";
import { useOpenProjects } from "@/lib/open-projects-context";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { Header } from "@/components/header";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { openProjects } = useOpenProjects();

  const activeSlug = pathname.startsWith("/project/")
    ? decodeURIComponent(pathname.split("/")[2])
    : null;
  const activeProjectOpen = activeSlug ? openProjects.some((p) => p.slug === activeSlug) : false;

  // Trigger resize when switching tabs so terminals and panels re-fit
  useEffect(() => {
    if (activeProjectOpen) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeSlug, activeProjectOpen]);

  return (
    <div className="flex h-screen flex-col">
      <div className="flex min-h-0 flex-1">
        {openProjects.length > 0 && <ProjectSidebar />}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Persistent workspaces — stay mounted across tab switches */}
          {openProjects.map((project) => {
            const isActive = project.slug === activeSlug;
            return (
              <div
                key={project.slug}
                className={isActive ? "flex min-h-0 flex-1 flex-col" : "hidden"}
              >
                <Header backAction={() => router.push("/")} title={project.name} />
                <WorkspaceProvider slug={project.slug}>
                  <div className="min-h-0 flex-1">
                    <WorkspaceLayout project={project} />
                  </div>
                </WorkspaceProvider>
              </div>
            );
          })}
          {/* Page children for loading/error when project isn't open yet */}
          {!activeProjectOpen && <div className="flex min-h-0 flex-1 flex-col">{children}</div>}
        </div>
      </div>
    </div>
  );
}
