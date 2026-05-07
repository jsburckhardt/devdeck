# Action Plan: Fix terminal connectivity, add token auth, polish shell environment

## Feature
- **ID:** 11
- **Research Brief:** project/issues/11/research/00-research.md

## ADRs Created
- **ADR-0004-token-authentication.md** — Single-tenant bearer token strategy for WebSocket and HTTP protection

## Core-Components Updated
- **CORE-COMPONENT-0003** (WebSocket Terminal Communication) — Added token handshake rules: token query param required on upgrade, validation before PTY spawn, close code 4401 for rejection
- **CORE-COMPONENT-0005** (Error Handling) — Added auth error patterns: no reconnect on 4401, 401 + AUTH_REQUIRED for HTTP, distinct "Unauthorized" overlay in terminal panel

## Implementation Tasks

### Workstream 1: Dev Startup Fix
- **T1:** Add `concurrently` dev dependency, update `dev:all` script and `just dev` recipe to start both Next.js and the terminal server reliably

### Workstream 2: Token Authentication
- **T2:** Create `src/lib/auth.ts` — token generation (`crypto.randomUUID()`), `getToken()`, `validateToken()` with `crypto.timingSafeEqual`
- **T3:** Integrate token auth into `terminal-server.mts` — validate token from upgrade request query param before spawning PTY; reject with close code 4401
- **T4:** Create `src/middleware.ts` — Next.js middleware that checks bearer token / cookie / query param on HTTP routes; sets cookie on first valid `?token=` visit
- **T5:** Update `use-terminal.ts` — append `?token=` to WebSocket URL; detect close code 4401 as auth error (no reconnect); update `terminal-panel.tsx` for auth error state

### Workstream 3: Shell Environment Polish
- **T6:** Change default cwd to `os.homedir()`, spawn shell with `-l` flag for login shell, inject locale env vars (`LANG`, `LC_ALL`)

### Workstream 4: Tests & Documentation
- **T7:** Unit tests — `src/lib/auth.test.ts` for auth utilities; update `terminal-server.test.ts` for auth validation, cwd default, login shell
- **T8:** E2E tests — Update `e2e/terminal.spec.ts` and `playwright.config.ts` for token-aware startup and connection flow
- **T9:** Documentation — Update CORE-COMPONENT-0003, CORE-COMPONENT-0005 (done in planning), update `LLM.txt` with auth details

### Dependency Order
```
T1 (dev startup) — independent
T2 (auth lib) — independent
T3 (server auth) — depends on T2
T4 (middleware) — depends on T2
T5 (frontend auth) — depends on T2, T3
T6 (shell polish) — independent
T7 (unit tests) — depends on T2, T3, T6
T8 (E2E tests) — depends on T1, T3, T5, T6
T9 (docs) — depends on all
```
