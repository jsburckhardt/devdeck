# Research Brief — Issue #21

## Title
feat: Add GitHub Actions CI workflow for pull request validation

## Scope Classification
- **scope_type:** issue
- **ADRs required:** None
- **Core-components required:** None

## Problem Summary
DevDeck has no CI pipeline. The 4 verification steps (lint, format:check, build, test) defined in `.github/soft-factory/verification.yml` are only enforced locally by the verifier agent. There is no `.github/workflows/` directory.

## Existing Context
- **Verification config:** `.github/soft-factory/verification.yml` defines lint, format_check, build, test steps
- **Tech stack:** Next.js + TypeScript + Vitest + ESLint + Prettier
- **Native dependency:** `node-pty` requires build tools for compilation
- **Lockfile:** `package-lock.json` exists (required for `npm ci`)
- **Node version:** LTS (no `.nvmrc`), devcontainer uses `ghcr.io/devcontainers/features/node` with `lts`
- **No existing workflows:** `.github/workflows/` directory does not exist

## Proposed Approach
Create a single `.github/workflows/ci.yml` workflow that triggers on `pull_request` to `main` and runs the same 4 verification steps. Use `ubuntu-latest`, `actions/checkout@v4`, `actions/setup-node@v4` with npm caching, and `npm ci`.

## Key Decisions (from issue)
- Trigger: `pull_request` (not `pull_request_target`) for security
- Job name: `validate` (stable for branch protection references)
- Permissions: `contents: read` (minimal)
- Concurrency: cancel in-progress runs per PR number
- Events: opened, synchronize, reopened, ready_for_review
- Node: `lts/*`
- Reference: comment in ci.yml pointing to verification.yml as source of truth

## Risks
- `node-pty` native compilation on `ubuntu-latest` — likely works since build-essential is pre-installed
- Synchronization drift between `verification.yml` and `ci.yml`
