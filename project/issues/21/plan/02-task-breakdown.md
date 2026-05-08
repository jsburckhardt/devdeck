# Task Breakdown — Issue #21

## Task 1: Create CI workflow file

- **Status:** Not started
- **Complexity:** Low
- **Dependencies:** None

### Description
Create `.github/workflows/ci.yml` with pull_request trigger, validate job, and 4 verification steps matching verification.yml.

### Acceptance Criteria
- File exists at `.github/workflows/ci.yml`
- Triggers on pull_request (opened, synchronize, reopened, ready_for_review) to main
- Job name is `validate`, runs on `ubuntu-latest`
- Permissions set to `contents: read`
- Concurrency group cancels in-progress runs per PR
- Steps: checkout, setup-node (lts/*, cache npm), npm ci, lint, format:check, build, test
- Comment references verification.yml as source of truth

---

## Task 2: Update documentation

- **Status:** Not started
- **Complexity:** Low
- **Dependencies:** Task 1

### Acceptance Criteria
- LLM.txt updated to mention CI workflow exists
- README.md updated if it has a development/contributing section

---

## Task 3: Validate workflow

- **Status:** Not started
- **Complexity:** Low
- **Dependencies:** Task 1

### Acceptance Criteria
- ci.yml is valid YAML (parseable)
- Workflow schema matches GitHub Actions requirements
