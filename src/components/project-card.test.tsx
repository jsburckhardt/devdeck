import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectCard } from "./project-card";
import type { Project } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const baseProject: Project = {
  slug: "test-project",
  name: "Test Project",
  description: "A test project description",
  language: "TypeScript",
  path: "/workspaces/test-project",
  source: "auto",
};

describe("ProjectCard", () => {
  it("renders project name and description (T21)", () => {
    render(<ProjectCard project={baseProject} />);
    expect(screen.getByText("Test Project")).toBeInTheDocument();
    expect(screen.getByText("A test project description")).toBeInTheDocument();
  });

  it("calls onEdit when edit button clicked via dropdown (T21)", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<ProjectCard project={baseProject} onEdit={onEdit} />);

    const menuButton = screen.getByTestId("card-menu-button");
    await user.click(menuButton);

    const editButton = await screen.findByTestId("edit-button");
    await user.click(editButton);

    expect(onEdit).toHaveBeenCalledWith(baseProject);
  });

  it("calls onRemove when remove button clicked via dropdown (T21)", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<ProjectCard project={baseProject} onRemove={onRemove} />);

    const menuButton = screen.getByTestId("card-menu-button");
    await user.click(menuButton);

    const removeButton = await screen.findByTestId("remove-button");
    await user.click(removeButton);

    expect(onRemove).toHaveBeenCalledWith(baseProject);
  });

  it("shows unavailable indicator when available is false (T22)", () => {
    const unavailableProject = { ...baseProject, available: false };
    render(<ProjectCard project={unavailableProject} />);

    expect(screen.getByTestId("unavailable-indicator")).toBeInTheDocument();
  });

  it("shows manual badge when source is manual", () => {
    const manualProject = { ...baseProject, source: "manual" as const };
    render(<ProjectCard project={manualProject} />);

    expect(screen.getByTestId("manual-badge")).toBeInTheDocument();
  });
});
