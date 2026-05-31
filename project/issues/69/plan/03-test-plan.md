# Test Plan: Issue #69

## Test TP1: Restored all-hidden state normalizes to Terminal visible

- **Type:** Unit
- **Task:** T2
- **Priority:** High

### Expected Result

- `showTerminal` is true.
- `showExplorer` is false.
- `showFileViewer` is false.
- Valid cached visibility states remain unchanged.

## Test TP2: Single-panel layout normalization

- **Type:** Unit
- **Task:** T3
- **Priority:** High

### Expected Result

- A single visible Explorer receives `resize("100%")`.
- A single visible File Preview receives `resize("100%")`.
- A single visible Terminal receives `resize("100%")`.
- Two- and three-panel states are not forcibly resized by the normalization effect.

## Test TP3: Reported order File Preview then Explorer

- **Type:** Unit + Browser
- **Task:** T3, T5
- **Priority:** High

### Expected Result

- Terminal remains mounted.
- Terminal becomes the only visible panel.
- Terminal resizes to `100%`.
- Browser geometry shows Terminal fills workspace width within tolerance.

## Test TP4: Reverse order Explorer then File Preview

- **Type:** Unit + Browser
- **Task:** T3, T5
- **Priority:** High

### Expected Result

- Terminal final geometry matches TP3.
- Terminal remains mounted and connected.

## Test TP5: Other order-independent only-panel transitions

- **Type:** Unit
- **Task:** T3
- **Priority:** High

### Expected Result

- Ordered two-step transitions ending with Explorer only, File Preview only, and Terminal only resize the remaining panel to `100%`.
- Hidden panels remain mounted and collapsed.
- Last-panel guard prevents hiding the final visible panel.

## Test TP6: Separator and guard matrix

- **Type:** Unit
- **Task:** T4
- **Priority:** High

### Expected Result

- Separator 0 is visible only for Explorer + File Preview.
- Separator 1 is visible for Terminal plus any visible left panel.
- No separator is visible for single-panel states.
- Last-panel guard blocks hiding Explorer-only, File Preview-only, or Terminal-only.

## Test TP7: Terminal lifecycle and xterm fit survive toggles

- **Type:** Unit + Browser
- **Task:** T3, T5
- **Priority:** High

### Expected Result

- TerminalPanel is not unmounted during visibility toggles.
- WebSocket/xterm session is not restarted by layout toggles.
- ResizeObserver-driven fit continues after Terminal expansion.
- Terminal remains connected after expansion.

## Test TP8: Rapid toggles and project/worktree switches

- **Type:** Unit
- **Task:** T3
- **Priority:** Medium

### Expected Result

- Rapid visibility changes settle to normalized single-panel sizes.
- Project slug changes trigger single-panel normalization.
- Active worktree changes trigger single-panel normalization.
- Stale prior partial sizes do not persist for single-panel states.

## Test TP9: Full verification

- **Type:** Verification
- **Task:** T6
- **Priority:** Medium

### Steps

Run:

```sh
npm run lint
npm run format:check
npm run build
npm run test
npx playwright test e2e/workspace-layout.spec.ts
```

### Expected Result

All checks pass before returning to Verify stage.
