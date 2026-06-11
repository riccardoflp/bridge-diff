# Bridge Diff

WebStorm-style side-by-side git diff viewer for VS Code: aligned panes with
filler lines, curved connectors in the center gutter linking changed blocks,
word-level intra-line highlights and chunk navigation.

## Features

- **Side-by-side diff** of a file against `HEAD` (working tree or index),
  rendered in a custom webview that follows your VS Code theme.
- **Aligned panes**: changed blocks stay vertically aligned via hatched filler
  lines, exactly like WebStorm's diff viewer.
- **Center-gutter connectors**: colored bands link each changed block on the
  left to its counterpart on the right (green = added, red = removed,
  blue = modified).
- **Word-level highlights** inside modified lines, with a noise guard that
  skips intra-line marks when nearly the whole line changed.
- **Chunk navigation**: `F7` / `Shift+F7` (like WebStorm) or the floating
  toolbar, with a "n / m" counter.
- **Live refresh**: the diff updates in place as you edit and save, or as the
  git state changes.
- Double-click a line to jump to it in the editor.

## Usage

- Command palette → **Bridge Diff: Open Diff (Working Tree vs HEAD)** for the
  active file.
- Right-click a file in the Source Control view → **Open Diff**.
- Changed files show a diff button in the editor title bar.
- **Bridge Diff: Open Diff (Index vs HEAD)** compares the staged copy instead.

## Roadmap

- Per-chunk apply/revert arrows in the gutter and hunk-level staging.
- Local Changes tree view grouped by directory.
- Compare with arbitrary branch/revision.
- Syntax highlighting inside the diff panes.

## Development

```
npm install
npm run compile      # host (tsc) + webview type-check + esbuild bundle
npm test             # unit tests for the diff engine (node --test)
```

Press `F5` to launch the Extension Development Host. A playground repo with
edits covering every diff case can be generated alongside this project
(`bridge-diff-playground`).
