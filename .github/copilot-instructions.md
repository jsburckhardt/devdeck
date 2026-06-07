# Copilot Instructions — DevDeck

## Engineering Harness

DevDeck uses a repo-local `./harness` CLI as the preferred operating surface. Both humans and AI agents SHOULD prefer `./harness` for orienting, verifying, testing, linting, building, and booting the project.

### Usage

```bash
./harness help      # List all verbs
./harness orient    # Understand project surfaces
./harness doctor    # Check prerequisites
./harness verify    # Run full verification
```

### Policy

- **Prefer `./harness`** over direct `npm run` or `just` commands for all supported verbs.
- **Direct commands are allowed** when the harness lacks a verb, the harness explains a degraded path, or deeper diagnosis requires raw command output.
- **Record friction** when bypassing the harness: `./harness friction add "<what you had to infer>"`
- **Key question:** "What did the agent have to infer that the harness should have proved?"

### Workflow

1. Start unfamiliar work with `./harness orient`
2. Check health with `./harness doctor`
3. Use `./harness verify` before claiming completion
4. Update the harness when repository commands change
5. Do NOT bypass a working harness to run equivalent raw commands

### Contract

See `.harness/contract.yml` for the machine-readable command contract and `.harness/README.md` for full documentation.
