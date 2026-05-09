"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { OpenProjectsProvider } from "@/lib/open-projects-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <OpenProjectsProvider>{children}</OpenProjectsProvider>
    </ThemeProvider>
  );
}
