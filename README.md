# DevDeck

A web-based development environment that replicates the IDE experience with a real terminal connected to your local machine via xterm.js + node-pty, built with Next.js.

[![APS version](https://img.shields.io/badge/APS-v1.2.2-blue?logo=github)](https://github.com/chris-buckley/agnostic-prompt-standard/releases/tag/v1.2.2)

## Tech Stack

- **Framework:** Next.js (App Router, TypeScript)
- **Terminal:** xterm.js (frontend) + node-pty (backend) via WebSocket
- **UI:** Tailwind CSS v4, shadcn/ui, framer-motion, @phosphor-icons/react
- **Testing:** Vitest + React Testing Library
- **Task Runner:** just (justfile)

## Getting Started

```bash
# Install dependencies
just install

# Start development server
just dev

# Run all checks
just check
```

## Development

```bash
just              # Show all available commands
just dev          # Start dev server with Turbopack
just test         # Run tests
just lint         # Run ESLint
just format       # Format code with Prettier
just check        # Run lint + format:check + build + test
```

## Documentation

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — pipeline workflow, how to contribute via GitHub Issues, and where artifacts belong
- [`AGENTS.md`](AGENTS.md) — agent definitions, guardrails, and pipeline specification
- [`docs/`](docs/) — application-specific documentation (API docs, user guides, etc.)
- [`project/`](project/) — architecture decisions, core-components, and per-issue pipeline artifacts
