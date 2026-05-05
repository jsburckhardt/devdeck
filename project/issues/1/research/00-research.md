# Research Brief — Issue #1: Bootstrap DevDeck Shell Layout

## 1. Scope Classification

**Type:** `issue`

This is a concrete implementation task — replacing the default Next.js template page with a functional DevDeck shell layout. It does not introduce new architectural patterns beyond what existing ADRs and core-components already mandate. No new ADR is needed. One new core-component should be considered (see §7).

---

## 2. Problem Statement

The repository ships with the unmodified Next.js `create-next-app` template. Running `just dev` renders Vercel/Next.js branding with no DevDeck identity. The existing decisions (CORE-COMPONENT-0004 Theming, CORE-COMPONENT-0005 Error Handling) describe mechanisms that need to be wired into the root layout, but none of that wiring exists yet. There are zero test files in the repository (`src/**/*.test.{ts,tsx}` returns no matches). The acceptance criteria for Issue #1 require:

1. A DevDeck-branded shell layout (header + placeholder panels)  
2. Dark mode as default (not dependent on OS preference)  
3. All `just check` steps passing (lint, format check, build, test)  
4. At least one smoke test verifying the page renders

---

## 3. Current State Analysis

### 3.1 `src/app/page.tsx` (lines 1–65)
Pure Next.js boilerplate — `next/image` imports, Next.js logo (`/next.svg`), Vercel Deploy button, hardcoded link to `nextjs.org`. **Entire file must be replaced.**

### 3.2 `src/app/layout.tsx` (lines 1–33)
- Geist + Geist Mono fonts loaded via `next/font/google`
- `metadata.title` = "Create Next App" → must become "DevDeck"
- **No `dark` class** on `<html>` — CORE-COMPONENT-0004 requires dark by default via `.dark` class, not `prefers-color-scheme`
- **No ThemeProvider** — CORE-COMPONENT-0004 mandates a `ThemeProvider` wrapping the layout
- **No Toaster** — CORE-COMPONENT-0005 mandates `sonner` Toaster in root layout

### 3.3 `src/app/globals.css` (lines 1–26)
- Uses `@import "tailwindcss"` (correct for Tailwind v4)
- `--background` / `--foreground` are **hex values**, not `oklch` — violates CORE-COMPONENT-0004 Decision #14
- Dark mode handled via `@media (prefers-color-scheme: dark)` — violates CORE-COMPONENT-0004 Decision #15 (must use `.dark` class; localStorage persistence)
- Missing all shadcn/ui CSS variable tokens (`--card`, `--accent`, `--muted`, `--border`, `--ring`, etc.)

### 3.4 `src/lib/utils.ts` (lines 1–5)
`cn()` utility present (correct shadcn/ui setup). No other library code exists.

### 3.5 Test Infrastructure
- `vitest.config.ts`: configured with jsdom, globals, `src/test/setup.ts`, `include: ["src/**/*.test.{ts,tsx}"]`
- `src/test/setup.ts`: imports `@testing-library/jest-dom/vitest` — setup is correct
- **No test files exist** anywhere in `src/` — zero coverage

