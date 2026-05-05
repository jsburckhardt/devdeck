# ADR-0002: Next.js + xterm.js + node-pty Tech Stack

## Status

Accepted

## Context

DevDeck requires a web-based development environment that replicates the devhub-web-based-ide experience. The key requirement is a real terminal connected to the user's local machine, plus a modern React-based UI with file browsing, theming, and resizable panels.

We need:
- A fullstack framework (frontend + backend API for terminal WebSocket)
- A real terminal emulator in the browser (not a simulated shell)
- A backend PTY (pseudo-terminal) to spawn real shell processes
- Modern UI toolkit with animation support

## Decision

We adopt the following tech stack:

- **Framework:** Next.js (App Router) — fullstack React framework with API routes for the WebSocket terminal backend
- **Language:** TypeScript — type safety across frontend and backend
- **Terminal Frontend:** xterm.js (@xterm/xterm) — industry-standard terminal emulator for the web
- **Terminal Backend:** node-pty — Node.js bindings for spawning real PTY processes
- **Communication:** WebSocket (ws) — low-latency bidirectional communication between xterm.js and node-pty
- **UI Components:** shadcn/ui (Radix + Tailwind) — accessible, composable component library
- **Styling:** Tailwind CSS v4 — utility-first CSS framework
- **Animations:** framer-motion — declarative animations for React
- **Icons:** @phosphor-icons/react — flexible icon library
- **Layout:** react-resizable-panels — resizable panel groups for IDE layout
- **Package Manager:** npm
- **Test Runner:** vitest — fast, ESM-native test runner
- **Task Runner:** just (justfile) — command runner for development workflows

## Alternatives

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Vite + React SPA | Simpler setup, faster dev server | No built-in API routes; need separate backend server | More infrastructure to manage; Next.js gives fullstack in one |
| Electron | Native app, full OS access | Heavy, requires desktop install | Goal is a web-based experience |
| Remix | Fullstack, good DX | Smaller ecosystem, less community tooling | Next.js has broader adoption and more examples |
| Socket.io instead of ws | Auto-reconnection, rooms | Heavier, custom protocol overhead | ws is lighter, xterm.js works well with raw WebSocket |
| Monaco Editor | Full IDE editing | Overkill for file viewing; heavy bundle | We're building a terminal-focused IDE, not a code editor |

## Consequences

### Positive
- Single codebase for frontend and backend
- Real terminal experience via xterm.js + node-pty
- Mature ecosystem with extensive documentation
- TypeScript provides type safety across the stack
- Tailwind + shadcn gives rapid, consistent UI development

### Negative
- node-pty requires native compilation (build tools needed)
- Next.js App Router is still evolving; some patterns not fully stable
- WebSocket handling in Next.js requires custom server or API route workarounds

### Neutral
- Team must be familiar with React and TypeScript
- justfile replaces npm scripts for complex workflows

## Related Issues

- GitHub Issue #1 (bootstrap)

## References

- [Next.js Documentation](https://nextjs.org/docs)
- [xterm.js Documentation](https://xtermjs.org/)
- [node-pty on npm](https://www.npmjs.com/package/node-pty)
- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)
