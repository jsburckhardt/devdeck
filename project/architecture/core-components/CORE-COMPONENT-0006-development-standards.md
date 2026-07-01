# CORE-COMPONENT-0006: Development Standards (Node/TypeScript)

## Status

Adopted (amended) - 2026-06-30

## Purpose

Define coding conventions, commit standards, and testing practices for the DevDeck project. These standards ensure consistency across the codebase and make it easier for contributors to understand and maintain the code.

## Scope

- TypeScript coding conventions
- Commit message standards
- Testing practices and coverage requirements
- Browser E2E testing practices and coverage requirements
- Code formatting and linting

## Definition

### Rules

#### Coding Conventions
- Use ESLint with the project-configured ruleset (eslint-config-next)
- Use TypeScript strict mode
- Prefer named exports over default exports
- Use async/await over raw Promises
- Use `@/*` import alias for project imports
- Component files use kebab-case (e.g., `theme-provider.tsx`); utility files use kebab-case
- React components must be functional components, except where React requires class components (e.g., ErrorBoundary)

#### Commit Standards
- Follow Conventional Commits specification v1.0.0
- Include scope in commit messages when applicable (e.g., `feat(terminal): add resize support`)
- Include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer on AI-authored commits
- PR titles must follow Conventional Commits format

#### Testing Practices
- Write unit tests for all exported functions and hooks
- Use `describe`/`it` blocks for test organization
- Aim for 80% code coverage minimum
- Co-locate test files next to source files using `*.test.ts(x)` naming
- Use React Testing Library for component tests
- Mock WebSocket and node-pty in unit tests
- Use Playwright for browser E2E tests under `e2e/` when behavior spans routing, authentication, real browser rendering, terminal UI, file-tree/file-viewer workflows, or accessibility-oriented user flows
- Use `./harness e2e [--json] [-- <playwright args...>]` for browser E2E runs instead of direct Playwright commands when the harness is available
- Keep Playwright fixtures isolated and resettable; tests MUST NOT depend on mutable checked-in fixture state or mutate `e2e/fixtures/` directly during harness-managed runs
- Prefer role, label, and stable `data-testid` selectors over brittle CSS/layout selectors in browser E2E tests

### Interfaces
- **Linter:** ESLint (eslint-config-next)
- **Formatter:** Prettier
- **Test Runner:** Vitest with @testing-library/react
- **Browser E2E Runner:** Playwright via `./harness e2e`
- **Task Runner:** justfile (just)

### Expectations
- All PRs must pass lint, format check, build, Vitest, smoke, and browser E2E through `./harness verify`
- New features must include tests
- New user-visible workflows must include or update Playwright E2E coverage when unit/component tests cannot prove the browser behavior
- Breaking changes must be documented in commit messages

## Rationale

These standards align with the Node.js ecosystem best practices from the bootstrap agent's DEV_STANDARDS. TypeScript strict mode catches more bugs at compile time. Conventional Commits enable automated changelog generation and semantic versioning. Vitest provides fast, ESM-native testing that integrates well with Next.js. Playwright complements Vitest by proving real browser workflows that depend on routing, middleware authentication, terminal WebSocket UI, file APIs, layout behavior, and accessibility semantics.

## Usage Examples

```bash
# Development workflow via justfile
just dev          # Start development server
just test         # Run tests
just lint         # Run ESLint
just format       # Format code with Prettier
just check        # Run all checks (lint + format:check + build + test)
./harness e2e     # Run browser E2E tests through Playwright
./harness verify  # Run lint + format:check + build + test + smoke + e2e
```

```typescript
// Test example
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeToggle } from '@/components/ThemeToggle';

describe('ThemeToggle', () => {
  it('renders toggle button', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
```

## Integration Guidelines

- Run `./harness verify` before pushing to ensure all standards are met
- Use `./harness e2e -- <playwright args...>` for focused browser regressions
- The harness is the preferred command surface; the justfile provides lower-level development commands
- CI runs `./harness verify`, with step definitions documented in `.harness/contract.yml`
- CI provisions Playwright browser dependencies before `./harness verify`

## Exceptions

- Generated files (e.g., Next.js route types) are excluded from linting and formatting
- Test files may use `any` type when mocking complex interfaces
- Direct `npx playwright test` may be used for local UI/debug diagnostics after a harness E2E failure, but it is not a substitute for `./harness e2e` or `./harness verify`

## Enforcement

- [x] Automated checks: ESLint, Prettier, Vitest in CI
- [ ] Automated checks: Playwright browser E2E runs through `./harness verify` in CI
- [x] Code review checklist: Verify tests exist for new functionality
- [x] Code review checklist: Verify browser E2E coverage for representative user-visible workflows
- [x] Test coverage requirements: 80% minimum coverage target
- [ ] Test coverage requirements: Playwright specs cover auth, project registry, terminal, file-tree/file-viewer, layout, and accessibility-oriented flows

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md)
