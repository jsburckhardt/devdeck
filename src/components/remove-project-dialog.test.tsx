import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RemoveProjectDialog } from "./remove-project-dialog";
import type { Project } from "@/lib/types";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";

const mockProject: Project = {
  slug: "proj",
  name: "My Project",
  description: "A description",
  path: "/test/proj",
  source: "manual",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("RemoveProjectDialog", () => {
  it("shows project name and confirms deletion (T25-like)", async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "removed" }), { status: 200 }),
    );

    render(
      <RemoveProjectDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
        project={mockProject}
      />,
    );

    expect(screen.getByText("My Project")).toBeInTheDocument();

    await user.click(screen.getByText("Remove"));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/projects/proj",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(onSuccess).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Project removed successfully");
  });
});
