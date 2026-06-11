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

export function createEditors(leftHost: HTMLElement, rightHost: HTMLElement): DiffEditors {
  const style = getComputedStyle(document.body);
  const fontFamily = style.getPropertyValue('--vscode-editor-font-family').trim() || 'monospace';
  const fontSize = parseInt(style.getPropertyValue('--vscode-editor-font-size'), 10) || 13;

  const common: monaco.editor.IStandaloneEditorConstructionOptions = {
    fontFamily,
    fontSize,
    automaticLayout: true,
    minimap: { enabled: false },
    folding: false,
    glyphMargin: false,
    lineDecorationsWidth: 8,
    lineNumbersMinChars: 4,
    scrollBeyondLastLine: false,
    renderLineHighlight: 'none',
    overviewRulerLanes: 0,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    wordWrap: 'off',
    stickyScroll: { enabled: false },
    guides: { indentation: false },
    occurrencesHighlight: 'off',
    selectionHighlight: false,
    unicodeHighlight: { ambiguousCharacters: false },
    fixedOverflowWidgets: true,
    scrollbar: {
      useShadows: false,
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
      alwaysConsumeMouseWheel: false,
    },
  };

  const left = monaco.editor.create(leftHost, {
    ...common,
    readOnly: true,
    // one visible vertical scrollbar (far right); wheel still scrolls the left
    scrollbar: { ...common.scrollbar, vertical: 'hidden' },
  });
  const right = monaco.editor.create(rightHost, { ...common });
  return { left, right };
}

export function lineHeightOf(editor: monaco.editor.IStandaloneCodeEditor): number {
  return editor.getOption(monaco.editor.EditorOption.lineHeight);
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
