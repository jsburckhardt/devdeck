"use client";

import { Moon, Sun, TerminalWindow } from "@phosphor-icons/react";
import { useTheme } from "@/components/theme-provider";

export function Header() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-2 text-foreground">
        <TerminalWindow size={20} weight="bold" />
        <span className="text-sm font-semibold">DevDeck</span>
      </div>
      <button
        onClick={toggleTheme}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </header>
  );
}
