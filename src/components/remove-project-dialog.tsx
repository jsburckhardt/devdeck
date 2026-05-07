"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Project } from "@/lib/types";

interface RemoveProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  project: Project;
}

export function RemoveProjectDialog({
  open,
  onOpenChange,
  onSuccess,
  project,
}: RemoveProjectDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/projects/${project.slug}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to remove project");
        return;
      }

      toast.success("Project removed successfully");
      onOpenChange(false);
      onSuccess();
    } catch {
      setError("Failed to remove project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              Remove Project
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-muted-foreground hover:text-foreground">
              <X size={20} />
            </Dialog.Close>
          </div>

          <p className="mb-2 text-sm text-muted-foreground">
            Are you sure you want to remove{" "}
            <strong className="text-foreground">{project.name}</strong>?
          </p>

          <p className="mb-4 text-xs text-muted-foreground">
            {project.source === "manual"
              ? "This will remove the project from your tracked list. The project files will not be deleted."
              : "This will hide the auto-discovered project from the landing page. You can re-add it later."}
          </p>

          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Dialog.Close className="rounded border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </Dialog.Close>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="rounded bg-destructive px-4 py-2 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {loading ? "Removing…" : "Remove"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
