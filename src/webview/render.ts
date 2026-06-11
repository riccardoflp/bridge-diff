import type { ThemedToken } from 'shiki/core';
import { AlignedDiffModel, CharRange, DiffCell } from '../diff/model';

export interface RenderedView {
  body: HTMLElement;
  gutter: HTMLElement;
  leftPane: HTMLElement;
  rightPane: HTMLElement;
}

export function render(root: HTMLElement, model: AlignedDiffModel): RenderedView {
  root.textContent = '';

  const header = el('div', 'header');
  const leftLabel = el('div', 'pane-label');
  leftLabel.textContent = `${model.filePath} — ${model.leftLabel}`;
  const gutterSpacer = el('div', 'gutter-spacer');
  const rightLabel = el('div', 'pane-label');
  rightLabel.textContent = model.rightLabel;
  header.append(leftLabel, gutterSpacer, rightLabel);

  const body = el('div', 'diff-body');
  const leftPane = el('div', 'pane left');
  const gutter = el('div', 'gutter');
  const rightPane = el('div', 'pane right');

  // No filler rows: each pane shows its own document compactly (WebStorm-style);
  // the gutter connectors and scroll sync bridge the height difference.
  model.rows.forEach((row, rowIndex) => {
    if (row.left.kind !== 'filler') {
      leftPane.appendChild(renderCellRow(row.left, row.chunkId, 'left', rowIndex));
    }
    if (row.right.kind !== 'filler') {
      rightPane.appendChild(renderCellRow(row.right, row.chunkId, 'right', rowIndex));
    }
  });

  body.append(leftPane, gutter, rightPane);
  root.append(header, body);
  return { body, gutter, leftPane, rightPane };
}

/** Cells of one pane, in document order (fillers skipped). */
export function sideCells(model: AlignedDiffModel, side: 'left' | 'right'): DiffCell[] {
  const cells: DiffCell[] = [];
  for (const row of model.rows) {
    const cell = side === 'left' ? row.left : row.right;
    if (cell.kind !== 'filler') {
      cells.push(cell);
    }
  }
  return cells;
}

/** Full text of one side, reconstructed for whole-file tokenization. */
export function sideText(model: AlignedDiffModel, side: 'left' | 'right'): string {
  return sideCells(model, side)
    .map((cell) => cell.text ?? '')
    .join('\n');
}

/** Swaps each line's plain content for syntax-colored tokens (post-render pass). */
export function applySyntaxTokens(
  view: RenderedView,
  model: AlignedDiffModel,
  side: 'left' | 'right',
  tokens: ThemedToken[][]
): void {
  const pane = side === 'left' ? view.leftPane : view.rightPane;
  const cells = sideCells(model, side);
  const lines = pane.children;
  const count = Math.min(cells.length, tokens.length, lines.length);
  for (let i = 0; i < count; i++) {
    const content = lines[i].querySelector('.line-content');
    if (content) {
      content.replaceWith(tokenizedContent(tokens[i], cells[i], side));
    }
  }
}

function renderCellRow(
  cell: DiffCell,
  chunkId: number | undefined,
  side: 'left' | 'right',
  rowIndex: number
): HTMLElement {
  const line = el('div', `line ${cell.kind}`);
  line.dataset.row = String(rowIndex);
  if (chunkId !== undefined) {
    line.dataset.chunk = String(chunkId);
  }
  const num = el('span', 'line-number');
  num.textContent = cell.lineNumber !== undefined ? String(cell.lineNumber) : '';
  line.append(num, renderLine(cell, side));
  return line;
}

/** Plain-text line content, shown until tokenization completes (or as fallback). */
export function renderLine(cell: DiffCell, side: 'left' | 'right'): HTMLElement {
  const content = el('span', 'line-content');
  const text = cell.text ?? '';
  const highlights = cell.highlights;
  if (!highlights || highlights.length === 0) {
    content.textContent = text;
    return content;
  }
  const highlightClass = side === 'left' ? 'hl-removed' : 'hl-added';
  let pos = 0;
  for (const [start, end] of highlights) {
    if (start > pos) {
      content.appendChild(document.createTextNode(text.slice(pos, start)));
    }
    const mark = el('span', highlightClass);
    mark.textContent = text.slice(start, end);
    content.appendChild(mark);
    pos = end;
  }
  if (pos < text.length) {
    content.appendChild(document.createTextNode(text.slice(pos)));
  }
  return content;
}

/**
 * One line as syntax tokens, split at intra-line diff boundaries so word-level
 * highlight backgrounds compose with token colors.
 */
function tokenizedContent(
  tokens: ThemedToken[],
  cell: DiffCell,
  side: 'left' | 'right'
): HTMLElement {
  const content = el('span', 'line-content');
  const highlights: CharRange[] = cell.highlights ?? [];
  const highlightClass = side === 'left' ? 'hl-removed' : 'hl-added';
  let hlIndex = 0;
  let pos = 0;

  for (const token of tokens) {
    const tokenStart = pos;
    const tokenEnd = pos + token.content.length;
    let cursor = tokenStart;
    while (cursor < tokenEnd) {
      while (hlIndex < highlights.length && highlights[hlIndex][1] <= cursor) {
        hlIndex++;
      }
      const hl = highlights[hlIndex];
      let segmentEnd: number;
      let inHighlight: boolean;
      if (hl && hl[0] <= cursor) {
        inHighlight = true;
        segmentEnd = Math.min(tokenEnd, hl[1]);
      } else if (hl && hl[0] < tokenEnd) {
        inHighlight = false;
        segmentEnd = Math.min(tokenEnd, hl[0]);
      } else {
        inHighlight = false;
        segmentEnd = tokenEnd;
      }
      const span = document.createElement('span');
      if (token.color) {
        span.style.color = token.color;
      }
      if (token.fontStyle) {
        if (token.fontStyle & 1) {
          span.style.fontStyle = 'italic';
        }
        if (token.fontStyle & 2) {
          span.style.fontWeight = 'bold';
        }
        if (token.fontStyle & 4) {
          span.style.textDecoration = 'underline';
        }
      }
      if (inHighlight) {
        span.classList.add(highlightClass);
      }
      span.textContent = token.content.slice(cursor - tokenStart, segmentEnd - tokenStart);
      content.appendChild(span);
      cursor = segmentEnd;
    }
    pos = tokenEnd;
  }
  return content;
}

function el(tag: string, className: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}
