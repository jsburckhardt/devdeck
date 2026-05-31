# Test Plan: Issue #66

## TP1: Multi-line code renders a complete logical gutter

- **Type:** Component
- **Task:** T2
- **Priority:** High

Mock `fetch` for `<FileViewer />` to return a non-binary TypeScript file with
multiple logical lines. Render the component, locate the gutter adjacent to the
code `<pre>`, and assert the gutter entries match the logical line count.

Expected result: the gutter renders `1`, `2`, and `3` for a three-line file.

## TP2: Long code line uses shared scroll-row no-wrap contract

- **Type:** Component
- **Task:** T1, T2
- **Priority:** High

Mock `fetch` to return a non-binary code file with one very long unbroken line.
Render the component, locate the outer scroll container, inner row, and `<pre>`,
then inspect class names.

Expected result: the outer container includes `overflow-auto`, the inner row
includes `min-w-max`, and the `<pre>` includes `flex-shrink-0`,
`whitespace-pre`, and `px-4` without `flex-1`.

## TP3: Empty content keeps one-line gutter behavior

- **Type:** Component
- **Task:** T2
- **Priority:** Medium

Mock `fetch` to return an empty non-binary text file. Render the component and
locate the gutter entries.

Expected result: the gutter renders exactly one entry, `1`, and the `<pre>`
retains the no-wrap class contract.

## TP4: Single-line content keeps one-line gutter behavior

- **Type:** Component
- **Task:** T2
- **Priority:** Medium

Mock `fetch` to return a single-line non-binary code file. Render the component
and locate the gutter entries and `<pre>`.

Expected result: the gutter renders exactly one entry, `1`, and the `<pre>`
retains the no-wrap class contract.

## TP5: Project verification commands pass

- **Type:** Verification
- **Task:** T3
- **Priority:** High

Run the targeted FileViewer test command, then `npm run lint`,
`npm run format:check`, `npm run build`, and `npm run test`.

Expected result: all commands complete successfully.
