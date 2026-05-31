# Research Brief - Issue #69

## Metadata

| Field | Value |
| --- | --- |
| Issue | GitHub Issue #69 |
| Title | fix(layout): terminal does not expand after disabling file preview then explorer |
| scope_type | issue |
| New ADRs required | No |
| New core-components required | No |
| Related architecture | CORE-COMPONENT-0007 Shell Layout, CORE-COMPONENT-0008 Multi-Project Tabs |

## Problem

After hiding File Preview and then hiding Explorer, Terminal remains near its previous width instead of expanding to fill the workspace. The same separator topology affects the reverse path where Explorer is hidden before File Preview.

## Existing architecture context

CORE-COMPONENT-0007 requires togglable workspace panels to stay mounted and use `react-resizable-panels` collapse/expand APIs instead of conditional rendering. It also requires separators only between adjacent expanded panels and a guard that prevents hiding the last visible workspace panel.

CORE-COMPONENT-0008 defines per-project workspace visibility state for `showExplorer`, `showFileViewer`, and `showTerminal`.

## Root cause

`src/components/workspace-layout.tsx` keeps all three panels mounted in this DOM order:

```text
Explorer | Separator 0 | FileViewer | Separator 1 | Terminal
```

`Separator 1` is currently enabled only when `showFileViewer && showTerminal`. When File Preview is hidden while Explorer and Terminal are still visible, File Preview collapses to size 0 and Explorer becomes adjacent to Terminal. However, both separators are disabled during the collapse, so `react-resizable-panels` has no active resize handle through which to distribute the freed File Preview width. Terminal therefore does not expand as expected.

This violates the existing shell-layout rule that separators are shown between adjacent expanded panels. In the `showExplorer=true`, `showFileViewer=false`, `showTerminal=true` state, Explorer and Terminal are adjacent and need an enabled separator between them.

## Proposed fix

Update `Separator 1` in `src/components/workspace-layout.tsx` so it remains visible and enabled whenever Terminal is visible and at least one panel to its left is visible:

```tsx
showTerminal && (showFileViewer || showExplorer)
```

`Separator 0` can remain tied to `showExplorer && showFileViewer`.

## Expected behavior after fix

| showExplorer | showFileViewer | showTerminal | Separator 0 | Separator 1 |
| --- | --- | --- | --- | --- |
| true | true | true | enabled | enabled |
| false | true | true | disabled | enabled |
| true | false | true | disabled | enabled |
| true | true | false | enabled | disabled |
| true | false | false | disabled | disabled |
| false | true | false | disabled | disabled |
| false | false | true | disabled | disabled |

The issue sequence should then leave Terminal occupying the full workspace after File Preview and Explorer are hidden.

## Affected files

| File | Expected change |
| --- | --- |
| `src/components/workspace-layout.tsx` | Update `Separator 1` hidden/disabled condition. |
| `src/components/workspace-layout.test.tsx` | Update existing separator expectation and add regression coverage for the File Preview then Explorer hide sequence. |

## Scope classification

`scope_type`: `issue`

No new ADR or core-component is required. The bug fix brings implementation back into alignment with CORE-COMPONENT-0007 rather than introducing a new architectural rule.
