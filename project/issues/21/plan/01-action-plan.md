# Action Plan — Issue #21

## Objective
Add a GitHub Actions CI workflow that validates PRs against main by running lint, format check, build, and test steps.

## Approach
1. Create `.github/workflows/ci.yml` mirroring `.github/soft-factory/verification.yml`
2. Configure triggers, permissions, concurrency, and caching per issue specification
3. Update LLM.txt to document the new workflow
4. Verify locally with YAML validation, then ship via PR

## Scope
- **In scope:** CI workflow file creation, documentation updates
- **Out of scope:** Branch protection rules, application source code changes

## Dependencies
- No ADRs or core-components required (infrastructure-only)
