import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditProjectDialog } from "./edit-project-dialog";
import type { Project } from "@/lib/types";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

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

describe("EditProjectDialog", () => {
  it("pre-populates fields", () => {
    render(
      <EditProjectDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
        project={mockProject}
      />,
    );

    expect(screen.getByDisplayValue("My Project")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A description")).toBeInTheDocument();
    expect(screen.getByDisplayValue("/test/proj")).toBeInTheDocument();
  });

  it("submits changes", async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ slug: "proj", name: "Updated" }), { status: 200 }),
    );

    render(
      <EditProjectDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
        project={mockProject}
      />,
    );

    const nameInput = screen.getByDisplayValue("My Project");
    await user.clear(nameInput);
    await user.type(nameInput, "Updated");
    await user.click(screen.getByText("Save Changes"));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/projects/proj",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it("shows error on failure", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
    );

    render(
      <EditProjectDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
        project={mockProject}
      />,
    );

    await user.click(screen.getByText("Save Changes"));

    expect(await screen.findByText("Not found")).toBeInTheDocument();
  });
});
