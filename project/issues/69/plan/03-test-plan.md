# Test Plan: Issue #69

## Test TP1: Separator 1 is enabled for Explorer + Terminal adjacency

- **Type:** Unit
- **Task:** T1, T2
- **Priority:** High

### Setup

Render `WorkspaceLayout` in `src/components/workspace-layout.test.tsx` with:

```ts
{
  showExplorer: true,
  showFileViewer: false,
  showTerminal: true,
}
```

### Expected Result

- `separator-0` has class `hidden`.
- `separator-0` has `data-disabled="true"`.
- `separator-1` does not have class `hidden`.
- `separator-1` has `data-disabled="false"`.

## Test TP2: Separator matrix remains correct across visible panel combinations

- **Type:** Unit
- **Task:** T2
- **Priority:** High

### Expected Result

| Explorer | File Preview | Terminal | Separator 0 | Separator 1 |
| --- | --- | --- | --- | --- |
| true | true | true | visible/enabled | visible/enabled |
| false | true | true | hidden/disabled | visible/enabled |
| true | false | true | hidden/disabled | visible/enabled |
| true | true | false | visible/enabled | hidden/disabled |
| false | false | true | hidden/disabled | hidden/disabled |

## Test TP3: Issue #69 regression sequence keeps adjacency handle active

- **Type:** Unit
- **Task:** T3
- **Priority:** High

### Steps

1. Render all three panels visible.
2. Rerender with File Preview hidden.
3. Assert `separator-1` remains visible/enabled.
4. Rerender with Explorer also hidden.
5. Assert Terminal remains mounted and both separators are hidden/disabled.

### Expected Result

- The intermediate Explorer + Terminal state has an active `separator-1`.
- Terminal remains mounted through the sequence.
- Once Terminal is the only visible panel, both separators are hidden/disabled.

## Test TP4: Full project verification

- **Type:** Verification
- **Task:** T4
- **Priority:** Medium

### Steps

Run:

```sh
npm run lint
npm run format:check
npm run build
npm run test
```

### Expected Result

All verification commands pass before the issue proceeds from Implement to Verify.
