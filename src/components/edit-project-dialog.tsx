"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Project } from "@/lib/types";

interface EditProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  project: Project;
}

export function EditProjectDialog({
  open,
  onOpenChange,
  onSuccess,
  project,
}: EditProjectDialogProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [projectPath, setProjectPath] = useState(project.path);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const body: Record<string, string> = {};
      if (name !== project.name) body.name = name;
      if (description !== project.description) body.description = description;
      if (projectPath !== project.path) body.path = projectPath;

      const res = await fetch(`/api/projects/${project.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update project");
        return;
      }

      toast.success("Project updated successfully");
      onOpenChange(false);
      onSuccess();
    } catch {
      setError("Failed to update project");
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
              Edit Project
            </Dialog.Title>
            <Dialog.Close
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X size={20} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="edit-name" className="mb-1 block text-sm text-muted-foreground">
                Name
              </label>
              <input
                id="edit-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="edit-desc" className="mb-1 block text-sm text-muted-foreground">
                Description
              </label>
              <input
                id="edit-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="edit-path" className="mb-1 block text-sm text-muted-foreground">
                Path
              </label>
              <input
                id="edit-path"
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Dialog.Close className="rounded border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                disabled={loading}
                className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