### 3.6 Dependencies Available (from `package.json`)
All stack packages are installed and ready:
- `framer-motion ^12.38.0`
- `@phosphor-icons/react ^2.1.10`
- `react-resizable-panels ^4.11.0`
- `sonner ^2.0.7`
- `@xterm/xterm ^6.0.0` (out of scope for #1, but present)
- `next 16.2.4` (note: README says "Next.js 16", package.json confirms `16.2.4`)

### 3.7 `justfile`
`just check` = `lint format-check build test` (sequential, all must pass). `just dev` = `npm run dev` which runs `next dev --turbopack`. Both are correctly wired.

### 3.8 ESLint / Prettier
- ESLint: `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`
- Prettier: `printWidth: 100`, `singleQuote: false`, `trailingComma: "all"`, `tabWidth: 2`
- Any new files must conform to these rules

---

## 4. Relevant Existing Decisions

| Source | Decision | Implication for #1 |
|---|---|---|
| ADR-0002 | Next.js App Router, Tailwind v4, shadcn/ui | Use `src/app/` structure; Tailwind utility classes throughout |
| ADR-0002 | TypeScript strict mode | All new files must type-check cleanly |
| ADR-0002 | Vitest + RTL | Tests go in `*.test.tsx` co-located next to components |
| CORE-COMPONENT-0004 | `.dark` class on root; oklch colors; localStorage; dark default | `layout.tsx` needs a ThemeProvider that adds `class="dark"` by default |
| CORE-COMPONENT-0004 | `useTheme()` hook + `ThemeProvider` | Must be created and wired in layout |
| CORE-COMPONENT-0004 | All CSS vars use oklch; shadcn/ui variable names | `globals.css` needs full rewrite with oklch tokens |
| CORE-COMPONENT-0005 | `sonner` Toaster in root layout; ErrorBoundary per panel | Layout needs Toaster; each placeholder panel needs an ErrorBoundary wrapper |
| CORE-COMPONENT-0005 | ErrorBoundary fallback UI per panel | Even placeholder panels need error boundaries (Issue #1 is the first chance to establish this) |
| CORE-COMPONENT-0006 | 80% coverage; co-locate tests; ESLint + Prettier | At minimum a smoke test for the page component is required |
| CORE-COMPONENT-0006 | Named exports preferred | New components should use named exports |

---

## 5. Proposed Approach (High-Level)

### 5.1 File Changes Required

**`src/app/globals.css`** — Full rewrite:
- Replace hex variables with oklch tokens for all shadcn/ui variables (`--background`, `--foreground`, `--card`, `--muted`, `--accent`, `--border`, `--ring`, `--primary`, `--secondary`, `--destructive`)
- Remove `@media (prefers-color-scheme: dark)` block; add `.dark { ... }` class block
- Keep `@import "tailwindcss"` and `@theme inline` directives

**`src/app/layout.tsx`** — Update:
- Update `metadata` title/description to "DevDeck"
- Add `dark` class to `<html>` element as the server-side default
- Wrap `{children}` with `ThemeProvider` (new component)
- Add `<Toaster />` from `sonner` inside body (CORE-COMPONENT-0005)

**`src/app/page.tsx`** — Full rewrite:
- Replace boilerplate with DevDeck shell: `<Header>` + panel grid layout
- Header: DevDeck title/logo, theme toggle button (Phosphor icon), placeholder nav
- Panels: at least 2–3 placeholder panels (e.g., "File Explorer", "Terminal", "Editor") using `react-resizable-panels`
- Each panel wrapped in an `ErrorBoundary` (CORE-COMPONENT-0005)
- Panels show placeholder content (e.g., a Phosphor icon + label)
- Use `framer-motion` for subtle mount animations (ADR-0002 lists framer-motion as chosen)

**New: `src/components/theme-provider.tsx`** (or `src/providers/theme-provider.tsx`):
- `ThemeProvider` component: reads localStorage on mount, sets `.dark` class on `<html>`, defaults to dark
- Exports `useTheme()` hook
- Must handle SSR (avoid hydration mismatch) — `suppressHydrationWarning` on `<html>`

**New: `src/components/error-boundary.tsx`**:
- React class component `ErrorBoundary` with fallback UI
- `PanelError` fallback with a retry callback

**New: `src/app/page.test.tsx`** (smoke test):
- Renders `<Home />` and asserts key structural elements are present
- Checks for header text (e.g., "DevDeck")
- Checks for placeholder panel text

### 5.2 Folder Structure After #1

```
src/
  app/
    globals.css         ← rewritten (oklch, .dark class)
    layout.tsx          ← updated (ThemeProvider, Toaster, metadata)
    page.tsx            ← replaced (DevDeck shell)
    page.test.tsx       ← NEW smoke test
  components/
    theme-provider.tsx  ← NEW (ThemeProvider + useTheme)
    error-boundary.tsx  ← NEW (ErrorBoundary + PanelError)
  lib/
    utils.ts            ← unchanged
  test/
    setup.ts            ← unchanged
```

### 5.3 Key Technical Decisions Within Scope

- **SSR dark mode default**: Add `className="dark"` directly to `<html>` in `layout.tsx` (server-rendered). `ThemeProvider` overrides on client mount if localStorage says otherwise. Add `suppressHydrationWarning` to `<html>` to prevent React hydration mismatch warnings on the className.
- **ThemeProvider**: A lightweight custom provider (not `next-themes`) to keep the dependency footprint minimal; `next-themes` was listed as an option in CORE-COMPONENT-0004 but is not in `package.json`, so a custom hook is safer for this bootstrap phase.
- **react-resizable-panels**: Use `PanelGroup` + `Panel` + `PanelResizeHandle` for the layout. Mark the page as `"use client"` if needed, or keep panels as client components.
- **Phosphor icons**: Use `TerminalWindow`, `FolderOpen`, `Code`, `Sun`, `Moon` icons for the shell placeholders and theme toggle.

---

## 6. ADRs / Core-Components Required

### New ADRs
**None required.** The tech stack (ADR-0002) already covers all libraries in use.

### New Core-Components
**Consider: CORE-COMPONENT-0007: Shell Layout**

A new core-component document describing:
- The overall IDE shell structure (header + resizable panel groups)
- Component hierarchy (`ShellLayout` > `Header` + `PanelGroup` > `Panel` + `ErrorBoundary`)
- Panel naming conventions and how future panels register themselves
- Responsive behaviour contract

This is **recommended but not blocking** for Issue #1. The implementation can proceed and the core-component can be authored as part of the issue's implementation artifacts, or deferred to a follow-up architecture issue. Given that Issue #1 explicitly says "placeholder panels", the layout component will be minimal and the core-component can capture the patterns established here.

---

## 7. Risks and Open Questions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hydration mismatch from SSR dark class | Medium | Low (warning only) | Add `suppressHydrationWarning` to `<html>` |
| `react-resizable-panels` requires `"use client"` | High | Low | Mark panel-containing component as client component |
| `globals.css` oklch rewrite breaks shadcn/ui variable assumptions | Low | Medium | Follow shadcn/ui variable names exactly; test with `just build` |
| No shadcn/ui components are installed via CLI | Confirmed | Low | `cn()` utility is present; shadcn UI components can be hand-authored or we can note that `npx shadcn` has not been run — not needed for placeholder panels |
| `framer-motion` v12 import changes | Low | Low | Check framer-motion v12 API; `motion.div` API is stable |
| Coverage threshold: Vitest has no `coverageThreshold` set | Confirmed | Low | No configured threshold will block CI; 80% is a team target, not an enforced gate yet |

### Open Questions

1. **ThemeProvider vs. `next-themes`**: The CORE-COMPONENT-0004 mentions `next-themes` as an option but it's not in `package.json`. Should the implementation install `next-themes` or use a custom provider? Custom is safer for now (no new dependency), but `next-themes` is the idiomatic choice for Next.js App Router.

2. **shadcn/ui CLI not yet run**: The `cn()` utility is present but no shadcn components have been scaffolded (no `src/components/ui/` directory). For Issue #1 (placeholders only), hand-crafted components are fine. Should the issue runner also run `npx shadcn init` to set up the component registry?

3. **`@theme inline` in globals.css**: Tailwind v4 uses `@theme` in CSS. The existing `@theme inline` block maps `--color-background` and `--color-foreground` to the CSS vars. When rewriting to add all oklch tokens, the `@theme inline` block should map all color tokens. Requires careful alignment with shadcn/ui v4 patterns.

4. **Test depth for smoke test**: Issue #1 says "a basic smoke test verifying the page renders." This is achievable with RTL `render` + `screen.getByText`. Should the test also assert that the dark class is applied, or is that deferred to a ThemeProvider-specific test?

5. **`react-resizable-panels` in placeholder panels**: If full resizable panels are used, the layout will require a defined `direction` and minimum sizes. Alternatively, a simple CSS grid could be used for placeholders and panels switched to `react-resizable-panels` in a later issue. The latter is lower risk for bootstrap.

---

## Citations

| Artifact | Path | Key Lines |
|---|---|---|
| page.tsx (current) | `jsburckhardt/devdeck:src/app/page.tsx:1-65` | Full Next.js boilerplate |
| layout.tsx (current) | `jsburckhardt/devdeck:src/app/layout.tsx:1-33` | No ThemeProvider, no dark class |
| globals.css (current) | `jsburckhardt/devdeck:src/app/globals.css:1-26` | Hex colors, media-query dark |
| test setup | `jsburckhardt/devdeck:src/test/setup.ts:1` | Only jest-dom import, no tests |
| lib/utils.ts | `jsburckhardt/devdeck:src/lib/utils.ts:1-5` | cn() only, no other lib code |
| vitest.config.ts | `jsburckhardt/devdeck:vitest.config.ts:1-18` | jsdom, globals, setup path |
| package.json | `jsburckhardt/devdeck:package.json:1-52` | All deps confirmed |
| justfile | `jsburckhardt/devdeck:justfile:44-46` | `check: lint format-check build test` |
| ADR-0002 | `jsburckhardt/devdeck:project/architecture/ADR/ADR-0002-tech-stack.md:19-34` | Stack choices |
| CORE-COMPONENT-0004 | `jsburckhardt/devdeck:project/architecture/core-components/CORE-COMPONENT-0004-theming.md:21-28` | Theming rules |
| CORE-COMPONENT-0005 | `jsburckhardt/devdeck:project/architecture/core-components/CORE-COMPONENT-0005-error-handling.md:22-28` | Error boundary rules |
| CORE-COMPONENT-0006 | `jsburckhardt/devdeck:project/architecture/core-components/CORE-COMPONENT-0006-development-standards.md:40-44` | Testing rules |
| Decision Log | `jsburckhardt/devdeck:project/architecture/ADR/DECISION-LOG.md:14-19` | All core-components registered |

---

Now let me write this brief to the required path. Since I only have read tools, I'll provide the complete markdown content below — the main agent should write this to `/workspaces/devdeck/project/issues/1/research/00-research.md`.

However, looking at the task again — the instruction says **I** should produce and write it. Since my toolset is read-only GitHub/filesystem tools, I'll surface the complete, ready-to-write markdown content here for the orchestrator.

---

```markdown
# Research Brief — Issue #1: Bootstrap DevDeck Shell Layout

## 1. Scope Classification

**Type:** `issue`

This is a concrete implementation task — replacing the default Next.js template page with a functional DevDeck shell layout. It does not introduce new architectural patterns beyond what existing ADRs and core-components already mandate. No new ADR is required. One new core-component (Shell Layout) is recommended but not blocking.

---

## 2. Problem Statement

The repository ships with the unmodified `create-next-app` template. Running `just dev` renders Vercel/Next.js branding with no DevDeck identity. Three existing core-components (CORE-COMPONENT-0004 Theming, CORE-COMPONENT-0005 Error Handling, CORE-COMPONENT-0006 Dev Standards) describe patterns that must be wired in from the start but none of that wiring exists yet. There are **zero test files** in the repository. The acceptance criteria for Issue #1 require a DevDeck-branded shell (header + placeholder panels), dark mode as the default theme (not OS-preference-dependent), all `just check` steps passing, and at least one smoke test verifying the page renders.

---

## 3. Current State Analysis

### 3.1 `src/app/page.tsx`
Pure Next.js boilerplate (`next/image`, Next.js logo, Vercel Deploy button, `nextjs.org` links). The entire file must be replaced with the DevDeck shell.

### 3.2 `src/app/layout.tsx`
- Loads Geist and Geist Mono fonts via `next/font/google`.
- `metadata.title` is `"Create Next App"` — must become `"DevDeck"`.
- No `dark` class on `<html>` — CORE-COMPONENT-0004 requires `.dark` class applied by default, not `prefers-color-scheme`.
- No `ThemeProvider` — required by CORE-COMPONENT-0004.
- No `<Toaster />` — required by CORE-COMPONENT-0005.

### 3.3 `src/app/globals.css`
- Correct `@import "tailwindcss"` and `@theme inline` for Tailwind v4.
- `--background` / `--foreground` are **hex values** — violates CORE-COMPONENT-0004 Decision #14 (all colors must use oklch).
- Dark mode via `@media (prefers-color-scheme: dark)` — violates CORE-COMPONENT-0004 Decision #15 (must use `.dark` class with localStorage persistence).
- Missing all shadcn/ui CSS variable tokens (`--card`, `--accent`, `--muted`, `--border`, `--ring`, `--primary`, `--secondary`, `--destructive`, etc.).

### 3.4 `src/lib/utils.ts`
`cn()` utility present (shadcn/ui setup is started). No other library code exists yet.

### 3.5 Test Infrastructure
- `vitest.config.ts`: jsdom environment, globals enabled, `src/test/setup.ts`, includes `src/**/*.test.{ts,tsx}`.
- `src/test/setup.ts`: imports `@testing-library/jest-dom/vitest` — correctly configured.
- **No test files exist anywhere in `src/`** — zero coverage.

### 3.6 Available Dependencies (`package.json`)
All stack packages are installed and ready to use without additional installs:
- `framer-motion ^12.38.0`
- `@phosphor-icons/react ^2.1.10`
- `react-resizable-panels ^4.11.0`
- `sonner ^2.0.7`
- `@xterm/xterm ^6.0.0` (out of scope for #1)
- `next 16.2.4`, `react 19.2.4`

No shadcn/ui components have been scaffolded via CLI — `src/components/ui/` does not exist.

### 3.7 Build / Check Pipeline
`just check` = `lint` → `format-check` → `build` → `test` (sequential). ESLint uses `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`. Prettier: `printWidth: 100`, `singleQuote: false`, `trailingComma: "all"`, `tabWidth: 2`.

---

## 4. Relevant Existing Decisions

| Source | Decision | Implication for #1 |
|---|---|---|
| ADR-0002 | Next.js App Router, Tailwind v4, shadcn/ui | Use `src/app/` structure; Tailwind utility classes throughout |
| ADR-0002 | TypeScript strict mode | All new files must type-check; no `any` except in tests |
| ADR-0002 | Vitest + RTL; justfile task runner | Tests in `*.test.tsx` co-located next to components |
| CORE-COMPONENT-0004 | `.dark` class on root; oklch colors; localStorage; dark default | `layout.tsx` needs ThemeProvider; `globals.css` needs full rewrite |
| CORE-COMPONENT-0004 | `useTheme()` hook and `ThemeProvider` component | Must be created and wired into root layout |
| CORE-COMPONENT-0005 | `sonner` Toaster in root layout; ErrorBoundary per panel | Layout needs `<Toaster />`; each placeholder panel needs `<ErrorBoundary>` |
| CORE-COMPONENT-0006 | 80% coverage target; co-locate tests; named exports preferred | At minimum a smoke test for `page.tsx` required; all exports named |

---

## 5. Proposed Approach (High-Level)

### 5.1 Files to Change or Create

| File | Action | Summary |
|---|---|---|
| `src/app/globals.css` | Rewrite | Replace hex vars with oklch tokens; replace media-query dark with `.dark {}` class block; add full shadcn/ui variable set |
| `src/app/layout.tsx` | Update | Update metadata; add `class="dark"` + `suppressHydrationWarning` to `<html>`; wrap children with `ThemeProvider`; add `<Toaster />` |
| `src/app/page.tsx` | Replace | DevDeck shell: `<Header>` + placeholder panel grid |
| `src/app/page.test.tsx` | Create | Smoke test: render `<Home />`, assert "DevDeck" heading and placeholder panel labels are present |
| `src/components/theme-provider.tsx` | Create | `ThemeProvider` + `useTheme()` hook; reads/writes localStorage; sets `.dark` class on `<html>`; defaults to dark |
| `src/components/error-boundary.tsx` | Create | `ErrorBoundary` React class component with `PanelError` fallback UI |

### 5.2 Proposed Shell Layout Structure

```
<Header>
  DevDeck wordmark  |  [ThemeToggle: Sun/Moon icon]
</Header>
<PanelGroup direction="horizontal">
  <Panel defaultSize={20}>        ← File Explorer placeholder
    <ErrorBoundary>
      <PlaceholderPanel label="File Explorer" icon={<FolderOpen />} />
    </ErrorBoundary>
  </Panel>
  <PanelResizeHandle />
  <Panel defaultSize={50}>        ← Editor/Viewer placeholder
    <ErrorBoundary>
      <PlaceholderPanel label="Editor" icon={<Code />} />
    </ErrorBoundary>
  </Panel>
  <PanelResizeHandle />
  <Panel defaultSize={30}>        ← Terminal placeholder
    <ErrorBoundary>
      <PlaceholderPanel label="Terminal" icon={<TerminalWindow />} />
    </ErrorBoundary>
  </Panel>
</PanelGroup>
```

### 5.3 Key Technical Decisions

- **SSR dark default**: Apply `className="dark"` server-side on `<html>` in `layout.tsx`. `ThemeProvider` re-reads localStorage on client mount and overrides if needed. Add `suppressHydrationWarning` to prevent React hydration mismatch warnings.
- **Custom ThemeProvider**: `next-themes` is not in `package.json`. A lightweight custom provider avoids an unplanned dependency while satisfying CORE-COMPONENT-0004.
- **`"use client"` boundary**: The page (or a `ShellClient` sub-component) must be marked `"use client"` because `react-resizable-panels` requires client-side rendering. The `layout.tsx` remains a Server Component.
- **No shadcn CLI run**: Placeholder panels can use raw Tailwind utility classes and the `cn()` utility; no shadcn CLI required for Issue #1.
- **framer-motion**: Apply `motion.div` with `initial={{ opacity: 0 }} animate={{ opacity: 1 }}` on panel mount for subtle animations consistent with ADR-0002.

---

## 6. ADRs / Core-Components Required

### New ADRs
**None.** ADR-0002 covers the entire tech stack.

### New Core-Components
**Recommended: CORE-COMPONENT-0007 — Shell Layout**

Scope: IDE shell structure (header, resizable panel groups, ErrorBoundary wrapping, client/server component boundary). This can be authored during the implementation phase of Issue #1 and registered in the Decision Log. It is not a blocker — the issue can proceed without it, with the document created as an implementation artifact.

---

## 7. Risks and Open Questions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hydration mismatch from `class="dark"` added server-side | Medium | Low (console warning) | Add `suppressHydrationWarning` to `<html>` |
| `react-resizable-panels` requires `"use client"` | High (confirmed by library) | Low | Wrap panel group in a client component; keep layout as Server Component |
| `globals.css` oklch rewrite misaligns shadcn/ui variable names | Low | Medium | Follow shadcn/ui v4 variable naming exactly; validate with `just build` |
| `framer-motion` v12 API breaking changes | Low | Low | v12 retains `motion.div` API; verify import path (`framer-motion`) |
| No coverage threshold enforced — 80% is aspirational | Confirmed | Low | Single smoke test is sufficient for bootstrap; coverage enforcement is a future concern |

### Open Questions

1. **Custom ThemeProvider vs. `next-themes`**: CORE-COMPONENT-0004 mentions `next-themes` as an option. It is not in `package.json`. Should the implementation add it as a dependency, or proceed with a custom lightweight provider? Recommendation: custom for now; add to technical debt log.

2. **shadcn/ui CLI initialisation**: `npx shadcn init` has not been run. Should Issue #1 also run `shadcn init` to scaffold the full component registry and update `globals.css` with the canonical shadcn variable set? Recommendation: yes — it aligns `globals.css` with the expected oklch variable names and avoids hand-rolling what shadcn generates.

3. **Placeholder panels using `react-resizable-panels` vs. CSS grid**: Full resizable panels add more complexity for placeholder content. A simple CSS grid could be used for Issue #1 with resizable panels introduced in a later issue alongside real content. Recommendation: use `react-resizable-panels` now to validate the stack wiring and match the architecture intent.

4. **Smoke test scope**: The issue requests "a basic smoke test verifying the page renders." Should it also assert dark mode is applied (e.g., `<html>` has `class="dark"`)? Recommendation: yes, add this assertion as it tests the primary acceptance criterion.

5. **`next.config.ts` empty**: The config has no options set. If `node-pty` native modules are imported anywhere in the server bundle, build may fail. For Issue #1 this is not a concern (no terminal code), but worth noting for future issues.
```

---

**Key findings for the main agent:**

1. **`page.tsx`** is 100% boilerplate — full replacement needed
2. **`layout.tsx`** needs ThemeProvider + Toaster + metadata update + dark class
3. **`globals.css`** violates two CORE-COMPONENT-0004 rules (hex colors, media-query dark) — needs full rewrite to oklch + `.dark` class
4. **Zero tests exist** — the smoke test is the first file in `src/**/*.test.tsx`
5. **No shadcn components scaffolded** — `cn()` utility only; no `shadcn init` run yet
6. **All needed npm packages are installed** — no new dependencies required (unless `next-themes` is chosen)
7. **No new ADR needed**; optional CORE-COMPONENT-0007 (Shell Layout) recommended
8. The `"use client"` boundary for `react-resizable-panels` is the main structural decision to get right in `page.tsx`