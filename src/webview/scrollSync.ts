import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import { AlignedDiffModel } from '../diff/model';

type Editor = monaco.editor.IStandaloneCodeEditor;

/**
 * Absolute pixel extent [top, bottom] of one side of a chunk.
 * A zero-count side collapses to a point at the insertion line boundary
 * (`start` follows the hunk-header convention: line before the insertion).
 */
export function sideExtent(start: number, count: number, lineHeight: number): [number, number] {
  if (count === 0) {
    const y = start * lineHeight;
    return [y, y];
  }
  return [(start - 1) * lineHeight, (start - 1 + count) * lineHeight];
}

/**
 * Keeps the two Monaco editors' vertical scroll positions in sync through a
 * piecewise linear mapping anchored at chunk boundaries: context regions
 * scroll 1:1, changed regions of different heights stretch (WebStorm-style).
 */
export class ScrollSync {
  private anchorsLeft: number[] = [0];
  private anchorsRight: number[] = [0];
  /** Suppresses feedback loops: scroll positions we set programmatically. */
  private readonly expected = new Map<Editor, number>();
  private listeners: monaco.IDisposable[] = [];

  constructor(private readonly onAnyScroll: () => void) {}

  attach(left: Editor, right: Editor, model: AlignedDiffModel, lineHeight: number): void {
    this.listeners.forEach((d) => d.dispose());
    this.setAnchors(model, lineHeight);
    this.listeners = [
      left.onDidScrollChange((event) => {
        if (event.scrollTopChanged) {
          this.onScroll(left, right, true);
        } else {
          this.onAnyScroll();
        }
      }),
      right.onDidScrollChange((event) => {
        if (event.scrollTopChanged) {
          this.onScroll(right, left, false);
        } else {
          this.onAnyScroll();
        }
      }),
    ];
  }

  /** Rebuilds the anchor mapping (e.g. after a model update) without re-listening. */
  setAnchors(model: AlignedDiffModel, lineHeight: number): void {
    const anchorsLeft = [0];
    const anchorsRight = [0];
    const push = (l: number, r: number) => {
      // keep both sequences monotonic so the interpolation stays well-defined
      anchorsLeft.push(Math.max(l, anchorsLeft[anchorsLeft.length - 1]));
      anchorsRight.push(Math.max(r, anchorsRight[anchorsRight.length - 1]));
    };
    for (const chunk of model.chunks) {
      const [lt, lb] = sideExtent(chunk.leftStart, chunk.leftCount, lineHeight);
      const [rt, rb] = sideExtent(chunk.rightStart, chunk.rightCount, lineHeight);
      push(lt, rt);
      push(lb, rb);
    }
    let leftLines = 0;
    let rightLines = 0;
    for (const row of model.rows) {
      if (row.left.kind !== 'filler') {
        leftLines++;
      }
      if (row.right.kind !== 'filler') {
        rightLines++;
      }
    }
    push(leftLines * lineHeight, rightLines * lineHeight);
    this.anchorsLeft = anchorsLeft;
    this.anchorsRight = anchorsRight;
  }

  /** Scroll one editor without triggering a counter-sync from its scroll event. */
  setScrollTop(editor: Editor, value: number): void {
    const max = Math.max(0, editor.getScrollHeight() - editor.getLayoutInfo().height);
    const clamped = Math.max(0, Math.min(value, max));
    this.expected.set(editor, clamped);
    editor.setScrollTop(clamped);
  }

  private onScroll(source: Editor, target: Editor, fromLeft: boolean): void {
    const expected = this.expected.get(source);
    if (expected !== undefined && Math.abs(source.getScrollTop() - expected) < 1.5) {
      this.expected.delete(source);
      this.onAnyScroll();
      return;
    }
    this.expected.delete(source);
    const mapped = this.map(source.getScrollTop(), fromLeft);
    if (Math.abs(target.getScrollTop() - mapped) >= 1) {
      this.setScrollTop(target, mapped);
    }
    this.onAnyScroll();
  }

  private map(y: number, fromLeft: boolean): number {
    const from = fromLeft ? this.anchorsLeft : this.anchorsRight;
    const to = fromLeft ? this.anchorsRight : this.anchorsLeft;
    if (y <= from[0]) {
      return to[0];
    }
    for (let i = 1; i < from.length; i++) {
      if (y <= from[i]) {
        const span = from[i] - from[i - 1];
        const t = span === 0 ? 1 : (y - from[i - 1]) / span;
        return to[i - 1] + t * (to[i] - to[i - 1]);
      }
    }
    // past the last anchor: continue 1:1
    return to[to.length - 1] + (y - from[from.length - 1]);
  }
}
