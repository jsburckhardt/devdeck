import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddProjectDialog } from "./add-project-dialog";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("AddProjectDialog", () => {
  it("submits with valid path and shows toast (T23)", async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ slug: "myproj", name: "myproj" }), { status: 201 }),
    );

    render(<AddProjectDialog open={true} onOpenChange={vi.fn()} onSuccess={onSuccess} />);

    const pathInput = screen.getByLabelText(/path/i);
    await user.type(pathInput, "/workspaces/myproj");
    await user.click(screen.getByRole("button", { name: "Add Project" }));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ method: "POST" }),
    );
    expect(onSuccess).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Project added successfully");
  });

  it("shows 409 conflict error (T24)", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Project with slug 'x' already exists" }), {
        status: 409,
      }),
    );

    render(<AddProjectDialog open={true} onOpenChange={vi.fn()} onSuccess={vi.fn()} />);

    const pathInput = screen.getByLabelText(/path/i);
    await user.type(pathInput, "/workspaces/x");
    await user.click(screen.getByRole("button", { name: "Add Project" }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });
});
