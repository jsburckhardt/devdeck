"use client";

import { ArrowLeft, Moon, Sun, TerminalWindow } from "@phosphor-icons/react";
import { useTheme } from "@/components/theme-provider";

interface HeaderProps {
  backAction?: () => void;
  title?: string;
}

export function Header({ backAction, title }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-2 text-foreground">
        {backAction && (
          <button
            onClick={backAction}
            className="mr-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Back to projects"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <TerminalWindow size={20} weight="bold" />
        <span className="text-sm font-semibold">DevDeck</span>
        {title && (
          <>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-mono text-sm text-muted-foreground">{title}</span>
          </>
        )}
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
