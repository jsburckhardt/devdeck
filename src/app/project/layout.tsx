"use client";

import { ProjectSidebar } from "@/components/project-sidebar";
import { useOpenProjects } from "@/lib/open-projects-context";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { openProjects } = useOpenProjects();

  return (
    <div className="flex h-screen flex-col">
      <div className="flex min-h-0 flex-1">
        {openProjects.length > 0 && <ProjectSidebar />}
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
