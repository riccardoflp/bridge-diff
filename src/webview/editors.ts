import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import { AlignedDiffModel } from '../diff/model';

/**
 * Workers cannot be created cross-origin from a webview, so the bundled
 * worker is loaded through a same-origin blob shim (CSP: worker-src blob:).
 * If creation fails, Monaco falls back to running services on the main thread.
 */
export function setupMonacoEnvironment(workerUri: string): void {
  (globalThis as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
    getWorker: () => {
      const blob = new Blob([`importScripts('${workerUri}');`], {
        type: 'application/javascript',
      });
      return new Worker(URL.createObjectURL(blob));
    },
  };
}

export interface DiffEditors {
  left: monaco.editor.IStandaloneCodeEditor;
  right: monaco.editor.IStandaloneCodeEditor;
}

/** Plain-JSON `editor.*` user settings forwarded from the extension host. */
export type UserEditorOptions = Record<string, unknown>;

type EditorOptions = monaco.editor.IEditorOptions & monaco.editor.IGlobalEditorOptions;

/**
 * The user's `editor.*` configuration maps 1:1 onto Monaco options (Monaco is
 * the VS Code editor core; unknown keys are ignored), so the panes behave like
 * the regular editor. Only keys the diff layout must own are dropped here.
 */
function sanitizedUserOptions(user: UserEditorOptions): EditorOptions {
  const options = { ...user };
  delete options.readOnly;
  delete options.automaticLayout;
  delete options.scrollbar; // merged separately to keep alwaysConsumeMouseWheel
  return options as EditorOptions;
}

function scrollbarOptions(
  user: UserEditorOptions,
  overrides?: monaco.editor.IEditorScrollbarOptions
): monaco.editor.IEditorScrollbarOptions {
  return {
    ...(user.scrollbar as monaco.editor.IEditorScrollbarOptions | undefined),
    // nested editors: the page must keep receiving wheel events at the edges
    alwaysConsumeMouseWheel: false,
    ...overrides,
  };
}

/** The left pane is the read-only reference: minimal chrome at the gutter edge. */
function leftOverrides(user: UserEditorOptions): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    readOnly: true,
    // one visible vertical scrollbar (far right); wheel still scrolls the left
    scrollbar: scrollbarOptions(user, { vertical: 'hidden' }),
    minimap: { enabled: false },
    overviewRulerLanes: 0,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
  };
}

export function createEditors(
  leftHost: HTMLElement,
  rightHost: HTMLElement,
  user: UserEditorOptions
): DiffEditors {
  const style = getComputedStyle(document.body);
  const fontFamily = style.getPropertyValue('--vscode-editor-font-family').trim() || 'monospace';
  const fontSize = parseInt(style.getPropertyValue('--vscode-editor-font-size'), 10) || 13;

  const common: monaco.editor.IStandaloneEditorConstructionOptions = {
    // CSS-var fallbacks; the host-provided configuration normally wins
    fontFamily,
    fontSize,
    ...sanitizedUserOptions(user),
    automaticLayout: true,
    fixedOverflowWidgets: true,
  };

  const left = monaco.editor.create(leftHost, { ...common, ...leftOverrides(user) });
  const right = monaco.editor.create(rightHost, {
    ...common,
    scrollbar: scrollbarOptions(user),
  });
  return { left, right };
}

/** Re-applies user settings to live editors after a configuration change. */
export function applyUserOptions(
  editors: DiffEditors,
  user: UserEditorOptions,
  rightReadOnly: boolean
): void {
  const common = sanitizedUserOptions(user);
  editors.left.updateOptions({ ...common, ...leftOverrides(user) });
  editors.right.updateOptions({
    ...common,
    scrollbar: scrollbarOptions(user),
    readOnly: rightReadOnly,
  });
}

/** Diff line backgrounds + intra-line word highlights as Monaco decorations. */
export function buildDiffDecorations(
  model: AlignedDiffModel,
  side: 'left' | 'right'
): monaco.editor.IModelDeltaDecoration[] {
  const decorations: monaco.editor.IModelDeltaDecoration[] = [];
  const inlineClass = side === 'left' ? 'bd-inline-removed' : 'bd-inline-added';
  for (const row of model.rows) {
    const cell = side === 'left' ? row.left : row.right;
    if (cell.kind === 'filler' || cell.kind === 'context' || cell.lineNumber === undefined) {
      continue;
    }
    // staged chunks render dimmed so pending work stands out
    const staged = row.chunkId !== undefined && model.chunks[row.chunkId]?.staged === true;
    const line = cell.lineNumber;
    decorations.push({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: `bd-line-${cell.kind}${staged ? ' bd-staged' : ''}`,
      },
    });
    for (const [start, end] of cell.highlights ?? []) {
      if (end > start) {
        decorations.push({
          range: new monaco.Range(line, start + 1, line, end + 1),
          options: { inlineClassName: `${inlineClass}${staged ? ' bd-inline-staged' : ''}` },
        });
      }
    }
  }
  // a chunk absent on this side (pure insertion/deletion) leaves no colored
  // lines here — mark the boundary with a divider where the connector lands
  for (const chunk of model.chunks) {
    const count = side === 'left' ? chunk.leftCount : chunk.rightCount;
    if (count !== 0) {
      continue;
    }
    const start = side === 'left' ? chunk.leftStart : chunk.rightStart;
    // hunk-header convention: `start` is the line before the boundary,
    // 0 meaning a change before the first line
    const edge = start === 0 ? 'top' : 'bottom';
    const line = Math.max(1, start);
    decorations.push({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: `bd-divider-${edge} bd-divider-${chunk.kind}${
          chunk.staged ? ' bd-divider-staged' : ''
        }`,
      },
    });
  }
  return decorations;
}

/** Focus outline on the lines of the currently navigated chunk. */
export function buildActiveChunkDecorations(
  model: AlignedDiffModel,
  chunkId: number,
  side: 'left' | 'right'
): monaco.editor.IModelDeltaDecoration[] {
  const chunk = chunkId >= 0 ? model.chunks[chunkId] : undefined;
  if (!chunk) {
    return [];
  }
  const start = side === 'left' ? chunk.leftStart : chunk.rightStart;
  const count = side === 'left' ? chunk.leftCount : chunk.rightCount;
  if (count === 0) {
    return [];
  }
  return [
    {
      range: new monaco.Range(start, 1, start + count - 1, 1),
      options: { isWholeLine: true, className: 'bd-active-chunk' },
    },
  ];
}
