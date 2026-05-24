"use client";

import { usePathname } from "next/navigation";
import { ProjectSidebar } from "@/components/project-sidebar";
import { useOpenProjects } from "@/lib/open-projects-context";
import { WorkspaceProvider } from "@/lib/workspace-context";

function activeProjectSlug(pathname: string): string | undefined {
  const prefix = "/project/";
  if (!pathname.startsWith(prefix)) return undefined;
  const slug = pathname.slice(prefix.length).split("/")[0];
  return slug ? decodeURIComponent(slug) : undefined;
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { openProjects } = useOpenProjects();
  const pathname = usePathname();
  const slug = activeProjectSlug(pathname);

  return (
    <WorkspaceProvider key={slug ?? "project"} slug={slug}>
      <div className="flex h-screen flex-col">
        <div className="flex min-h-0 flex-1">
          {openProjects.length > 0 && <ProjectSidebar />}
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
