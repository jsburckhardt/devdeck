# DevDeck Documentation

DevDeck is a web-based development environment built with Next.js, featuring a real terminal (xterm.js + node-pty) connected to your local machine via WebSocket.

## Architecture

- **Frontend:** Next.js App Router with React 19, Tailwind CSS v4, shadcn/ui
- **Backend:** Next.js API routes with WebSocket server for terminal communication
- **Terminal:** xterm.js in the browser, node-pty spawning real PTY processes on the server

## Key Architectural Decisions

- [ADR-0002: Tech Stack](../project/architecture/ADR/ADR-0002-tech-stack.md)

## Core Components

- [WebSocket Terminal Communication](../project/architecture/core-components/CORE-COMPONENT-0003-websocket-terminal.md)
- [Theming](../project/architecture/core-components/CORE-COMPONENT-0004-theming.md)
- [Error Handling](../project/architecture/core-components/CORE-COMPONENT-0005-error-handling.md)
- [Development Standards](../project/architecture/core-components/CORE-COMPONENT-0006-development-standards.md)

For project management documentation (architecture decisions, core-components, and per-issue pipeline artifacts), see the [`project/`](../project/) directory.
