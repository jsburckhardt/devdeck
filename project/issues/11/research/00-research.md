# Research Brief — Issue #11

## Problem Statement

The terminal feature in DevDeck has four usability and security gaps:

1. **Terminal server never starts** — `just dev` only runs Next.js, not the WebSocket terminal server
2. **No authentication** — anyone reaching the port gets full shell access
3. **Shell starts in wrong directory** — PTY spawns at `process.cwd()` instead of `$HOME`
4. **Shell environment is bare** — no login shell, no profile loading

## Scope Classification

- **scope_type:** `issue`
- **Issue Number:** 11

## Affected Files

### Must Modify
| File | Change |
|------|--------|
| `justfile` | Update `dev` recipe to start both servers |
| `package.json` | Add `concurrently` devDep, update `dev:all` script |
| `src/server/terminal-server.mts` | Add token auth, change default cwd to `$HOME`, login shell |
| `src/hooks/use-terminal.ts` | Send token in WebSocket URL |
| `src/components/terminal-panel.tsx` | Show auth error states |
| `next.config.ts` | Pass token query param in rewrite |
| `src/server/terminal-server.test.ts` | Add auth tests, cwd tests |
| `e2e/terminal.spec.ts` | Update for token-aware flow |
| `playwright.config.ts` | May need token env var |

### May Need to Create
| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | Token generation, validation, constant-time comparison |
| `src/lib/auth.test.ts` | Unit tests for auth utilities |
| `src/middleware.ts` | Next.js middleware for HTTP route token validation |

## Existing ADR/Core-Component Impact

### Updates Required
- **CORE-COMPONENT-0003** (WebSocket Terminal Communication): Add token handshake step documentation
- **CORE-COMPONENT-0005** (Error Handling): Document auth error handling patterns

### New ADR/Core-Component Required
- **ADR-0004**: Token-based Authentication Strategy — documents the single-tenant bearer token approach

## Technical Risks

1. **WebSocket rewrite + token**: Next.js `rewrites` in `next.config.ts` proxy `/api/terminal` to the standalone WS server. The token must be forwarded through this rewrite (query params are preserved by default).
2. **Process management**: Using `&` for backgrounding is fragile. `concurrently` is the standard solution.
3. **Constant-time comparison**: Must use `crypto.timingSafeEqual` for token validation to prevent timing attacks.
4. **Login shell flag**: Using `["-l"]` as spawn args for login shell behavior.
5. **Test environment**: Server-side tests need `// @vitest-environment node` pragma.

## Proposed Approach

1. Add `concurrently` as a devDependency for reliable process management
2. Create `src/lib/auth.ts` with token generation/validation utilities
3. Update terminal server to validate token before spawning PTY
4. Add Next.js middleware for HTTP route protection
5. Update `use-terminal.ts` to include token in WebSocket URL
6. Update justfile `dev` recipe to use concurrently
7. Change default cwd to `os.homedir()` and spawn login shell
8. Add comprehensive unit tests
9. Update E2E tests for token-aware flow
