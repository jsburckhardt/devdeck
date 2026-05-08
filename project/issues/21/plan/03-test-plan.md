# Test Plan — Issue #21

## Validation Tests

| ID | Description | Type | Status |
|----|-------------|------|--------|
| T1 | ci.yml is valid YAML syntax | Validation | Not run |
| T2 | Workflow triggers on correct PR events | Review | Not run |
| T3 | Job name is `validate` | Review | Not run |
| T4 | Permissions set to `contents: read` | Review | Not run |
| T5 | Concurrency group uses PR number | Review | Not run |
| T6 | Node version is `lts/*` with npm cache | Review | Not run |
| T7 | Steps match verification.yml (lint, format:check, build, test) | Review | Not run |
| T8 | Comment references verification.yml | Review | Not run |
| T9 | No secrets referenced in workflow | Security | Not run |
| T10 | Uses `pull_request` not `pull_request_target` | Security | Not run |

## Functional Tests (post-merge)
- CI passes on a clean PR against main
- CI fails when lint violations are introduced
- Stale runs are cancelled on new pushes
