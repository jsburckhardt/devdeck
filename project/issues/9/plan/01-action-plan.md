# Action Plan: Manual Project Tracking — Add, Edit, and Remove Projects

## Feature
- **ID:** 9
- **Research Brief:** project/issues/9/research/00-research.md

## ADRs Created
- **ADR-0003** — Project Registry & Persistence Strategy (`project/architecture/ADR/ADR-0003-project-registry-persistence.md`)
  - JSON file persistence at `$DEVDECK_DATA_DIR/registry.json`
  - Atomic writes via temp file + `fs.rename`
  - Async `resolveProjectPath` in `src/lib/registry.ts`
  - Merge strategy for auto-discovered + manual projects
  - Slug immutability and collision detection

## Core-Components Created
- None — the registry is a feature-specific data-access layer, not a cross-cutting concern.

## Implementation Tasks

### Phase 1: Foundation (Tasks 1–3)
Build the registry module and update existing API routes to use it.

1. **Update `Project` type + create `src/lib/registry.ts`** — Add `path`, `source`, `available` fields to `Project`; implement `loadRegistry`, `saveRegistry`, `resolveProjectPath` (async), `detectLanguage`, `readPackageJson` in the new registry module.
2. **Update `GET /api/projects` to merge registry with auto-discovery** — Load registry, merge with scanned projects, apply hide rules, return enriched `Project[]` with `path` and `source` fields.
3. **Update file API routes to use async resolver** — Change imports in `src/app/api/files/route.ts` and `src/app/api/files/content/route.ts` from route-module import to `src/lib/registry.ts`; add `await`.

### Phase 2: Mutation API (Tasks 4–5)
Add CRUD endpoints for project management.

4. **Add `POST /api/projects`** — Validate path exists, derive slug, detect collision (409), auto-populate metadata, save to registry.
5. **Add `PUT /api/projects/[slug]` and `DELETE /api/projects/[slug]`** — PUT updates name/description/path (not slug). DELETE removes manual entries or sets `hidden: true` for auto-discovered.

### Phase 3: UI (Tasks 6–8)
Build the user-facing dialogs and wire up the landing page.

6. **Install `@radix-ui/react-dialog` and build Add/Edit/Remove dialogs** — Accessible modal dialogs using Radix primitives per ADR-0002's declared shadcn/ui stack. Use `sonner` for toast feedback.
7. **Update `ProjectCard` with edit + remove action slots** — Add icon buttons with `stopPropagation` to prevent card navigation. Show on hover using existing `group-hover:opacity-100` pattern.
8. **Update landing page with Add button, refresh after mutations, stale project handling** — Add "Add Project" button, implement `refreshProjects` callback, render unavailable projects with visual indicator.

### Key Design Decisions
- Install `@radix-ui/react-dialog` to align with ADR-0002's shadcn/ui declaration
- Use `sonner` (already installed) for post-mutation toast feedback
- Slugs are immutable after creation; derived from `path.basename()` for manual projects
- Auto-discovered projects with `hidden: true` are excluded from GET results
- Stale/inaccessible manual projects render as "unavailable" rather than being silently dropped
