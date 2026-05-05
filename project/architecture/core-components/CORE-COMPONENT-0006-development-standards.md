# CORE-COMPONENT-0006: Development Standards (Node/TypeScript)

## Status

Adopted

## Purpose

Define coding conventions, commit standards, and testing practices for the DevDeck project. These standards ensure consistency across the codebase and make it easier for contributors to understand and maintain the code.

## Scope

- TypeScript coding conventions
- Commit message standards
- Testing practices and coverage requirements
- Code formatting and linting

## Definition

### Rules

#### Coding Conventions
- Use ESLint with the project-configured ruleset (eslint-config-next)
- Use TypeScript strict mode
- Prefer named exports over default exports
- Use async/await over raw Promises
- Use `@/*` import alias for project imports
- Component files use PascalCase; utility files use kebab-case
- React components must be functional components (no class components)

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

### Interfaces
- **Linter:** ESLint (eslint-config-next)
- **Formatter:** Prettier
- **Test Runner:** Vitest with @testing-library/react
- **Task Runner:** justfile (just)

### Expectations
- All PRs must pass lint, format check, build, and tests
- New features must include tests
- Breaking changes must be documented in commit messages

## Rationale

These standards align with the Node.js ecosystem best practices from the bootstrap agent's DEV_STANDARDS. TypeScript strict mode catches more bugs at compile time. Conventional Commits enable automated changelog generation and semantic versioning. Vitest provides fast, ESM-native testing that integrates well with Next.js.

## Usage Examples

```bash
# Development workflow via justfile
just dev          # Start development server
just test         # Run tests
just lint         # Run ESLint
just format       # Format code with Prettier
just check        # Run all checks (lint + format:check + build + test)
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

- Run `just check` before pushing to ensure all standards are met
- The justfile provides all common development commands
- CI will run the same verification commands defined in `.github/soft-factory/verification.yml`

## Exceptions

- Generated files (e.g., Next.js route types) are excluded from linting and formatting
- Test files may use `any` type when mocking complex interfaces

## Enforcement

- [x] Automated checks: ESLint, Prettier, Vitest in CI
- [x] Code review checklist: Verify tests exist for new functionality
- [x] Test coverage requirements: 80% minimum coverage target

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md)
