"use client";

import { Group, Panel, Separator } from "react-resizable-panels";
import { Code, FolderOpen, TerminalWindow } from "@phosphor-icons/react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Header } from "@/components/header";

function PlaceholderPanel({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <Icon size={32} className="opacity-50" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <Group orientation="horizontal" className="flex-1">
        <Panel defaultSize={25} minSize={15}>
          <ErrorBoundary>
            <PlaceholderPanel icon={FolderOpen} label="File Explorer" />
          </ErrorBoundary>
        </Panel>
        <Separator className="w-1 bg-border hover:bg-accent" />
        <Panel defaultSize={50} minSize={30}>
          <ErrorBoundary>
            <PlaceholderPanel icon={Code} label="Editor" />
          </ErrorBoundary>
        </Panel>
        <Separator className="w-1 bg-border hover:bg-accent" />
        <Panel defaultSize={25} minSize={15}>
          <ErrorBoundary>
            <PlaceholderPanel icon={TerminalWindow} label="Terminal" />
          </ErrorBoundary>
        </Panel>
      </Group>
    </div>
  );
}
