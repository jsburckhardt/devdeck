# ADR-0003: Project Registry & Persistence Strategy

## Status

Accepted

## Context

DevDeck currently discovers projects by scanning a single directory (`DEVDECK_PROJECTS_DIR`, default `/workspaces`) at request time. There is no persistence layer — every request re-scans the filesystem. Issue #9 requires users to manually add, edit, and remove projects from the landing page, which demands a persistence mechanism to store project metadata beyond what auto-discovery provides.

Key gaps that motivate this decision:

1. **No persistence exists** — manual project entries have nowhere to be stored across server restarts.
2. **`resolveProjectPath` is synchronous** and hard-coded to `PROJECTS_DIR/<slug>` — it cannot resolve manually-added projects at arbitrary filesystem paths.
3. **`resolveProjectPath` is exported from a route module** (`src/app/api/projects/route.ts`) — a design smell that couples utility logic to HTTP handler modules.
4. **The `Project` type lacks fields** needed for tracking: `path`, `source`, and `hidden`.

## Decision

### 1. Storage Format: JSON File

Use a single JSON file (`registry.json`) as the persistence mechanism. The file stores an array of `ProjectRegistryEntry` objects representing manually-added projects and hide/override state for auto-discovered projects.

### 2. File Location

The registry file lives at `$DEVDECK_DATA_DIR/registry.json`. The `DEVDECK_DATA_DIR` environment variable defaults to `~/.config/devdeck/` when unset. The directory is created on first write if it does not exist.

### 3. Atomic Write Strategy

All writes use a write-to-temp-then-rename pattern:
1. Write data to a temporary file in the same directory (`registry.json.tmp`).
2. Call `fs.rename()` to atomically replace the registry file.

This prevents corruption from partial writes or crashes during write. File-level locking is not required at the current single-user scale but is noted as a future consideration.

### 4. `ProjectRegistryEntry` Schema

```typescript
interface ProjectRegistryEntry {
  slug: string;          // Immutable after creation; URL-safe identifier
  path: string;          // Absolute filesystem path to project root
  source: 'auto' | 'manual';  // How the entry was created
  hidden?: boolean;      // true = soft-removed auto-discovered project
  name?: string;         // User-provided override (manual projects)
  description?: string;  // User-provided override (manual projects)
}
```

The registry file format:
```typescript
interface ProjectRegistry {
  version: 1;
  projects: ProjectRegistryEntry[];
}
```

### 5. `resolveProjectPath` Location

Move `resolveProjectPath` from `src/app/api/projects/route.ts` to `src/lib/registry.ts`. The new function is **async** — it loads the registry, looks up the slug, and returns the registered path. If no registry entry exists, it falls back to the current behavior (`PROJECTS_DIR/<sanitized-slug>`) for backward compatibility.

```typescript
// src/lib/registry.ts
export async function resolveProjectPath(slug: string): Promise<string> {
  const registry = await loadRegistry();
  const entry = registry.projects.find(p => p.slug === slug);
  if (entry) return entry.path;
  const sanitized = slug.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.resolve(PROJECTS_DIR, sanitized);
}
```

### 6. Merge Strategy: Auto-Discovered + Registry

`GET /api/projects` merges two sources:
1. **Auto-discovered projects** — scanned from `DEVDECK_PROJECTS_DIR` (existing behavior).
2. **Registry entries** — loaded from `registry.json`.

Merge rules:
- Auto-discovered projects with a matching registry entry that has `hidden: true` are excluded from results.
- Registry entries with `source: 'manual'` are included directly (after validating path accessibility).
- Registry metadata (`name`, `description`) overrides auto-discovered values when present.
- Auto-discovered projects not in the registry appear as `source: 'auto'` with no registry entry needed.

### 7. Updated `Project` Type

The existing `Project` interface gains three new fields:

```typescript
export interface Project {
  slug: string;
  name: string;
  description: string;
  language?: string;
  lastModified?: string;
  path: string;               // NEW: absolute filesystem path
  source: 'auto' | 'manual';  // NEW: discovery origin
  available?: boolean;         // NEW: false if path is inaccessible
}
```

### 8. Slug Assignment and Stability

- **Auto-discovered projects:** slug = directory name (existing behavior, preserved).
- **Manual projects:** slug = `path.basename(projectPath)`, sanitized to URL-safe characters.
- **Collision detection:** `POST /api/projects` returns `409 Conflict` if the derived slug already exists. The client must handle this error.
- **Slug immutability:** Editing a project (PUT) cannot change its slug. The slug is assigned at creation and locked.

### 9. Utility Extraction

`detectLanguage` and `readPackageJson` are extracted from `src/app/api/projects/route.ts` to `src/lib/registry.ts` so they can be reused during manual project creation (auto-populating metadata).

## Alternatives

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| SQLite via `better-sqlite3` | Strong concurrent-write safety, query capabilities | Native dependency, harder to inspect, heavier | Overkill for single-user, small-dataset use case; adds native build dependency |
| In-memory store | Zero I/O, simplest implementation | Lost on restart, no persistence | Defeats the purpose of manual project tracking |
| Environment variable list | No file I/O needed | Cannot add/edit/remove at runtime, very limited | Not dynamic; requires server restart for changes |
| Store in `DEVDECK_PROJECTS_DIR/.devdeck-registry.json` | Co-located with projects | Pollutes workspace directory; may conflict with project files; not writable in all environments | Separation of concerns; data dir should be independent of project scan dir |

## Consequences

### Positive
- Users can track projects at any filesystem path, not just under `DEVDECK_PROJECTS_DIR`
- No new dependencies required — uses only Node.js built-in `fs/promises`
- Registry file is human-readable and manually editable if needed
- `resolveProjectPath` moving to `src/lib/registry.ts` eliminates route-module utility export smell
- Backward compatible — auto-discovered projects work without any registry entries

### Negative
- Concurrent writes from multiple tabs could cause data loss (mitigated by atomic write; acceptable at single-user scale)
- An additional filesystem read on every `resolveProjectPath` call (mitigable with in-memory caching if needed)
- Manual projects with moved/deleted paths will show as unavailable until edited or removed

### Neutral
- `DEVDECK_DATA_DIR` is a new environment variable to document
- Registry format is versioned (`version: 1`) to allow future schema migrations

## Related Issues

- [#9](https://github.com/jsburckhardt/devdeck/issues/9) — feat: Add manual project tracking

## References

- [ADR-0002](./ADR-0002-tech-stack.md) — Tech stack (Next.js, TypeScript, shadcn/ui)
- [CORE-COMPONENT-0006](../core-components/CORE-COMPONENT-0006-development-standards.md) — Development standards (co-located tests, 80% coverage)
